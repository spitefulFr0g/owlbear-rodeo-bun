import { clipFog, coveredFog, fogItem, fogShape } from "./fogItem";
import { Fog } from "../types/Fog";
const rectangle = (id: string, x: number, size: number): Fog => ({ id, type: "fog", color: "black", visible: true, strokeWidth: 0.5,
  data: { points: [{ x, y: x }, { x: x + size, y: x }, { x: x + size, y: x + size }, { x, y: x + size }], holes: [] } });
test("single layer clipping retains an enclosed hole in local item geometry", () => {
  const clipped = clipFog(rectangle("outer", -100, 400), [rectangle("inner", 0, 100)]);
  expect(clipped).toHaveLength(1);
  const item = fogItem(clipped[0], "gm", false, false);
  expect(item.kind).toBe("shape");
  expect(fogShape(item).data.holes).toHaveLength(1);
});
test("cut flags subtract from cover and hidden fog stops covering players", () => {
  const cover = fogItem(rectangle("cover", 0, 400), "gm", false, false);
  const cut = fogItem(rectangle("cut", 100, 100), "gm", true, false);
  expect(coveredFog([cover, cut])[0].data.holes).toHaveLength(1);
  expect(coveredFog([{ ...cover, hidden: true }, cut])).toEqual([]);
  expect(coveredFog([cover, { ...cut, hidden: true }])[0].data.holes).toEqual([]);
});
test("brush fog is a closed curve and rectangle geometry remains in world units", () => {
  const shape = rectangle("brush", -300, 150);
  const item = fogItem(shape, "gm", true, true);
  expect(item.kind).toBe("curve");
  expect(item.cut).toBe(true);
  expect(fogShape(item).data).toEqual(shape.data);
});

test("placing fog after a cut covers that area again", () => {
  const cover = fogItem(rectangle("cover", 0, 400), "gm", false, false);
  const cut = fogItem(rectangle("cut", 100, 100), "gm", true, false);
  const replacement = fogItem(rectangle("replacement", 100, 100), "gm", false, false);
  expect(coveredFog([cover, cut, replacement])[0].data.holes).toEqual([]);
});


test("circular fog covers its transformed area and can cut a hole", () => {
  const base = fogItem(rectangle("circle", 0, 400), "gm", false, false);
  const circle = { ...base, kind: "shape" as const,
    geometry: { type: "circle" as const, radius: 50 },
    position: { x: 200, y: 200 }, scale: { x: 2, y: 1 }, rotation: 90 };
  const points = fogShape(circle).data.points;
  expect(points[0].x).toBeCloseTo(200);
  expect(points[0].y).toBeCloseTo(300);
  expect(coveredFog([circle])).toHaveLength(1);
  const cover = fogItem(rectangle("cover", 0, 400), "gm", false, false);
  expect(coveredFog([cover, { ...circle, cut: true }])[0].data.holes).toHaveLength(1);
});
