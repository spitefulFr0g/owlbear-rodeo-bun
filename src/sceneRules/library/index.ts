import type { ImageSource, Person } from "../types";
import type { AssetType, LibraryAsset, LibraryFiles, LibraryIdentity, LibrarySection, LibraryViewAsset, LibraryViewOptions, PlacementContext, QuotaUsage } from "./types";
import { assetTypes } from "./types";
export * from "./types";

export const maxLibraryAssets = 10_000;
export const maxLibraryFolders = 1_000;
// Decimal bytes, matching the MB/GB labels shown to people.
export const defaultLibraryQuota = 2_000_000_000;
export const defaultPlayerQuota = 100_000_000;

export function checkLibraryName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const name = value.trim();
  return name.length >= 1 && name.length <= 100 ? name : undefined;
}
export const checkAssetName = checkLibraryName;
export const checkFolderName = checkLibraryName;

export function maySetAssetType(role: Person["role"], value: unknown): value is AssetType {
  return role !== "display" && assetTypes.some(type => type === value) && (role === "gm" || value !== "map");
}
export function legacyCategoryToAssetType(category: "vehicle" | Exclude<AssetType, "map">): Exclude<AssetType, "map"> {
  return category === "vehicle" ? "mount" : category;
}
export function mayUpload(role: Person["role"], uploads: boolean): boolean {
  return role === "gm" || role === "trusted" || (role === "player" && uploads);
}
function countFits(held: number, reserved: number, incoming: number, cap: number): boolean {
  return [held, reserved, incoming].every(value => Number.isSafeInteger(value) && value >= 0) && held + reserved + incoming <= cap;
}
export function checkAssetCount(held: number, reserved = 0, incoming = 1): boolean {
  return countFits(held, reserved, incoming, maxLibraryAssets);
}
export function checkFolderCount(held: number, incoming = 1): boolean {
  return countFits(held, 0, incoming, maxLibraryFolders);
}
/** Counts each role in full, even when files share bytes or hashes. */
export function assetBytes(files: LibraryFiles): number {
  return Object.values(files).reduce((sum, file) => sum + file.size, 0);
}
export function checkQuota(usage: QuotaUsage, incomingBytes: number): boolean {
  return [usage.bytes, usage.reservedBytes, usage.quota, incomingBytes].every(value => Number.isSafeInteger(value) && value >= 0) &&
    usage.bytes + usage.reservedBytes + incomingBytes <= usage.quota;
}
/** Room uploads pass both quotas; account uploads/moves pass the account quota alone. */
export function quotaError(incomingBytes: number, library: QuotaUsage, kind: LibraryIdentity["kind"], player?: QuotaUsage): string | undefined {
  if (!checkQuota(library, incomingBytes)) return kind === "room" ? "Room quota exceeded" : "Account quota exceeded";
  if (player && !checkQuota(player, incomingBytes)) return "Player quota exceeded";
  return undefined;
}
/** A lowered quota is valid even when existing usage exceeds it. */
export function checkPlayerQuota(value: number, roomQuota: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && Number.isSafeInteger(roomQuota) && value <= roomQuota;
}
export function sameLibrary(a: LibraryIdentity, b: LibraryIdentity): boolean {
  return a.kind === b.kind && a.id === b.id;
}
export function maySeeAsset(asset: LibraryAsset, context: Pick<PlacementContext, "person" | "roomId" | "accountId">): boolean {
  if (context.person.role === "display") return false;
  if (asset.library.kind === "account") return context.person.role === "gm" && asset.library.id === context.accountId;
  return asset.library.id === context.roomId && (context.person.role === "gm" || asset.uploader === context.person.id);
}
/** File authority only: scene layer/tool permissions are checked separately. */
export function mayPlaceImage(image: ImageSource, context: PlacementContext): boolean {
  if (image.type === "default") return true;
  if (context.person.role === "display") return false;
  const allowed = new Set(context.placedFileIds);
  for (const asset of context.assets) {
    if (!asset.uploading && maySeeAsset(asset, context)) {
      for (const file of Object.values(asset.files)) allowed.add(file.id);
    }
  }
  return [image.file, image.thumbnail, ...Object.values(image.resolutions || {})]
    .filter((id): id is string => id !== undefined).every(id => allowed.has(id));
}
/** Case-insensitive subsequence matching: "gbl" matches "Goblin". */
export function fuzzyLibraryMatch(name: string, search: string): boolean {
  const haystack = name.toLowerCase();
  let position = 0;
  for (const character of search.trim().toLowerCase()) {
    position = haystack.indexOf(character, position);
    if (position === -1) return false;
    position++;
  }
  return true;
}
export function librarySections(options: LibraryViewOptions): LibrarySection[] {
  const { person, search = "", order = "name" } = options;
  if (person.role === "display") return [];
  const visible = options.assets.filter(asset => !asset.uploading && maySeeAsset(asset, options));
  const byName = (a: { name: string; id: string }, b: { name: string; id: string }) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  const sortAssets = <T extends LibraryViewAsset>(assets: T[]): T[] => assets.sort((a, b) =>
    (order === "newest" ? b.created - a.created : 0) || byName(a, b));
  const matches = (asset: LibraryViewAsset) => (!options.type || asset.type === options.type) && fuzzyLibraryMatch(asset.name, search);
  const sections: LibrarySection[] = [];
  function add(id: LibrarySection["id"], heading: string, library: LibrarySection["library"], assets: LibraryAsset[], owner: (value: string | null) => boolean) {
    if (options.filter && options.filter !== "all" && options.filter !== library) return;
    const folders = options.folders.filter(folder => folder.library.kind === library &&
      folder.library.id === (library === "room" ? options.roomId : options.accountId) && owner(folder.owner))
      .sort(byName).map(folder => ({ ...folder, assets: sortAssets(assets.filter(asset => asset.folderId === folder.id && matches(asset))), open: !!search.trim() }))
      .filter(folder => !search.trim() || folder.assets.length > 0 || fuzzyLibraryMatch(folder.name, search));
    const folderIds = new Set(folders.map(folder => folder.id));
    sections.push({ id, heading, library, folders, assets: sortAssets(assets.filter(asset => (!asset.folderId || !folderIds.has(asset.folderId)) && matches(asset))) });
  }
  const room = visible.filter(asset => asset.library.kind === "room");
  if (person.role === "gm") {
    add("room", "This room", "room", room.filter(asset => asset.uploader === null), owner => owner === null);
    const players = room.filter(asset => asset.uploader !== null);
    if (players.length || options.folders.some(folder => folder.library.kind === "room" && folder.library.id === options.roomId && folder.owner !== null)) {
      add("players", "From players", "room", players, owner => owner !== null);
    }
    add("account", "My library", "account", visible.filter(asset => asset.library.kind === "account"), () => true);
  } else {
    add("uploads", "My uploads", "room", room, owner => owner === person.id);
  }
  if (!options.filter || options.filter === "all" || options.filter === "server") {
    sections.push({ id: "server", heading: "Server set", library: "server", folders: [], assets: sortAssets(options.serverSet.filter(matches)) });
  }
  return sections;
}

export * from "./wire";
