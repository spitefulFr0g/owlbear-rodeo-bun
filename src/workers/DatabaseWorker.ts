import * as Comlink from "comlink";
import { encode, decode } from "@msgpack/msgpack";

import { getDatabase } from "../database";

import { Asset } from "../types/Asset";


// Worker to load large amounts of database data on a separate thread
let service = {
  /**
   * Load either a whole table or individual item from the DB
   * @param {string} table Table to load from
   * @param {string=} key Optional database key to load, if undefined whole table will be loaded
   */
  async loadData<T>(table: string, key?: string): Promise<Uint8Array> {
    try {
      let db = getDatabase({});
      if (key) {
        // Load specific item
        const data = await db.table(table).get(key);
        const packed = encode(data);
        return Comlink.transfer(packed, [packed.buffer]);
      } else {
        // Load entire table
        let items: T[] = [];
        // Use a cursor instead of toArray to prevent IPC max size error
        await db.table(table).each((item: any) => {
          items.push(item);
        });

        // Pack data with msgpack so we can use transfer to avoid memory issues
        const packed = encode(items);
        return Comlink.transfer(packed, [packed.buffer]);
      }
    } catch {
      throw new Error("Unable to load database");
    }
  },

  /**
   * Put data into table encoded by msgpack
   * @param {Uint8Array} data
   * @param {string} table
   */
  async putData(data: Uint8Array, table: string): Promise<boolean> {
    try {
      let db = getDatabase({});
      const decoded = decode(data);
      await db.table(table).put(decoded);
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Ensure the asset cache doesn't go over `maxCacheSize` by removing cached assets
   * Removes largest assets first
   * @param {number} maxCacheSize Max size of cache in bytes
   */
  async cleanAssetCache(maxCacheSize: number) {
    try {
      let db = getDatabase({});
      const userId = (await db.table("user").get("userId")).value;

      const assetSizes: { id: string; size: number }[] = [];
      await db
        .table("assets")
        .where("owner")
        .notEqual(userId)
        .each((asset: Asset) => {
          assetSizes.push({ id: asset.id, size: asset.file.byteLength });
        });
      const totalSize = assetSizes.reduce((acc, cur) => acc + cur.size, 0);
      if (totalSize > maxCacheSize) {
        // Remove largest assets first
        const largestAssets = assetSizes.sort((a, b) => b.size - a.size);
        let assetsToDelete = [];
        let deletedBytes = 0;
        for (let asset of largestAssets) {
          assetsToDelete.push(asset.id);
          deletedBytes += asset.size;
          if (totalSize - deletedBytes < maxCacheSize) {
            break;
          }
        }
        await db.table("assets").bulkDelete(assetsToDelete);
      }
    } catch {}
  },
};

export type DatabaseWorkerService = typeof service;

Comlink.expose(service);
