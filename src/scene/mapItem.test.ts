import {
  applyChange, Change, checkChange, checkGrid, defaultSceneGrid, ImageItem, Item, Scene, SceneGrid,
} from "../sceneRules";
import { Map } from "../types/Map";
import { cellSize, snapPosition } from "./grid";
import {
  fitMap, importedSceneName, mapItem, mapSceneGrid, mapTopLeft, pickedMap, sameAlignment,
  sceneFromMap, sceneMapEdit,
} from "./mapItem";

function savedMap(type: SceneGrid["type"] = "square"): Map {
  return { id: "library-map", name: "Map", owner: "browser", type: "default", key: "grass",
    width: 1000, height: 800, created: 0, lastModified: 0, showGrid: false, snapToGrid: false,
    grid: { type, size: { x: 8, y: 6 },
      inset: { topLeft: { x: 0.1, y: 0.1 }, bottomRight: { x: 0.9, y: 0.85 } },
      measurement: { type: "euclidean", scale: "10m" } } };
}

for (const type of ["square", "hexVertical", "hexHorizontal"] as const) {
  test(`fits ${type} drawn cells to scene cells and aligns the inset to the lattice`, () => {
    const map = savedMap(type);
    const grid = mapSceneGrid(map, defaultSceneGrid);
    const fitted = fitMap(map, grid, { x: -370, y: 210 });
    const size = cellSize(grid);
    if (type !== "hexHorizontal") expect(800 / 8 * fitted.scale.x).toBeCloseTo(size.width);
    if (type !== "hexVertical") expect(600 / 6 * fitted.scale.y).toBeCloseTo(size.height);
    if (type !== "square") expect(fitted.scale.x).toBe(fitted.scale.y);
    const insetMiddle = {
      x: fitted.position.x - map.width * fitted.scale.x / 2 + 100 * fitted.scale.x + size.width / 2,
      y: fitted.position.y - map.height * fitted.scale.y / 2 + 80 * fitted.scale.y + size.height / 2,
    };
    const snapped = snapPosition(grid, insetMiddle, 2, false);
    expect(insetMiddle.x).toBeCloseTo(snapped.x);
    expect(insetMiddle.y).toBeCloseTo(snapped.y);
    expect(map.grid.inset.topLeft).toEqual({ x: 0.1, y: 0.1 });
  });
}

test("the first map with no inset begins at the origin and a replacement keeps that place", () => {
  const map = savedMap();
  map.grid.inset = { topLeft: { x: 0, y: 0 }, bottomRight: { x: 1, y: 1 } };
  const first = mapItem(map, defaultSceneGrid, "first");
  expect(mapTopLeft(first)).toEqual({ x: 0, y: 0 });
  const moved = { ...first, position: { x: first.position.x + 300, y: first.position.y - 150 } };
  const replacement = mapItem({ ...map, width: 2000 }, defaultSceneGrid, "next", mapTopLeft(moved));
  expect(mapTopLeft(replacement)).toEqual(mapTopLeft(moved));
});

test("picking copies type and measurement without changing scene cell size, visibility or snapping", () => {
  const grid = { ...defaultSceneGrid, unitsPerCell: 200, shown: false, snap: false };
  expect(mapSceneGrid(savedMap("hexHorizontal"), grid)).toEqual({ ...grid,
    type: "hexHorizontal", measurement: { type: "euclidean", scale: "10m" } });
});

test("the picker image is locked, GM owned and retains all stored resolution ids", () => {
  const map: Map = { ...savedMap(), type: "file", file: "original", thumbnail: "thumb",
    resolutions: { low: "low", high: "high" }, quality: "low" };
  const item = mapItem(map, defaultSceneGrid, "placed");
  expect(item.image).toEqual({ type: "file", file: "original", thumbnail: "thumb",
    resolutions: { low: "low", high: "high" } });
  expect(item.locked).toBe(true);
  expect(item.owner).toBe("gm");
  expect(item.metadata.mapQuality).toBe("low");
  expect(pickedMap({ id: "scene", grid: defaultSceneGrid, fogFill: false, viewOnly: false, movementMode: true, items: { placed: item } })).toEqual(item);
});

test("a scene made from a map is one create the server's rules accept", () => {
  const map = savedMap("hexVertical");
  const create = sceneFromMap(map, undefined, "first");
  expect(create.name).toBe("Map");
  expect(create.grid).toEqual({ ...defaultSceneGrid, type: "hexVertical",
    measurement: { type: "euclidean", scale: "10m" } });
  expect(checkGrid(create.grid)).toBe(true);
  expect(create.map).toEqual(mapItem(map, create.grid, "first"));
  const empty = { id: "scene", grid: create.grid, fogFill: false, viewOnly: false, movementMode: true, items: {} };
  expect(checkChange(empty, { type: "add", item: create.map })).toBeUndefined();
});

test("the map of a new scene is scaled so its drawn cells match the scene's", () => {
  const { grid, map } = sceneFromMap(savedMap(), undefined, "first");
  expect(800 / 8 * map.scale.x).toBeCloseTo(cellSize(grid).width);
  expect(600 / 6 * map.scale.y).toBeCloseTo(cellSize(grid).height);
});

test("a new scene is named after its map unless another name is typed", () => {
  expect(importedSceneName(savedMap(), undefined)).toBe("Map");
  expect(importedSceneName({ ...savedMap(), name: "  Keep  " }, undefined)).toBe("Keep");
  expect(importedSceneName({ ...savedMap(), name: "x".repeat(140) }, undefined)).toBe("x".repeat(100));
  expect(importedSceneName(savedMap(), " Ambush ")).toBe("Ambush");
  expect(importedSceneName(savedMap(), "")).toBe("");
  expect(sceneFromMap(savedMap(), "Ambush", "first").name).toBe("Ambush");
});

const note: Item = { id: "note", kind: "text", layer: "note", position: { x: 420, y: -75 },
  scale: { x: 1, y: 1 }, rotation: 0, order: 1, owner: "gm", locked: false, hidden: true,
  metadata: {}, text: "Trap", color: "yellow", size: 24, square: true };
const token: Item = { ...mapItem(savedMap(), defaultSceneGrid, "token"), layer: "character",
  position: { x: 225, y: 375 }, locked: false, metadata: {} };

/** A scene made from the map, moved off the origin, with a styled grid, a token and a note */
function editedScene(map = savedMap()): Scene {
  const made = sceneFromMap(map, undefined, "first");
  const placed = { ...made.map, position: { x: made.map.position.x + 300, y: made.map.position.y - 150 } };
  return { id: "scene", fogFill: false, viewOnly: false, movementMode: true,
    grid: { ...made.grid, shown: false, opacity: 0.4, color: "#336699",
      measurement: { type: "manhattan", scale: "5ft" } },
    items: { first: placed, token, note } };
}

/** The scene once the server's rules have taken every change of an edit */
function afterEdit(scene: Scene, changes: Change[]): Scene {
  return changes.reduce((current, change) => {
    expect(checkChange(current, change)).toBeUndefined();
    return applyChange(current, change).scene;
  }, scene);
}

test("alignment is the grid kind, cell count and inset, and nothing else of a map", () => {
  const map = savedMap();
  expect(sameAlignment(map, { ...map, name: "Other", grid: { ...map.grid,
    measurement: { type: "manhattan", scale: "1m" } } })).toBe(true);
  expect(sameAlignment(map, { ...map, grid: { ...map.grid, type: "hexVertical" } })).toBe(false);
  expect(sameAlignment(map, { ...map, grid: { ...map.grid, size: { x: 8, y: 7 } } })).toBe(false);
  expect(sameAlignment(map, { ...map, grid: { ...map.grid,
    inset: { ...map.grid.inset, bottomRight: { x: 0.9, y: 0.8 } } } })).toBe(false);
});

test("an edit that leaves the scene's map as it is changes nothing", () => {
  expect(sceneMapEdit(editedScene(), savedMap(), false, "next")).toEqual({ changes: [] });
});

test("realigning fits the same map item to its new alignment and leaves the grid alone", () => {
  const scene = editedScene();
  const map = savedMap();
  map.grid.size = { x: 16, y: 12 };
  const edit = sceneMapEdit(scene, map, true, "next");
  expect(edit.grid).toBeUndefined();
  const after = afterEdit(scene, edit.changes);
  const realigned = pickedMap(after)!;
  expect(realigned.id).toBe("first");
  expect(800 / 16 * realigned.scale.x).toBeCloseTo(cellSize(scene.grid).width);
  expect(600 / 12 * realigned.scale.y).toBeCloseTo(cellSize(scene.grid).height);
  expect(realigned).toEqual({ ...scene.items.first, ...fitMap(map, scene.grid, mapTopLeft(scene.items.first as ImageItem)) });
});

test("a realign that changes the map's grid kind sets the scene's grid kind", () => {
  const scene = editedScene();
  const edit = sceneMapEdit(scene, savedMap("hexVertical"), true, "next");
  expect(edit.grid).toEqual({ ...scene.grid, type: "hexVertical" });
  expect(pickedMap(afterEdit(scene, edit.changes))!.scale.x).toBe(pickedMap(afterEdit(scene, edit.changes))!.scale.y);
});

test("a replacement map goes where the old map was and only the grid kind follows it", () => {
  const scene = editedScene();
  const map = { ...savedMap("hexHorizontal"), id: "other-map", width: 2000, height: 1000 };
  map.grid.inset = { topLeft: { x: 0, y: 0 }, bottomRight: { x: 1, y: 1 } };
  const edit = sceneMapEdit(scene, map, false, "next");
  expect(edit.grid).toEqual({ ...scene.grid, type: "hexHorizontal" });
  expect(checkGrid(edit.grid)).toBe(true);
  const after = afterEdit(scene, edit.changes);
  expect(after.items.first).toBeUndefined();
  const replacement = pickedMap(after)!;
  expect(replacement.id).toBe("next");
  expect(replacement.metadata.pickerMapId).toBe("other-map");
  expect(replacement.locked).toBe(true);
  // Within a cell of the old map's corner, on the lattice
  const old = mapTopLeft(scene.items.first as ImageItem);
  const size = cellSize(edit.grid!);
  expect(Math.abs(mapTopLeft(replacement).x - old.x)).toBeLessThan(size.width);
  expect(Math.abs(mapTopLeft(replacement).y - old.y)).toBeLessThan(size.height);
});

test("a replacement of the same grid kind leaves the whole grid alone", () => {
  const edit = sceneMapEdit(editedScene(), { ...savedMap(), id: "other-map" }, false, "next");
  expect(edit.grid).toBeUndefined();
  expect(edit.changes.map((change) => change.type)).toEqual(["delete", "add"]);
});

test("a map chosen for a scene with none is added at the origin", () => {
  const scene = editedScene();
  delete scene.items.first;
  const map = savedMap();
  const edit = sceneMapEdit(scene, map, false, "next");
  expect(edit.changes).toEqual([{ type: "add", item: mapItem(map, scene.grid, "next") }]);
});

test("removing the map leaves a scene with no map, and one with none unchanged", () => {
  const scene = editedScene();
  const edit = sceneMapEdit(scene, undefined, false, "next");
  expect(edit.grid).toBeUndefined();
  const after = afterEdit(scene, edit.changes);
  expect(pickedMap(after)).toBeUndefined();
  expect(sceneMapEdit(after, undefined, false, "next")).toEqual({ changes: [] });
});

test("after a realign, a replace and a remove every other item is where it was", () => {
  const start = editedScene();
  const realignedMap = savedMap();
  realignedMap.grid.inset = { topLeft: { x: 0.05, y: 0.2 }, bottomRight: { x: 0.95, y: 0.9 } };
  let scene = afterEdit(start, sceneMapEdit(start, realignedMap, true, "a").changes);
  scene = afterEdit(scene, sceneMapEdit(scene, { ...savedMap("hexVertical"), id: "other-map" }, false, "b").changes);
  scene = afterEdit(scene, sceneMapEdit(scene, undefined, false, "c").changes);
  expect(scene.items).toEqual({ token: start.items.token, note: start.items.note });
});
