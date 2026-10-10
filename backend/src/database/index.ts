import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, statSync } from "fs";
import { inspectDatabase } from "./startup";
import { dirname } from "path";
import type { AssetRecord } from "../entities/AssetStore";

export interface RoomRecord {
  id: string;
  name: string;
  gmAccountId: string | null;
  hasPassword: number;
  passwordHash: string;
  displayToken: string;
  switches?: string;
  trustedPlayerIds?: string;
  documentVersion: number;
  document: string;
}

export const LAYOUT_VERSION = 1;

// All v0.2.0 tables belong here, in the same layout version. Nothing in
// this release has shipped yet, so later tickets extend this declaration.
const layout = `
  CREATE TABLE IF NOT EXISTS assets (
    id TEXT PRIMARY KEY,
    hash TEXT NOT NULL,
    size INTEGER NOT NULL,
    mime TEXT NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    owner TEXT NOT NULL,
    createdAt TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS assets_hash ON assets(hash);
  CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL DEFAULT '',
    gmAccountId TEXT REFERENCES accounts(id),
    hasPassword INTEGER NOT NULL DEFAULT 0,
    passwordHash TEXT NOT NULL,
    displayToken TEXT NOT NULL,
    switches TEXT NOT NULL DEFAULT '{"tokens":true,"drawing":true,"notes":true,"fog":false,"uploads":false}',
    trustedPlayerIds TEXT NOT NULL DEFAULT '[]',
    documentVersion INTEGER NOT NULL,
    document TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL COLLATE NOCASE UNIQUE,
    passwordHash TEXT NOT NULL,
    administrator INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sign_ins (
    tokenHash TEXT PRIMARY KEY,
    accountId TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    createdAt INTEGER NOT NULL,
    lastUsedAt INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sign_ins_account ON sign_ins(accountId);
  CREATE TABLE IF NOT EXISTS invites (
    tokenHash TEXT PRIMARY KEY,
    expiresAt INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS resets (
    tokenHash TEXT PRIMARY KEY,
    accountId TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    expiresAt INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS room_assets (
    roomId TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    assetId TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    PRIMARY KEY (roomId, assetId)
  );
  CREATE INDEX IF NOT EXISTS room_assets_asset ON room_assets(assetId);
  CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

export class OwlbearDatabase {
  readonly connection: Database;

  constructor(private readonly path: string, upgrades: readonly import("./startup").UpgradeStep[] = []) {
    mkdirSync(dirname(path), { recursive: true });
    const existing = existsSync(path);
    const version = existing ? inspectDatabase(path, LAYOUT_VERSION) : LAYOUT_VERSION;
    this.connection = new Database(path, { create: true, strict: true });
    try {
      this.transaction(() => {
        for (const step of upgrades) {
          if (step.version > version && step.version <= LAYOUT_VERSION) this.connection.exec(step.sql);
        }
        this.connection.exec(layout);
        if (!existing || version < LAYOUT_VERSION) {
          this.connection.exec(`PRAGMA user_version = ${LAYOUT_VERSION}`);
        }
      });
    } catch (error) {
      this.close();
      throw new Error(`Unable to upgrade database ${path}: ${(error as Error).message}. Restore ${path}.before-upgrade with the server stopped, or use the previous executable.`);
    }
  }

  /** SQLite transactions are synchronous: never await inside this callback. */
  transaction<T>(change: () => T extends PromiseLike<unknown> ? never : T): T {
    return this.connection.transaction(() => {
      const result = change();
      if (result && typeof (result as any).then === "function") {
        throw new Error("Database transactions must be synchronous");
      }
      return result;
    })();
  }

  room(id: string): RoomRecord | undefined {
    return this.connection.query<RoomRecord, [string]>("SELECT * FROM rooms WHERE id = ?").get(id) ?? undefined;
  }

  saveRoom(record: RoomRecord): void {
    this.connection.query(`INSERT INTO rooms (id, passwordHash, displayToken, documentVersion, document, name, gmAccountId, hasPassword, switches, trustedPlayerIds)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET
      passwordHash = excluded.passwordHash, displayToken = excluded.displayToken,
      documentVersion = excluded.documentVersion, document = excluded.document,
      name = excluded.name, gmAccountId = excluded.gmAccountId, hasPassword = excluded.hasPassword, switches = excluded.switches, trustedPlayerIds = excluded.trustedPlayerIds`)
      .run(record.id, record.passwordHash, record.displayToken, record.documentVersion, record.document, record.name, record.gmAccountId, record.hasPassword, record.switches ?? JSON.stringify({ tokens: true, drawing: true, notes: true, fog: false, uploads: false }), record.trustedPlayerIds ?? "[]");
  }

  roomsForGM(accountId: string): RoomRecord[] {
    return this.connection.query<RoomRecord, [string]>("SELECT * FROM rooms WHERE gmAccountId = ? ORDER BY name, id").all(accountId);
  }

  administratorRooms(): (RoomRecord & { gmUsername: string })[] {
    return this.connection.query<RoomRecord & { gmUsername: string }, []>(`
      SELECT rooms.*, accounts.username AS gmUsername FROM rooms
      JOIN accounts ON accounts.id = rooms.gmAccountId ORDER BY rooms.name, rooms.id`).all();
  }

  diskSizeBytes(): number {
    return [this.path, `${this.path}-wal`, `${this.path}-shm`, `${this.path}-journal`]
      .reduce((total, path) => total + (existsSync(path) ? statSync(path).size : 0), 0);
  }

  /** Saved UTF-8 document bytes plus each image this room has used. */
  roomSizeBytes(roomId: string): number {
    return this.connection.query<{ sizeBytes: number }, [string]>(`
      SELECT length(CAST(document AS BLOB)) + COALESCE((
        SELECT SUM(assets.size) FROM room_assets
        JOIN assets ON assets.id = room_assets.assetId WHERE room_assets.roomId = rooms.id
      ), 0) AS sizeBytes FROM rooms WHERE id = ?`).get(roomId)?.sizeBytes ?? 0;
  }

  recordRoomAsset(roomId: string, assetId: string): void {
    this.connection.query(`INSERT OR IGNORE INTO room_assets (roomId, assetId)
      SELECT rooms.id, assets.id FROM rooms, assets WHERE rooms.id = ? AND assets.id = ?`)
      .run(roomId, assetId);
  }

  deleteRoom(roomId: string): AssetRecord[] {
    return this.transaction(() => {
      const unused = this.connection.query<AssetRecord, [string]>(`
        SELECT assets.* FROM assets JOIN room_assets ON room_assets.assetId = assets.id
        WHERE room_assets.roomId = ? AND NOT EXISTS (
          SELECT 1 FROM room_assets other WHERE other.assetId = assets.id AND other.roomId != room_assets.roomId
        )`).all(roomId);
      this.connection.query("DELETE FROM room_assets WHERE roomId = ?").run(roomId);
      this.connection.query("DELETE FROM rooms WHERE id = ?").run(roomId);
      for (const asset of unused) this.deleteAsset(asset.id);
      return unused;
    });
  }

  asset(id: string): AssetRecord | undefined {
    return this.connection.query<AssetRecord, [string]>("SELECT * FROM assets WHERE id = ?").get(id) ?? undefined;
  }

  insertAsset(record: AssetRecord): void {
    this.connection.query(`INSERT INTO assets (id, hash, size, mime, width, height, owner, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(record.id, record.hash, record.size, record.mime, record.width, record.height, record.owner, record.createdAt);
  }

  deleteAsset(id: string): void {
    this.connection.query("DELETE FROM assets WHERE id = ?").run(id);
  }

  hasHash(hash: string): boolean {
    return !!this.connection.query("SELECT 1 FROM assets WHERE hash = ? LIMIT 1").get(hash);
  }

  legacyAssetsImported(): boolean {
    return !!this.connection.query("SELECT 1 FROM metadata WHERE key = 'legacy_assets_imported'").get();
  }

  markLegacyAssetsImported(): void {
    this.connection.query("INSERT INTO metadata VALUES ('legacy_assets_imported', '1')").run();
  }

  close(): void { this.connection.close(); }
}
