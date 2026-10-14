import type { LibraryAsset, LibraryFolder, LibraryIdentity, LibraryFiles, StoredFileRole, RoomLibraryUsage, PlayerLibraryUsage } from "./types";

export type LibraryBegin = Pick<LibraryAsset, "name" | "type" | "width" | "height" | "outline" | "defaults"> & {
  import?: boolean;
  folderId?: string | null;
  files: Partial<Record<StoredFileRole, { size: number; mime: string }>> & { original: { size: number; mime: string } };
};
export type LibraryReservation = { assetId: string; files: LibraryFiles };
export type LibraryUploadResult = { id: string; duplicate?: LibraryAsset };
export type LibrarySnapshot = { assets: LibraryAsset[]; folders: LibraryFolder[]; usage: RoomLibraryUsage | PlayerLibraryUsage };
export type LibraryDelta = { assets: { added: LibraryAsset[]; changed: LibraryAsset[]; removed: string[] }; folders: { added: LibraryFolder[]; changed: LibraryFolder[]; removed: string[] }; usage: LibrarySnapshot["usage"] };
export type LibraryCommand =
  | { action: "edit"; id: string; changes: Partial<Pick<LibraryAsset, "name" | "type" | "defaults" | "folderId">> }
  | { action: "delete"; id: string }
  | { action: "move"; id: string; destination: "room" | "account" }
  | { action: "folder-create"; library: LibraryIdentity["kind"]; name: string }
  | { action: "folder-edit"; id: string; name: string }
  | { action: "folder-delete"; id: string }
  | { action: "player-quota"; bytes: number };
export type LibraryAck = { ok: true; id?: string } | { ok: false; error: string };
export type LibraryCompleteResult = { asset: LibraryAsset; duplicate?: boolean };
export type LibraryQuotaRequest = { bytes: number };
export type AccountLibrarySummary = { sizeBytes: number; quota: number };
export type AdministratorLibraryQuotas = {
  accounts: (AccountLibrarySummary & { id: string; username: string; administrator: boolean; usage: import("./types").LibraryUsage })[];
  rooms: (AccountLibrarySummary & { id: string; name: string; gmAccountId: string | null; playerQuota: number; usage: import("./types").LibraryUsage })[];
};
