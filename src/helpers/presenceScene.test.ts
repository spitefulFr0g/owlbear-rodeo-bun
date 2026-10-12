import { presenceSceneMark } from "./presenceScene";
import { Presence } from "../sceneRules";
import { SceneList } from "./sceneList";

const gm: Presence = { sessionId: "gm-device", nickname: "GM", role: "gm", color: "blue", dice: { share: false, rolls: [] }, elsewhere: true, sceneId: "keep" };
const list: SceneList = { scenes: [{ id: "keep", name: "Hidden Keep", viewOnly: false }], openSceneId: "road", welcomeSceneId: null };

test("players and trusted players see only a generic GM mark during a session", () => {
  for (const role of ["player", "trusted"] as const) {
    expect(presenceSceneMark(gm, role, true, "road", list)).toBe("Viewing another scene");
    expect(presenceSceneMark(gm, role, false, "road", list)).toBeUndefined();
    expect(presenceSceneMark({ ...gm, elsewhere: false }, role, true, "road", list)).toBeUndefined();
  }
});

test("a GM sees the other GM device's scene name only when their scenes differ", () => {
  expect(presenceSceneMark(gm, "gm", true, "road", list)).toBe("Viewing: Hidden Keep");
  expect(presenceSceneMark(gm, "gm", false, "road", list)).toBe("Viewing: Hidden Keep");
  expect(presenceSceneMark(gm, "gm", true, "keep", list)).toBeUndefined();
  expect(presenceSceneMark({ ...gm, sceneId: null }, "gm", true, "road", list)).toBeUndefined();
  expect(presenceSceneMark(gm, "gm", true, undefined, list)).toBeUndefined();
});

test("unknown scene names use a generic mark without exposing an id", () => {
  expect(presenceSceneMark(gm, "gm", true, "road", null)).toBe("Viewing another scene");
});

test("players never carry a GM scene mark", () => {
  expect(presenceSceneMark({ ...gm, role: "trusted" }, "gm", true, "road", list)).toBeUndefined();
  expect(presenceSceneMark({ ...gm, role: "player" }, "player", true, "road", list)).toBeUndefined();
});
