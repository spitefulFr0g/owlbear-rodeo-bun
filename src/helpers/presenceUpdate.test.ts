import { presenceUpdate } from "./presenceUpdate";
import { maxPresenceNameLength, maxPresenceRolls } from "../sceneRules";
import { PlayerState } from "../types/PlayerState";

const player: PlayerState = { nickname: "Robin", color: "teal", dice: { share: true, rolls: [{ type: "d20", roll: 17 }] } };

test("shared dice rolls and a running timer are sent with the name and colour", () => {
  expect(presenceUpdate({ ...player, timer: { current: 20, max: 60 } })).toEqual({ ...player, timer: { current: 20, max: 60 } });
});

test("dice rolls are not sent while sharing is off", () => {
  expect(presenceUpdate({ ...player, dice: { share: false, rolls: player.dice.rolls } })?.dice).toEqual({ share: false, rolls: [] });
});

test("nothing is sent before the server has assigned a colour", () => {
  expect(presenceUpdate({ ...player, color: undefined })).toBeUndefined();
});

test("a stopped timer is left out rather than sent empty", () => {
  expect(presenceUpdate({ ...player, timer: undefined })).not.toHaveProperty("timer");
});

test("a long name and a full tray are cut to the caps the server accepts", () => {
  const update = presenceUpdate({ ...player, nickname: "x".repeat(maxPresenceNameLength + 5), dice: { share: true, rolls: Array(maxPresenceRolls + 5).fill({ type: "d6", roll: 3 }) } });
  expect(update?.nickname).toHaveLength(maxPresenceNameLength);
  expect(update?.dice.rolls).toHaveLength(maxPresenceRolls);
});

test("a die that has not settled on a face is sent as still rolling", () => {
  const rolls = presenceUpdate({ ...player, dice: { share: true, rolls: [{ type: "d6", roll: 0 }, { type: "d6", roll: "unknown" }, { type: "d100", roll: 100 }] } })?.dice.rolls;
  expect(rolls).toEqual([{ type: "d6", roll: "unknown" }, { type: "d6", roll: "unknown" }, { type: "d100", roll: 100 }]);
});
