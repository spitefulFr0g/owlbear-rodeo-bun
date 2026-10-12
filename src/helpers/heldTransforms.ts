import { Item, LiveTransform } from "../sceneRules";

/** A held interaction survives edits, but ends if any item disappears or loses permission. */
export function heldTransformsAllowed(
  transforms: LiveTransform[],
  items: Record<string, Item>,
  canSelect: (item: Item) => boolean
): boolean {
  return transforms.every(({ id }) =>
    Object.prototype.hasOwnProperty.call(items, id) && canSelect(items[id])
  );
}
