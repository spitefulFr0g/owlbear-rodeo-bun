import { defaultSceneGrid, SceneGrid } from "../sceneRules";

import { afterLive, liveStatesAt, noLiveMarks } from "./live";
import { rulerText } from "./ruler";

const grid = (type: SceneGrid["type"], measurement: SceneGrid["measurement"]): SceneGrid => ({
  ...defaultSceneGrid, type, unitsPerCell: 100, measurement });
// Three cells across and two down on a square grid
const start = { x: 50, y: 50 };
const end = { x: 350, y: 250 };

test("a ruler on a square grid is written in the scene's scale for each measurement type", () => {
  const text = (type: SceneGrid["measurement"]["type"]) => rulerText(grid("square", { type, scale: "5ft" }), start, end);
  expect(text("chebyshev")).toBe("15ft");
  expect(text("alternating")).toBe("20ft");
  expect(text("manhattan")).toBe("25ft");
  expect(text("euclidean")).toBe("18ft");
});

test("a ruler on either hex grid counts the hexes stepped through", () => {
  const measurement = { type: "chebyshev", scale: "5ft" } as const;
  // Along a row of a vertical grid and down a column of a horizontal one
  expect(rulerText(grid("hexVertical", measurement), { x: 50, y: 58 }, { x: 350, y: 58 })).toBe("15ft");
  expect(rulerText(grid("hexHorizontal", measurement), { x: 58, y: 50 }, { x: 58, y: 350 })).toBe("15ft");
  // Two rows down a vertical grid is two hexes, wherever the square cells would fall
  expect(rulerText(grid("hexVertical", measurement), { x: 50, y: 58 }, { x: 50, y: 231 })).toBe("10ft");
});

test("a ruler keeps the digits and unit of the scene's scale", () => {
  expect(rulerText(grid("square", { type: "euclidean", scale: "1.50m" }), start, { x: 150, y: 50 })).toBe("1.50m");
  expect(rulerText(grid("square", { type: "chebyshev", scale: "" }), start, end)).toBe("3");
});

test("a received ruler's latest update gives the distance its owner sees while its line is still catching up", () => {
  const scene = grid("square", { type: "chebyshev", scale: "5ft" });
  const ruler = (x: number) => ({ sceneId: "scene", kind: "ruler" as const, connectionId: "a",
    state: { start, end: { x, y: 50 } } });
  const marks = afterLive(afterLive(noLiveMarks, ruler(150), 0), ruler(350), 100);
  const line = liveStatesAt("ruler", marks, 125).a;
  expect(line.end.x).toBe(250);
  expect(rulerText(scene, line.start, line.end)).toBe("10ft");
  const latest = marks.ruler.a.to;
  expect(rulerText(scene, latest.start, latest.end)).toBe("15ft");
});
