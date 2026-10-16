import { mayChange, Item, LineItem, Person, TextItem } from "../sceneRules";
import { defaultRoomSwitches } from "./roomControls";
import { onlyGmShowsHint, visibilityEntry } from "./visibilityEntry";

const note: TextItem = {
  id: "note", kind: "text", layer: "note", position: { x: 0, y: 0 }, rotation: 0,
  scale: { x: 1, y: 1 }, order: 0, owner: "ann", locked: false, hidden: true,
  metadata: {}, text: "", color: "yellow", size: 300, square: true,
};
const text: TextItem = { ...note, id: "text", layer: "text", square: false };
const drawing: LineItem = {
  id: "drawing", kind: "line", layer: "drawing", position: { x: 0, y: 0 }, rotation: 0,
  scale: { x: 1, y: 1 }, order: 0, owner: "ann", locked: false, hidden: true, metadata: {},
  points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], color: "red", strokeWidth: 1, blend: false,
};

function entry(person: Person, items: Item[]) {
  const rules = { switches: defaultRoomSwitches };
  return visibilityEntry(person, items, (item, hidden) =>
    mayChange(person, rules, item, { type: "update", id: item.id, fields: { hidden } }));
}

test("a player who is not trusted sees Show disabled with the hint on their own hidden notes and text", () => {
  expect(entry({ role: "player", id: "ann" }, [note, text]))
    .toEqual({ label: "Show", enabled: false, hint: onlyGmShowsHint });
  expect(onlyGmShowsHint).toBe("Only the GM can show this");
});

test("a mixed selection shows a disabled Show with no hint", () => {
  expect(entry({ role: "player", id: "ann" }, [note, drawing]))
    .toEqual({ label: "Show", enabled: false });
  expect(entry({ role: "player", id: "ann" }, [note, { ...note, id: "other", owner: "bob" }]))
    .toEqual({ label: "Show", enabled: false });
});

test("the GM may show any player's note", () => {
  expect(entry({ role: "gm", id: "gm" }, [note, text])).toEqual({ label: "Show", enabled: true });
});

test("a trusted player may show their own note and not another player's", () => {
  expect(entry({ role: "trusted", id: "ann" }, [note])).toEqual({ label: "Show", enabled: true });
  expect(entry({ role: "trusted", id: "bob" }, [note])).toEqual({ label: "Show", enabled: false });
});

test("a shown item offers Hide", () => {
  expect(entry({ role: "gm", id: "gm" }, [{ ...note, hidden: false }])).toEqual({ label: "Hide", enabled: true });
  expect(entry({ role: "player", id: "ann" }, [{ ...note, hidden: false }])).toEqual({ label: "Hide", enabled: false });
});
