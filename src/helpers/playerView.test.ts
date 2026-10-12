import { getVisibleMapRect } from "./displayView";
import { fitPlayerView } from "./playerView";

// A window whose world units are one stage pixel each before any pan or zoom
const window1000 = {
  stageWidth: 1000,
  stageHeight: 1000,
  mapWidth: 1,
  mapHeight: 1,
  layerX: 0,
  layerY: 0,
};

// A wider window with the world's origin at its centre
const wideWindow = {
  stageWidth: 2000,
  stageHeight: 500,
  mapWidth: 1,
  mapHeight: 1,
  layerX: 1000,
  layerY: 250,
};

// A tall window whose world origin is off to one side, as after panning
const tallWindow = {
  stageWidth: 400,
  stageHeight: 800,
  mapWidth: 1,
  mapHeight: 1,
  layerX: -150,
  layerY: 60,
};

const view = { sceneId: "scene-1", x: 200, y: 100, width: 500, height: 500 };

describe("fitPlayerView", () => {
  test("starts a player where the GM was looking", () => {
    const transform = fitPlayerView(view, "scene-1", window1000);
    expect(transform).toEqual({ x: -400, y: -200, scale: 2 });
    expect(getVisibleMapRect(transform!, window1000)).toEqual({
      x: 200,
      y: 100,
      width: 500,
      height: 500,
    });
  });

  test("shows all of the GM's view in a window of another shape, with more at the sides", () => {
    const transform = fitPlayerView(view, "scene-1", wideWindow);
    const visible = getVisibleMapRect(transform!, wideWindow);
    expect(visible.y).toBeCloseTo(100);
    expect(visible.height).toBeCloseTo(500);
    expect(visible.width).toBeCloseTo(2000);
    // Centred on the same point of the scene
    expect(visible.x + visible.width / 2).toBeCloseTo(450);
  });

  test("brings a player to all of the GM's view in a narrower window, with more above and below", () => {
    const transform = fitPlayerView(view, "scene-1", tallWindow);
    const visible = getVisibleMapRect(transform!, tallWindow);
    expect(visible.x).toBeCloseTo(200);
    expect(visible.width).toBeCloseTo(500);
    expect(visible.height).toBeCloseTo(1000);
    // Centred on the same point of the scene
    expect(visible.y + visible.height / 2).toBeCloseTo(350);
  });

  test("brings a player to a view across the world's origin", () => {
    const acrossOrigin = { ...view, x: -250, y: -150 };
    const transform = fitPlayerView(acrossOrigin, "scene-1", window1000);
    expect(transform).toEqual({ x: 500, y: 300, scale: 2 });
    expect(getVisibleMapRect(transform!, window1000)).toEqual({
      x: -250,
      y: -150,
      width: 500,
      height: 500,
    });
  });

  test("leaves the view alone when it is of a scene this window does not hold", () => {
    expect(fitPlayerView(view, "scene-2", window1000)).toBeNull();
    expect(fitPlayerView(view, undefined, window1000)).toBeNull();
  });

  test("leaves the view alone when the rectangle cannot be fitted", () => {
    expect(fitPlayerView({ ...view, width: 0, height: 0 }, "scene-1", window1000)).toBeNull();
    expect(fitPlayerView({ ...view, x: NaN }, "scene-1", window1000)).toBeNull();
  });
});
