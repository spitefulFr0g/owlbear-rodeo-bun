import { visibleTo, changeFor, mayChange, TextItem, Person, RoomRules } from "./index";
const item: TextItem = { id: "secret", kind: "text", layer: "note", position: { x: 0, y: 0 }, rotation: 0, scale: { x: 1, y: 1 }, order: 0, owner: "alice", locked: false, hidden: true, metadata: {}, text: "Secret", color: "red", size: 150, square: true };
const rules: RoomRules = { switches: { tokens: true, drawing: true, notes: true, fog: true, uploads: true, ownerOnly: false } };
test("hidden items reach only their owner and the GM, never a cast display", () => {
  for (const role of ["gm", "trusted", "player", "display"] as Person["role"][]) {
    for (const owner of ["gm", "alice", "bob"]) {
      const person = { role, id: "alice" };
      expect(visibleTo(person, { ...item, owner })).toBe(role === "gm" || (role !== "display" && owner === "alice"));
      expect(visibleTo(person, { ...item, owner, hidden: false })).toBe(true);
    }
  }
});
test("hiding, showing and transferring a hidden item translate at each visibility boundary", () => {
  for (const role of ["gm", "trusted", "player", "display"] as Person["role"][]) {
    const person = { role, id: "bob" };
    const shown = { ...item, hidden: false };
    const hide = { type: "update" as const, id: item.id, fields: { hidden: true } };
    const show = { type: "update" as const, id: item.id, fields: { hidden: false } };
    expect(changeFor(person, shown, item, hide)).toEqual(role === "gm" ? hide : { type: "delete", id: item.id });
    expect(changeFor(person, item, shown, show)).toEqual(role === "gm" ? show : { type: "add", item: shown });
    const given = { ...item, owner: "bob" };
    const transfer = { type: "update" as const, id: item.id, fields: { owner: "bob" } };
    expect(changeFor(person, item, given, transfer)).toEqual(role === "gm" ? transfer : role === "display" ? undefined : { type: "add", item: given });
    expect(changeFor(person, given, item, transfer)).toEqual(role === "gm" ? transfer : role === "display" ? undefined : { type: "delete", id: item.id });
    expect(changeFor(person, undefined, item, { type: "add", item })).toEqual(role === "gm" ? { type: "add", item } : undefined);
  }
});
test("only the GM and trusted owners can hide or show unlocked items", () => {
  for (const role of ["gm", "trusted", "player", "display"] as Person["role"][]) {
    for (const owner of ["alice", "bob"]) {
      for (const hidden of [true, false]) expect(mayChange({ role, id: "alice" }, rules, { ...item, owner, hidden: false }, { type: "update", id: item.id, fields: { hidden } })).toBe(role === "gm" || (role === "trusted" && owner === "alice"));
    }
  }
});
