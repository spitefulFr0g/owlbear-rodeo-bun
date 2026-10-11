import { canPlaceImage, getToolPermissions } from "./roomControls";

test("uploads off requires both the token image and its thumbnail in the scene", () => {
  const permissions = getToolPermissions("player");
  const image = { type: "file", file: "image", thumbnail: "thumbnail" };
  expect(canPlaceImage(image, permissions, ["image"])).toBe(false);
  expect(canPlaceImage(image, permissions, ["thumbnail"])).toBe(false);
  expect(canPlaceImage(image, permissions, ["image", "thumbnail"])).toBe(true);
  expect(canPlaceImage(image, getToolPermissions("trusted"), [])).toBe(true);
  expect(canPlaceImage(image, getToolPermissions("gm"), [])).toBe(true);
});
