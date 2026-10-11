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

const base = { ...map, id: "item", owner: "player", locked: false, layer: "note" as const };
const examples: import("./types").Item[] = [
  { ...base, kind: "image", image: { type: "default", key: "hero" }, width: 150, height: 150, label: "Hero", outline: { type: "circle", x: 0, y: 0, radius: 75 } },
  { ...base, kind: "shape", geometry: { type: "circle", radius: 75 }, color: "red", strokeWidth: 1, fill: false, blend: false, cut: false },
  { ...base, kind: "curve", points: [{ x: 0, y: 0 }], closed: false, color: "red", strokeWidth: 1, fill: false, blend: false, cut: false },
  { ...base, kind: "line", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], color: "red", strokeWidth: 1, blend: false },
  base,
];
for (const example of examples) {
  for (const layer of ["map", "grid", "drawing", "prop", "mount", "character", "attachment", "note", "text", "ruler", "fog"] as const) {
    const governingSwitch = layer === "fog" ? "fog" : example.kind === "image" ? "tokens" : example.kind === "text" ? "notes" : "drawing";
    test(`${example.kind} on ${layer} follows ${layer === "map" ? "GM only" : governingSwitch} for add, change and delete`, () => {
      for (const on of [false, true]) {
        const switches = { tokens: !on, drawing: !on, notes: !on, fog: !on, uploads: true, [governingSwitch]: on };
        for (const role of ["gm", "trusted", "player", "display"] as const) {
          for (const owner of ["player", "other"]) {
            const item = { ...example, layer, owner };
            const changes: Change[] = [{ type: "add", item }, { type: "update", id: item.id, fields: { position: { x: 10, y: 20 } } }, { type: "delete", id: item.id }];
            for (const change of changes) {
              const playerAllowed = on && (change.type === "add" || layer === "fog" || (example.kind === "image" && change.type === "update") || owner === "player");
              expect(mayChange({ role, id: "player" }, { switches }, change.type === "add" ? undefined : item, change)).toBe(role === "gm" || (layer !== "map" && (role === "trusted" || (role === "player" && playerAllowed))));
            }
          }
        }
      }
    });
  }
}
test("players transform and label others' tokens and set only status ring metadata", () => {
  const item = { ...examples[0], owner: "other" };
  for (const fields of [{ position: { x: 1, y: 2 } }, { scale: { x: 2, y: 2 } }, { rotation: 90 }, { label: "Monster" }, { metadata: { statusRings: ["red"] } }, { metadata: { statusRings: null } }]) {
    expect(mayChange({ role: "player", id: "player" }, rules, item, { type: "update", id: item.id, fields })).toBe(true);
  }
  for (const fields of [{ image: { type: "default" as const, key: "other" } }, { width: 200 }, { metadata: { custom: true } }, { metadata: { statusRings: [], custom: true } }]) {
    expect(mayChange({ role: "player", id: "player" }, rules, item, { type: "update", id: item.id, fields: { position: { x: 1, y: 2 }, ...fields } })).toBe(false);
  }
});
test("one forbidden field refuses a whole update and only trusted owners can change layers", () => {
  for (const role of ["gm", "trusted", "player"] as const) {
    for (const field of ["kind", "owner", "locked", "hidden"]) {
      const fields = { position: { x: 10, y: 20 }, [field]: field === "kind" ? "text" : field === "owner" ? "other" : true };
      expect(mayChange({ role, id: "player" }, rules, base, { type: "update", id: base.id, fields })).toBe(role === "gm");
    }
    for (const owner of ["player", "other"]) {
      for (const layer of ["map", "drawing"] as const) {
        expect(mayChange({ role, id: "player" }, rules, { ...base, owner }, { type: "update", id: base.id, fields: { layer } })).toBe(role === "gm" || (role === "trusted" && owner === "player" && layer !== "map"));
      }
    }
    for (const flags of [{ locked: true }, { hidden: true }]) {
      expect(mayChange({ role, id: "player" }, rules, undefined, { type: "add", item: { ...base, ...flags } })).toBe(role === "gm");
    }
  }
});

test("drawing, text and fog tools follow their switch for every editable field", () => {
  const cases: [import("./types").Item, import("./types").ItemFields][] = [
    [examples[1], { geometry: { type: "circle", radius: 100 }, color: "blue", strokeWidth: 2, fill: true, blend: true, cut: true }],
    [examples[2], { points: [{ x: 10, y: 20 }], closed: true, color: "blue", strokeWidth: 2, fill: true, blend: true, cut: false }],
    [examples[3], { points: [{ x: 0, y: 0 }, { x: 10, y: 20 }], color: "blue", strokeWidth: 2, blend: true }],
    [base, { text: "Changed", color: "blue", size: 200, square: false }],
  ];
  for (const [example, fields] of cases) {
    for (const fog of [false, true]) {
      const item = { ...example, layer: fog ? "fog" as const : example.layer };
      const governingSwitch = fog ? "fog" : item.kind === "text" ? "notes" : "drawing";
      for (const on of [false, true]) {
        for (const role of ["gm", "trusted", "player", "display"] as const) {
          for (const owner of ["player", "other"]) {
            for (const [field, value] of Object.entries({ ...fields, position: { x: 10, y: 20 }, scale: { x: 2, y: 2 }, rotation: 90, metadata: { custom: true } })) {
              expect(mayChange({ role, id: "player" }, { switches: { ...rules.switches, [governingSwitch]: on } }, { ...item, owner }, { type: "update", id: item.id, fields: { [field]: value } })).toBe(role === "gm" || role === "trusted" || (role === "player" && on && (fog || owner === "player")));
            }
          }
        }
      }
    }
  }
});
