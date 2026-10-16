import { Asset } from "../types/Asset";

/** Raw files are a bounded convenience cache; the server remains their store. */
export function createAssetCache(maxBytes = 64 * 1024 * 1024, maxEntries = 256) {
  const assets = new Map<string, Asset>();
  const pending = new Map<string, Promise<Asset>>();
  let bytes = 0;

  function put(asset: Asset) {
    const previous = assets.get(asset.id);
    if (previous) bytes -= previous.file.byteLength;
    assets.delete(asset.id);
    // Oversized files can still be displayed without retaining their raw bytes.
    if (asset.file.byteLength <= maxBytes && maxEntries > 0) {
      assets.set(asset.id, asset);
      bytes += asset.file.byteLength;
    }
    while (bytes > maxBytes || assets.size > maxEntries) {
      const oldest = assets.values().next().value as Asset;
      assets.delete(oldest.id);
      bytes -= oldest.file.byteLength;
    }
  }

  async function get(id: string, load: () => Promise<Asset>): Promise<Asset> {
    const cached = assets.get(id);
    if (cached) {
      assets.delete(id);
      assets.set(id, cached);
      return cached;
    }
    const existing = pending.get(id);
    if (existing) return existing;
    const request = load().then(asset => { put(asset); return asset; });
    pending.set(id, request);
    try { return await request; }
    finally {
      // An earlier connection's completion must not remove its replacement.
      if (pending.get(id) === request) pending.delete(id);
    }
  }

  function resetPending() {
    pending.clear();
  }

  return { get, put, resetPending };
}
