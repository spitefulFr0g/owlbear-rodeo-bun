import { ImageSource, ImageItem, SceneGrid, Vector2 } from "../sceneRules";
import { AssetDefaults, LibraryAsset, LibraryDelta, LibrarySnapshot } from "../sceneRules/library";

export function filenameGridSize(name: string): Vector2 | undefined {
  const matches = Array.from(name.matchAll(/(\d+)\s*x\s*(\d+)/gi));
  for (const match of matches.reverse()) {
    const x = Number(match[1]), y = Number(match[2]);
    if (Number.isSafeInteger(x) && Number.isSafeInteger(y) && x > 0 && y > 0) return { x, y };
  }
}

export function libraryDefaults(size: Vector2 = { x: 22, y: 22 }): AssetDefaults {
  return { defaultSize: 1, defaultLabel: "", grid: { size, type: "square",
    inset: { topLeft: { x: 0, y: 0 }, bottomRight: { x: 1, y: 1 } },
    measurement: { type: "chebyshev", scale: "5ft" } } };
}

export function applyLibraryDelta(snapshot: LibrarySnapshot, delta: LibraryDelta): LibrarySnapshot {
  function update<T extends { id: string }>(held: T[], changes: { added: T[]; changed: T[]; removed: string[] }): T[] {
    const records = new Map(held.map(record => [record.id, record]));
    changes.removed.forEach(id => records.delete(id));
    [...changes.added, ...changes.changed].forEach(record => records.set(record.id, record));
    return Array.from(records.values());
  }
  return { assets: update(snapshot.assets, delta.assets), folders: update(snapshot.folders, delta.folders), usage: delta.usage };
}

/** A centred, square fan keeps the entire drop around the chosen world point. */
export function dropPositions(count: number, center: Vector2, spacing: number): Vector2[] {
  if (count <= 0) return [];
  const columns = Math.ceil(Math.sqrt(count)), rows = Math.ceil(count / columns);
  return Array.from({ length: count }, (_, index) => ({
    x: center.x + (index % columns - (Math.min(columns, count - Math.floor(index / columns) * columns) - 1) / 2) * spacing,
    y: center.y + (Math.floor(index / columns) - (rows - 1) / 2) * spacing,
  }));
}

export function libraryImage(asset: LibraryAsset): ImageSource {
  const resolutions: Record<string, string> = {};
  for (const role of ["low", "medium", "high", "ultra"] as const) {
    const file = asset.files[role];
    if (file) resolutions[role] = file.id;
  }
  return { type: "file", file: asset.files.original.id, thumbnail: asset.files.thumbnail?.id, resolutions };
}

export type PlaceableAsset = Pick<LibraryAsset, "type" | "width" | "height" | "outline" | "defaults"> & { image: ImageSource };
export function libraryItem(asset: PlaceableAsset, position: Vector2, grid: SceneGrid, owner: string, id: string): ImageItem {
  const scale = asset.type === "map" ? grid.unitsPerCell * asset.defaults.grid.size.x / asset.width
    : grid.unitsPerCell * asset.defaults.defaultSize / asset.width;
  return { id, kind: "image", layer: asset.type, position: { ...position }, scale: { x: scale, y: scale },
    rotation: 0, order: 0, owner, locked: asset.type === "map", hidden: false, metadata: {},
    image: asset.image, width: asset.width, height: asset.height,
    outline: asset.outline.type === "path" ? { ...asset.outline, points: [...asset.outline.points] } : { ...asset.outline },
    label: asset.type === "map" ? "" : asset.defaults.defaultLabel };
}
