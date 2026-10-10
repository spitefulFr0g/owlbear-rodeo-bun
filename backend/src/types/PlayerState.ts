import { PlayerColour } from "./PlayerColour";
import { Timer } from "./Timer";
import { Dice } from "./Dice";

export type PlayerState = {
  color?: PlayerColour;
  role?: "gm" | "trusted" | "player";
  nickname: string;
  timer?: Timer;
  dice: Dice;
  sessionId?: string;
  userId?: string;
};
