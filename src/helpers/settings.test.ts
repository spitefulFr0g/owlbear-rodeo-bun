import { getSettings } from "../settings";

beforeEach(() => localStorage.clear());

test("a new browser's Text tool starts white and medium", () => {
  expect(getSettings().getAll().text).toEqual({ color: "white", size: "medium" });
});

test("upgrading keeps the drawing tool's settings and adds the Text tool's", () => {
  localStorage.setItem("OwlbearRodeoSettings", JSON.stringify({
    __version: 10,
    drawing: { color: "blue", type: "line", useBlending: false, useShapeFill: false, strokeWidth: "thick" },
    pointer: { color: "green" },
  }));
  const settings = getSettings().getAll();
  expect(settings.drawing).toEqual({ color: "blue", type: "line", useBlending: false, useShapeFill: false, strokeWidth: "thick" });
  expect(settings.pointer).toEqual({ color: "green" });
  expect(settings.text).toEqual({ color: "white", size: "medium" });
});

test("a remembered text colour and size survive opening the settings again", () => {
  const settings = getSettings();
  settings.setAll({ ...settings.getAll(), text: { color: "red", size: "huge" } });
  expect(getSettings().getAll().text).toEqual({ color: "red", size: "huge" });
});
