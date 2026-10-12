import { GridType, SceneGrid } from "../sceneRules";

type Measurement = SceneGrid["measurement"]["type"];

/**
 * The measurements worth choosing between on a grid, its default first. A hex
 * grid has no diagonals, so Chebyshev and Alternating count hexes as
 * Manhattan does and are not offered.
 */
export function measurementsOffered(type: GridType): Measurement[] {
  return type === "square" ? ["chebyshev", "alternating", "euclidean", "manhattan"] : ["manhattan", "euclidean"];
}

/** The offered measurement that measures as the grid's saved one does. */
export function measurementShown(grid: SceneGrid): Measurement {
  const offered = measurementsOffered(grid.type);
  return offered.includes(grid.measurement.type) ? grid.measurement.type : offered[0];
}

/** The grid as another type. Changing between square and hex takes the new type's default measurement. */
export function withGridType(grid: SceneGrid, type: GridType): SceneGrid {
  if ((grid.type === "square") === (type === "square")) return { ...grid, type };
  return { ...grid, type, measurement: { ...grid.measurement, type: measurementsOffered(type)[0] } };
}
