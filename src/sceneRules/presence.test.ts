import { readPresence, maxPresenceNameLength, maxPresenceRolls, playerColours } from "./presence";
const update = { nickname: "Player", color: "blue", dice: { share: true, rolls: [{ type: "d20", roll: 20 }] } };
test("presence accepts the name and dice caps and every player colour", () => {
  for (const color of playerColours) expect(readPresence({ ...update, color, nickname: "x".repeat(maxPresenceNameLength), dice: { share: true, rolls: Array(maxPresenceRolls).fill({ type: "d4", roll: "unknown" }) } })).toBeDefined();
  for (const invalid of [{ nickname: "x".repeat(maxPresenceNameLength + 1) }, { nickname: 1 }, { color: "black" }, { dice: { share: true, rolls: Array(maxPresenceRolls + 1).fill({ type: "d6", roll: 1 }) } }]) expect(readPresence({ ...update, ...invalid })).toBeUndefined();
});
test("presence validates dice types and results including rolling dice", () => {
  for (const sides of [4, 6, 8, 10, 12, 20, 100]) {
    for (const roll of [1, sides, "unknown"]) expect(readPresence({ ...update, dice: { share: true, rolls: [{ type: `d${sides}`, roll }] } })).toBeDefined();
    for (const roll of [0, sides + 1, 1.5, Infinity, NaN, "20", null]) expect(readPresence({ ...update, dice: { share: true, rolls: [{ type: `d${sides}`, roll }] } })).toBeUndefined();
  }
  for (const dice of [{}, { share: 1, rolls: [] }, { share: true, rolls: {} }, { share: true, rolls: [null] }, { share: true, rolls: [{ type: "toString", roll: 1 }] }]) expect(readPresence({ ...update, dice })).toBeUndefined();
});
test("presence copies only its allowed fields and sanitizes private rolls", () => {
  const timer = { current: 20, max: 60 };
  expect(readPresence({ ...update, userId: "fake", sceneId: "secret", dice: { ...update.dice, rolls: [{ ...update.dice.rolls[0], secret: 1 }], extra: 1 }, timer: { ...timer, secret: 1 } })).toEqual({ ...update, timer });
  expect(readPresence({ ...update, dice: { ...update.dice, share: false } })?.dice.rolls).toEqual([]);
  for (const timer of [null, {}, { current: Infinity, max: 1 }, { current: 1, max: NaN }, { current: "1", max: 1 }]) expect(readPresence({ ...update, timer })).toBeUndefined();
  for (const value of [null, [], undefined]) expect(readPresence(value)).toBeUndefined();
});
