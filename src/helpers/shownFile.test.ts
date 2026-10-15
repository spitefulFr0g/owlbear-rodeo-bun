import { shownFile } from "./shownFile";

const map = { type: "file" as const, file: "original", thumbnail: "thumb", quality: "original", resolutions: { medium: "medium" } };

test("a map shows its original unless its quality names a stored copy", () => {
  expect(shownFile(map)).toBe("original");
  expect(shownFile({ ...map, quality: "medium" })).toBe("medium");
  expect(shownFile({ ...map, quality: "high" })).toBeUndefined();
  expect(shownFile(map, true)).toBe("thumb");
  expect(shownFile({ ...map, thumbnail: undefined }, true)).toBe("original");
  expect(shownFile({ type: "default", key: "blank" })).toBe("blank");
});
