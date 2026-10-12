import { SceneGrid, Vector2 } from "../sceneRules";
export { cellSize, snapPosition, gridDistance } from "../sceneRules/measurement";

/** Where the world's origin is on the canvas, and how many canvas pixels a world unit is */
export type WorldPlacement = { x: number; y: number; scale: number };

/** How the 1.0 map's grid is drawn: a cell's size and the grid's top left, in canvas pixels */
export type MapGridPlacement = {
  cell: { width: number; height: number };
  offset: Vector2;
};

/**
 * Where the world sits on the canvas. A 1.0 map sits with the top left of its
 * grid on the world's origin and each of its cells on a scene cell, so the
 * world is scaled to the map as it is drawn. With no map a unit is a pixel.
 */
export function worldPlacement(
  mapGrid: MapGridPlacement | undefined,
  grid: SceneGrid
): WorldPlacement {
  // A hex is narrowest across its flat sides, which is the grid's units
  const cell = mapGrid ? Math.min(mapGrid.cell.width, mapGrid.cell.height) : 0;
  if (!mapGrid || !(cell > 0)) return { x: 0, y: 0, scale: 1 };
  return {
    x: mapGrid.offset.x,
    y: mapGrid.offset.y,
    scale: cell / grid.unitsPerCell,
  };
}
