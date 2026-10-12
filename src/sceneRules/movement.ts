import { Item, Scene, Vector2 } from "./types";
export type MovementTransform = Pick<Item, "id" | "position" | "rotation" | "scale">;
export type TokenMovement = { id: string; start: Vector2; end: Vector2 };
/** Choose the picked-up token locally, or the first received moved token remotely. */
export function tokenMovement(scene: Scene, transforms: readonly MovementTransform[], pickedUpId?: string): TokenMovement | undefined {
  if (!scene.movementMode) return;
  const candidates = pickedUpId === undefined ? transforms : transforms.filter(item => item.id === pickedUpId);
  for (const transform of candidates) {
    const item = Object.prototype.hasOwnProperty.call(scene.items, transform.id) ? scene.items[transform.id] : undefined;
    if (!item || item.kind !== "image" || !["character", "mount", "prop", "attachment"].includes(item.layer)) continue;
    if (item.rotation !== transform.rotation || item.scale.x !== transform.scale.x || item.scale.y !== transform.scale.y) continue;
    if (item.position.x === transform.position.x && item.position.y === transform.position.y) continue;
    return { id: item.id, start: item.position, end: transform.position };
  }
}
