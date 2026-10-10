import { OwlbearDatabase } from "../database";
import { Clock, realClock } from "../clock";
import { createHash, randomUUID } from "crypto";
import { readFileSync, readdirSync, createReadStream, createWriteStream } from "fs";
import { mkdir, rename, rm, stat } from "fs/promises";
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

/** Keeps bytes in blobs/ and temporary uploads in tmp/; records live in SQLite. */
export class FsAssetStore implements AssetStore {
  private readonly blobsDir: string;
  private readonly refsDir: string;
  private readonly database: OwlbearDatabase;
  private readonly tmpDir: string;
  private readonly maxBytes: number;
  /** Ids with an upload in progress */
  private readonly writing = new Set<string>();
  /** Tail of the queue that changes to records and blobs wait in */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(dir: string, maxBytes: number, private readonly clock: Clock = realClock, database?: OwlbearDatabase) {
    // Standalone stores keep their database beside the byte directory. The
    // server supplies its single data-directory database.
    this.database = database ?? new OwlbearDatabase(`${dir}.db`);
    this.blobsDir = join(dir, "blobs");
    this.refsDir = join(dir, "refs");
    this.tmpDir = join(dir, "tmp");
    this.maxBytes = maxBytes;
  }

  /** Creates the directories and discards uploads a previous run left behind */
  async init(): Promise<void> {
    await rm(this.tmpDir, { recursive: true, force: true });
    await mkdir(this.blobsDir, { recursive: true });
    this.importLegacyRecords();
    // Only remove old files after their records and completion marker commit.
    await rm(this.refsDir, { recursive: true, force: true });
    await mkdir(this.tmpDir, { recursive: true });
  }

  async put(
    id: string,
    info: AssetInfo,
    body: AsyncIterable<Uint8Array>
  ): Promise<AssetRecord> {
    this.validateId(id);
    if (this.writing.has(id)) {
      throw new AssetExistsError(id);
    }
    this.writing.add(id);
    const tmpPath = join(this.tmpDir, randomUUID());
    try {
      if (this.database.asset(id)) {
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
        createdAt: new Date(this.clock.now()).toISOString(),
      };
      await this.exclusive(async () => {
        const blobPath = this.blobPath(record.hash);
        if (!(await exists(blobPath))) {
          await mkdir(dirname(blobPath), { recursive: true });
          await rename(tmpPath, blobPath);
        }
        this.database.insertAsset(record);
      });
      return record;
    } finally {
      this.writing.delete(id);
      await rm(tmpPath, { force: true });
    }
  }

  async get(id: string): Promise<StoredAsset | undefined> {
    this.validateId(id);
    const record = this.database.asset(id);
    if (!record) {
      return undefined;
    }
    const blobPath = this.blobPath(record.hash);
    return { record, open: () => createReadStream(blobPath) };
  }

  async has(id: string): Promise<boolean> {
    this.validateId(id);
    return !!this.database.asset(id);
  }

  async delete(id: string): Promise<boolean> {
    this.validateId(id);
    return this.exclusive(async () => {
      const record = this.database.asset(id);
      if (!record) {
        return false;
      }
      this.database.deleteAsset(id);
      if (!this.database.hasHash(record.hash)) {
        await rm(this.blobPath(record.hash), { force: true });
      }
      return true;
    });
  }

  async deleteRoom(roomId: string, deleted: () => void): Promise<void> {
    await this.exclusive(async () => {
      const removed = this.database.deleteRoom(roomId);
      deleted();
      for (const hash of new Set(removed.map(asset => asset.hash))) {
        if (!this.database.hasHash(hash)) await rm(this.blobPath(hash), { force: true });
      }
    });
  }

  private importLegacyRecords(): void {
    if (this.database.legacyAssetsImported()) return;
    this.database.transaction(() => {
      let files: string[];
      try { files = readdirSync(this.refsDir, { recursive: true }) as string[]; }
      catch (error: any) {
        if (error.code !== "ENOENT") throw error;
        files = [];
      }
      for (const file of files.sort()) {
        if (!file.endsWith(".json")) continue;
        const record: AssetRecord = JSON.parse(readFileSync(join(this.refsDir, file), "utf8"));
        this.validateId(record.id);
        if (!/^[a-f0-9]{64}$/.test(record.hash)) throw new Error(`Invalid asset hash in ${file}`);
        this.database.insertAsset(record);
      }
      this.database.markLegacyAssetsImported();
    });
  }

  /** Runs tasks that change records or blobs one at a time */
  private exclusive<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => {
      // Keep the queue available after a failed task; the caller receives the error.
    });
    return run;
  }

  private validateId(id: string): void {
    if (!isAssetId(id)) throw new Error(`Invalid asset id "${id}"`);
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
