import { Timer } from "./Timer";
import { DiceState } from "./Dice";
import { Role } from "./Room";

export type PlayerState = {
  nickname: string;
  timer?: Timer;
  dice: DiceState;
  sessionId?: string;
  userId?: string;
  /** Set by the server for the others in the party, never taken from a browser */
  role?: Role;
};
