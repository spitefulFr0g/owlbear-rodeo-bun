import { Update } from "./diff";
import { RoomSwitches } from "../types/RoomSwitches";

// Document version 1 only. Replace this top-level seam with the item model.
export function allowsLegacyMapStateUpdateV1(update: Update<unknown>, switches: RoomSwitches): boolean {
  const kinds: Record<string, keyof RoomSwitches> = { tokens: "tokens", drawings: "drawing", notes: "notes", fogs: "fog" };
  return !!update && Array.isArray(update.changes) && update.changes.every(change => {
    const field = change?.path?.[0];
    const kind = typeof field === "string" && Object.hasOwn(kinds, field) ? kinds[field] : undefined;
    return !!kind && switches[kind];
  });
}
