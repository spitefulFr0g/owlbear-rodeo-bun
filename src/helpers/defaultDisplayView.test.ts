import { defaultDisplayView } from "./defaultDisplayView";
import { defaultSceneGrid, ImageItem, Scene } from "../sceneRules";

const image: ImageItem = { id: "map", kind: "image", layer: "map", position: { x: 100, y: 200 },
  rotation: 0, scale: { x: 2, y: 3 }, order: 0, owner: "gm", locked: true, hidden: false,
  metadata: {}, image: { type: "default", key: "test" }, width: 100, height: 100,
  label: "", outline: { type: "circle", x: 50, y: 50, radius: 50 } };
function scene(items: Scene["items"]): Scene { return { id: "scene", grid: defaultSceneGrid, items }; }

test("opens on an area centred on the origin when nothing was sent", () => {
  expect(defaultDisplayView(scene({}))).toEqual({ x: -750, y: -750, width: 1500, height: 1500 });
});
test("fits the map rather than distant tokens", () => {
  expect(defaultDisplayView(scene({ map: image, token: { ...image, id: "token", layer: "character", position: { x: 9000, y: 9000 } } })))
    .toEqual({ x: 0, y: 50, width: 200, height: 300 });
});
test("fits all received items without a map, including rotation and negative scale", () => {
  const view = defaultDisplayView(scene({ token: { ...image, layer: "character", rotation: 90, scale: { x: -2, y: 3 } } }));
  expect(view.x).toBeCloseTo(-50); expect(view.y).toBeCloseTo(100);
  expect(view.width).toBeCloseTo(300); expect(view.height).toBeCloseTo(200);
});
test("gives a line with no height a usable view", () => {
  expect(defaultDisplayView(scene({ line: { ...image, kind: "line", layer: "drawing", points: [{ x: 0, y: 0 }, { x: 50, y: 0 }], color: "red", strokeWidth: 1, blend: false } }))).toEqual({ x: 100, y: 125, width: 100, height: 150 });
});

test("fits separate received items together when there is no map", () => {
  expect(defaultDisplayView(scene({ a: { ...image, layer: "character" },
    b: { ...image, id: "b", layer: "prop", position: { x: 500, y: -200 } } })))
    .toEqual({ x: 0, y: -350, width: 600, height: 700 });
});
test("fits shape, curve and text geometry in world units", () => {
  const base = { ...image, layer: "drawing" as const, scale: { x: 1, y: 1 }, rotation: 0 };
  expect(defaultDisplayView(scene({ shape: { ...base, kind: "shape", geometry: { type: "rectangle", width: 200, height: 100 }, color: "red", strokeWidth: 1, fill: true, blend: false, cut: false } })))
    .toEqual({ x: 100, y: 200, width: 200, height: 100 });
  expect(defaultDisplayView(scene({ curve: { ...base, kind: "curve", points: [{ x: -20, y: -40 }, { x: 20, y: 40 }], closed: false, color: "red", strokeWidth: 1, fill: false, blend: false, cut: false } })))
    .toEqual({ x: 80, y: 160, width: 40, height: 80 });
  expect(defaultDisplayView(scene({ text: { ...base, kind: "text", size: 100, text: "Hello", color: "red", square: true } })))
    .toEqual({ x: 50, y: 150, width: 100, height: 100 });
});
