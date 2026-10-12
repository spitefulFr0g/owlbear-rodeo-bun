import { readLive, maxChanges } from "./index";
const position = { x: 1, y: 2 };
test("pointers retain only finite positions and visibility, never browser identity", () => {
  expect(readLive({ sceneId: "scene", kind: "pointer", connectionId: "forged", state: { position: { ...position, color: "red" }, visible: true, owner: "forged" } })).toEqual({ sceneId: "scene", kind: "pointer", state: { position, visible: true } });
  for (const state of [undefined, {}, { position, visible: 1 }, { position: { x: Infinity, y: 2 }, visible: true }]) expect(readLive({ sceneId: "scene", kind: "pointer", state })).toBeUndefined();
  expect(readLive({ sceneId: "x".repeat(65), kind: "pointer", state: null })).toBeUndefined();
});
test("rulers and drags carry only their finite wire fields and obey the batch cap", () => {
  expect(readLive({ sceneId: "scene", kind: "ruler", state: { start: position, end: position, distance: 5 } })).toEqual({ sceneId: "scene", kind: "ruler", state: { start: position, end: position } });
  const item = { id: "hero", position, rotation: 0, scale: position };
  expect(readLive({ sceneId: "scene", kind: "drag", state: { items: Array(maxChanges).fill(item) } })).toBeDefined();
  expect(readLive({ sceneId: "scene", kind: "drag", state: { items: Array(maxChanges + 1).fill(item) } })).toBeUndefined();
  for (const bad of [{ ...item, rotation: NaN }, { ...item, id: "" }, { ...item, scale: { x: 1, y: Infinity } }]) expect(readLive({ sceneId: "scene", kind: "drag", state: { items: [bad] } })).toBeUndefined();
  for (const kind of ["pointer", "ruler", "drag"]) expect(readLive({ sceneId: "scene", kind, state: null })).toEqual({ sceneId: "scene", kind, state: null });
});

test("rulers require two finite world points and discard distance, colour and identity", () => {
  const message = { sceneId: "scene", kind: "ruler", state: { start: { x: -1.5, y: 0 }, end: { x: 3, y: 4 } } };
  expect(readLive({ ...message, connectionId: "forged", state: { ...message.state, distance: 5, color: "red", owner: "forged" } })).toEqual(message);
  for (const state of [undefined, {}, [], { start: position }, { end: position },
    { start: null, end: position }, { start: position, end: [1, 2] },
    { start: { x: "1", y: 2 }, end: position },
    ...[NaN, Infinity, -Infinity].flatMap(value => [
      { start: { x: value, y: 2 }, end: position },
      { start: position, end: { x: 1, y: value } },
    ]),
  ]) expect(readLive({ ...message, state })).toBeUndefined();
  expect(readLive({ ...message, state: null })).toEqual({ ...message, state: null });
});
