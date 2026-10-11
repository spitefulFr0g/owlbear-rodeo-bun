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
  ownerOnly: false,
};

test("new room tools use the room defaults when switches have not arrived", () => {
  expect(getToolPermissions("player")).toEqual({
    select: true,
    tokens: true, drawing: true, notes: true, fog: false, uploads: false,
    measure: true,
    pointer: true,
  });
});

test.each(["tokens", "drawing", "notes", "fog", "uploads"] as const)(
  "players follow the live %s switch independently",
  (key) => {
    expect(getToolPermissions("player", off)[key]).toBe(false);
    expect(getToolPermissions("player", { ...off, [key]: true })).toEqual({
      select: true,
      tokens: false, drawing: false, notes: false, fog: false, uploads: false,
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
      select: true,
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
    select: true,
    tokens: false, drawing: false, notes: false, fog: false, uploads: false,
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

test("Owner Only limits items without disabling the token tool", () => {
  expect(getToolPermissions("player", { ...defaultRoomSwitches, ownerOnly: true }))
    .toEqual(getToolPermissions("player", defaultRoomSwitches));
});

const on = { ...off, tokens: true, drawing: true, notes: true, fog: true, uploads: true };

test.each(["trusted", "player"] as const)(
  "a view-only scene leaves a %s only the measure and pointer tools, with every switch on",
  (role) => {
    expect(getToolPermissions(role, on, true)).toEqual({
      select: false, tokens: false, drawing: false, notes: false, fog: false,
      uploads: true,
      measure: true,
      pointer: true,
    });
    expect(canPlaceImage({ type: "default" }, getToolPermissions(role, on, true), [])).toBe(false);
  }
);

test("a view-only scene takes no tool from the GM", () => {
  expect(getToolPermissions("gm", off, true)).toEqual(getToolPermissions("gm", off));
});
