import { Role } from "../types/Room";

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
