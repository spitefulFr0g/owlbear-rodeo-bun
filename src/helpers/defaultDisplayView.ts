import { Item, Scene, Vector2 } from "../sceneRules";
import { MapRect } from "./displayView";

/** Local geometry transformed into world units, including rotated items. */
function itemBounds(item: Item): MapRect {
  let points: Vector2[];
  if (item.kind === "image" || item.kind === "text") {
    const width = item.kind === "image" ? item.width : item.size;
    const height = item.kind === "image" ? item.height : item.size;
    points = [{ x: -width / 2, y: -height / 2 }, { x: width / 2, y: -height / 2 },
      { x: width / 2, y: height / 2 }, { x: -width / 2, y: height / 2 }];
  } else if (item.kind === "shape") {
    const geometry = item.geometry;
    if (geometry.type === "circle") {
      const angle = item.rotation * Math.PI / 180;
      const rx = geometry.radius * Math.hypot(item.scale.x * Math.cos(angle), item.scale.y * Math.sin(angle));
      const ry = geometry.radius * Math.hypot(item.scale.x * Math.sin(angle), item.scale.y * Math.cos(angle));
      return { x: item.position.x - rx, y: item.position.y - ry, width: rx * 2, height: ry * 2 };
    }
    points = geometry.type === "rectangle"
      ? [{ x: 0, y: 0 }, { x: geometry.width, y: 0 }, { x: geometry.width, y: geometry.height }, { x: 0, y: geometry.height }]
      : geometry.points;
  } else {
    points = item.points;
  }
  const angle = item.rotation * Math.PI / 180;
  const world = points.map(({ x, y }) => ({
    x: item.position.x + x * item.scale.x * Math.cos(angle) - y * item.scale.y * Math.sin(angle),
    y: item.position.y + x * item.scale.x * Math.sin(angle) + y * item.scale.y * Math.cos(angle),
  }));
  if (!world.length) world.push(item.position);
  const x = Math.min(...world.map((point) => point.x));
  const y = Math.min(...world.map((point) => point.y));
  return { x, y, width: Math.max(...world.map((point) => point.x)) - x,
    height: Math.max(...world.map((point) => point.y)) - y };
}

/** Fit the map, else every received item, else ten cells around the origin. */
export function defaultDisplayView(scene: Scene | null): MapRect {
  const items = Object.values(scene?.items || {});
  const maps = items.filter((item) => item.kind === "image" && item.layer === "map");
  const bounds = (maps.length ? maps : items).map(itemBounds);
  const cell = scene?.grid.unitsPerCell || 150;
  if (!bounds.length) return { x: -cell * 5, y: -cell * 5, width: cell * 10, height: cell * 10 };
  const x = Math.min(...bounds.map((rect) => rect.x));
  const y = Math.min(...bounds.map((rect) => rect.y));
  const width = Math.max(...bounds.map((rect) => rect.x + rect.width)) - x;
  const height = Math.max(...bounds.map((rect) => rect.y + rect.height)) - y;
  return { x: x - (width === 0 ? cell / 2 : 0), y: y - (height === 0 ? cell / 2 : 0),
    width: width || cell, height: height || cell };
}
