import { checkGrid, defaultSceneGrid } from "./index";

test("grid style accepts six-digit colours and bounded opacity and world line widths", () => {
  expect(checkGrid({ ...defaultSceneGrid, opacity: 0.4, lineWidth: 2, color: "#Ab12Cd" })).toBe(true);
  expect(checkGrid({ ...defaultSceneGrid, opacity: 0, lineWidth: 0.1 })).toBe(true);
  expect(checkGrid({ ...defaultSceneGrid, opacity: 1, lineWidth: 10 })).toBe(true);
});

test("malformed grid styles and unknown fields are refused", () => {
  for (const value of [null, [], {},
    ...[-0.01, 1.01, NaN, Infinity, "0.5"].map(opacity => ({ ...defaultSceneGrid, opacity })),
    ...[0, 0.09, 10.01, NaN, Infinity, "1"].map(lineWidth => ({ ...defaultSceneGrid, lineWidth })),
    ...["black", "#fff", "#12345678", "#gg1234", 123456].map(color => ({ ...defaultSceneGrid, color })),
    { ...defaultSceneGrid, extra: true }, { ...defaultSceneGrid, measurement: { type: "euclidean", scale: 5 } },
    { ...defaultSceneGrid, shown: undefined }, { ...defaultSceneGrid, type: "triangle" },
    { ...defaultSceneGrid, measurement: { type: "euclidean", scale: "5ft", extra: true } },
  ]) expect(checkGrid(value)).toBe(false);
});
