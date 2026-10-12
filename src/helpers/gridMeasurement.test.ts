import { defaultSceneGrid, SceneGrid } from "../sceneRules";
import { measurementShown, measurementsOffered, withGridType } from "./gridMeasurement";

describe("the measurements a grid offers", () => {
  const measured = (type: SceneGrid["type"], measurement: SceneGrid["measurement"]["type"]): SceneGrid =>
    ({ ...defaultSceneGrid, type, measurement: { type: measurement, scale: "2m" } });

  test("are all four on a square grid and the two that differ on a hex grid", () => {
    expect(measurementsOffered("square")).toEqual(["chebyshev", "alternating", "euclidean", "manhattan"]);
    expect(measurementsOffered("hexVertical")).toEqual(["manhattan", "euclidean"]);
    expect(measurementsOffered("hexHorizontal")).toEqual(["manhattan", "euclidean"]);
  });

  test("a hex grid saved with a measurement that counts hexes shows as Manhattan", () => {
    expect(measurementShown(measured("hexVertical", "chebyshev"))).toBe("manhattan");
    expect(measurementShown(measured("hexHorizontal", "alternating"))).toBe("manhattan");
    expect(measurementShown(measured("hexVertical", "euclidean"))).toBe("euclidean");
    expect(measurementShown(measured("square", "alternating"))).toBe("alternating");
  });

  test("changing between square and hex takes the new grid's first measurement and keeps the scale", () => {
    expect(withGridType(measured("square", "chebyshev"), "hexVertical").measurement).toEqual({ type: "manhattan", scale: "2m" });
    expect(withGridType(measured("square", "euclidean"), "hexHorizontal").measurement).toEqual({ type: "manhattan", scale: "2m" });
    expect(withGridType(measured("hexVertical", "euclidean"), "square").measurement).toEqual({ type: "chebyshev", scale: "2m" });
    expect(withGridType(measured("square", "chebyshev"), "hexVertical").type).toBe("hexVertical");
  });

  test("changing between the two hex grids, or to the same grid, keeps the measurement", () => {
    expect(withGridType(measured("hexVertical", "euclidean"), "hexHorizontal")).toEqual(measured("hexHorizontal", "euclidean"));
    expect(withGridType(measured("square", "alternating"), "square")).toEqual(measured("square", "alternating"));
  });
});
