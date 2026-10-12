import { mayChangeNothing } from "../sceneRules";
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
  ownerOnly: false,
};

/**
 * Trusted players bypass switches, but retain the GM-only boundaries above.
 * On a view-only scene only the GM keeps the tools that change the scene.
 */
export function getToolPermissions(role: Role, switches = defaultRoomSwitches, viewOnly = false) {
  const changes = !mayChangeNothing(role, { viewOnly });
  const bypass = role === "gm" || role === "trusted";
  return {
    select: changes,
    tokens: changes && (bypass || switches.tokens),
    drawing: changes && (bypass || switches.drawing),
    notes: changes && (bypass || switches.notes),
    fog: changes && (bypass || switches.fog),
    uploads: bypass || switches.uploads,
    measure: true,
    pointer: true,
  };
}

/** Local images require uploads unless all their files are already named by scene images. */
export function canPlaceImage(
  image: { type: string; file?: string; thumbnail?: string },
  permissions: ReturnType<typeof getToolPermissions>,
  roomAssetIds: string[]
) {
  return (
    permissions.tokens &&
    (image.type === "default" ||
      permissions.uploads ||
      (!!image.file && roomAssetIds.includes(image.file) &&
        (!image.thumbnail || roomAssetIds.includes(image.thumbnail))))
  );
}
