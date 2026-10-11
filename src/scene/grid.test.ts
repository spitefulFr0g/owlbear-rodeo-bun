import { defaultSceneGrid, SceneGrid } from "../sceneRules";
import { cellSize, gridDistance, snapPosition, worldPlacement } from "./grid";

const square = defaultSceneGrid;
const hexVertical: SceneGrid = { ...square, type: "hexVertical" };
const hexHorizontal: SceneGrid = { ...square, type: "hexHorizontal" };

function measured(grid: SceneGrid, type: SceneGrid["measurement"]["type"]) {
  return { ...grid, measurement: { ...grid.measurement, type } };
}

function expectPoint(
  actual: { x: number; y: number },
  x: number,
  y: number
) {
  expect(actual.x).toBeCloseTo(x, 2);
  expect(actual.y).toBeCloseTo(y, 2);
}

describe("the size of a cell", () => {
  test("is the grid's units on both sides of a square", () => {
    expect(cellSize(square)).toEqual({ width: 150, height: 150, radius: 75 });
  });

  test("puts neighbouring hexes the grid's units apart", () => {
    const vertical = cellSize(hexVertical);
    expect(vertical.width).toBe(150);
    expect(vertical.height).toBeCloseTo(173.205, 2);
    expect(vertical.radius).toBeCloseTo(86.603, 2);

    const horizontal = cellSize(hexHorizontal);
    expect(horizontal.width).toBeCloseTo(173.205, 2);
    expect(horizontal.height).toBe(150);
  });
});

describe("snapping to a square grid", () => {
  test("takes a point near the middle of a cell to the middle", () => {
    expect(snapPosition(square, { x: 80, y: 70 }, 0.2)).toEqual({
      x: 75,
      y: 75,
    });
  });

  test("takes a point near a corner to the corner", () => {
    expect(snapPosition(square, { x: 10, y: 5 }, 0.2)).toEqual({ x: 0, y: 0 });
    expect(snapPosition(square, { x: 140, y: 290 }, 0.2)).toEqual({
      x: 150,
      y: 300,
    });
  });

  test("leaves a point far from both where it is", () => {
    expect(snapPosition(square, { x: 40, y: 40 }, 0.2)).toEqual({
      x: 40,
      y: 40,
    });
  });

  test("works on the far side of the origin", () => {
    expect(snapPosition(square, { x: -80, y: -70 }, 0.2)).toEqual({
      x: -75,
      y: -75,
    });
  });

  test("ignores corners when asked for cell middles only", () => {
    expect(snapPosition(square, { x: 10, y: 5 }, 1, false)).toEqual({
      x: 75,
      y: 75,
    });
  });

  test("does nothing at no sensitivity", () => {
    expect(snapPosition(square, { x: 76, y: 76 }, 0)).toEqual({ x: 76, y: 76 });
  });
});

describe("snapping to a hex grid", () => {
  test("finds the middle of a vertical hex, every other row half a cell across", () => {
    expectPoint(snapPosition(hexVertical, { x: 80, y: 90 }, 0.2), 75, 86.6);
    expectPoint(snapPosition(hexVertical, { x: 148, y: 215 }, 0.2), 150, 216.51);
  });

  test("finds the top corner of a vertical hex", () => {
    expectPoint(snapPosition(hexVertical, { x: 77, y: 3 }, 0.2), 75, 0);
  });

  test("finds the middle of a horizontal hex, every other column half a cell down", () => {
    expectPoint(snapPosition(hexHorizontal, { x: 90, y: 80 }, 0.2), 86.6, 75);
    expectPoint(
      snapPosition(hexHorizontal, { x: 215, y: 148 }, 0.2),
      216.51,
      150
    );
  });

  test("finds the right corner of a horizontal hex", () => {
    expectPoint(snapPosition(hexHorizontal, { x: 170, y: 77 }, 0.2), 173.21, 75);
  });
});

describe("the distance between two points in cells", () => {
  const a = { x: 75, y: 75 };

  test("counts a diagonal as one on a square grid by default", () => {
    expect(gridDistance(square, a, { x: 375, y: 225 })).toBe(2);
  });

  test("counts every second diagonal twice when alternating", () => {
    expect(
      gridDistance(measured(square, "alternating"), a, { x: 375, y: 375 })
    ).toBe(3);
  });

  test("counts across then down for manhattan", () => {
    expect(
      gridDistance(measured(square, "manhattan"), a, { x: 375, y: 225 })
    ).toBe(3);
  });

  test("is the straight line for euclidean", () => {
    expect(
      gridDistance(measured(square, "euclidean"), { x: 0, y: 0 }, { x: 300, y: 400 })
    ).toBeCloseTo(3.333, 2);
    expect(
      gridDistance(
        measured(hexVertical, "euclidean"),
        { x: 75, y: 86.6 },
        { x: 150, y: 216.51 }
      )
    ).toBeCloseTo(1, 2);
  });

  test("counts hexes stepped through on a hex grid", () => {
    const first = { x: 75, y: 86.6 };
    expect(gridDistance(hexVertical, first, { x: 375, y: 86.6 })).toBe(2);
    expect(gridDistance(hexVertical, first, { x: 150, y: 216.51 })).toBe(1);
    expect(gridDistance(hexVertical, first, { x: 75, y: 346.4 })).toBe(2);
    expect(
      gridDistance(hexHorizontal, { x: 86.6, y: 75 }, { x: 216.51, y: 150 })
    ).toBe(1);
  });
});

describe("where the world sits on the canvas", () => {
  test("is one pixel to a unit from the canvas's corner when there is no map", () => {
    expect(worldPlacement(undefined, square)).toEqual({ x: 0, y: 0, scale: 1 });
  });

  test("puts a scene cell on each cell of the 1.0 map's grid", () => {
    expect(
      worldPlacement(
        { cell: { width: 50, height: 50 }, offset: { x: 10, y: 20 } },
        square
      )
    ).toEqual({ x: 10, y: 20, scale: 1 / 3 });
  });

  test("goes by the distance between hexes on a hex map", () => {
    expect(
      worldPlacement(
        { cell: { width: 75, height: 86.6 }, offset: { x: 0, y: 0 } },
        hexVertical
      ).scale
    ).toBe(0.5);
  });
});
