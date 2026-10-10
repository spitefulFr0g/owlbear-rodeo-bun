import { Role, RoomSwitches } from "../types/Room";

/** What a role may do in a room, whatever the room's switches say */
export type RoleControls = {
  /** Change the map, reset it, or change a map's settings */
  map: boolean;
  /** See and change what is hidden or locked on the map */
  hidden: boolean;
  /** Change the room's settings, run its session and cast its display */
  room: boolean;
};

/**
 * The controls a role is shown. The server makes the same decision for
 * itself, this only keeps the browser from offering what would be refused.
 */
export function getRoleControls(role: Role): RoleControls {
  const isGM = role === "gm";
  return { map: isGM, hidden: isGM, room: isGM };
}

export const defaultRoomSwitches: RoomSwitches = {
  tokens: true,
  drawing: true,
  notes: true,
  fog: false,
  uploads: false,
};

/** Trusted players bypass switches, but retain the GM-only boundaries above. */
export function getToolPermissions(role: Role, switches = defaultRoomSwitches) {
  const bypass = role === "gm" || role === "trusted";
  return {
    tokens: bypass || switches.tokens,
    drawing: bypass || switches.drawing,
    notes: bypass || switches.notes,
    fog: bypass || switches.fog,
    uploads: bypass || switches.uploads,
    measure: true,
    pointer: true,
  };
}

/** Local images require uploads unless their file is already in the room manifest. */
export function canPlaceImage(
  image: { type: string; file?: string },
  permissions: ReturnType<typeof getToolPermissions>,
  roomAssetIds: string[]
) {
  return (
    permissions.tokens &&
    (image.type === "default" ||
      permissions.uploads ||
      (!!image.file && roomAssetIds.includes(image.file)))
  );
}
