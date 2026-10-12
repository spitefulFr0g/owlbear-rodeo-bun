import { defaultSceneGrid, Scene, TextItem, applyChange } from "../sceneRules";
import { emptyHistory, remember, historyChanges, dropStep } from "./history";
const item: TextItem = { id: "note", kind: "text", layer: "note", position: { x: 0, y: 0 },
  scale: { x: 1, y: 1 }, rotation: 0, order: 1, owner: "gm", locked: false,
  hidden: false, metadata: {}, text: "before", color: "red", size: 150, square: true };
const scene: Scene = { id: "scene", grid: defaultSceneGrid, fogFill: false, viewOnly: false, movementMode: true, items: { note: item } };
test("one multi-item action is one reversible step, with sequential changes undone backwards", () => {
  const changes = [{ type: "update" as const, id: item.id, fields: { text: "middle" } },
    { type: "update" as const, id: item.id, fields: { text: "after" } },
    { type: "add" as const, item: { ...item, id: "second" } }];
  const history = remember(emptyHistory, scene, changes, "action");
  expect(history.undo).toHaveLength(1);
  const changed = changes.reduce((scene, change) => applyChange(scene, change).scene, scene);
  expect(history.undo[0].undo.reduce((scene, change) => applyChange(scene, change).scene, changed)).toEqual(scene);
});
test("history keeps fifty actions and a new action clears redo", () => {
  let history = emptyHistory;
  for (let i = 0; i < 51; i++) history = remember(history, scene, [{ type: "update", id: item.id, fields: { text: String(i) } }], String(i));
  expect(history.undo).toHaveLength(50);
  expect(history.undo[0].id).toBe("1");
  expect(remember({ undo: [], redo: history.undo }, scene, [{ type: "delete", id: item.id }], "new").redo).toEqual([]);
});
test("replay skips someone else's deleted item and refusal drops a step from either direction", () => {
  const history = remember(emptyHistory, scene, [{ type: "update", id: item.id, fields: { text: "after" } }], "action");
  expect(historyChanges({ ...scene, items: {} }, history.undo[0].undo)).toEqual([]);
  expect(dropStep({ undo: history.undo, redo: history.undo }, "action")).toEqual(emptyHistory);
  const deletion = remember(emptyHistory, scene, [{ type: "delete", id: item.id }], "delete");
  expect(historyChanges({ ...scene, items: {} }, deletion.undo[0].undo)).toEqual([{ type: "add", item }]);
});

test("a multi-item step with a remotely deleted item is skipped whole", () => {
  const second = { ...item, id: "second" };
  const history = remember(emptyHistory, { ...scene, items: {} },
    [{ type: "add", item }, { type: "add", item: second }], "two");
  expect(historyChanges(scene, history.undo[0].undo)).toEqual([]);
});
