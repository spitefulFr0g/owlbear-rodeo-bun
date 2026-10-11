export * from "./types";
export * from "./caps";
import { Batch, Change, Scene, Layer, Item } from "./types";
import { maxChanges } from "./caps";
export function readBatch(value: unknown): Batch | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return;
  const batch = value as Batch;
  if (
    typeof batch.id !== "string" ||
    typeof batch.sceneId !== "string" ||
    !Array.isArray(batch.changes) ||
    batch.changes.length > maxChanges
  )
    return;
  if (
    !Array.from(batch.changes).every(
      (change) =>
        change &&
        typeof change === "object" &&
        !Array.isArray(change) &&
        (change.type === "add"
          ? change.item &&
            typeof change.item === "object" &&
            !Array.isArray(change.item) &&
            typeof change.item.id === "string"
          : (change.type === "update" || change.type === "delete") &&
            typeof change.id === "string")
    )
  )
    return;
  return batch;
}
export function applyChange(
  scene: Scene,
  change: Change
):
  | { scene: Scene; applied: true }
  | { scene: Scene; applied: false; reason: "missing" | "exists" } {
  const id = change.type === "add" ? change.item.id : change.id;
  const before = Object.prototype.hasOwnProperty.call(scene.items, id)
    ? scene.items[id]
    : undefined;
  if (change.type === "add" && before)
    return { scene, applied: false, reason: "exists" };
  if (change.type !== "add" && !before)
    return { scene, applied: false, reason: "missing" };
  const items: Record<string, Item> = { ...scene.items };
  if (change.type === "delete") delete items[id];
  else if (change.type === "add")
    Object.defineProperty(items, id, {
      value: change.item,
      enumerable: true,
      writable: true,
      configurable: true,
    });
  else {
    const metadata = { ...before!.metadata };
    for (const key of Object.keys(change.fields.metadata || {})) {
      const value = change.fields.metadata![key];
      if (value === null) delete metadata[key];
      else
        Object.defineProperty(metadata, key, {
          value,
          enumerable: true,
          writable: true,
          configurable: true,
        });
    }
    items[id] = { ...before!, ...change.fields, metadata } as Item;
  }
  return { scene: { ...scene, items }, applied: true };
}
export function topOrder(scene: Scene, layer: Layer): number {
  const orders = Object.values(scene.items)
    .filter((item) => item.layer === layer)
    .map((item) => item.order);
  return orders.length ? Math.max(...orders) + 1 : 0;
}
export { checkChange } from "./validation";

export { mayChange } from "./permissions";
