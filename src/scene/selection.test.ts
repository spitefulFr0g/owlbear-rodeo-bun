import { attachesTo, copySelection, moveSelection } from "./selection";
import { afterAnswer, shownScene } from "./shown";
import { defaultSceneGrid, ImageItem, Item } from "../sceneRules";

const base = {
  position: { x: 10, y: 20 },
  rotation: 30,
  scale: { x: 2, y: 3 },
  order: 0,
  owner: "gm",
  locked: false,
  hidden: false,
  metadata: { marker: "kept" },
};
const items: Item[] = [
  {
    ...base,
    id: "note",
    kind: "text",
    layer: "note",
    text: "Hello",
    color: "red",
    size: 150,
    square: true,
  },
  {
    ...base,
    id: "fog",
    kind: "shape",
    layer: "fog",
    geometry: { type: "circle", radius: 40 },
    color: "black",
    strokeWidth: 1,
    fill: true,
    blend: false,
    cut: true,
  },
  {
    ...base,
    id: "line",
    kind: "line",
    layer: "drawing",
    points: [
      { x: 0, y: 0 },
      { x: 100, y: 20 },
    ],
    color: "blue",
    strokeWidth: 2,
    blend: false,
  },
];
test("moving a mixed selection changes only positions by the same world delta", () => {
  expect(moveSelection(items, { x: 150, y: -75 })).toEqual(
    items.map((item) => ({
      type: "update",
      id: item.id,
      fields: { position: { x: 160, y: -55 } },
    }))
  );
  expect(items[0].position).toEqual({ x: 10, y: 20 });
});
test("copying notes, fog and drawings preserves geometry and flags with new identities", () => {
  const copied = copySelection(items, { x: 30, y: 40 }, ["a", "b", "c"]);
  expect(copied).toEqual(
    items.map((item, index) => ({
      ...item,
      id: ["a", "b", "c"][index],
      position: { x: 40, y: 60 },
    }))
  );
  expect(items.map((item) => item.id)).toEqual(["note", "fog", "line"]);
});

test("a mixed move keeps accepted positions and restores only refused items", () => {
  const scene = {
    id: "scene",
    grid: defaultSceneGrid,
    fogFill: false, viewOnly: false,
    items: Object.fromEntries(items.map((item) => [item.id, item])),
  };
  const changes = moveSelection(items, { x: 150, y: 0 });
  const batch = { id: "move", sceneId: scene.id, changes };
  expect(shownScene(scene, [batch])!.items.fog.position.x).toBe(160);
  const answered = afterAnswer(scene, {
    batchId: batch.id,
    sceneId: scene.id,
    applied: [changes[0], changes[2]],
    refused: [{ id: "fog", item: scene.items.fog }],
  })!;
  expect(answered.items.note.position.x).toBe(160);
  expect(answered.items.line.position.x).toBe(160);
  expect(answered.items.fog.position.x).toBe(10);
});

const mount: ImageItem = {
  ...base,
  id: "mount",
  kind: "image",
  layer: "mount",
  position: { x: 150, y: 200 },
  rotation: 90,
  scale: { x: 0.8, y: 0.8 },
  image: { type: "default", key: "fighter" },
  width: 300,
  height: 300,
  label: "",
  outline: { type: "circle", x: 150, y: 150, radius: 150 },
};
const rider: ImageItem = { ...mount, id: "rider", layer: "character" };
test("a mount carries riders whose centres lie inside its transformed outline", () => {
  expect(attachesTo(mount, rider, 150)).toBe(true);
  expect(
    attachesTo(mount, { ...rider, position: { x: 300, y: 200 } }, 150)
  ).toBe(false);
  expect(
    attachesTo(
      {
        ...mount,
        outline: { type: "rect", x: 0, y: 0, width: 300, height: 300 },
      },
      { ...rider, position: { x: 150, y: 300 } },
      150
    )
  ).toBe(true);
  expect(
    attachesTo(
      {
        ...mount,
        outline: { type: "path", points: [0, 0, 300, 0, 300, 300, 0, 300] },
      },
      rider,
      150
    )
  ).toBe(true);
});
test("a character carries nearby attachments but not other characters", () => {
  expect(
    attachesTo(
      rider,
      {
        ...rider,
        id: "ring",
        layer: "attachment",
        position: { x: 170, y: 200 },
      },
      150
    )
  ).toBe(true);
  expect(
    attachesTo(
      rider,
      {
        ...rider,
        id: "ring",
        layer: "attachment",
        position: { x: 200, y: 200 },
      },
      150
    )
  ).toBe(false);
  expect(attachesTo(rider, { ...rider, id: "other" }, 150)).toBe(false);
});
