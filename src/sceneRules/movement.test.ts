import { defaultSceneGrid, gridDistance, ImageItem, Scene, tokenMovement } from "./index";
import { gridDistance as rulerDistance } from "../scene/grid";
const token: ImageItem = { id: "first", kind: "image", layer: "character", position: { x: 75, y: 75 }, rotation: 0,
  scale: { x: 1, y: 1 }, order: 0, owner: "gm", locked: false, hidden: false, metadata: {},
  image: { type: "default", key: "token" }, width: 150, height: 150, label: "", outline: { type: "circle", x: 75, y: 75, radius: 75 } };
const second = { ...token, id: "second" };
const scene: Scene = { id: "scene", grid: defaultSceneGrid, movementMode: true, fogFill: false, viewOnly: false, items: { first: token, second } };
const move = (item = token) => ({ ...item, position: { x: 525, y: 375 } });
for (const type of ["square", "hexVertical", "hexHorizontal"] as const) {
  for (const measurement of ["chebyshev", "alternating", "euclidean", "manhattan"] as const) {
    test(`${type} movement and ruler count the same ${measurement} distance`, () => {
      const grid = { ...defaultSceneGrid, type, measurement: { type: measurement, scale: "5ft" } };
      const start = type === "square" ? { x: 75, y: 75 } : type === "hexVertical" ? { x: 75, y: 150 / Math.sqrt(3) } : { x: 150 / Math.sqrt(3), y: 75 };
      const end = type === "square" ? { x: start.x + 450, y: start.y + 300 } : type === "hexVertical" ? { x: start.x + 450, y: start.y } : { x: start.x, y: start.y + 450 };
      const distance = gridDistance(grid, start, end);
      expect(distance).toBeCloseTo(type !== "square" ? 3 : measurement === "euclidean" ? Math.sqrt(13) : measurement === "manhattan" ? 5 : measurement === "alternating" ? 4 : 3);
      expect(distance).toBe(rulerDistance(grid, start, end));
      expect(gridDistance(grid, end, start)).toBe(distance);
    });
  }
}
test("a group move measures the picked-up token locally and the first received token remotely", () => {
  expect(tokenMovement(scene, [move(), move(second)], "second")?.id).toBe("second");
  expect(tokenMovement(scene, [move(second), move()])?.id).toBe("second");
  expect(tokenMovement(scene, [move()], "missing")).toBeUndefined();
});
test("only positional moves of tokens carry a distance", () => {
  for (const layer of ["character", "mount", "prop", "attachment"] as const) expect(tokenMovement({ ...scene, items: { first: { ...token, layer } } }, [move()])?.id).toBe("first");
  for (const transform of [token, { ...move(), rotation: 1 }, { ...move(), scale: { x: 2, y: 1 } }]) expect(tokenMovement(scene, [transform])).toBeUndefined();
  expect(tokenMovement({ ...scene, movementMode: false }, [move()])).toBeUndefined();
  expect(tokenMovement({ ...scene, items: { first: { ...token, layer: "map" } } }, [move()])).toBeUndefined();
  expect(tokenMovement({ ...scene, items: { first: { ...token, kind: "text", layer: "note", text: "note", color: "red", size: 1, square: true } } }, [move()])).toBeUndefined();
  expect(tokenMovement(scene, [])).toBeUndefined();
  expect(tokenMovement(scene, [{ ...move(), id: "__proto__" }, move(second)])?.id).toBe("second");
});

test("a receiver missing the picked-up hidden token measures the first shown moved token", () => {
  const receivedScene = { ...scene, items: { second } };
  expect(tokenMovement(receivedScene, [move(second)])).toEqual({ id: "second", start: second.position, end: move(second).position });
  expect(tokenMovement(receivedScene, [move(), move(second)])?.id).toBe("second");
});

for (const type of ["square", "hexVertical", "hexHorizontal"] as const) {
  test(`sender and receiver measure the same group move on a ${type} grid`, () => {
    const shared = { ...scene, grid: { ...scene.grid, type } };
    const transforms = [move(), move(second)];
    const local = tokenMovement(shared, transforms, token.id)!;
    const remote = tokenMovement(shared, transforms)!;
    expect(rulerDistance(shared.grid, remote.start, remote.end)).toBe(rulerDistance(shared.grid, local.start, local.end));
  });
}

test("ending a received drag or turning movement mode off clears its distance", () => {
  expect(tokenMovement(scene, [move()])).toBeDefined();
  expect(tokenMovement(scene, [])).toBeUndefined();
  expect(tokenMovement({ ...scene, movementMode: false }, [move()])).toBeUndefined();
});
