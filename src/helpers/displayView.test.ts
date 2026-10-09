import {
  fitMapRect,
  fullMapRect,
  getVisibleMapRect,
  isSameMapRect,
} from "./displayView";

// A 2:1 map fitted to the width of a 1000x1000 window, centred vertically
const squareWindow = {
  stageWidth: 1000,
  stageHeight: 1000,
  mapWidth: 1000,
  mapHeight: 500,
  layerX: 0,
  layerY: 250,
};

// The same map fitted to the height of a 2000x500 window
const wideWindow = {
  stageWidth: 2000,
  stageHeight: 500,
  mapWidth: 1000,
  mapHeight: 500,
  layerX: 500,
  layerY: 0,
};

describe("getVisibleMapRect", () => {
  test("covers the map and the space around it before any pan or zoom", () => {
    const rect = getVisibleMapRect({ x: 0, y: 0, scale: 1 }, squareWindow);
    expect(isSameMapRect(rect, { x: 0, y: -0.5, width: 1, height: 2 })).toBe(
      true
    );
  });

  test("shrinks when zoomed in and moves when panned", () => {
    const rect = getVisibleMapRect({ x: -500, y: -500, scale: 2 }, squareWindow);
    expect(rect).toEqual({ x: 0.25, y: 0, width: 0.5, height: 1 });
  });
});

describe("fitMapRect", () => {
  test("shows the whole map centred when given the full map", () => {
    expect(fitMapRect(fullMapRect, squareWindow)).toEqual({
      x: 0,
      y: 0,
      scale: 1,
    });
    expect(fitMapRect(fullMapRect, wideWindow)).toEqual({
      x: 0,
      y: 0,
      scale: 1,
    });
  });

  test("reproduces the view it was measured from in a window of the same shape", () => {
    const transform = { x: -320, y: 75, scale: 1.6 };
    const rect = getVisibleMapRect(transform, squareWindow);
    const fitted = fitMapRect(rect, squareWindow);
    expect(fitted.x).toBeCloseTo(transform.x);
    expect(fitted.y).toBeCloseTo(transform.y);
    expect(fitted.scale).toBeCloseTo(transform.scale);
  });

  test("keeps everything in the view visible in a window of another shape", () => {
    const rect = getVisibleMapRect({ x: -500, y: -500, scale: 2 }, squareWindow);
    const shown = getVisibleMapRect(fitMapRect(rect, wideWindow), wideWindow);
    expect(shown.x).toBeLessThanOrEqual(rect.x);
    expect(shown.y).toBeLessThanOrEqual(rect.y + 1e-9);
    expect(shown.x + shown.width).toBeGreaterThanOrEqual(rect.x + rect.width);
    expect(shown.y + shown.height).toBeGreaterThanOrEqual(
      rect.y + rect.height - 1e-9
    );
    // The extra room goes equally to both sides
    expect(shown.x + shown.width / 2).toBeCloseTo(rect.x + rect.width / 2);
    expect(shown.height).toBeCloseTo(rect.height);
    expect(shown.width).toBeGreaterThan(rect.width);
  });
});

describe("isSameMapRect", () => {
  test("ignores differences too small to see", () => {
    const rect = { x: 0.25, y: 0, width: 0.5, height: 1 };
    expect(isSameMapRect(rect, { ...rect, x: 0.25 + 1e-9 })).toBe(true);
    expect(isSameMapRect(rect, { ...rect, x: 0.26 })).toBe(false);
  });
});
