import { PresenceUpdate, readPresence, maxPresenceNameLength, maxPresenceRolls } from "../sceneRules";
import { PlayerState } from "../types/PlayerState";

/**
 * What this browser sends as its presence, or nothing until the server has
 * assigned a colour. Dice rolls leave only while they are shared.
 */
export function presenceUpdate(player: PlayerState): PresenceUpdate | undefined {
  const rolls = !player.dice.share ? [] : player.dice.rolls.slice(0, maxPresenceRolls).map(({ type, roll }) => {
    const settled = typeof roll === "number" && Number.isInteger(roll) && roll >= 1 && roll <= Number(type.slice(1));
    return { type, roll: settled ? roll : "unknown" };
  });
  const timer = player.timer && Number.isFinite(player.timer.current) && Number.isFinite(player.timer.max)
    ? { timer: { current: player.timer.current, max: player.timer.max } } : {};
  return readPresence({
    nickname: player.nickname.slice(0, maxPresenceNameLength),
    color: player.color,
    dice: { share: player.dice.share, rolls },
    ...timer,
  });
}
