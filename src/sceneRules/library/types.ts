import type { Grid } from "../../types/Grid";
import type { Outline, Person } from "../types";

export const assetTypes = ["map", "prop", "mount", "character", "attachment"] as const;
export type AssetType = typeof assetTypes[number];
export type LibraryRole = Person["role"];
export type LibraryIdentity = { kind: "room" | "account"; id: string };
export const storedFileRoles = ["original", "thumbnail", "low", "medium", "high", "ultra"] as const;
export type StoredFileRole = typeof storedFileRoles[number];
export type StoredFileReference = { id: string; size: number };
export type LibraryFiles = { original: StoredFileReference } & Partial<Record<StoredFileRole, StoredFileReference>>;
export type AssetDefaults = { defaultSize: number; defaultLabel: string; grid: Grid };
export type LibraryAsset = {
  id: string;
  library: LibraryIdentity;
  name: string;
  type: AssetType;
  folderId: string | null;
  uploader: string | null;
  uploaderName?: string;
  created: number;
  files: LibraryFiles;
  width: number;
  height: number;
  outline: Outline;
  defaults: AssetDefaults;
  uploading: boolean;
};
export type LibraryFolder = {
  id: string;
  library: LibraryIdentity;
  name: string;
  owner: string | null;
};
export type ServerSetAsset = {
  id: string;
  key: string;
  name: string;
  type: AssetType;
  created: number;
};
export type LibraryUsage = { bytes: number; reservedBytes: number; assets: number; reservedAssets: number; folders: number };
export type QuotaUsage = { bytes: number; reservedBytes: number; quota: number };
export type RoomLibraryUsage = {
  room: QuotaUsage;
  gmBytes: number;
  players: Record<string, number>;
  playerQuota: number;
  account: QuotaUsage;
};
export type PlayerLibraryUsage = { player: QuotaUsage };
export type PlacementContext = {
  person: Person;
  roomId: string;
  accountId?: string;
  assets: readonly LibraryAsset[];
  placedFileIds: ReadonlySet<string>;
};
export type LibraryFilter = "all" | "room" | "account" | "server";
export type LibraryOrder = "name" | "newest";
export type LibrarySectionId = "room" | "players" | "account" | "uploads" | "server";
export type LibraryViewAsset = LibraryAsset | ServerSetAsset;
export type LibraryViewFolder = LibraryFolder & { assets: LibraryAsset[]; open: boolean };
export type LibrarySection = {
  id: LibrarySectionId;
  heading: string;
  library: LibraryFilter;
  folders: LibraryViewFolder[];
  assets: LibraryViewAsset[];
};
export type LibraryViewOptions = {
  person: Person;
  roomId: string;
  accountId?: string;
  assets: readonly LibraryAsset[];
  folders: readonly LibraryFolder[];
  serverSet: readonly ServerSetAsset[];
  filter?: LibraryFilter;
  order?: LibraryOrder;
  search?: string;
  type?: AssetType;
};
