import {
  defaultSceneGrid, gmOwner, ImageItem, maxSceneNameLength, Scene, SceneGrid, Vector2,
} from "../sceneRules";
import { Map } from "../types/Map";
import { cellSize, snapPosition } from "./grid";

/** Identifies the image placed by the map picker, independently of the library. */
export function pickedMap(scene: Scene | null): ImageItem | undefined {
  if (!scene) return undefined;
  return Object.values(scene.items).find(
    (item): item is ImageItem => item.kind === "image" && item.layer === "map" &&
      typeof item.metadata.pickerMapId === "string"
  );
}

/** The saved map changes type and measurement, keeping the scene's cell size and switches. */
export function mapSceneGrid(map: Map, grid: SceneGrid): SceneGrid {
  return { ...grid, type: map.grid.type, measurement: { ...map.grid.measurement } };
}

/**
 * Fits the map's inset grid to scene cells. `near` is the desired image top
 * left; its inset is aligned to the nearest lattice origin. Hex inset bounds
 * surround cell 0, 0, whose middle is half a cell from the scene origin.
 */
export function fitMap(map: Map, grid: SceneGrid, near: Vector2 = { x: 0, y: 0 }) {
  const size = cellSize(grid);
  const inset = map.grid.inset;
  const width = map.width * (inset.bottomRight.x - inset.topLeft.x);
  const height = map.height * (inset.bottomRight.y - inset.topLeft.y);
  const scaleX = size.width / (width / map.grid.size.x);
  const scaleY = grid.type === "square"
    ? size.height / (height / map.grid.size.y) : scaleX;
  const scale = grid.type === "hexHorizontal"
    ? { x: size.height / (height / map.grid.size.y), y: size.height / (height / map.grid.size.y) }
    : { x: scaleX, y: scaleY };
  const offset = { x: inset.topLeft.x * map.width * scale.x,
    y: inset.topLeft.y * map.height * scale.y };
  const desired = { x: near.x + offset.x, y: near.y + offset.y };
  const half = { x: size.width / 2, y: size.height / 2 };
  const middle = snapPosition(grid, { x: desired.x + half.x, y: desired.y + half.y }, 2, false);
  return { scale, position: {
    x: middle.x - half.x - offset.x + map.width * scale.x / 2,
    y: middle.y - half.y - offset.y + map.height * scale.y / 2,
  } };
}

export function mapTopLeft(item: ImageItem): Vector2 {
  return { x: item.position.x - item.width * item.scale.x / 2,
    y: item.position.y - item.height * item.scale.y / 2 };
}

/** The picker places one locked image; its files include every resolution. */
export function mapItem(map: Map, grid: SceneGrid, id: string, near?: Vector2): ImageItem {
  return {
    id, kind: "image", layer: "map", ...fitMap(map, grid, near),
    rotation: 0, order: 0, owner: gmOwner, locked: true, hidden: false,
    metadata: { pickerMapId: map.id, mapQuality: map.type === "file" ? map.quality : "original" },
    image: map.type === "default" ? { type: "default", key: map.key } : {
      type: "file", file: map.file, thumbnail: map.thumbnail, resolutions: { ...map.resolutions },
    },
    width: map.width, height: map.height, label: "",
    outline: { type: "rect", x: 0, y: 0, width: map.width, height: map.height },
  };
}

/** The name the importer gives a scene: what was typed, else the map's own name. */
export function importedSceneName(map: Map, typed: string | undefined): string {
  return typed === undefined ? map.name.trim().slice(0, maxSceneNameLength) : typed.trim();
}

/**
 * What one create carries for a scene made from a map: the default grid with
 * the map's type and measurement, and the map fitted to it.
 */
export function sceneFromMap(map: Map, typedName: string | undefined, itemId: string) {
  const grid = mapSceneGrid(map, defaultSceneGrid);
  return { name: importedSceneName(map, typedName), grid, map: mapItem(map, grid, itemId) };
}
