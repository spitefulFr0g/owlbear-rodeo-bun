import { attachesTo, boxSelection, copySelection, moveSelection, pressPick } from "./selection";
import { afterAnswer, shownScene } from "./shown";
import { defaultSceneGrid, ImageItem, Item, mayChange, Person } from "../sceneRules";

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
  const copied = copySelection(items, { x: 30, y: 40 }, ["a", "b", "c"], items);
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
    fogFill: false, viewOnly: false, movementMode: true,
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

test("mixed copies number only images against the supplied visible scene", () => {
  const source: Item[] = [{ ...rider, label: "Goblin 1" }, ...items, { ...mount, label: "Goblin 2" }];
  const visible = [...source, { ...rider, id: "other", label: "Goblin 3" }];
  const copied = copySelection(source, { x: 0, y: 0 }, source.map((_, i) => `copy-${i}`), visible);
  expect(copied[0]).toEqual({ ...source[0], id: "copy-0", label: "Goblin 4" });
  expect(copied[4]).toEqual({ ...source[4], id: "copy-4", label: "Goblin 5" });
  expect(copied.slice(1, 4)).toEqual(items.map((item, i) => ({ ...item, id: `copy-${i + 1}` })));
  expect(copySelection([source[0]], { x: 0, y: 0 }, ["again"], [source[0]])[0]).toEqual({ ...source[0], id: "again", label: "Goblin 2" });
});

const map: ImageItem = { ...mount, id: "map", layer: "map", locked: true, owner: "gm" };
const prop: ImageItem = { ...mount, id: "prop", layer: "prop", locked: true, owner: "gm" };
const token: ImageItem = { ...rider, id: "token", owner: "player" };
const maySelect = (person: Person) => (item: Item) =>
  mayChange(person, { switches: { tokens: true, drawing: true, notes: true, fog: true, uploads: true, ownerOnly: false } }, item,
    { type: "update", id: item.id, fields: { position: item.position } });
const gm = maySelect({ role: "gm", id: "gm" });
const player = maySelect({ role: "player", id: "player" });
const trusted = maySelect({ role: "trusted", id: "player" });

test("a GM's single press passes a locked item to the unlocked item beneath it", () => {
  expect(pressPick([token, prop], gm, "single")).toBe(token);
  expect(pressPick([map, token, prop], gm, "single")).toBe(token);
});
test("a GM's single press on locked items alone picks nothing, so the canvas pans or boxes", () => {
  expect(pressPick([map], gm, "single")).toBeUndefined();
  expect(pressPick([map, prop], gm, "single")).toBeUndefined();
  expect(pressPick([], gm, "single")).toBeUndefined();
});
test("a GM's double-click on a locked item picks it instead of opening the menu", () => {
  expect(pressPick([map], gm, "double")).toBe(map);
  expect(pressPick([token, prop], gm, "double")).toBe(prop);
});
test("a double-click on an unlocked item picks nothing, so its menu opens", () => {
  expect(pressPick([map, token], gm, "double")).toBeUndefined();
  expect(pressPick([], gm, "double")).toBeUndefined();
});
test("a right-click picks the topmost item the person may select, locked or not", () => {
  expect(pressPick([token, prop], gm, "menu")).toBe(prop);
  expect(pressPick([map, token], gm, "menu")).toBe(token);
  expect(pressPick([token, prop], player, "menu")).toBe(token);
});
test("players, trusted or not, never pick a locked item and press through to their token", () => {
  for (const person of [player, trusted]) {
    for (const press of ["single", "double", "menu"] as const) {
      expect(pressPick([map], person, press)).toBeUndefined();
      expect(pressPick([prop], person, press)).toBeUndefined();
    }
    expect(pressPick([map, token, prop], person, "single")).toBe(token);
  }
});
test("a press passes items the person may not select", () => {
  const hiddenNote = { ...items[0], id: "hidden", hidden: true, owner: "gm" };
  expect(pressPick([token, hiddenNote], player, "single")).toBe(token);
  expect(pressPick([token, hiddenNote], gm, "single")).toBe(hiddenNote);
});
test("a selection box skips locked items and items the person may not select", () => {
  expect(boxSelection([map, token, prop, items[2]], gm)).toEqual([token, items[2]]);
  expect(boxSelection([map, token, items[2]], player)).toEqual([token]);
});
