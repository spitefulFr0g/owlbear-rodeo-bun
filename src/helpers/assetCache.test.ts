import { createAssetCache } from "./assetCache";
import { Asset } from "../types/Asset";

const asset = (id: string, size = 3): Asset => ({
  id, file: new Uint8Array(size), width: 1, height: 1, owner: "gm", mime: "image/png",
});

test("revisiting an evicted scene image downloads it again", async () => {
  const cache = createAssetCache(6);
  const first = asset("first");
  cache.put(first);
  cache.put(asset("second"));
  cache.put(asset("third"));
  let downloads = 0;
  expect(await cache.get("first", async () => { downloads++; return first; })).toBe(first);
  expect(downloads).toBe(1);
  await cache.get("first", async () => { throw new Error("should be cached"); });
});

test("recently used images survive eviction of older images", async () => {
  const cache = createAssetCache(6);
  const first = asset("first");
  cache.put(first);
  cache.put(asset("second"));
  await cache.get("first", async () => { throw new Error("should be cached"); });
  cache.put(asset("third"));
  expect(await cache.get("first", async () => { throw new Error("should be cached"); })).toBe(first);
  let downloaded = false;
  await cache.get("second", async () => { downloaded = true; return asset("second"); });
  expect(downloaded).toBe(true);
});

test("replacing a cached file accounts for its new byte size", async () => {
  const cache = createAssetCache(6);
  cache.put(asset("first", 5));
  const replacement = asset("first", 1);
  cache.put(replacement);
  cache.put(asset("second", 5));
  expect(await cache.get("first", async () => { throw new Error("incorrect byte count"); })).toBe(replacement);
});

test("oversized images are returned without retaining their raw files", async () => {
  const cache = createAssetCache(2);
  let downloads = 0;
  const load = async () => { downloads++; return asset("large", 3); };
  expect((await cache.get("large", load)).id).toBe("large");
  await cache.get("large", load);
  expect(downloads).toBe(2);
});

test("the entry limit also bounds empty image metadata", async () => {
  const cache = createAssetCache(6, 1);
  cache.put(asset("first", 0));
  cache.put(asset("second", 0));
  let downloaded = false;
  await cache.get("first", async () => { downloaded = true; return asset("first", 0); });
  expect(downloaded).toBe(true);
});

test("concurrent image requests share one download", async () => {
  const cache = createAssetCache();
  let complete!: (value: Asset) => void;
  let downloads = 0;
  const load = () => { downloads++; return new Promise<Asset>(resolve => { complete = resolve; }); };
  const first = cache.get("same", load);
  const second = cache.get("same", load);
  const result = asset("same");
  complete(result);
  expect(await Promise.all([first, second])).toEqual([result, result]);
  expect(downloads).toBe(1);
});

test("a failed image download can be retried", async () => {
  const cache = createAssetCache();
  await expect(cache.get("retry", async () => { throw new Error("offline"); })).rejects.toThrow("offline");
  const result = asset("retry");
  expect(await cache.get("retry", async () => result)).toBe(result);
});

test("rejoining can replace an unfinished download without losing request sharing", async () => {
  const cache = createAssetCache();
  let failOld!: (reason: Error) => void;
  const old = cache.get("same", () => new Promise<Asset>((_resolve, reject) => { failOld = reject; }));
  const failure = expect(old).rejects.toThrow("old connection");
  cache.resetPending();
  let completeNew!: (value: Asset) => void;
  const replacement = cache.get("same", () => new Promise<Asset>(resolve => { completeNew = resolve; }));
  failOld(new Error("old connection"));
  await failure;
  let duplicateDownload = false;
  const shared = cache.get("same", async () => { duplicateDownload = true; return asset("same"); });
  const result = asset("same");
  completeNew(result);
  expect(await Promise.all([replacement, shared])).toEqual([result, result]);
  expect(duplicateDownload).toBe(false);
});

test("rejoining keeps successfully cached files", async () => {
  const cache = createAssetCache();
  const result = asset("same");
  cache.put(result);
  cache.resetPending();
  expect(await cache.get("same", async () => { throw new Error("unnecessary download"); })).toBe(result);
});
