import { checkSceneName, maxScenes } from "./index";

test("scene names are trimmed and contain one to one hundred characters", () => {
  expect(checkSceneName("  Road  ")).toBe("Road");
  expect(checkSceneName("x".repeat(100))).toBe("x".repeat(100));
  for (const value of ["", " \n ", "x".repeat(101), null, 12, {}, []]) {
    expect(checkSceneName(value)).toBeUndefined();
  }
  expect(maxScenes).toBe(100);
});
