import { SceneGrid } from "./types";
import { minGridLineWidth, maxGridLineWidth } from "./caps";

/** Checks the complete scene grid, including its drawing style. */
export function checkGrid(value: unknown): value is SceneGrid {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const grid = value as SceneGrid;
  return !Object.keys(grid).some(key => !["type", "unitsPerCell", "measurement", "shown", "snap", "opacity", "lineWidth", "color"].includes(key)) &&
    ["square", "hexVertical", "hexHorizontal"].includes(grid.type) && grid.unitsPerCell === 150 &&
    typeof grid.shown === "boolean" && typeof grid.snap === "boolean" &&
    typeof grid.opacity === "number" && Number.isFinite(grid.opacity) && grid.opacity >= 0 && grid.opacity <= 1 &&
    typeof grid.lineWidth === "number" && Number.isFinite(grid.lineWidth) && grid.lineWidth >= minGridLineWidth && grid.lineWidth <= maxGridLineWidth &&
    typeof grid.color === "string" && /^#[0-9a-f]{6}$/i.test(grid.color) &&
    !!grid.measurement && typeof grid.measurement === "object" && !Array.isArray(grid.measurement) &&
    !Object.keys(grid.measurement).some(key => !["type", "scale"].includes(key)) &&
    ["chebyshev", "alternating", "euclidean", "manhattan"].includes(grid.measurement.type) &&
    typeof grid.measurement.scale === "string";
}
