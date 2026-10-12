import { Item, LiveMessage, maxChanges, ReceivedLiveMessage } from "../sceneRules";
import {
  afterLive,
  createLiveSender,
  dragTransforms,
  heldDrag,
  itemInDrag,
  itemsInDrags,
  liveMoving,
  liveSendInterval,
  liveStatesAt,
  noLiveMarks,
  withoutConnection,
} from "./live";

const pointer = (x: number, connectionId = "a", visible = true): ReceivedLiveMessage => ({
  sceneId: "scene", kind: "pointer", connectionId, state: { position: { x, y: 0 }, visible } });
const transform = (id: string, x: number, rotation = 0) => ({ id, position: { x, y: 0 }, rotation, scale: { x: 1, y: 1 } });

test("a first update is drawn at once where it was sent", () => {
  const marks = afterLive(noLiveMarks, pointer(10), 1000);
  expect(liveStatesAt("pointer", marks, 1000)).toEqual({ a: { position: { x: 10, y: 0 }, visible: true } });
  expect(liveMoving("pointer", marks, 1000 + liveSendInterval)).toBe(false);
});

test("a pointer moves evenly to its latest update over one send interval and stays there", () => {
  const marks = afterLive(afterLive(noLiveMarks, pointer(0), 1000), pointer(100), 1100);
  const x = (now: number) => liveStatesAt("pointer", marks, now).a.position.x;
  expect(x(1100)).toBe(0);
  expect(x(1100 + liveSendInterval / 2)).toBe(50);
  expect(liveMoving("pointer", marks, 1100 + liveSendInterval / 2)).toBe(true);
  expect(x(1100 + liveSendInterval)).toBe(100);
  expect(x(5000)).toBe(100);
  expect(liveMoving("pointer", marks, 5000)).toBe(false);
});

test("an update that arrives mid-move starts from where the mark was drawn", () => {
  let marks = afterLive(afterLive(noLiveMarks, pointer(0), 1000), pointer(100), 1100);
  marks = afterLive(marks, pointer(0), 1100 + liveSendInterval / 2);
  expect(liveStatesAt("pointer", marks, 1100 + liveSendInterval / 2).a.position.x).toBe(50);
  expect(liveStatesAt("pointer", marks, 1100 + liveSendInterval).a.position.x).toBe(25);
});

test("a pointer that hides finishes its move first", () => {
  const marks = afterLive(afterLive(noLiveMarks, pointer(0), 1000), pointer(100, "a", false), 1100);
  expect(liveStatesAt("pointer", marks, 1125).a).toEqual({ position: { x: 50, y: 0 }, visible: true });
  expect(liveStatesAt("pointer", marks, 1150).a.visible).toBe(false);
});

test("marks are held by connection and kind, and an end removes only its own", () => {
  const ruler: ReceivedLiveMessage = { sceneId: "scene", kind: "ruler", connectionId: "a",
    state: { start: { x: 0, y: 0 }, end: { x: 4, y: 0 } } };
  let marks = afterLive(afterLive(afterLive(noLiveMarks, pointer(1), 0), pointer(2, "b"), 0), ruler, 0);
  marks = afterLive(marks, { ...ruler, state: { start: { x: 0, y: 0 }, end: { x: 8, y: 0 } } }, 100);
  expect(liveStatesAt("ruler", marks, 125).a.end.x).toBe(6);
  marks = afterLive(marks, { sceneId: "scene", kind: "pointer", connectionId: "a", state: null }, 200);
  expect(Object.keys(marks.pointer)).toEqual(["b"]);
  expect(Object.keys(marks.ruler)).toEqual(["a"]);
  expect(afterLive(marks, { sceneId: "scene", kind: "drag", connectionId: "a", state: null }, 200)).toBe(marks);
});

test("a drag smooths the items it still holds and takes its items and order from the latest update", () => {
  const drag = (items: ReturnType<typeof transform>[]): ReceivedLiveMessage => ({
    sceneId: "scene", kind: "drag", connectionId: "a", state: { items } });
  const marks = afterLive(afterLive(noLiveMarks, drag([transform("hero", 0), transform("gone", 0)]), 0),
    drag([transform("new", 7), transform("hero", 10, 90)]), 100);
  expect(liveStatesAt("drag", marks, 125).a.items).toEqual([transform("new", 7), transform("hero", 5, 45)]);
});

test("a connection that leaves the room loses every kind of mark", () => {
  const ruler: ReceivedLiveMessage = { sceneId: "scene", kind: "ruler", connectionId: "a",
    state: { start: { x: 0, y: 0 }, end: { x: 4, y: 0 } } };
  const marks = afterLive(afterLive(afterLive(noLiveMarks, pointer(1), 0), pointer(2, "b"), 0), ruler, 0);
  const left = withoutConnection(marks, "a");
  expect(left).toEqual({ pointer: { b: marks.pointer.b }, ruler: {}, drag: {} });
  expect(withoutConnection(left, "a")).toBe(left);
});

function sender() {
  const sent: [LiveMessage, boolean][] = [];
  return { sent, live: createLiveSender((message, reliable) => sent.push([message, reliable])) };
}
const state = (x: number) => ({ position: { x, y: 0 }, visible: true });
const update = (x: number): [LiveMessage, boolean] => [{ sceneId: "scene", kind: "pointer", state: state(x) }, false];

test("the sender sends the first update at once, then the latest one each send interval", () => {
  const { sent, live } = sender();
  live.update("scene", "pointer", state(1), 1000);
  live.update("scene", "pointer", state(2), 1010);
  live.update("scene", "pointer", state(3), 1020);
  expect(sent).toEqual([update(1)]);
  expect(live.waiting()).toBe(true);
  live.flush(1000 + liveSendInterval - 1);
  expect(sent).toEqual([update(1)]);
  live.flush(1000 + liveSendInterval);
  expect(sent).toEqual([update(1), update(3)]);
  expect(live.waiting()).toBe(false);
  live.flush(2000);
  expect(sent).toHaveLength(2);
  live.update("scene", "pointer", state(4), 2000);
  expect(sent).toEqual([update(1), update(3), update(4)]);
});

test("each kind is throttled on its own", () => {
  const { sent, live } = sender();
  live.update("scene", "pointer", state(1), 1000);
  live.update("scene", "ruler", { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } }, 1010);
  expect(sent.map(([message]) => message.kind)).toEqual(["pointer", "ruler"]);
});

test("an end is reliable, drops the update that was waiting and is sent once", () => {
  const { sent, live } = sender();
  live.end("pointer");
  expect(sent).toEqual([]);
  live.update("scene", "pointer", state(1), 1000);
  live.update("scene", "pointer", state(2), 1010);
  live.end("pointer");
  live.end("pointer");
  live.flush(2000);
  expect(sent).toEqual([update(1), [{ sceneId: "scene", kind: "pointer", state: null }, true]]);
  // The next update starts a new mark, with no wait left over from the last
  live.update("scene", "pointer", state(3), 1020);
  expect(sent).toHaveLength(3);
});

test("ending everything ends only the kinds that are out, and a reset sends nothing", () => {
  const { sent, live } = sender();
  live.update("scene", "pointer", state(1), 1000);
  live.update("scene", "drag", { items: [] }, 1000);
  live.endAll();
  expect(sent.slice(2)).toEqual([
    [{ sceneId: "scene", kind: "pointer", state: null }, true],
    [{ sceneId: "scene", kind: "drag", state: null }, true],
  ]);
  live.update("scene", "pointer", state(1), 2000);
  live.update("scene", "pointer", state(2), 2010);
  live.reset();
  live.flush(3000);
  live.endAll();
  expect(sent).toHaveLength(5);
  expect(live.waiting()).toBe(false);
});

test("an update for another scene first ends the mark on the scene left", () => {
  const { sent, live } = sender();
  live.update("scene", "pointer", state(1), 1000);
  live.update("other", "pointer", state(2), 1010);
  expect(sent).toEqual([
    update(1),
    [{ sceneId: "scene", kind: "pointer", state: null }, true],
    [{ sceneId: "other", kind: "pointer", state: state(2) }, false],
  ]);
});

const note = (id: string, x: number): Item => ({ id, kind: "text", layer: "note", position: { x, y: 0 }, rotation: 0,
  scale: { x: 1, y: 1 }, order: 0, owner: "gm", locked: false, hidden: false, metadata: {}, text: "", size: 10,
  color: "red", square: true });

test("an item in a drag is drawn with the drag's position, rotation and scale over the store's", () => {
  const item = note("hero", 0);
  const drawn = itemInDrag(item, { id: "hero", position: { x: 5, y: 6 }, rotation: 90, scale: { x: 2, y: 2 } });
  expect(drawn).toEqual({ ...item, position: { x: 5, y: 6 }, rotation: 90, scale: { x: 2, y: 2 } });
  expect(item.position).toEqual({ x: 0, y: 0 });
  expect(itemInDrag(item, undefined)).toBe(item);
});

test("drags draw over the items they hold and leave the store and the other items as they were", () => {
  const items = { hero: note("hero", 0), bystander: note("bystander", 3) };
  const drawn = itemsInDrags(items, dragTransforms({ a: { items: [transform("hero", 8, 45), transform("deleted", 1)] } }, []));
  expect(drawn.hero).toEqual({ ...items.hero, position: { x: 8, y: 0 }, rotation: 45 });
  expect(drawn.bystander).toBe(items.bystander);
  expect(Object.keys(drawn)).toEqual(["hero", "bystander"]);
  expect(items.hero.position.x).toBe(0);
  expect(itemsInDrags(items, dragTransforms({}, []))).toBe(items);
  expect(itemsInDrags(items, dragTransforms({ a: { items: [transform("deleted", 1)] } }, []))).toBe(items);
});

test("an item this connection holds keeps its own drag while the others follow the drag received", () => {
  const transforms = dragTransforms({ a: { items: [transform("mine", 8), transform("theirs", 9)] } }, ["mine"]);
  expect(transforms).toEqual({ theirs: transform("theirs", 9) });
});

test("one item dragged by two connections is drawn where the first connection has it", () => {
  const transforms = dragTransforms({ b: { items: [transform("hero", 2)] }, a: { items: [transform("hero", 1)] } }, []);
  expect(transforms.hero.position.x).toBe(1);
});

test("a received drag of an item named like an object property is drawn as any other", () => {
  const items = { __proto__: null, constructor: note("constructor", 0) } as unknown as Record<string, Item>;
  const drawn = itemsInDrags(items, dragTransforms({ a: { items: [transform("constructor", 4)] } }, []));
  expect((drawn.constructor as unknown as Item).position.x).toBe(4);
});

test("the drag sent puts the item picked up first and keeps the others in order", () => {
  const held = [transform("mount", 0), transform("hero", 1), transform("hat", 2)];
  expect(heldDrag(held, "hero")!.items.map((item) => item.id)).toEqual(["hero", "mount", "hat"]);
  expect(heldDrag(held)!.items).toEqual(held);
});

test("no drag is sent for nothing held or for more items than a batch may change", () => {
  const many = Array.from({ length: maxChanges + 1 }, (_, index) => transform(`item-${index}`, index));
  expect(heldDrag([])).toBeNull();
  expect(heldDrag(many, "item-3")).toBeNull();
  expect(heldDrag(many.slice(1))!.items).toHaveLength(maxChanges);
});
