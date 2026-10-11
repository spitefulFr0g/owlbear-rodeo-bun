import { Change, Item, Person } from "./types";

export function visibleTo(person: Person, item: Item): boolean {
  return !item.hidden || person.role === "gm" ||
    (person.role !== "display" && item.owner === person.id);
}

/** Translates one applied change using visibility immediately before and after it. */
export function changeFor(person: Person, before: Item | undefined, after: Item | undefined, change: Change): Change | undefined {
  const wasVisible = !!before && visibleTo(person, before);
  const isVisible = !!after && visibleTo(person, after);
  if (!wasVisible && !isVisible) return undefined;
  if (!isVisible) return { type: "delete", id: before!.id };
  if (!wasVisible) return { type: "add", item: after! };
  return change;
}
