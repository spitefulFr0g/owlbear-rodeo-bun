import { coveredFog } from "./fog";
import { cutsFog, fogItem } from "../scene/fogItem";
import { Fog } from "../types/Fog";
const rectangle = (id: string, x: number, size: number): Fog => ({ id, type: "fog", color: "black", visible: true, strokeWidth: 0,
  data: { points: [{ x, y: x }, { x: x + size, y: x }, { x: x + size, y: x + size }, { x, y: x + size }], holes: [] } });
const fill = rectangle("view", -100, 400);
const cut = { ...fogItem(rectangle("cut", 0, 100), "gm", true, false), order: 1 };
test("Fog Fill covers any viewport with no shapes, while fill off leaves it open", () => {
  expect(coveredFog([], fill)[0].data.holes).toEqual([]);
  expect(coveredFog([])).toEqual([]);
  expect(coveredFog([], rectangle("far away", 1e9, 100))).toHaveLength(1);
});
test("a cut opens the fill and deleting or hiding it restores the cover", () => {
  expect(coveredFog([cut], fill)[0].data.holes).toHaveLength(1);
  expect(coveredFog([], fill)[0].data.holes).toEqual([]);
  expect(coveredFog([{ ...cut, hidden: true }], fill)[0].data.holes).toEqual([]);
});
test("fog drawn after a cut restores cover in drawing order", () => {
  const cover = { ...cut, id: "cover", cut: false, order: 2 };
  expect(coveredFog([cover, cut], fill)[0].data.holes).toHaveLength(0);
  expect(coveredFog([cut, { ...cover, hidden: true }], fill)[0].data.holes).toHaveLength(1);
});
test("the cut tool can cut fill without a placed fog shape", () => {
  expect(cutsFog(rectangle("tool", 0, 100), [], true)).toBe(true);
  expect(cutsFog(rectangle("tool", 0, 100), [], false)).toBe(false);
});
test("a viewport wholly inside a cut is open and later fog outside it does not cover it", () => {
  const view = rectangle("view", 25, 25);
  const outside = { ...fogItem(rectangle("outside", 200, 50), "gm", false, false), order: 2 };
  expect(coveredFog([cut, outside], view)).toEqual([]);
});
test("fog restored over a cut can be cut again", () => {
  const restored = { ...cut, id: "restored", cut: false, order: 2 };
  const recut = { ...cut, id: "recut", order: 3 };
  const view = rectangle("view", 25, 25);
  expect(coveredFog([cut, restored], view)).toHaveLength(1);
  expect(coveredFog([cut, restored, recut], view)).toEqual([]);
});
