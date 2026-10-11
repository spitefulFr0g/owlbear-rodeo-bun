import { defaultSceneGrid, SceneGrid } from "../sceneRules";
import { Map } from "../types/Map";
import { cellSize, snapPosition } from "./grid";
import { fitMap, mapItem, mapSceneGrid, mapTopLeft, pickedMap } from "./mapItem";

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
  expect(pickedMap({ id: "scene", grid: defaultSceneGrid, items: { placed: item } })).toEqual(item);
});
