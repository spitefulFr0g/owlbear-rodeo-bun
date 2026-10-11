import { defaultSceneGrid, checkChange, Scene } from "../sceneRules";
import { Token } from "../types/Token";
import { tokenItem } from "./tokenItem";

const scene: Scene = { id: "scene", grid: defaultSceneGrid, items: {} };

const wolf: Token = {
  id: "token",
  name: "Wolf",
  type: "file",
  file: "file-id",
  thumbnail: "thumbnail-id",
  defaultSize: 2,
  defaultCategory: "vehicle",
  defaultLabel: "Wolf",
  hideInSidebar: false,
  width: 300,
  height: 600,
  outline: { type: "rect", x: 0, y: 0, width: 300, height: 600 },
  owner: "browser",
  created: 1,
  lastModified: 1,
};

test("a token becomes an image item the scene rules accept", () => {
  const item = tokenItem(wolf, { x: 40, y: -10 }, scene.grid, "browser", "id");
  expect(checkChange(scene, { type: "add", item })).toBeUndefined();
  expect(item.position).toEqual({ x: 40, y: -10 });
  expect(item.label).toBe("Wolf");
  expect(item.image).toEqual({
    type: "file",
    file: "file-id",
    thumbnail: "thumbnail-id",
  });
});

test("a token two cells wide covers two cells and keeps its proportions", () => {
  const item = tokenItem(wolf, { x: 0, y: 0 }, scene.grid, "browser", "id");
  expect(item.width * item.scale.x).toBe(300);
  expect(item.height * item.scale.y).toBe(600);
});

test("a token lands on the layer for its category", () => {
  const layer = (defaultCategory: Token["defaultCategory"]) =>
    tokenItem(
      { ...wolf, defaultCategory },
      { x: 0, y: 0 },
      scene.grid,
      "browser",
      "id"
    ).layer;
  expect(layer("character")).toBe("character");
  expect(layer("vehicle")).toBe("mount");
  expect(layer("prop")).toBe("prop");
  expect(layer("attachment")).toBe("attachment");
});

test("a built-in token names its image by key", () => {
  const item = tokenItem(
    { ...wolf, type: "default", key: "goblin" } as Token,
    { x: 0, y: 0 },
    scene.grid,
    "browser",
    "id"
  );
  expect(item.image).toEqual({ type: "default", key: "goblin" });
});
