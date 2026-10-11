import { drawingItem, drawingsInOrder, deleteDrawings } from "./drawingItem";
import { Drawing } from "../types/Drawing";
import { Change, defaultSceneGrid, maxChanges } from "../sceneRules";

const style = { id: "drawing", color: "red" as const, blend: true, strokeWidth: 1 };

test("world drawing geometry becomes local without changing its position or style", () => {
  const drawings: Drawing[] = [
    { ...style, type: "path", pathType: "stroke", data: { points: [{ x: -300, y: 450 }, { x: -150, y: 600 }] } },
    { ...style, type: "shape", shapeType: "line", data: { points: [{ x: -300, y: 450 }, { x: -150, y: 600 }] } },
    { ...style, type: "shape", shapeType: "triangle", data: { points: [{ x: -300, y: 450 }, { x: -150, y: 600 }, { x: -450, y: 600 }] } },
    { ...style, type: "shape", shapeType: "rectangle", data: { x: -300, y: 450, width: -150, height: 300 } },
    { ...style, type: "shape", shapeType: "circle", data: { x: -300, y: 450, radius: 75 } },
  ];
  const items = drawings.map(drawing => drawingItem(drawing, "player", 15));
  expect(items.map(item => item.kind)).toEqual(["curve", "line", "shape", "shape", "shape"]);
  for (const item of items) {
    expect(item.position).toEqual({ x: -300, y: 450 });
    expect(item.owner).toBe("player");
    expect(item.layer).toBe("drawing");
    expect(item.strokeWidth).toBe(15);
    expect(item.blend).toBe(true);
  }
  expect(items[0]).toMatchObject({ points: [{ x: 0, y: 0 }, { x: 150, y: 150 }], closed: false, fill: false });
  expect(items[2]).toMatchObject({ geometry: { type: "triangle", points: [{ x: 0, y: 0 }, { x: 150, y: 150 }, { x: -150, y: 150 }] } });
  expect(items[3]).toMatchObject({ geometry: { type: "rectangle", width: -150, height: 300 } });
  expect(items[4]).toMatchObject({ geometry: { type: "circle", radius: 75 } });
});

test("marker strokes are closed and filled while retaining blending", () => {
  expect(drawingItem({ ...style, strokeWidth: 0, type: "path", pathType: "fill", data: { points: [{ x: 0, y: 0 }, { x: 150, y: 150 }] } }, "gm", 15))
    .toMatchObject({ kind: "curve", closed: true, fill: true, blend: true, strokeWidth: 0 });
});

test("only drawing items are erased, in server order, within the batch cap", () => {
  const item = drawingItem({ ...style, type: "shape", shapeType: "circle", data: { x: 0, y: 0, radius: 75 } }, "gm", 15);
  const scene = { id: "scene", grid: defaultSceneGrid, items: {
    later: { ...item, id: "later", order: 2 }, earlier: { ...item, id: "earlier", order: 1 },
    fog: { ...item, id: "fog", layer: "fog" as const },
  } };
  expect(drawingsInOrder(scene).map(item => item.id)).toEqual(["earlier", "later"]);
  const batches: Change[][] = [];
  deleteDrawings(Array.from({ length: maxChanges + 1 }, (_, index) => String(index)), changes => { batches.push(changes); return true; });
  expect(batches.map(batch => batch.length)).toEqual([maxChanges, 1]);
  expect(batches[1]).toEqual([{ type: "delete", id: String(maxChanges) }]);
});
