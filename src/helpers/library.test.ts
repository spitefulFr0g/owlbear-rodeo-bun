import { sceneLibraryMap } from "./libraryScene";
import { sceneFromMap } from "../scene/mapItem";
import { applyLibraryDelta, browserImportRecord, dropPositions, filenameGridSize, importedAsset, libraryDefaults, libraryImage, libraryItem } from "./library";
import { defaultSceneGrid } from "../sceneRules";
import { LibraryAsset, LibrarySnapshot } from "../sceneRules/library";
import { FileMap } from "../types/Map";
import { FileToken } from "../types/Token";

const asset: LibraryAsset = {
  id: "entry", library: { kind: "room", id: "room" }, name: "Cave", type: "map", folderId: null,
  uploader: null, created: 1, files: { original: { id: "original", size: 100 }, thumbnail: { id: "thumb", size: 10 },
    medium: { id: "medium", size: 50 } }, width: 1000, height: 800,
  outline: { type: "rect", x: 0, y: 0, width: 1000, height: 800 },
  defaults: { ...libraryDefaults({ x: 10, y: 8 }), defaultSize: 2, defaultLabel: "Hero" }, uploading: false,
};

test("file names supply small, rectangular and large map grids", () => {
  expect(filenameGridSize("cave 10x8.png")).toEqual({ x: 10, y: 8 });
  expect(filenameGridSize("room 1 X 2.webp")).toEqual({ x: 1, y: 2 });
  expect(filenameGridSize("continent 300x450.png")).toEqual({ x: 300, y: 450 });
  expect(filenameGridSize("room 0x8.png")).toBeUndefined();
  expect(filenameGridSize("room.png")).toBeUndefined();
});

test("a multi-file drop fans items around the chosen point without overlap", () => {
  expect(dropPositions(0, { x: 10, y: 20 }, 150)).toEqual([]);
  expect(dropPositions(1, { x: 10, y: 20 }, 150)).toEqual([{ x: 10, y: 20 }]);
  expect(dropPositions(3, { x: 10, y: 20 }, 150)).toEqual([
    { x: -65, y: -55 }, { x: 85, y: -55 }, { x: 10, y: 95 },
  ]);
});

test("placing a map uses stored file identities and leaves it locked and unaligned at the drop", () => {
  const item = libraryItem({ ...asset, image: libraryImage(asset) }, { x: 17, y: 23 }, defaultSceneGrid, "gm", "item");
  expect(item.image).toEqual({ type: "file", file: "original", thumbnail: "thumb", resolutions: { medium: "medium" } });
  expect(item.position).toEqual({ x: 17, y: 23 });
  expect(item.scale).toEqual({ x: 1.5, y: 1.5 });
  expect(item.locked).toBe(true);
  expect(item.layer).toBe("map");
  expect(item.metadata).toEqual({});
});

test("placing a token copies its type, size and label without changing saved map defaults", () => {
  const token = { ...asset, type: "mount" as const, image: libraryImage(asset) };
  const item = libraryItem(token, { x: 0, y: 0 }, defaultSceneGrid, "player", "item");
  expect(item.layer).toBe("mount");
  expect(item.scale).toEqual({ x: 0.3, y: 0.3 });
  expect(item.label).toBe("Hero");
  expect(item.locked).toBe(false);
  expect(token.defaults.grid.size).toEqual({ x: 10, y: 8 });
});

const token: FileToken = { id: "token", name: "Horse", type: "file", file: "old-file", thumbnail: "old-thumb",
  defaultSize: 2, defaultCategory: "vehicle", defaultLabel: "Pony", hideInSidebar: true,
  width: 100, height: 100, owner: "browser", created: 1, lastModified: 1,
  outline: { type: "circle", x: 50, y: 50, radius: 50 } };
const map: FileMap = { id: "map", name: "Cave", type: "file", file: "old-map", thumbnail: "old-thumb",
  width: 100, height: 80, owner: "browser", created: 1, lastModified: 1, grid: libraryDefaults({ x: 10, y: 8 }).grid,
  resolutions: {}, quality: "original", showGrid: false, snapToGrid: true };

test("browser import keeps token defaults and converts vehicle to Mount and groups to folder names", () => {
  const converted = browserImportRecord(token, [{ type: "group", id: "group", name: "Party", items: [{ type: "item", id: token.id }] }])!;
  expect(converted.type).toBe("mount");
  expect(converted.folderName).toBe("Party");
  expect(converted.defaults.defaultSize).toBe(2);
  expect(converted.defaults.defaultLabel).toBe("Pony");
  expect(converted.originalId).toBe("old-file");
  expect(converted).not.toHaveProperty("hideInSidebar");
  expect(browserImportRecord({ ...token, type: "default", key: "horse" }, [])).toBeUndefined();
});

test("browser import keeps the map's saved alignment and leaves ungrouped images at the top", () => {
  const converted = browserImportRecord(map, [])!;
  expect(converted.type).toBe("map");
  expect(converted.defaults.grid).toEqual(map.grid);
  expect(converted.folderName).toBeUndefined();
  expect(map.file).toBe("old-map");
});

test("library deltas replace records, remove departed entries and refresh quota usage", () => {
  const snapshot: LibrarySnapshot = { assets: [asset], folders: [], usage: { player: { bytes: 160, reservedBytes: 0, quota: 200 } } };
  const usage = { player: { bytes: 0, reservedBytes: 0, quota: 200 } };
  expect(applyLibraryDelta(snapshot, { assets: { added: [], changed: [], removed: [asset.id] },
    folders: { added: [], changed: [], removed: [] }, usage })).toEqual({ assets: [], folders: [], usage });
  expect(snapshot.assets).toEqual([asset]);
  const changed = { ...asset, name: "Renamed" };
  expect(applyLibraryDelta(snapshot, { assets: { added: [], changed: [changed], removed: [] },
    folders: { added: [], changed: [], removed: [] }, usage }).assets).toEqual([changed]);
});

test("a new scene aligns the saved small grid and retains every stored quality copy", () => {
  const map = sceneLibraryMap(asset);
  const scene = sceneFromMap(map, undefined, "map-item");
  expect(scene.name).toBe("Cave");
  expect(scene.map.image).toEqual({ type: "file", file: "original", thumbnail: "thumb", resolutions: { medium: "medium" } });
  expect(scene.map.scale).toEqual({ x: 1.5, y: 1.5 });
  expect(scene.map.locked).toBe(true);
  expect(asset.defaults.grid.size).toEqual({ x: 10, y: 8 });
});

test("a rerun skips an original only while the asset it became is still in the account library", () => {
  const imported: LibraryAsset = { ...asset, id: "imported", library: { kind: "account", id: "account" } };
  const marks = { "old-file": "imported" };
  expect(importedAsset(marks, [imported], "account", "old-file")).toBe(imported);
  expect(importedAsset(marks, [imported], "account", "other-file")).toBeUndefined();
  expect(importedAsset(marks, [], "account", "old-file")).toBeUndefined();
  expect(importedAsset(marks, [{ ...imported, library: { kind: "room", id: "room" } }], "account", "old-file")).toBeUndefined();
  expect(importedAsset(marks, [imported], "another account", "old-file")).toBeUndefined();
  expect(importedAsset(marks, [{ ...imported, uploading: true }], "account", "old-file")).toBeUndefined();
});
