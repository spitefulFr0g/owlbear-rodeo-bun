import {
  canPlaceImage,
  defaultRoomSwitches,
  getRoleControls,
  getToolPermissions,
} from "./roomControls";

const off = {
  tokens: false,
  drawing: false,
  notes: false,
  fog: false,
  uploads: false,
};

test("new room tools use the room defaults when switches have not arrived", () => {
  expect(getToolPermissions("player")).toEqual({
    ...defaultRoomSwitches,
    measure: true,
    pointer: true,
  });
});

test.each(["tokens", "drawing", "notes", "fog", "uploads"] as const)(
  "players follow the live %s switch independently",
  (key) => {
    expect(getToolPermissions("player", off)[key]).toBe(false);
    expect(getToolPermissions("player", { ...off, [key]: true })).toEqual({
      ...off,
      [key]: true,
      measure: true,
      pointer: true,
    });
  }
);

test.each(["gm", "trusted"] as const)(
  "%s bypasses tool switches while room and map controls remain GM only",
  (role) => {
    expect(getToolPermissions(role, off)).toEqual({
      tokens: true,
      drawing: true,
      notes: true,
      fog: true,
      uploads: true,
      measure: true,
      pointer: true,
    });
    expect(getRoleControls(role).room).toBe(role === "gm");
    expect(getRoleControls(role).map).toBe(role === "gm");
  }
);

test("measure and pointer stay available when every player switch is off", () => {
  expect(getToolPermissions("player", off)).toEqual({
    ...off,
    measure: true,
    pointer: true,
  });
});

test("uploads off allows built-ins and images already in the room but refuses local images", () => {
  const permissions = getToolPermissions("player");
  expect(canPlaceImage({ type: "default" }, permissions, [])).toBe(true);
  expect(
    canPlaceImage({ type: "file", file: "room" }, permissions, ["room"])
  ).toBe(true);
  expect(
    canPlaceImage({ type: "file", file: "local" }, permissions, ["room"])
  ).toBe(false);
  expect(
    canPlaceImage(
      { type: "file", file: "local" },
      getToolPermissions("player", { ...defaultRoomSwitches, uploads: true }),
      []
    )
  ).toBe(true);
  expect(
    canPlaceImage({ type: "default" }, getToolPermissions("player", off), [])
  ).toBe(false);
  expect(
    canPlaceImage(
      { type: "file", file: "local" },
      getToolPermissions("trusted", off),
      []
    )
  ).toBe(true);
});
