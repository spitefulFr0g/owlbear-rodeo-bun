import type { OwlbearDatabase } from "./index";
import { assetBytes, checkAssetCount, quotaError, defaultLibraryQuota, defaultPlayerQuota } from "../../../src/sceneRules/library";
import type { LibraryAsset, LibraryFolder, LibraryIdentity } from "../../../src/sceneRules/library";

export function documentFileIds(value: unknown): Set<string> {
  const ids = new Set<string>();
  function visit(value: unknown): void {
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, any>;
    if (record.kind === "image" && record.image?.type !== "default" && record.image) {
      for (const id of [record.image.file, record.image.thumbnail, ...Object.values(record.image.resolutions ?? {})]) if (typeof id === "string") ids.add(id);
    }
    for (const child of Object.values(record)) visit(child);
  }
  visit(value);
  return ids;
}

/** Persistence only: callers authorize and validate in a database transaction. */
export class LibraryRepository {
  constructor(private readonly database: OwlbearDatabase) {}
  assets(library: LibraryIdentity): LibraryAsset[] { return this.rows("library_assets", library); }
  folders(library: LibraryIdentity): LibraryFolder[] { return this.rows("library_folders", library); }
  asset(id: string): LibraryAsset | undefined {
    const row = this.database.connection.query<{ data: string }, [string]>("SELECT data FROM library_assets WHERE id = ?").get(id);
    return row ? JSON.parse(row.data) : undefined;
  }
  saveAsset(asset: LibraryAsset): void {
    this.database.transaction(() => {
      this.save("library_assets", asset);
      this.database.connection.query("DELETE FROM library_files WHERE entryId = ?").run(asset.id);
      for (const id of new Set(Object.values(asset.files).map(file => file.id))) this.database.connection.query("INSERT INTO library_files VALUES (?, ?)").run(asset.id, id);
    });
  }
  deleteAsset(id: string): void {
    this.database.transaction(() => {
      this.database.connection.query("DELETE FROM library_files WHERE entryId = ?").run(id);
      this.database.connection.query("DELETE FROM library_assets WHERE id = ?").run(id);
    });
  }
  duplicate(library: LibraryIdentity, originalFileId: string, uploader?: string | null): LibraryAsset | undefined {
    const hash = this.database.asset(originalFileId)?.hash;
    if (!hash) return undefined;
    return this.assets(library).find(asset => !asset.uploading && (uploader === undefined || asset.uploader === uploader) &&
      this.database.asset(asset.files.original.id)?.hash === hash);
  }
  moveAsset(id: string, library: LibraryIdentity): LibraryAsset {
    return this.database.transaction(() => {
      const asset = this.asset(id);
      if (!asset || asset.uploading) throw new Error("Asset not found");
      if (asset.library.kind === library.kind && asset.library.id === library.id) return asset;
      const duplicate = this.duplicate(library, asset.files.original.id);
      if (duplicate) throw new Error(`The destination already holds ${duplicate.name}`);
      const usage = this.usage(library);
      if (!checkAssetCount(usage.assets, usage.reservedAssets, 1)) throw new Error("Library asset count limit reached");
      const error = quotaError(assetBytes(asset.files), { ...usage, quota: this.quota(library) }, library.kind);
      if (error) throw new Error(error);
      const moved = { ...asset, library, folderId: null, uploader: null };
      this.saveAsset(moved);
      return moved;
    });
  }
  saveFolder(folder: LibraryFolder): void { this.save("library_folders", folder); }
  deleteFolder(id: string): void {
    this.database.transaction(() => {
      const row = this.database.connection.query<{ data: string }, [string]>("SELECT data FROM library_folders WHERE id = ?").get(id);
      if (!row) return;
      const folder: LibraryFolder = JSON.parse(row.data);
      for (const asset of this.assets(folder.library)) if (asset.folderId === id) this.saveAsset({ ...asset, folderId: null });
      this.database.connection.query("DELETE FROM library_folders WHERE id = ?").run(id);
    });
  }
  usage(library: LibraryIdentity, uploader?: string | null) {
    const assets = this.assets(library).filter(asset => uploader === undefined || asset.uploader === uploader);
    return { bytes: assets.filter(a => !a.uploading).reduce((sum, a) => sum + assetBytes(a.files), 0),
      reservedBytes: assets.filter(a => a.uploading).reduce((sum, a) => sum + assetBytes(a.files), 0),
      assets: assets.filter(a => !a.uploading).length, reservedAssets: assets.filter(a => a.uploading).length,
      folders: this.folders(library).filter(f => uploader === undefined || f.owner === uploader).length };
  }
  quota(library: LibraryIdentity): number {
    return this.database.connection.query<{ quota: number }, [string]>(`SELECT quota FROM ${library.kind === "room" ? "rooms" : "accounts"} WHERE id = ?`).get(library.id)?.quota ?? defaultLibraryQuota;
  }
  setQuota(library: LibraryIdentity, quota: number): void {
    this.checkQuota(quota);
    this.database.connection.query(`UPDATE ${library.kind === "room" ? "rooms" : "accounts"} SET quota = ? WHERE id = ?`).run(quota, library.id);
  }
  playerQuota(roomId: string): number {
    return this.database.connection.query<{ playerQuota: number }, [string]>("SELECT playerQuota FROM rooms WHERE id = ?").get(roomId)?.playerQuota ?? defaultPlayerQuota;
  }
  setPlayerQuota(roomId: string, quota: number): void {
    this.checkQuota(quota);
    if (quota > this.quota({ kind: "room", id: roomId })) throw new Error("Player quota exceeds room quota");
    this.database.connection.query("UPDATE rooms SET playerQuota = ? WHERE id = ?").run(quota, roomId);
  }
  dropIncomplete(): void {
    for (const row of this.database.connection.query<{ data: string }, []>("SELECT data FROM library_assets").all()) {
      const asset: LibraryAsset = JSON.parse(row.data);
      if (asset.uploading) this.deleteAsset(asset.id);
    }
  }
  transferAccount(from: string, to: string): void {
    this.database.transaction(() => {
      const destination = { kind: "account", id: to } as const;
      const folders = this.folders(destination);
      const mapped = new Map<string, string>();
      for (const folder of this.folders({ kind: "account", id: from })) {
        const existing = folders.find(other => other.name === folder.name);
        mapped.set(folder.id, existing?.id ?? folder.id);
        if (existing) this.database.connection.query("DELETE FROM library_folders WHERE id = ?").run(folder.id);
        else { const moved = { ...folder, library: destination, owner: null }; this.saveFolder(moved); folders.push(moved); }
      }
      for (const asset of this.assets({ kind: "account", id: from })) this.saveAsset({ ...asset, library: destination, uploader: null, folderId: asset.folderId ? mapped.get(asset.folderId) ?? null : null });
    });
  }
  private checkQuota(quota: number): void {
    if (!Number.isSafeInteger(quota) || quota < 0) throw new Error("Quota must be a nonnegative whole number of bytes");
  }
  private rows<T>(table: string, library: LibraryIdentity): T[] {
    return this.database.connection.query<{ data: string }, [string, string]>(`SELECT data FROM ${table} WHERE kind = ? AND libraryId = ? ORDER BY id`).all(library.kind, library.id).map(row => JSON.parse(row.data));
  }
  private save(table: string, value: LibraryAsset | LibraryFolder): void {
    this.database.connection.query(`INSERT INTO ${table} VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, libraryId = excluded.libraryId, data = excluded.data`).run(value.id, value.library.kind, value.library.id, JSON.stringify(value));
  }
}
