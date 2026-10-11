import { Change, Item, Vector2 } from "../sceneRules";

/** A common translation preserves the spacing of a mixed selection. */
export function moveSelection(items: Item[], delta: Vector2): Change[] {
  return items.map((item) => ({
    type: "update",
    id: item.id,
    fields: {
      position: { x: item.position.x + delta.x, y: item.position.y + delta.y },
    },
  }));
}

/** Copies keep each kind's geometry and metadata, with new item identities. */
export function copySelection(
  items: Item[],
  delta: Vector2,
  ids: string[]
): Item[] {
  return items.map((item, index) => ({
    ...item,
    id: ids[index],
    position: {
      x: item.position.x + delta.x,
      y: item.position.y + delta.y,
    },
  }));
}

/** Attaching layers follow today's mount outline and character centre rules. */
export function attachesTo(
  base: Item,
  candidate: Item,
  unitsPerCell: number
): boolean {
  if (base.kind !== "image" || candidate.kind !== "image") return false;
  if (base.layer === "character" && candidate.layer === "attachment")
    return (
      Math.hypot(
        candidate.position.x - base.position.x,
        candidate.position.y - base.position.y
      ) <
      unitsPerCell / 4
    );
  if (
    base.layer !== "mount" ||
    (candidate.layer !== "character" && candidate.layer !== "attachment")
  )
    return false;
  const angle = (-base.rotation * Math.PI) / 180;
  const dx = candidate.position.x - base.position.x;
  const dy = candidate.position.y - base.position.y;
  const x =
    (dx * Math.cos(angle) - dy * Math.sin(angle)) / base.scale.x +
    base.width / 2;
  const y =
    (dx * Math.sin(angle) + dy * Math.cos(angle)) / base.scale.y +
    base.height / 2;
  const outline = base.outline;
  if (outline.type === "circle")
    return Math.hypot(x - outline.x, y - outline.y) < outline.radius;
  if (outline.type === "rect")
    return (
      x >= outline.x &&
      x <= outline.x + outline.width &&
      y >= outline.y &&
      y <= outline.y + outline.height
    );
  let inside = false;
  for (
    let i = 0, j = outline.points.length - 2;
    i < outline.points.length;
    j = i, i += 2
  ) {
    const xi = outline.points[i],
      yi = outline.points[i + 1];
    const xj = outline.points[j],
      yj = outline.points[j + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}
