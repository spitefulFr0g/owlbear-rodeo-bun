import { LibraryRepository, documentFileIds } from "./library";
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, statSync } from "fs";
import { inspectDatabase, upgradeSteps } from "./startup";
import { dirname } from "path";
import type { AssetRecord } from "../entities/AssetStore";

export interface RoomRecord {
  id: string;
  name: string;
  gmAccountId: string | null;
  hasPassword: number;
  /** 1 while the room's session is running. */
  session: number;
  passwordHash: string;
  displayToken: string;
  switches?: string;
  trustedPlayerIds?: string;
  quota?: number;
  playerQuota?: number;
  documentVersion: number;
  document: string;
}

export const LAYOUT_VERSION = 4;

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
    quota INTEGER NOT NULL DEFAULT 2000000000,
    playerQuota INTEGER NOT NULL DEFAULT 100000000,
    trustedPlayerIds TEXT NOT NULL DEFAULT '[]',
    documentVersion INTEGER NOT NULL,
    document TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL COLLATE NOCASE UNIQUE,
    passwordHash TEXT NOT NULL,
    quota INTEGER NOT NULL DEFAULT 2000000000,
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
  CREATE TABLE IF NOT EXISTS placed_files (
    roomId TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    fileId TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    PRIMARY KEY (roomId, fileId)
  );
  CREATE INDEX IF NOT EXISTS placed_files_asset ON placed_files(fileId);
  CREATE TABLE IF NOT EXISTS room_sessions (
    roomId TEXT PRIMARY KEY REFERENCES rooms(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS library_assets (
    id TEXT PRIMARY KEY, kind TEXT NOT NULL, libraryId TEXT NOT NULL, data TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS library_assets_library ON library_assets(kind, libraryId);
  CREATE TABLE IF NOT EXISTS library_folders (
    id TEXT PRIMARY KEY, kind TEXT NOT NULL, libraryId TEXT NOT NULL, data TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS library_folders_library ON library_folders(kind, libraryId);
  CREATE TABLE IF NOT EXISTS library_files (
    entryId TEXT NOT NULL REFERENCES library_assets(id) ON DELETE CASCADE,
    fileId TEXT NOT NULL, PRIMARY KEY(entryId, fileId)
  );
  CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

const roomRecords = "SELECT rooms.*, EXISTS (SELECT 1 FROM room_sessions WHERE roomId = rooms.id) AS session FROM rooms";

export class OwlbearDatabase {
  readonly connection: Database;

  constructor(private readonly path: string, upgrades: readonly import("./startup").UpgradeStep[] = upgradeSteps) {
    mkdirSync(dirname(path), { recursive: true });
    const existing = existsSync(path);
    const version = existing ? inspectDatabase(path, LAYOUT_VERSION) : LAYOUT_VERSION;
    this.connection = new Database(path, { create: true, strict: true });
    try {
      this.transaction(() => {
        for (const step of upgrades) {
          if (step.version > version && step.version <= LAYOUT_VERSION) this.connection.exec(step.sql);
        }
        if (existing && version < 4) {
          for (const [table, column, value] of [["rooms", "quota", 2000000000], ["rooms", "playerQuota", 100000000], ["accounts", "quota", 2000000000]] as const) {
            const columns = this.connection.query<{ name: string }, []>(`PRAGMA table_info(${table})`).all();
            if (columns.length && !columns.some(field => field.name === column)) this.connection.exec(`ALTER TABLE ${table} ADD COLUMN ${column} INTEGER NOT NULL DEFAULT ${value}`);
          }
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
    return this.connection.query<RoomRecord, [string]>(`${roomRecords} WHERE id = ?`).get(id) ?? undefined;
  }

  saveRoom(record: RoomRecord): void {
    this.transaction(() => {
      this.connection.query(`INSERT INTO rooms (id, passwordHash, displayToken, documentVersion, document, name, gmAccountId, hasPassword, switches, trustedPlayerIds)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET
        passwordHash = excluded.passwordHash, displayToken = excluded.displayToken,
        documentVersion = excluded.documentVersion, document = excluded.document,
        name = excluded.name, gmAccountId = excluded.gmAccountId, hasPassword = excluded.hasPassword, switches = excluded.switches, trustedPlayerIds = excluded.trustedPlayerIds`)
        .run(record.id, record.passwordHash, record.displayToken, record.documentVersion, record.document, record.name, record.gmAccountId, record.hasPassword, record.switches ?? JSON.stringify({ tokens: true, drawing: true, notes: true, fog: false, uploads: false, ownerOnly: false }), record.trustedPlayerIds ?? "[]");
      this.connection.query(record.session ? "INSERT OR IGNORE INTO room_sessions (roomId) VALUES (?)" : "DELETE FROM room_sessions WHERE roomId = ?").run(record.id);
    });
  }

  roomIdsInSession(): string[] {
    return this.connection.query<{ id: string }, []>("SELECT roomId AS id FROM room_sessions").all().map(room => room.id);
  }

  roomsForGM(accountId: string): RoomRecord[] {
    return this.connection.query<RoomRecord, [string]>(`${roomRecords} WHERE gmAccountId = ? ORDER BY name, id`).all(accountId);
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

  /** Library references count in full; placed files outside that library count once. */
  roomSizeBytes(roomId: string): number {
    const usage = this.library.usage({ kind: "room", id: roomId });
    return (this.connection.query<{ sizeBytes: number }, [string]>(`
      SELECT length(CAST(document AS BLOB)) + COALESCE((
        SELECT SUM(assets.size) FROM assets JOIN placed_files ON fileId = assets.id
        WHERE roomId = rooms.id AND NOT EXISTS (
          SELECT 1 FROM library_files JOIN library_assets ON entryId = library_assets.id
          WHERE library_files.fileId = assets.id AND kind = 'room' AND libraryId = rooms.id)
      ), 0) AS sizeBytes FROM rooms WHERE id = ?`).get(roomId)?.sizeBytes ?? 0) + usage.bytes + usage.reservedBytes;
  }

  accountLibrarySizeBytes(accountId: string): number {
    const usage = this.library.usage({ kind: "account", id: accountId });
    return usage.bytes + usage.reservedBytes;
  }

  private recordPlacedFile(roomId: string, fileId: string): void {
    this.connection.query(`INSERT OR IGNORE INTO placed_files (roomId, fileId)
      SELECT rooms.id, assets.id FROM rooms, assets WHERE rooms.id = ? AND assets.id = ?`)
      .run(roomId, fileId);
  }

  deleteRoom(roomId: string): AssetRecord[] {
    return this.transaction(() => {
      for (const entry of this.library.assets({ kind: "room", id: roomId })) this.library.deleteAsset(entry.id);
      for (const folder of this.library.folders({ kind: "room", id: roomId })) this.library.deleteFolder(folder.id);
      this.connection.query("DELETE FROM placed_files WHERE roomId = ?").run(roomId);
      this.connection.query("DELETE FROM room_sessions WHERE roomId = ?").run(roomId);
      this.connection.query("DELETE FROM rooms WHERE id = ?").run(roomId);
      return this.collectUnusedFiles();
    });
  }

  readonly library = new LibraryRepository(this);

  placedFileIds(roomId: string): Set<string> {
    return new Set(this.connection.query<{ fileId: string }, [string]>("SELECT fileId FROM placed_files WHERE roomId = ?").all(roomId).map(row => row.fileId));
  }

  recordPlacedFiles(roomId: string, document: unknown): void {
    for (const id of documentFileIds(document)) this.recordPlacedFile(roomId, id);
  }

  rebuildPlacedFiles(): void {
    this.transaction(() => {
      this.connection.exec("DELETE FROM placed_files");
      for (const room of this.connection.query<{ id: string; document: string }, []>("SELECT id, document FROM rooms").all()) {
        this.recordPlacedFiles(room.id, JSON.parse(room.document));
      }
    });
  }

  collectUnusedFiles(): AssetRecord[] {
    return this.transaction(() => {
      const unused = this.connection.query<AssetRecord, []>(`SELECT * FROM assets WHERE
        NOT EXISTS (SELECT 1 FROM placed_files WHERE fileId = assets.id) AND
        NOT EXISTS (SELECT 1 FROM library_files WHERE fileId = assets.id)`).all();
      for (const file of unused) this.deleteAsset(file.id);
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
