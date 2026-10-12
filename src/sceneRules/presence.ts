/** Fixed wire caps for ephemeral, room-wide presence. */
export const maxPresenceNameLength = 100;
export const maxPresenceRolls = 100;
export const playerColours = ["blue", "orange", "red", "yellow", "purple", "green", "pink", "teal"] as const;
export type PlayerColour = typeof playerColours[number];
export function isPlayerColour(value: unknown): value is PlayerColour {
  return typeof value === "string" && playerColours.some(color => color === value);
}
export type PresenceUpdate = {
  nickname: string;
  color: PlayerColour;
  dice: { share: boolean; rolls: { type: "d4" | "d6" | "d8" | "d10" | "d12" | "d20" | "d100"; roll: number | "unknown" }[] };
  timer?: { current: number; max: number };
};
export type Presence = PresenceUpdate & {
  sessionId: string;
  userId?: string;
  role: "gm" | "trusted" | "player";
  sceneId?: string | null;
  elsewhere?: boolean;
};
export type PresenceState = Record<string, Presence>;
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
const sides = { d4: 4, d6: 6, d8: 8, d10: 10, d12: 12, d20: 20, d100: 100 };
/** Reject the whole update on malformed known fields; copy only allowed fields. */
export function readPresence(value: unknown): PresenceUpdate | undefined {
  if (!record(value) || typeof value.nickname !== "string" || value.nickname.length > maxPresenceNameLength || !isPlayerColour(value.color)) return;
  const dice = value.dice;
  if (!record(dice) || typeof dice.share !== "boolean" || !Array.isArray(dice.rolls) || dice.rolls.length > maxPresenceRolls) return;
  const rolls: PresenceUpdate["dice"]["rolls"] = [];
  for (const die of dice.rolls) {
    if (!record(die) || typeof die.type !== "string" || !Object.prototype.hasOwnProperty.call(sides, die.type)) return;
    const type = die.type as keyof typeof sides;
    if (die.roll !== "unknown" && (typeof die.roll !== "number" || !Number.isInteger(die.roll) || die.roll < 1 || die.roll > sides[type])) return;
    rolls.push({ type, roll: die.roll as number | "unknown" });
  }
  let timer: PresenceUpdate["timer"];
  if (value.timer !== undefined) {
    if (!record(value.timer) || typeof value.timer.current !== "number" || !Number.isFinite(value.timer.current) || typeof value.timer.max !== "number" || !Number.isFinite(value.timer.max)) return;
    timer = { current: value.timer.current, max: value.timer.max };
  }
  return { nickname: value.nickname, color: value.color, dice: { share: dice.share, rolls: dice.share ? rolls : [] }, ...(timer ? { timer } : {}) };
}

/** Project server-owned viewed-scene information for one recipient. */
export function presenceSceneFor(role: "gm" | "trusted" | "player" | "display", receiverSceneId: string | null, viewedSceneId: string | null, session: boolean): { sceneId: string | null } | { elsewhere: boolean } {
  return role === "gm" ? { sceneId: viewedSceneId } : { elsewhere: session && viewedSceneId !== receiverSceneId };
}
