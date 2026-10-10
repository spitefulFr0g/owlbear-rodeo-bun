import { Timer } from "./Timer";
import { Dice } from "./Dice";

export type PlayerState = {
  role?: "gm" | "trusted" | "player";
  nickname: string;
  timer?: Timer;
  dice: Dice;
  sessionId?: string;
  userId?: string;
};
