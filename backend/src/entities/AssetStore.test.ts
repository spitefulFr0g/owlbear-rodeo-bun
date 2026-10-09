import { TestClock } from "../testing/serverHelpers";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  AssetExistsError,
  AssetTooLargeError,
  FsAssetStore,
  isAssetId,
} from "./AssetStore";

const info = { mime: "image/png", width: 4, height: 2, owner: "gm" };

async function* bytes(...chunks: string[]) {
  for (const chunk of chunks) {
    yield Buffer.from(chunk);
  }
}

async function read(store: FsAssetStore, id: string): Promise<string> {
  const asset = await store.get(id);
  const chunks: Buffer[] = [];
  for await (const chunk of asset!.open()) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString();
}

async function files(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
}

describe("FsAssetStore", () => {
  let dir: string;
  let store: FsAssetStore;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "asset-store-"));
    store = new FsAssetStore(dir, 16);
    await store.init();
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("dates asset records with the supplied clock", async () => {
    const clock = new TestClock();
    const timedStore = new FsAssetStore(dir, 16, clock);
    const first = await timedStore.put("first-date", info, bytes("first"));
    expect(first.createdAt).toBe("2026-01-01T00:00:00.000Z");
    await clock.advance(3000);
    const second = await timedStore.put("second-date", info, bytes("second"));
    expect(second.createdAt).toBe("2026-01-01T00:00:03.000Z");
  });

  test("returns what was put", async () => {
    const record = await store.put("map-1", info, bytes("hello ", "world"));
    expect(record).toMatchObject({ id: "map-1", size: 11, ...info });
    expect(record.hash).toBe(
      "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
    );
    expect(await store.has("map-1")).toBe(true);
    expect((await store.get("map-1"))?.record).toEqual(record);
    expect(await read(store, "map-1")).toBe("hello world");
  });

  test("knows nothing about an id that was never put", async () => {
    expect(await store.has("missing")).toBe(false);
    expect(await store.get("missing")).toBeUndefined();
    expect(await store.delete("missing")).toBe(false);
  });

  test("keeps assets when reopened", async () => {
    await store.put("map-1", info, bytes("hello"));
    const reopened = new FsAssetStore(dir, 16);
    await reopened.init();
    expect(await read(reopened, "map-1")).toBe("hello");
  });

  test("is write-once", async () => {
    await store.put("map-1", info, bytes("first"));
    await expect(store.put("map-1", info, bytes("second"))).rejects.toThrow(
      AssetExistsError
    );
    expect(await read(store, "map-1")).toBe("first");
  });

  test("lets only one of two concurrent puts of an id win", async () => {
    const results = await Promise.allSettled([
      store.put("map-1", info, bytes("first")),
      store.put("map-1", info, bytes("second")),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([
      "fulfilled",
      "rejected",
    ]);
  });

  test("rejects a body over the size limit and keeps nothing", async () => {
    await expect(
      store.put("map-1", info, bytes("0123456789", "0123456789"))
    ).rejects.toThrow(AssetTooLargeError);
    expect(await store.has("map-1")).toBe(false);
    expect(await files(dir)).toEqual([]);
  });

  test("stores identical bytes once", async () => {
    const a = await store.put("token-a", info, bytes("same"));
    const b = await store.put("token-b", { ...info, owner: "player" }, bytes("same"));
    expect(a.hash).toBe(b.hash);
    expect(await files(join(dir, "blobs"))).toEqual([a.hash]);
    expect((await store.get("token-b"))?.record.owner).toBe("player");
  });

  test("deletes the bytes with the last id that uses them", async () => {
    const { hash } = await store.put("token-a", info, bytes("same"));
    await store.put("token-b", info, bytes("same"));

    expect(await store.delete("token-a")).toBe(true);
    expect(await store.has("token-a")).toBe(false);
    expect(await read(store, "token-b")).toBe("same");

    expect(await store.delete("token-b")).toBe(true);
    expect(await files(join(dir, "blobs"))).not.toContain(hash);
  });

  test("discards unfinished uploads on init", async () => {
    await writeFile(join(dir, "tmp", "leftover"), "partial");
    await store.init();
    expect(await files(join(dir, "tmp"))).toEqual([]);
  });

  test("refuses ids that are not safe file names", async () => {
    await expect(store.has("../escape")).rejects.toThrow(/invalid/i);
    await expect(store.put("a/b", info, bytes("x"))).rejects.toThrow(/invalid/i);
  });
});

describe("isAssetId", () => {
  test("accepts UUIDs", () => {
    expect(isAssetId("3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b")).toBe(true);
  });

  test("rejects anything that could leave the directory or clash on Windows", () => {
    for (const id of ["", "..", "a/b", "a\\b", "a.json", "ABC", "a".repeat(65)]) {
      expect(isAssetId(id)).toBe(false);
    }
    expect(isAssetId(undefined)).toBe(false);
  });
});
