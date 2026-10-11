import { defaultSceneGrid, ImageItem, Scene } from "../sceneRules";
import { afterAnswer, afterChanges, imageFiles, imagesInOrder } from "./shown";

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
  return { id: "scene", grid: defaultSceneGrid, items: byId };
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
