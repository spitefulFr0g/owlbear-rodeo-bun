import Konva from "konva";
import { DefaultDice, DiceRoll } from "./Dice";
import { Map } from "./Map";
import { Note } from "./Note";
import { Timer } from "./Timer";
import { Token } from "./Token";

export type MapChangeEventHandler = (
  map: Map | null
) => void;
export type MapSettingsChangeEventHandler = (change: Partial<Map>) => void;

export type DiceSelectEventHandler = (dice: DefaultDice) => void;

export type RequestCloseEventHandler = () => void;

export type TokenMenuOpenChangeEventHandler = (
  tokenStateId: string,
  tokenImage: Konva.Node,
  focus: boolean
) => void;
export type TokenMenuCloseChangeEventHandler = () => void;
export type TokenSettingsChangeEventHandler = (change: Partial<Token>) => void;
export type TokenDragEventHandler = (
  event: Konva.KonvaEventObject<DragEvent>,
  tokenStateId: string,
  attachedTokenStateIds: string[]
) => void;

export type NoteCreateEventHander = (notes: Note[]) => void;
export type NoteRemoveEventHander = (noteIds: string[]) => void;
export type NoteChangeEventHandler = (
  changes: Record<string, Partial<Note>>
) => void;
export type NoteMenuOpenEventHandler = (
  noteId: string,
  noteNode: Konva.Node,
  focus: boolean
) => void;
export type NoteMenuCloseEventHandler = () => void;
export type NoteDragEventHandler = (
  event: Konva.KonvaEventObject<DragEvent>,
  noteId: string
) => void;

export type DiceShareChangeEventHandler = (share: boolean) => void;
export type DiceRollsChangeEventHandler = (newRolls: DiceRoll[]) => void;

export type TimerStartEventHandler = (event: Timer) => void;
export type TimerStopEventHandler = () => void;

export type CustomTransformEventHandler = (
  event: Konva.KonvaEventObject<Event>,
  attachments: Konva.Node[]
) => void;
