import { PlayerColour } from "../helpers/playerColour";

/** What a connection may do in a room, decided by the server */
export type Role = "gm" | "trusted" | "player";

/** The tools a GM can switch on or off for players */
export type RoomSwitches = {
  tokens: boolean;
  drawing: boolean;
  notes: boolean;
  fog: boolean;
  uploads: boolean;
};

/** What everyone in a room is told about it, kept current by the server */
export type RoomState = {
  name?: string;
  switches?: RoomSwitches;
  /** Whether a session is running */
  session?: boolean;
  /** Whether players need a password to join */
  hasPassword?: boolean;
};

/** What the server tells a connection about its own join */
export type JoinInfo = {
  role?: Role;
  color?: PlayerColour;
  room?: RoomState;
};
