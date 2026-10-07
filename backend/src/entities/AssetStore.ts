import { createHash, randomUUID } from "crypto";
import { createReadStream, createWriteStream } from "fs";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "fs/promises";
import { dirname, join } from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";

/** What the uploader tells us about an asset. The server never parses images. */
export interface AssetInfo {
  mime: string;
  width: number;
  height: number;
  /** User id of the player the asset belongs to */
  owner: string;
}

/** The metadata record kept for every asset id. */
export interface AssetRecord extends AssetInfo {
  id: string;
  /** SHA-256 of the bytes, hex encoded. Several ids can share one hash. */
  hash: string;
  size: number;
  createdAt: string;
}

export interface StoredAsset {
  record: AssetRecord;
  /** Opens the asset's bytes for reading */
  open(): Readable;
}

/**
 * Keeps assets by id. Stores are write-once: an id never changes what it
 * points to, so anything read from a store can be cached forever.
 */
export interface AssetStore {
  /**
   * @throws AssetExistsError when the id is already stored or being stored
   * @throws AssetTooLargeError when the body is larger than the store allows
   */
  put(
    id: string,
    info: AssetInfo,
    body: AsyncIterable<Uint8Array>
  ): Promise<AssetRecord>;
  get(id: string): Promise<StoredAsset | undefined>;
  has(id: string): Promise<boolean>;
  /** @returns false when there was nothing to delete */
  delete(id: string): Promise<boolean>;
}

export class AssetExistsError extends Error {
  constructor(id: string) {
    super(`Asset "${id}" already exists`);
  }
}

export class AssetTooLargeError extends Error {
  constructor(maxBytes: number) {
    super(`Asset is larger than ${maxBytes} bytes`);
  }
}

/**
 * Ids become file names, so only allow what is safe on every filesystem.
 * Lowercase only, because Windows and macOS would treat `A` and `a` as the
 * same file. The frontend uses UUIDs.
 */
export function isAssetId(id: unknown): id is string {
  return typeof id === "string" && /^[a-z0-9-]{1,64}$/.test(id);
}

/**
 * Stores assets in a directory:
 *
 *   blobs/ab/abcdef...     the bytes, named by their SHA-256
 *   refs/12/1234-....json  an AssetRecord per asset id, pointing at a blob
 *   tmp/                   uploads in progress
 */
export class FsAssetStore implements AssetStore {
  private readonly blobsDir: string;
  private readonly refsDir: string;
  private readonly tmpDir: string;
  private readonly maxBytes: number;
  /** Ids with an upload in progress */
  private readonly writing = new Set<string>();
  /** Tail of the queue that changes to refs and blobs wait in */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(dir: string, maxBytes: number) {
    this.blobsDir = join(dir, "blobs");
    this.refsDir = join(dir, "refs");
    this.tmpDir = join(dir, "tmp");
    this.maxBytes = maxBytes;
  }

  /** Creates the directories and discards uploads a previous run left behind */
  async init(): Promise<void> {
    await rm(this.tmpDir, { recursive: true, force: true });
    await mkdir(this.blobsDir, { recursive: true });
    await mkdir(this.refsDir, { recursive: true });
    await mkdir(this.tmpDir, { recursive: true });
  }

  async put(
    id: string,
    info: AssetInfo,
    body: AsyncIterable<Uint8Array>
  ): Promise<AssetRecord> {
    const refPath = this.refPath(id);
    if (this.writing.has(id)) {
      throw new AssetExistsError(id);
    }
    this.writing.add(id);
    const tmpPath = join(this.tmpDir, randomUUID());
    try {
      if (await exists(refPath)) {
        throw new AssetExistsError(id);
      }

      const hasher = createHash("sha256");
      let size = 0;
      const { maxBytes } = this;
      await pipeline(
        body,
        async function* measure(source: AsyncIterable<Uint8Array>) {
          for await (const chunk of source) {
            size += chunk.length;
            if (size > maxBytes) {
              throw new AssetTooLargeError(maxBytes);
            }
            hasher.update(chunk);
            yield chunk;
          }
        },
        createWriteStream(tmpPath)
      );

      const record: AssetRecord = {
        id,
        hash: hasher.digest("hex"),
        size,
        mime: info.mime,
        width: info.width,
        height: info.height,
        owner: info.owner,
        createdAt: new Date().toISOString(),
      };
      await this.exclusive(async () => {
        const blobPath = this.blobPath(record.hash);
        if (!(await exists(blobPath))) {
          await mkdir(dirname(blobPath), { recursive: true });
          await rename(tmpPath, blobPath);
        }
        // Written in full before it is moved into place, so a crash cannot
        // leave half a record behind
        const tmpRefPath = `${tmpPath}.json`;
        await writeFile(tmpRefPath, JSON.stringify(record));
        await mkdir(dirname(refPath), { recursive: true });
        await rename(tmpRefPath, refPath);
      });
      return record;
    } finally {
      this.writing.delete(id);
      await rm(tmpPath, { force: true });
    }
  }

  async get(id: string): Promise<StoredAsset | undefined> {
    const record = await readRecord(this.refPath(id));
    if (!record) {
      return undefined;
    }
    const blobPath = this.blobPath(record.hash);
    return { record, open: () => createReadStream(blobPath) };
  }

  async has(id: string): Promise<boolean> {
    return exists(this.refPath(id));
  }

  async delete(id: string): Promise<boolean> {
    const refPath = this.refPath(id);
    return this.exclusive(async () => {
      const record = await readRecord(refPath);
      if (!record) {
        return false;
      }
      await rm(refPath);
      if (!(await this.isReferenced(record.hash))) {
        await rm(this.blobPath(record.hash), { force: true });
      }
      return true;
    });
  }

  private async isReferenced(hash: string): Promise<boolean> {
    const files = await readdir(this.refsDir, { recursive: true });
    for (const file of files) {
      if (file.endsWith(".json")) {
        const record = await readRecord(join(this.refsDir, file));
        if (record?.hash === hash) {
          return true;
        }
      }
    }
    return false;
  }

  /** Runs tasks that change refs or blobs one at a time */
  private exclusive<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => {});
    return run;
  }

  private refPath(id: string): string {
    if (!isAssetId(id)) {
      throw new Error(`Invalid asset id "${id}"`);
    }
    return join(this.refsDir, id.slice(0, 2), `${id}.json`);
  }

  private blobPath(hash: string): string {
    return join(this.blobsDir, hash.slice(0, 2), hash);
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error: any) {
    if (error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function readRecord(path: string): Promise<AssetRecord | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error: any) {
    if (error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}
