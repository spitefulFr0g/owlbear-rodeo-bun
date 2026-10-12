import { heldTransformsAllowed } from "./heldTransforms";
import { Item, LiveTransform } from "../sceneRules";

const item: Item = {
  id: "Hero", kind: "shape", layer: "drawing", owner: "gm", order: 0,
  position: { x: 750, y: 350 }, rotation: 0, scale: { x: 1, y: 1 },
  locked: false, hidden: false, metadata: {},
  geometry: { type: "rectangle", width: 100, height: 100 },
  color: "red", strokeWidth: 1, fill: true, blend: false, cut: false,
};
const held: LiveTransform[] = [{ id: item.id, position: { x: 900, y: 200 }, rotation: 30, scale: { x: 2, y: 2 } }];

test("a competing committed transform leaves the local held geometry intact", () => {
  const committed = { ...item, position: { x: 450, y: 500 } };
  expect(heldTransformsAllowed(held, { Hero: committed }, () => true)).toBe(true);
  expect(held[0]).toEqual({ id: "Hero", position: { x: 900, y: 200 }, rotation: 30, scale: { x: 2, y: 2 } });
  expect(committed.position).toEqual({ x: 450, y: 500 });
});

test("deleting any carried item cancels the whole held interaction", () => {
  expect(heldTransformsAllowed([...held, { ...held[0], id: "Rider" }], { Hero: item }, () => true)).toBe(false);
});

test("a permission change cancels a held interaction even while its items exist", () => {
  expect(heldTransformsAllowed(held, { Hero: { ...item, locked: true } }, value => !value.locked)).toBe(false);
  expect(heldTransformsAllowed(held, { Hero: item }, () => false)).toBe(false);
});
