import { Change, ItemFields, Scene } from "./types";

/** Inverts a change against its pre-action scene; missing/existing items have no inverse. */
export function invertChange(scene: Scene, change: Change): Change | undefined {
  const id = change.type === "add" ? change.item.id : change.id;
  const item = Object.prototype.hasOwnProperty.call(scene.items, id) ? scene.items[id] : undefined;
  if (change.type === "add") return item ? undefined : { type: "delete", id };
  if (!item) return undefined;
  if (change.type === "delete") return { type: "add", item };
  const fields: Record<string, unknown> = {};
  for (const key of Object.keys(change.fields)) {
    if (key === "order") continue;
    if (key === "metadata") {
      const metadata: Record<string, unknown> = {};
      for (const name of Object.keys(change.fields.metadata || {})) {
        Object.defineProperty(metadata, name, { value: Object.prototype.hasOwnProperty.call(item.metadata, name)
          ? item.metadata[name] : null, enumerable: true });
      }
      fields.metadata = metadata;
    } else fields[key] = (item as unknown as Record<string, unknown>)[key];
  }
  return { type: "update", id, fields: fields as ItemFields };
}
