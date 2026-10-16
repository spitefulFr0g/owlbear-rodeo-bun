import { Item, Person } from "../sceneRules";

export const onlyGmShowsHint = "Only the GM can show this";

export type VisibilityEntry = { label: "Show" | "Hide"; enabled: boolean; hint?: string };

/**
 * The item menu's Show or Hide entry for a selection. `mayChangeHidden`
 * answers with the shared permission rule; the hint tells a player who is
 * not trusted whom to ask when every selected item is their own hidden
 * note or text.
 */
export function visibilityEntry(
  person: Person,
  items: Item[],
  mayChangeHidden: (item: Item, hidden: boolean) => boolean
): VisibilityEntry {
  const hidden = items.length > 0 && items.every(item => item.hidden);
  const label = hidden ? "Show" : "Hide";
  const enabled = items.length > 0 && items.every(item => mayChangeHidden(item, !hidden));
  const ownHiddenText = hidden && items.every(item => item.kind === "text" && item.owner === person.id);
  return person.role === "player" && !enabled && ownHiddenText
    ? { label, enabled, hint: onlyGmShowsHint } : { label, enabled };
}
