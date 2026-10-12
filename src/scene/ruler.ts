import { parseGridScale } from "../helpers/grid";
import { SceneGrid, Vector2 } from "../sceneRules";

import { gridDistance } from "./grid";

/**
 * The distance a ruler shows between two points in world units, counted by
 * the scene's measurement type and written in its scale. The measure tool and
 * every browser drawing that ruler use this, so there is one number.
 */
export function rulerText(grid: SceneGrid, start: Vector2, end: Vector2) {
  const scale = parseGridScale(grid.measurement.scale);
  const cells = gridDistance(grid, start, end);
  return `${(cells * scale.multiplier).toFixed(scale.digits)}${scale.unit}`;
}
