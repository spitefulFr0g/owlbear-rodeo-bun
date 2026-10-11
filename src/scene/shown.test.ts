import { Batch, Change, defaultSceneGrid, ImageItem, Scene } from "../sceneRules";
import {
  afterAnswer,
  afterChanges,
  afterGrid,
  imageFiles,
  imagesInOrder,
  shownScene,
} from "./shown";

function image(id: string, fields: Partial<ImageItem> = {}): ImageItem {
  return {
    id,
    kind: "image",
    layer: "character",
    position: { x: 0, y: 0 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    order: 0,
    owner: "gm",
    locked: false,
    hidden: false,
    metadata: {},
    image: { type: "default", key: "goblin" },
    width: 100,
    height: 100,
    label: "",
    outline: { type: "rect", x: 0, y: 0, width: 100, height: 100 },
    ...fields,
  };
}

function scene(...items: ImageItem[]): Scene {
  const byId: Scene["items"] = {};
  for (const item of items) byId[item.id] = item;
  return { id: "scene", grid: defaultSceneGrid, fogFill: false, viewOnly: false, items: byId };
}

describe("changes another connection made", () => {
  test("are applied to the scene they name", () => {
    const after = afterChanges(scene(image("a")), {
      sceneId: "scene",
      changes: [
        { type: "add", item: image("b") },
        { type: "delete", id: "a" },
      ],
    });
    expect(Object.keys(after!.items)).toEqual(["b"]);
  });

  test("are dropped when they name another scene", () => {
    const before = scene(image("a"));
    const after = afterChanges(before, {
      sceneId: "other",
      changes: [{ type: "delete", id: "a" }],
    });
    expect(after).toBe(before);
  });

  test("are dropped before the first snapshot", () => {
    expect(
      afterChanges(null, {
        sceneId: "scene",
        changes: [{ type: "add", item: image("a") }],
      })
    ).toBeNull();
  });
});

describe("the server's answer to a batch", () => {
  test("puts the applied changes in the scene as the server made them", () => {
    const after = afterAnswer(scene(), {
      batchId: "batch",
      sceneId: "scene",
      applied: [{ type: "add", item: image("a", { order: 7, owner: "me" }) }],
      refused: [],
    });
    expect(after!.items.a.order).toBe(7);
    expect(after!.items.a.owner).toBe("me");
  });

  test("sets a refused item back to what the server holds", () => {
    const held = image("a", { label: "held" });
    const after = afterAnswer(scene(image("a", { label: "mine" })), {
      batchId: "batch",
      sceneId: "scene",
      applied: [],
      refused: [{ id: "a", item: held }],
    });
    expect(after!.items.a).toEqual(held);
  });

  test("removes a refused item the server does not hold", () => {
    const after = afterAnswer(scene(image("a")), {
      batchId: "batch",
      sceneId: "scene",
      applied: [],
      refused: [{ id: "a", item: null }],
    });
    expect(after!.items).toEqual({});
  });

  test("is dropped when it names another scene", () => {
    const before = scene();
    const after = afterAnswer(before, {
      batchId: "batch",
      sceneId: "other",
      applied: [{ type: "add", item: image("a") }],
      refused: [],
    });
    expect(after).toBe(before);
  });
});

function batch(id: string, ...changes: Change[]): Batch {
  return { id, sceneId: "scene", changes };
}

function move(id: string, x: number, y: number): Change {
  return { type: "update", id, fields: { position: { x, y } } };
}

describe("what the store shows", () => {
  test("is the server's scene when nothing is unconfirmed", () => {
    const held = scene(image("a"));
    expect(shownScene(held, [])).toBe(held);
  });

  test("is nothing before the first snapshot", () => {
    expect(shownScene(null, [batch("one", move("a", 1, 1))])).toBeNull();
  });

  test("has an unconfirmed change on top of the server's scene", () => {
    const held = scene(image("a"));
    const shown = shownScene(held, [batch("one", move("a", 30, 40))]);
    expect(shown!.items.a.position).toEqual({ x: 30, y: 40 });
    expect(held.items.a.position).toEqual({ x: 0, y: 0 });
  });

  test("keeps an unconfirmed change on top of what the server sends meanwhile", () => {
    const unconfirmed = [batch("one", move("a", 30, 40))];
    const held = afterChanges(scene(image("a")), {
      sceneId: "scene",
      changes: [
        {
          type: "update",
          id: "a",
          fields: { position: { x: 7, y: 7 }, label: "theirs" },
        },
      ],
    });
    const shown = shownScene(held, unconfirmed);
    expect(shown!.items.a.position).toEqual({ x: 30, y: 40 });
    expect(shown!.items.a).toMatchObject({ label: "theirs" });
  });

  test("applies unconfirmed batches in the order they were made", () => {
    const shown = shownScene(scene(image("a")), [
      batch("one", move("a", 1, 1), { type: "add", item: image("b") }),
      batch("two", move("a", 2, 2), { type: "delete", id: "b" }),
    ]);
    expect(shown!.items.a.position).toEqual({ x: 2, y: 2 });
    expect(Object.keys(shown!.items)).toEqual(["a"]);
  });

  test("skips an unconfirmed change to an item that is gone, and shows the rest", () => {
    const shown = shownScene(scene(image("b")), [
      batch("one", move("a", 1, 1), move("b", 2, 2)),
    ]);
    expect(Object.keys(shown!.items)).toEqual(["b"]);
    expect(shown!.items.b.position).toEqual({ x: 2, y: 2 });
  });

  test("puts a moved image on top of its layer, as the server will", () => {
    const shown = shownScene(
      scene(image("a", { order: 0 }), image("b", { order: 4 })),
      [batch("one", move("a", 1, 1))]
    );
    expect(imagesInOrder(shown!).map((item) => item.id)).toEqual(["b", "a"]);
  });

  test("leaves a moved image on the Map layer in its order", () => {
    const shown = shownScene(
      scene(
        image("a", { layer: "map", order: 0 }),
        image("b", { layer: "map", order: 4 })
      ),
      [batch("one", move("a", 1, 1))]
    );
    expect(shown!.items.a.order).toBe(0);
  });

  test("puts an added item and an item that changed layer on top of the layer", () => {
    const shown = shownScene(
      scene(image("a", { order: 3 }), image("p", { layer: "prop", order: 6 })),
      [
        batch(
          "one",
          { type: "add", item: image("new") },
          { type: "update", id: "a", fields: { layer: "prop" } }
        ),
      ]
    );
    expect(shown!.items.new.order).toBe(4);
    expect(shown!.items.a.order).toBe(7);
  });

  test("goes back to what the server holds once a refused batch is answered", () => {
    const unconfirmed = [batch("one", move("a", 30, 40))];
    const held = afterAnswer(scene(image("a")), {
      batchId: "one",
      sceneId: "scene",
      applied: [],
      refused: [{ id: "a", item: image("a") }],
    });
    const shown = shownScene(
      held,
      unconfirmed.filter((sent) => sent.id !== "one")
    );
    expect(shown!.items.a.position).toEqual({ x: 0, y: 0 });
  });
});

test("images draw layer by layer, each layer in its order", () => {
  const drawn = imagesInOrder(
    scene(
      image("attachment", { layer: "attachment", order: 0 }),
      image("character-top", { layer: "character", order: 2 }),
      image("prop", { layer: "prop", order: 9 }),
      image("character-bottom", { layer: "character", order: 1 }),
      image("mount", { layer: "mount", order: 5 })
    )
  );
  expect(drawn.map((item) => item.id)).toEqual([
    "prop",
    "mount",
    "character-bottom",
    "character-top",
    "attachment",
  ]);
});

test("an image being dragged draws on top of its own layer only", () => {
  const drawn = imagesInOrder(
    scene(
      image("dragged", { order: 0 }),
      image("character", { order: 5 }),
      image("attachment", { layer: "attachment", order: 0 })
    ),
    "dragged"
  );
  expect(drawn.map((item) => item.id)).toEqual([
    "character",
    "dragged",
    "attachment",
  ]);
});

test("an image names every stored file it can be drawn from", () => {
  expect(
    imageFiles(
      image("a", {
        image: {
          type: "file",
          file: "full",
          thumbnail: "thumb",
          resolutions: { low: "low" },
        },
      })
    )
  ).toEqual(["full", "thumb", "low"]);
  expect(imageFiles(image("b"))).toEqual([]);
});

describe("a grid change the server accepted", () => {
  const hex = { ...defaultSceneGrid, type: "hexVertical" as const };

  test("replaces the grid of the scene it names and keeps the items", () => {
    const before = scene(image("a"));
    const after = afterGrid(before, { sceneId: "scene", grid: hex });
    expect(after?.grid).toEqual(hex);
    expect(after?.items).toEqual(before.items);
  });

  test("is ignored when it names another scene", () => {
    const before = scene();
    expect(afterGrid(before, { sceneId: "other", grid: hex })).toBe(before);
  });

  test("is ignored before the scene has arrived", () => {
    expect(afterGrid(null, { sceneId: "scene", grid: hex })).toBeNull();
  });
});
