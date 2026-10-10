import { isPlayerColour, rememberedColour, rememberColour, playerColours } from "./playerColour";

afterEach(() => localStorage.clear());

test("only the eight player colours are accepted", () => {
  expect(playerColours.every(isPlayerColour)).toBe(true);
  for (const value of ["black", "primary", "Blue", "", undefined, {}]) {
    expect(isPlayerColour(value)).toBe(false);
  }
});

test("a chosen colour is remembered for the next join", () => {
  expect(rememberedColour()).toBeUndefined();
  rememberColour("teal");
  expect(rememberedColour()).toBe("teal");
});

test("an unknown saved colour does not override the join assignment", () => {
  localStorage.setItem("owlbear.playerColour", "black");
  expect(rememberedColour()).toBeUndefined();
});
