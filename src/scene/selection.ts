import { duplicateLabels } from "../helpers/duplicateLabels";
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
  ids: string[],
  visibleItems: Item[]
): Item[] {
  const labels = duplicateLabels(
    items.flatMap((item) => item.kind === "image" ? [item.label] : []),
    visibleItems.flatMap((item) => item.kind === "image" ? [item.label] : [])
  );
  let imageIndex = 0;
  return items.map((item, index) => ({
    ...item,
    ...(item.kind === "image" ? { label: labels[imageIndex++] } : {}),
    id: ids[index],
    position: {
      x: item.position.x + delta.x,
      y: item.position.y + delta.y,
    },
  }));
}

/**
 * What a pointer press picks from the items under it, given bottom to top in
 * drawing order. A single press passes locked items to the topmost unlocked
 * item beneath; a double-click picks a locked item and nothing otherwise, so
 * an unlocked item's menu opens; a menu press picks the topmost item. Items
 * the person may not select are always passed.
 */
export function pressPick(
  under: Item[],
  maySelect: (item: Item) => boolean,
  press: "single" | "double" | "menu"
): Item | undefined {
  const permitted = under.filter(maySelect).reverse();
  if (press === "menu") return permitted[0];
  if (press === "double") return permitted[0]?.locked ? permitted[0] : undefined;
  return permitted.find((item) => !item.locked);
}

/** What a selection box takes from the items it touches: never a locked item. */
export function boxSelection(
  touched: Item[],
  maySelect: (item: Item) => boolean
): Item[] {
  return touched.filter((item) => !item.locked && maySelect(item));
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
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}
