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
  /** Connection-local totals are rebuilt once; triggers participate in every rollback and direct delete. */
  initializeUsage(): void {
    const db = this.database.connection;
    db.exec(`CREATE TEMP TABLE library_usage (
      kind TEXT, libraryId TEXT, owner TEXT, bytes INTEGER NOT NULL DEFAULT 0,
      reservedBytes INTEGER NOT NULL DEFAULT 0, assets INTEGER NOT NULL DEFAULT 0,
      reservedAssets INTEGER NOT NULL DEFAULT 0, folders INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(kind, libraryId, owner)
    )`);
    for (const table of ["library_assets", "library_folders"]) {
      const contribution = (row: string, sign: number) => {
        const asset = table === "library_assets";
        const uploading = `COALESCE(json_extract(${row}.data, '$.uploading'), 0)`;
        const bytes = `(SELECT COALESCE(SUM(json_extract(value, '$.size')), 0) FROM json_each(${row}.data, '$.files'))`;
        return ["*", `json_quote(json_extract(${row}.data, '$.${asset ? "uploader" : "owner"}'))`].map(owner => `
          INSERT INTO library_usage(kind, libraryId, owner, bytes, reservedBytes, assets, reservedAssets, folders)
          VALUES (${row}.kind, ${row}.libraryId, ${owner === "*" ? "'*'" : owner},
            ${asset ? `${sign} * (1 - ${uploading}) * ${bytes}, ${sign} * ${uploading} * ${bytes}, ${sign} * (1 - ${uploading}), ${sign} * ${uploading}, 0` : `0, 0, 0, 0, ${sign}`})
          ON CONFLICT(kind, libraryId, owner) DO UPDATE SET
            bytes = bytes + excluded.bytes, reservedBytes = reservedBytes + excluded.reservedBytes,
            assets = assets + excluded.assets, reservedAssets = reservedAssets + excluded.reservedAssets,
            folders = folders + excluded.folders;`).join("\n");
      };
      for (const event of ["INSERT", "UPDATE", "DELETE"]) db.exec(`
        CREATE TEMP TRIGGER ${table}_usage_${event} AFTER ${event} ON main.${table} BEGIN
          ${event !== "INSERT" ? contribution("old", -1) : ""}
          ${event !== "DELETE" ? contribution("new", 1) : ""}
        END`);
      for (const row of db.query<{ data: string }, []>(`SELECT data FROM ${table}`).all()) {
        const record = JSON.parse(row.data);
        const asset = table === "library_assets";
        const bytes = asset ? assetBytes(record.files) : 0;
        for (const owner of ["*", JSON.stringify(asset ? record.uploader : record.owner)]) db.query(`
          INSERT INTO library_usage VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(kind, libraryId, owner) DO UPDATE SET bytes = bytes + excluded.bytes,
          reservedBytes = reservedBytes + excluded.reservedBytes, assets = assets + excluded.assets,
          reservedAssets = reservedAssets + excluded.reservedAssets, folders = folders + excluded.folders
        `).run(record.library.kind, record.library.id, owner, record.uploading ? 0 : bytes,
          record.uploading ? bytes : 0, asset && !record.uploading ? 1 : 0, record.uploading ? 1 : 0, asset ? 0 : 1);
      }
    }
  }
  visibleAssets(library: LibraryIdentity): LibraryAsset[] {
    return this.database.connection.query<{ data: string }, [string, string]>(
      "SELECT data FROM library_assets WHERE kind = ? AND libraryId = ? AND COALESCE(json_extract(data, '$.uploading'), 0) = 0 ORDER BY id"
    ).all(library.kind, library.id).map(row => JSON.parse(row.data));
  }
  assets(library: LibraryIdentity): LibraryAsset[] { return this.rows("library_assets", library); }
  folders(library: LibraryIdentity): LibraryFolder[] { return this.rows("library_folders", library); }
  asset(id: string): LibraryAsset | undefined {
    const row = this.database.connection.query<{ data: string }, [string]>("SELECT data FROM library_assets WHERE id = ?").get(id);
    return row ? JSON.parse(row.data) : undefined;
  }
  folder(id: string): LibraryFolder | undefined {
    const row = this.database.connection.query<{ data: string }, [string]>("SELECT data FROM library_folders WHERE id = ?").get(id);
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
    return this.visibleAssets(library).find(asset => (uploader === undefined || asset.uploader === uploader) &&
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
    return this.database.connection.query<{ bytes: number; reservedBytes: number; assets: number; reservedAssets: number; folders: number }, [string, string, string]>(
      "SELECT bytes, reservedBytes, assets, reservedAssets, folders FROM library_usage WHERE kind = ? AND libraryId = ? AND owner = ?"
    ).get(library.kind, library.id, uploader === undefined ? "*" : JSON.stringify(uploader)) ??
      { bytes: 0, reservedBytes: 0, assets: 0, reservedAssets: 0, folders: 0 };
  }
  playerBytes(library: LibraryIdentity): Record<string, number> {
    const players: Record<string, number> = Object.create(null);
    for (const row of this.database.connection.query<{ owner: string; bytes: number }, [string, string]>(
      "SELECT owner, bytes + reservedBytes AS bytes FROM library_usage WHERE kind = ? AND libraryId = ? AND owner NOT IN ('*', 'null') AND assets + reservedAssets > 0"
    ).all(library.kind, library.id)) players[JSON.parse(row.owner)] = row.bytes;
    return players;
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
