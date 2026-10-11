import { mayChange, TextItem, RoomRules, Person, Change } from "./index";
const rules: RoomRules = { switches: { tokens: true, drawing: true, notes: true, fog: true, uploads: true } };
const map: TextItem = { id: "map", kind: "text", layer: "map", position: { x: 0, y: 0 }, rotation: 0,
  scale: { x: 1, y: 1 }, order: 0, owner: "gm", locked: true, hidden: false, metadata: {},
  text: "Map", color: "red", size: 150, square: true };
test("only the GM can add, edit, remove or move items into or out of the Map layer", () => {
  const note = { ...map, layer: "note" as const };
  const cases: [TextItem | undefined, Change][] = [
    [undefined, { type: "add", item: map }],
    [map, { type: "update", id: map.id, fields: { position: { x: 10, y: 20 } } }],
    [map, { type: "delete", id: map.id }],
    [map, { type: "update", id: map.id, fields: { layer: "note" } }],
    [note, { type: "update", id: note.id, fields: { layer: "map" } }],
  ];
  for (const role of ["gm", "trusted", "player", "display"] as Person["role"][]) {
    for (const [item, change] of cases) expect(mayChange({ role, id: role }, rules, item, change)).toBe(role === "gm");
  }
});
