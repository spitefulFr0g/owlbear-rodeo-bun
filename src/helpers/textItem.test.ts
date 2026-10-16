import { textLineHeight, textSizes, textSizeOf } from "./textItem";

test("each text size is a line height in proportion to the scene's grid cell", () => {
  expect(textSizes.map(size => textLineHeight(size, 150))).toEqual([30, 60, 120, 240]);
  expect(textSizes.map(size => textLineHeight(size, 70))).toEqual([14, 28, 56, 112]);
});

test("the sizes run small, medium, large and huge, each larger than the last", () => {
  expect(textSizes).toEqual(["small", "medium", "large", "huge"]);
});

test("a line height is read back as the nearest size at the scene's cell", () => {
  for (const unitsPerCell of [150, 70])
    for (const size of textSizes)
      expect(textSizeOf(textLineHeight(size, unitsPerCell), unitsPerCell)).toBe(size);
  expect(textSizeOf(50, 150)).toBe("medium");
  expect(textSizeOf(1000, 150)).toBe("huge");
  expect(textSizeOf(1, 150)).toBe("small");
});
