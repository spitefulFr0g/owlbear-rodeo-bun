import { Person, RoomRules, Item, Change, statusRingsKey } from "./types";

/** Item permissions; shape validation is separate. Locks, visibility and
 * Owner Only are extended by their respective permission rows. */
export function mayChange(
  person: Person,
  rules: RoomRules,
  item: Item | undefined,
  change: Change
): boolean {
  if (person.role === "display") return false;
  if (person.role === "gm") return true;
  const target = change.type === "add" ? change.item : item;
  if (!target || target.layer === "map") return false;
  if (change.type === "add") {
    if (target.locked || target.hidden) return false;
  } else if (change.type === "update") {
    for (const field of Object.keys(change.fields)) {
      if (["id", "kind", "order", "owner", "locked", "hidden"].includes(field)) return false;
      if (field === "layer" && (person.role !== "trusted" ||
          target.owner !== person.id || change.fields.layer === "map")) return false;
    }
  }
  if (person.role === "trusted") return true;
  const governingSwitch = target.layer === "fog" ? "fog" :
    target.kind === "image" ? "tokens" : target.kind === "text" ? "notes" : "drawing";
  if (!rules.switches[governingSwitch]) return false;
  if (change.type === "add") return true;
  if (governingSwitch === "fog") return true;
  if (governingSwitch !== "tokens" || change.type === "delete") return target.owner === person.id;
  // Players can transform and label any token, but cannot replace its image
  // or use the metadata bag to change anything besides status rings.
  return Object.keys(change.fields).every(field =>
    ["position", "scale", "rotation", "label"].includes(field) ||
    (field === "metadata" && Object.keys(change.fields.metadata!).every(key => key === statusRingsKey))
  );
}
