import { readBatch } from "./index";
test("a batch envelope accepts item ids and refuses malformed changes", () => {
  expect(
    readBatch({
      id: "batch",
      sceneId: "scene",
      changes: [{ type: "delete", id: "item" }],
    })
  ).toBeDefined();
  expect(
    readBatch({ id: "batch", sceneId: "scene", changes: [{ type: "delete" }] })
  ).toBeUndefined();
});
import {
  applyChange,
  topOrder,
  Scene,
  TextItem,
  defaultSceneGrid,
} from "./index";
const item: TextItem = {
  id: "note",
  kind: "text",
  layer: "note",
  position: { x: 0, y: 0 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  order: 4,
  owner: "gm",
  locked: false,
  hidden: false,
  metadata: { old: true },
  text: "hello",
  color: "red",
  size: 150,
  square: true,
};
const empty: Scene = { id: "scene", grid: defaultSceneGrid, items: {} };
test("items preserve independent field and metadata writes without changing earlier scenes", () => {
  const added = applyChange(empty, { type: "add", item }).scene;
  const first = applyChange(added, {
    type: "update",
    id: "note",
    fields: { text: "first", metadata: { a: 1 } },
  }).scene;
  const last = applyChange(first, {
    type: "update",
    id: "note",
    fields: { text: "last", color: "blue", metadata: { b: 2, old: null } },
  }).scene;
  expect(last.items.note).toEqual({
    ...item,
    text: "last",
    color: "blue",
    metadata: { a: 1, b: 2 },
  });
  expect(added.items.note).toEqual(item);
  expect(empty.items).toEqual({});
  expect(topOrder(added, "note")).toBe(5);
  expect(topOrder(added, "map")).toBe(0);
  expect(applyChange(last, { type: "delete", id: "note" }).scene.items).toEqual(
    {}
  );
  expect(applyChange(added, { type: "add", item })).toEqual({
    scene: added,
    applied: false,
    reason: "exists",
  });
  for (const type of ["update", "delete"] as const)
    expect(applyChange(empty, { type, id: "note", fields: {} })).toEqual({
      scene: empty,
      applied: false,
      reason: "missing",
    });
});
import { checkChange } from "./index";
test("scene changes refuse unknown shapes, wrong types and nonfinite numbers", () => {
  expect(checkChange(empty, { type: "add", item })).toBeUndefined();
  for (const fields of [
    { kind: "alien" },
    { layer: "grid" },
    { layer: "other" },
    { surprise: true },
    { size: "big" },
    { rotation: Infinity },
    { position: { x: NaN, y: 0 } },
  ]) {
    expect(
      checkChange(empty, { type: "add", item: { ...item, ...fields } } as any)
    ).toBe("invalid");
  }
  const scene = applyChange(empty, { type: "add", item }).scene;
  expect(
    checkChange(scene, { type: "update", id: "note", fields: { points: [] } })
  ).toBe("invalid");
  expect(
    checkChange(scene, {
      type: "update",
      id: "note",
      fields: { metadata: { old: null } },
    })
  ).toBeUndefined();
});
test("batch and scene item counts accept the limit and refuse one more", () => {
  const changes = Array.from({ length: 500 }, () => ({
    type: "delete",
    id: "note",
  }));
  expect(readBatch({ id: "b", sceneId: "s", changes })).toBeDefined();
  expect(
    readBatch({ id: "b", sceneId: "s", changes: [...changes, changes[0]] })
  ).toBeUndefined();
  const items: Record<string, TextItem> = {};
  for (let i = 0; i < 4999; i++) items[String(i)] = { ...item, id: String(i) };
  expect(
    checkChange({ ...empty, items }, { type: "add", item })
  ).toBeUndefined();
  items.extra = { ...item, id: "extra" };
  expect(checkChange({ ...empty, items }, { type: "add", item })).toBe("cap");
});
test("text and metadata accept the limit and refuse one more UTF-8 byte", () => {
  expect(
    checkChange(empty, {
      type: "add",
      item: { ...item, text: "a".repeat(10000) },
    })
  ).toBeUndefined();
  expect(
    checkChange(empty, {
      type: "add",
      item: { ...item, text: "a".repeat(10001) },
    })
  ).toBe("cap");
  // JSON adds eight bytes around this string, and é takes two UTF-8 bytes.
  const metadata = { a: "é".repeat(8188) };
  expect(
    checkChange(empty, { type: "add", item: { ...item, metadata } })
  ).toBeUndefined();
  expect(
    checkChange(empty, {
      type: "add",
      item: { ...item, metadata: { a: metadata.a + "a" } },
    })
  ).toBe("cap");
});
test("polygon holes count toward the per-item point limit", () => {
  const polygon = {
    ...item,
    kind: "shape",
    geometry: {
      type: "polygon",
      points: [{ x: 0, y: 0 }],
      holes: [Array.from({ length: 9999 }, () => ({ x: 1, y: 1 }))],
    },
    color: "red",
    strokeWidth: 1,
    fill: true,
    blend: false,
    cut: false,
  } as any;
  delete polygon.text;
  delete polygon.size;
  delete polygon.square;
  expect(checkChange(empty, { type: "add", item: polygon })).toBeUndefined();
  polygon.geometry.holes[0].push({ x: 2, y: 2 });
  expect(checkChange(empty, { type: "add", item: polygon })).toBe("cap");
});
test("metadata updates are capped after independent names merge", () => {
  const scene = {
    ...empty,
    items: { note: { ...item, metadata: { a: "x".repeat(16000) } } },
  };
  expect(
    checkChange(scene, {
      type: "update",
      id: "note",
      fields: { metadata: { b: "x".repeat(500) } },
    })
  ).toBe("cap");
  expect(
    checkChange(scene, {
      type: "update",
      id: "note",
      fields: { metadata: { a: null, b: "x".repeat(500) } },
    })
  ).toBeUndefined();
});
test("each item kind validates its own fields and local geometry", () => {
  const { text, size, square, ...base } = item;
  const candidates: any[] = [
    {
      ...base,
      kind: "image",
      image: { type: "file", file: "asset", resolutions: { low: "small" } },
      width: 100,
      height: 200,
      label: "token",
      outline: { type: "path", points: [0, 0, 100, 100] },
    },
    {
      ...base,
      kind: "shape",
      geometry: {
        type: "triangle",
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 0, y: 10 },
        ],
      },
      strokeWidth: 1,
      fill: true,
      blend: false,
      cut: false,
    },
    {
      ...base,
      kind: "curve",
      points: [{ x: 0, y: 0 }],
      closed: false,
      strokeWidth: 1,
      fill: false,
      blend: false,
      cut: false,
    },
    {
      ...base,
      kind: "line",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ],
      strokeWidth: 1,
      blend: false,
    },
  ];
  delete candidates[0].color;
  for (const candidate of candidates) {
    expect(
      checkChange(empty, { type: "add", item: candidate })
    ).toBeUndefined();
    expect(
      checkChange(empty, {
        type: "add",
        item: { ...candidate, text: "wrong kind" },
      })
    ).toBe("invalid");
  }
  candidates[0].label = "x".repeat(10000);
  expect(
    checkChange(empty, { type: "add", item: candidates[0] })
  ).toBeUndefined();
  candidates[0].label += "x";
  expect(checkChange(empty, { type: "add", item: candidates[0] })).toBe("cap");
  candidates[2].points = Array.from({ length: 10000 }, () => ({ x: 0, y: 0 }));
  expect(
    checkChange(empty, { type: "add", item: candidates[2] })
  ).toBeUndefined();
  candidates[2].points.push({ x: 0, y: 0 });
  expect(checkChange(empty, { type: "add", item: candidates[2] })).toBe("cap");
});
test("updates refuse identity and server order fields, malformed geometry and non-JSON metadata", () => {
  const scene = { ...empty, items: { note: item } };
  for (const fields of [
    { id: "other" },
    { kind: "image" },
    { order: 10 },
    { metadata: { bad: undefined } },
    { metadata: { bad: Infinity } },
  ])
    expect(
      checkChange(scene, { type: "update", id: "note", fields } as any)
    ).toBe("invalid");
  expect(checkChange(empty, { type: "add", item: { ...item, id: "" } })).toBe(
    "invalid"
  );
  expect(
    checkChange(empty, { type: "add", item: { ...item, layer: "ruler" } })
  ).toBe("invalid");
});
test("item and metadata names are data even when they match object prototype names", () => {
  const special = {
    ...item,
    id: "__proto__",
    metadata: JSON.parse('{"__proto__":1}'),
  };
  const added = applyChange(empty, { type: "add", item: special }).scene;
  expect(Object.keys(added.items)).toEqual(["__proto__"]);
  const updated = applyChange(added, {
    type: "update",
    id: "__proto__",
    fields: { metadata: JSON.parse('{"__proto__":2}') },
  }).scene;
  expect(JSON.stringify(updated.items.__proto__.metadata)).toBe(
    '{"__proto__":2}'
  );
});
test("validation checks fields and caps without deciding whether the item exists", () => {
  expect(
    checkChange(empty, {
      type: "update",
      id: "missing",
      fields: { points: [{ x: 0, y: 0 }], closed: false },
    })
  ).toBeUndefined();
  expect(
    checkChange(empty, {
      type: "update",
      id: "missing",
      fields: { text: "x".repeat(10001) },
    })
  ).toBe("cap");
  expect(
    checkChange(empty, {
      type: "update",
      id: "missing",
      fields: { text: "note", image: { type: "default", key: "token" } },
    })
  ).toBe("invalid");
  expect(
    checkChange(empty, {
      type: "add",
      item: { ...item, metadata: { date: new Date() } },
    })
  ).toBe("invalid");
});
test("a batch envelope rejects arrays and holes masquerading as changes", () => {
  expect(
    readBatch({ id: "b", sceneId: "s", changes: new Array(1) })
  ).toBeUndefined();
  const change = Object.assign([], { type: "delete", id: "note" });
  expect(
    readBatch({ id: "b", sceneId: "s", changes: [change] })
  ).toBeUndefined();
});
