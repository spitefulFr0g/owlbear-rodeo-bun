import polygonClipping from "polygon-clipping";
import shortid from "shortid";
import { CurveItem, Scene, ShapeItem, Vector2 } from "../sceneRules";
import { Fog } from "../types/Fog";
import { fogToGeometry } from "../helpers/fogGeometry";
import { mergeFogShapes } from "../helpers/drawing";

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

export function fogShape(item: FogItem): Fog {
  const world = (points: Vector2[]) => points.map(point => {
    const angle = item.rotation * Math.PI / 180;
    const x = point.x * item.scale.x, y = point.y * item.scale.y;
    return { x: item.position.x + x * Math.cos(angle) - y * Math.sin(angle), y: item.position.y + x * Math.sin(angle) + y * Math.cos(angle) };
  });
  const geometry = item.kind === "shape" ? item.geometry : null;
  const points = item.kind === "curve" ? item.points : geometry?.type === "rectangle"
    ? [{ x: 0, y: 0 }, { x: geometry.width, y: 0 }, { x: geometry.width, y: geometry.height }, { x: 0, y: geometry.height }]
    : geometry?.type === "polygon" || geometry?.type === "triangle" ? geometry.points : [];
  return { id: item.id, type: "fog", color: item.cut ? "red" : item.color as Fog["color"], strokeWidth: 0.5, visible: !item.hidden,
    data: { points: world(points), holes: geometry?.type === "polygon" ? geometry.holes.map(world) : [] } };
}

/** Subtract whole polygons, retaining each resulting polygon's holes. */
export function clipFog(shape: Fog, subtract: Fog[]): Fog[] {
  if (shape.data.points.length < 3) return [];
  if (!subtract.length) return [shape];
  const result = polygonClipping.difference(fogToGeometry(shape), ...subtract.map(fogToGeometry));
  return result.map(polygon => ({ ...shape, id: shortid.generate(), data: {
    points: polygon[0].map(([x, y]) => ({ x, y })),
    holes: polygon.slice(1).map(ring => ring.map(([x, y]) => ({ x, y }))),
  } }));
}

/** Hidden items never cover a player's view; cut items subtract from the visible cover. */
export function coveredFog(items: FogItem[]): Fog[] {
  let cover: Fog[] = [];
  for (const item of items) {
    if (item.hidden) continue;
    const shape = fogShape(item);
    cover = item.cut ? cover.flatMap(existing => clipFog(existing, [shape]))
      : mergeFogShapes([...cover, shape]);
  }
  return cover;
}

/** A cut must overlap the current visible cover. */
export function cutsFog(shape: Fog, items: FogItem[]): boolean {
  if (shape.data.points.length < 3) return false;
  return coveredFog(items).some(cover => polygonClipping.intersection(fogToGeometry(shape), fogToGeometry(cover)).length > 0);
}
