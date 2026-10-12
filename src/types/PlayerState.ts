import { PlayerColour } from "../helpers/playerColour";
import { Timer } from "./Timer";
import { DiceState } from "./Dice";

/** This browser's own name, colour, dice and timer; what it sends is its presence */
export type PlayerState = {
  nickname: string;
  /** Assigned by the server on join */
  color?: PlayerColour;
  timer?: Timer;
  dice: DiceState;
};
