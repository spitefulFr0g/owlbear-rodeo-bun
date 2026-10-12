import { applyChange, defaultSceneGrid, invertChange, Scene, TextItem } from "./index";
const item: TextItem = { id: "note", kind: "text", layer: "note", position: { x: 0, y: 0 },
  scale: { x: 1, y: 1 }, rotation: 0, order: 1, owner: "gm", locked: false,
  hidden: false, metadata: { old: true }, text: "before", color: "red", size: 150, square: true };
const scene: Scene = { id: "scene", grid: defaultSceneGrid, fogFill: false, viewOnly: false, movementMode: true, items: { note: item } };
test("undoing an add deletes it and undoing a delete restores the same id", () => {
  expect(invertChange({ ...scene, items: {} }, { type: "add", item })).toEqual({ type: "delete", id: item.id });
  expect(invertChange(scene, { type: "delete", id: item.id })).toEqual({ type: "add", item });
});
test("undo restores only the changed fields and metadata names even after another person's edit", () => {
  const inverse = invertChange(scene, { type: "update", id: item.id,
    fields: { text: "after", metadata: { old: null, added: true } } })!;
  const later = applyChange(scene, { type: "update", id: item.id,
    fields: { text: "someone else", color: "blue", metadata: { added: 2, unrelated: 3 } } }).scene;
  expect(applyChange(later, inverse).scene.items.note).toEqual({ ...item, color: "blue", metadata: { old: true, unrelated: 3 } });
});
test("a deleted item has no update or delete inverse", () => {
  const empty = { ...scene, items: {} };
  expect(invertChange(empty, { type: "update", id: item.id, fields: { text: "after" } })).toBeUndefined();
  expect(invertChange(empty, { type: "delete", id: item.id })).toBeUndefined();
});

test("add, move, edit and delete undo use the same rules for tokens, drawings, fog and notes", () => {
  const items: import("./types").Item[] = [
    item,
    { ...item, kind: "image", layer: "character", image: { type: "default", key: "token" },
      width: 150, height: 150, label: "token", outline: { type: "circle", x: 0, y: 0, radius: 75 } },
    { ...item, kind: "shape", layer: "drawing", geometry: { type: "circle", radius: 75 },
      strokeWidth: 2, fill: true, blend: false, cut: false },
    { ...item, kind: "curve", layer: "fog", points: [{ x: 0, y: 0 }, { x: 5, y: 5 }],
      closed: true, strokeWidth: 2, fill: true, blend: false, cut: false },
    { ...item, kind: "line", layer: "drawing", points: [{ x: 0, y: 0 }, { x: 5, y: 5 }],
      strokeWidth: 2, blend: false },
  ];
  for (const placed of items) {
    const before = { ...scene, items: { note: placed } };
    const change = { type: "update" as const, id: placed.id,
      fields: { position: { x: 100, y: 200 }, rotation: 45, metadata: { status: "changed" } } };
    const after = applyChange(before, change).scene;
    expect(applyChange(after, invertChange(before, change)!).scene).toEqual(before);
    const deletion = { type: "delete" as const, id: placed.id };
    expect(applyChange(applyChange(before, deletion).scene, invertChange(before, deletion)!).scene).toEqual(before);
    const addition = { type: "add" as const, item: placed };
    const empty = { ...scene, items: {} };
    expect(applyChange(applyChange(empty, addition).scene, invertChange(empty, addition)!).scene).toEqual(empty);
  }
});
