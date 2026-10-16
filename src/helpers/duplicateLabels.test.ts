import { duplicateLabels } from "./duplicateLabels";

test("duplicates take the lowest free number strictly above the source", () => {
  expect(duplicateLabels(["Goblin 1"], ["Goblin 1"])).toEqual(["Goblin 2"]);
  expect(duplicateLabels(["Goblin 1"], ["Goblin 1", "Goblin 2", "Goblin 3", "Goblin 5"])).toEqual(["Goblin 4"]);
  expect(duplicateLabels(["Goblin 4"], ["Goblin 1", "Goblin 6"])).toEqual(["Goblin 5"]);
});

test("copies reserve numbers in selection order", () => {
  expect(duplicateLabels(["Goblin 1", "Goblin 2"], ["Goblin 1", "Goblin 2"])).toEqual(["Goblin 3", "Goblin 4"]);
  expect(duplicateLabels(["Goblin 2", "Goblin 1", "Goblin 1"], ["Goblin 1", "Goblin 2"])).toEqual(["Goblin 3", "Goblin 4", "Goblin 5"]);
});

test("only a trailing whole number after a space is numbered", () => {
  const labels = ["Goblin1", "Goblin #1", "", "Goblin", "Room 3 guard", "Goblin -1", "Goblin 1.5", "Goblin 1 "];
  expect(duplicateLabels(labels, labels)).toEqual(labels);
});

test("stems and spacing are exact and independent", () => {
  expect(duplicateLabels(["Goblin  1", "Goblin 1", "goblin 1", " 1"], ["Goblin 2", "Goblin  3"])).toEqual(["Goblin  2", "Goblin 3", "goblin 2", " 2"]);
});

test("whole numbers retain their value beyond machine integer precision", () => {
  expect(duplicateLabels(["Goblin 9007199254740992", "Goblin 01"], ["Goblin 9007199254740993", "Goblin 02"])).toEqual(["Goblin 9007199254740994", "Goblin 3"]);
});
