import { Person, RoomRules, Item, Change } from "./types";

/** Map-layer permission row; other layer permissions are added in later steps. */
export function mayChange(
  person: Person,
  _rules: RoomRules,
  item: Item | undefined,
  change: Change
): boolean {
  if (person.role === "display") return false;
  if (person.role === "gm") return true;
  const layer = change.type === "add" ? change.item.layer :
    change.type === "update" ? change.fields.layer : undefined;
  return item?.layer !== "map" && layer !== "map";
}
