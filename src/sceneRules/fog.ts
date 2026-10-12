import polygonClipping from "polygon-clipping";
import { fogToGeometry } from "../helpers/fogGeometry";
import { Fog } from "../types/Fog";
import shortid from "shortid";
import { CurveItem, ShapeItem, Vector2 } from "./types";
import { mergeFogShapes } from "../helpers/drawing";

export type FogItem = ShapeItem | CurveItem;

export function fogShape(item: FogItem): Fog {
  const world = (points: Vector2[]) => points.map(point => {
    const angle = item.rotation * Math.PI / 180;
    const x = point.x * item.scale.x, y = point.y * item.scale.y;
    return { x: item.position.x + x * Math.cos(angle) - y * Math.sin(angle), y: item.position.y + x * Math.sin(angle) + y * Math.cos(angle) };
  });
  const geometry = item.kind === "shape" ? item.geometry : null;
  const points = item.kind === "curve" ? item.points : geometry?.type === "rectangle"
    ? [{ x: 0, y: 0 }, { x: geometry.width, y: 0 }, { x: geometry.width, y: geometry.height }, { x: 0, y: geometry.height }]
    : geometry?.type === "circle"
      // Polygon clipping approximates the circle before applying its world transform.
      ? Array.from({ length: 128 }, (_, index) => {
          const angle = index * Math.PI * 2 / 128;
          return { x: Math.cos(angle) * geometry.radius, y: Math.sin(angle) * geometry.radius };
        })
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
export function coveredFog(items: FogItem[], fill?: Fog): Fog[] {
  let cover: Fog[] = fill ? [fill] : [];
  for (const item of [...items].sort((a, b) => a.order - b.order)) {
    if (item.hidden) continue;
    const shape = fogShape(item);
    cover = item.cut ? cover.flatMap(existing => clipFog(existing, [shape]))
      : mergeFogShapes([...cover, shape]);
  }
  if (!fill) return cover;
  // A viewport (or tool shape) represents just the part of the infinite fill being queried.
  return cover.flatMap(shape => polygonClipping.intersection(fogToGeometry(shape), fogToGeometry(fill))
    .map(polygon => ({ ...shape, data: {
      points: polygon[0].map(([x, y]) => ({ x, y })),
      holes: polygon.slice(1).map(ring => ring.map(([x, y]) => ({ x, y }))),
    } })));
}

