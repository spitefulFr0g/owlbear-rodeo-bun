import { Drawing, DrawingStrokeWidth, DrawingToolSettings } from "../types/Drawing";
import { Change, CurveItem, LineItem, ShapeItem, Scene, maxChanges } from "../sceneRules";

export type DrawingItem = ShapeItem | CurveItem | LineItem;

/** Drawing-layer items, in the order assigned by the server. */
export function drawingsInOrder(scene: Scene): DrawingItem[] {
  return Object.values(scene.items).filter((item): item is DrawingItem =>
    item.layer === "drawing" && (item.kind === "shape" || item.kind === "curve" || item.kind === "line")
  ).sort((a, b) => a.order - b.order);
}

export const strokeWidthMultipliers: Record<DrawingStrokeWidth, number> = { thin: 0.5, normal: 1, thick: 2 };

type StrokeSettings = Pick<DrawingToolSettings, "type" | "useShapeFill" | "strokeWidth">;

/** The brush, the line and outlined shapes have a stroke; the marker and filled shapes do not. */
export function drawingToolStrokes({ type, useShapeFill }: StrokeSettings): boolean {
  return type === "brush" || type === "line"
    || ((type === "rectangle" || type === "circle" || type === "triangle") && !useShapeFill);
}

/** The new drawing's stroke width multiplier for the chosen width, 0 for fills. */
export function toolStrokeWidth(settings: StrokeSettings): number {
  return drawingToolStrokes(settings) ? strokeWidthMultipliers[settings.strokeWidth] : 0;
}

/** Convert the tool's world geometry to the item's local geometry. */
export function drawingItem(drawing: Drawing, owner: string, strokeWidth: number): DrawingItem {
  const position = drawing.type === "path" || drawing.shapeType === "line" || drawing.shapeType === "triangle"
    ? drawing.data.points[0] : { x: drawing.data.x, y: drawing.data.y };
  const base = {
    id: drawing.id, layer: "drawing" as const, position, rotation: 0,
    scale: { x: 1, y: 1 }, order: 0, owner, locked: false, hidden: false,
    metadata: {}, color: drawing.color, blend: drawing.blend,
    strokeWidth: drawing.strokeWidth * strokeWidth,
  };
  const local = (points: { x: number; y: number }[]) => points.map((point) => ({ x: point.x - position.x, y: point.y - position.y }));
  if (drawing.type === "path") {
    return { ...base, kind: "curve", points: local(drawing.data.points), closed: drawing.pathType === "fill", fill: drawing.pathType === "fill", cut: false };
  }
  if (drawing.shapeType === "line") return { ...base, kind: "line", points: local(drawing.data.points) };
  const geometry = drawing.shapeType === "rectangle"
    ? { type: "rectangle" as const, width: drawing.data.width, height: drawing.data.height }
    : drawing.shapeType === "circle"
    ? { type: "circle" as const, radius: drawing.data.radius }
    : { type: "triangle" as const, points: local(drawing.data.points) };
  return { ...base, kind: "shape", geometry, fill: drawing.strokeWidth === 0, cut: false };
}

/** Large erasures use batches within the server's envelope cap. */
export function deleteDrawings(ids: string[], act: (changes: Change[]) => boolean) {
  for (let offset = 0; offset < ids.length; offset += maxChanges) {
    act(ids.slice(offset, offset + maxChanges).map((id) => ({ type: "delete", id })));
  }
}
