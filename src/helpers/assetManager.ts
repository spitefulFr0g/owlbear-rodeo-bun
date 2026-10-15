import {
  AssetDefaults,
  AssetType,
  checkAssetName,
  LibraryAsset,
  LibraryCommand,
  LibrarySection,
  LibrarySectionId,
  librarySections,
  LibraryViewAsset,
  LibraryViewFolder,
  LibraryViewOptions,
} from "../sceneRules/library";
import { Grid } from "../types/Grid";
import { Map as BrowserMap } from "../types/Map";
import { Token } from "../types/Token";
import type { BundledLibraryAsset } from "./serverSet";

/**
 * The Asset Manager's sources: the dock's sections over every asset type a
 * role may use. Map is the GM's alone, so a player sees no server set maps,
 * and "From players" shows only with something under it.
 */
export function managerSections(options: LibraryViewOptions): LibrarySection[] {
  const gm = options.person.role === "gm";
  return librarySections({ ...options, folders: gm ? options.folders.filter(folder => folder.owner === null) : options.folders })
    .map((section) => (gm ? section : { ...section, assets: section.assets.filter((asset) => asset.type !== "map") }))
    .filter((section) => section.id !== "players" || section.folders.length > 0 || section.assets.length > 0);
}

export type ManagerView = {
  /** The open folder, when the breadcrumb is inside one */
  folder?: LibraryViewFolder;
  /** Folder tiles, shown only at the top of a source */
  folders: LibraryViewFolder[];
  assets: LibraryViewAsset[];
};

/**
 * What one source shows: its folders then its loose assets at the top, or one
 * folder's assets. A search opens every folder holding a match, so at the top
 * its matches follow the loose ones.
 */
export function managerView(section: LibrarySection | undefined, folderId: string | null): ManagerView {
  if (!section) return { folders: [], assets: [] };
  const folder = folderId ? section.folders.find((candidate) => candidate.id === folderId) : undefined;
  if (folder) return { folder, folders: [], assets: folder.assets };
  return {
    folders: section.folders,
    assets: [...section.assets, ...section.folders.filter((candidate) => candidate.open).flatMap((candidate) => candidate.assets)],
  };
}

/** Where an asset sits among the sources, to open the manager on it */
export function locateAsset(
  sections: LibrarySection[],
  assetId: string
): { section: LibrarySectionId; folderId: string | null } | undefined {
  for (const section of sections) {
    if (section.assets.some((asset) => asset.id === assetId)) return { section: section.id, folderId: null };
    const folder = section.folders.find((candidate) => candidate.assets.some((asset) => asset.id === assetId));
    if (folder) return { section: section.id, folderId: folder.id };
  }
  return undefined;
}

/** The library a new folder in a source belongs to; none for the server set or the GM's view of player uploads */
export function folderLibrary(section: LibrarySectionId): "room" | "account" | undefined {
  if (section === "room" || section === "uploads") return "room";
  if (section === "account") return "account";
  return undefined;
}

/** What the image editor holds while a person changes it */
export type EditorDraft = { name: string; type: AssetType; defaults: AssetDefaults };

export function editorDraft(asset: LibraryAsset): EditorDraft {
  return { name: asset.name, type: asset.type, defaults: asset.defaults };
}

function sameJSON(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * The edit command for a draft, sending only what changed. Defaults go whole,
 * so a map's saved grid and a token's size and label both survive a change of
 * type and back.
 */
export function editorCommand(
  asset: LibraryAsset,
  draft: EditorDraft
): { command?: Extract<LibraryCommand, { action: "edit" }>; error?: string } {
  const name = checkAssetName(draft.name);
  if (!name) return { error: "A name is 1 to 100 characters" };
  const { defaultSize, grid } = draft.defaults;
  if (!(Number.isFinite(defaultSize) && defaultSize > 0)) return { error: "The default size must be more than 0" };
  if (!(Number.isSafeInteger(grid.size.x) && grid.size.x > 0 && Number.isSafeInteger(grid.size.y) && grid.size.y > 0)) {
    return { error: "A grid needs at least 1 column and 1 row" };
  }
  const changes: Extract<LibraryCommand, { action: "edit" }>["changes"] = {};
  if (name !== asset.name) changes.name = name;
  if (draft.type !== asset.type) changes.type = draft.type;
  if (!sameJSON(draft.defaults, asset.defaults)) changes.defaults = draft.defaults;
  return Object.keys(changes).length > 0 ? { command: { action: "edit", id: asset.id, changes } } : {};
}

/** The best stored copy to align a grid on: medium, then high, low and ultra before the original */
export function previewFileId(asset: LibraryAsset): string {
  const { files } = asset;
  return (files.medium || files.high || files.low || files.ultra || files.original).id;
}

/**
 * The asset as the existing map preview reads one, so the editor reuses the
 * grid preview without the browser library
 */
export function editorMap(asset: LibraryAsset | BundledLibraryAsset, grid: Grid): BrowserMap {
  const base = {
    id: asset.id, name: asset.name, owner: "", grid, width: asset.width, height: asset.height,
    lastModified: asset.created, created: asset.created, showGrid: true, snapToGrid: true,
  };
  if ("key" in asset) return { ...base, type: "default", key: asset.key };
  return { ...base, type: "file", file: previewFileId(asset), resolutions: {}, thumbnail: asset.files.thumbnail?.id || "", quality: "original" };
}

/** The asset as the existing token preview reads one, showing its default size */
export function editorToken(asset: LibraryAsset | BundledLibraryAsset, defaults: AssetDefaults): Token {
  const base = {
    id: asset.id, name: asset.name, defaultSize: defaults.defaultSize, defaultCategory: "character" as const,
    defaultLabel: defaults.defaultLabel, hideInSidebar: false, width: asset.width, height: asset.height,
    owner: "", created: asset.created, lastModified: asset.created, outline: asset.outline,
  };
  if ("key" in asset) return { ...base, type: "default", key: asset.key };
  return { ...base, type: "file", file: asset.files.original.id, thumbnail: asset.files.thumbnail?.id || "" };
}
