import { fogToGeometry } from "../helpers/fogGeometry";
import polygonClipping from "polygon-clipping";
import { CurveItem, Scene, ShapeItem, Vector2 } from "../sceneRules";
import { Fog } from "../types/Fog";
import { coveredFog } from "../sceneRules/fog";
export { fogShape, clipFog } from "../sceneRules/fog";

export type FogItem = ShapeItem | CurveItem;
export const fogItems = (scene: Scene): FogItem[] => Object.values(scene.items)
  .filter((item): item is FogItem => item.layer === "fog" && (item.kind === "shape" || item.kind === "curve"))
  .sort((a, b) => a.order - b.order);

/** The tool's transient polygon geometry is in world units; saved geometry is local. */
export function fogItem(shape: Fog, owner: string, cut: boolean, brush: boolean): FogItem {
  const position = shape.data.points[0] || { x: 0, y: 0 };
  const local = (points: Vector2[]) => points.map(point => ({ x: point.x - position.x, y: point.y - position.y }));
  const base = { id: shape.id, layer: "fog" as const, position, rotation: 0, scale: { x: 1, y: 1 },
    order: 0, owner, locked: false, hidden: !shape.visible, metadata: {}, color: shape.color,
    strokeWidth: 0, fill: true, blend: false, cut };
  if (brush && !shape.data.holes.length) return { ...base, kind: "curve", points: local(shape.data.points), closed: true };
  const points = shape.data.points;
  if (!brush && !shape.data.holes.length && points.length === 4 &&
      points[0].y === points[1].y && points[1].x === points[2].x &&
      points[2].y === points[3].y && points[3].x === points[0].x) {
    return { ...base, kind: "shape", geometry: { type: "rectangle", width: points[2].x - position.x, height: points[2].y - position.y } };
  }
  return { ...base, kind: "shape", geometry: { type: "polygon", points: local(shape.data.points), holes: shape.data.holes.map(local) } };
}

export { coveredFog } from "../sceneRules/fog";

/** A cut must overlap the current visible cover. */
export function cutsFog(shape: Fog, items: FogItem[], filled = false): boolean {
  if (shape.data.points.length < 3) return false;
  return coveredFog(items, filled ? shape : undefined).some(cover => polygonClipping.intersection(fogToGeometry(shape), fogToGeometry(cover)).length > 0);
}
