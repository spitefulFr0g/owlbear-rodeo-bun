import { readLive, maxChanges, dragFrom, dragFor } from "./index";
import type { ImageItem, Item } from "./types";
const position = { x: 1, y: 2 };
test("pointers retain only finite positions and visibility, never browser identity", () => {
  expect(readLive({ sceneId: "scene", kind: "pointer", connectionId: "forged", state: { position: { ...position, color: "red" }, visible: true, owner: "forged" } })).toEqual({ sceneId: "scene", kind: "pointer", state: { position, visible: true } });
  for (const state of [undefined, {}, { position, visible: 1 }, { position: { x: Infinity, y: 2 }, visible: true }]) expect(readLive({ sceneId: "scene", kind: "pointer", state })).toBeUndefined();
  expect(readLive({ sceneId: "x".repeat(65), kind: "pointer", state: null })).toBeUndefined();
});
test("rulers and drags carry only their finite wire fields and obey the batch cap", () => {
  expect(readLive({ sceneId: "scene", kind: "ruler", state: { start: position, end: position, distance: 5 } })).toEqual({ sceneId: "scene", kind: "ruler", state: { start: position, end: position } });
  const item = { id: "hero", position, rotation: 0, scale: position };
  expect(readLive({ sceneId: "scene", kind: "drag", state: { items: Array(maxChanges).fill(item) } })).toBeDefined();
  expect(readLive({ sceneId: "scene", kind: "drag", state: { items: Array(maxChanges + 1).fill(item) } })).toBeUndefined();
  for (const bad of [{ ...item, rotation: NaN }, { ...item, id: "" }, { ...item, scale: { x: 1, y: Infinity } }]) expect(readLive({ sceneId: "scene", kind: "drag", state: { items: [bad] } })).toBeUndefined();
  for (const kind of ["pointer", "ruler", "drag"]) expect(readLive({ sceneId: "scene", kind, state: null })).toEqual({ sceneId: "scene", kind, state: null });
});

const token: ImageItem = { id: "hero", kind: "image", layer: "character", position,
  rotation: 0, scale: position, order: 0, owner: "gm", locked: false, hidden: false, metadata: {},
  image: { type: "default", key: "hero" }, width: 1, height: 1, label: "Hero",
  outline: { type: "circle", x: 0, y: 0, radius: 1 } };
const transform = { id: "hero", position, rotation: 90, scale: { x: 2, y: 3 } };
const switches = { tokens: true, drawing: true, notes: true, fog: true, uploads: true, ownerOnly: false };

for (const role of ["gm", "trusted", "player", "display"] as const) {
  for (const owner of ["gm", "receiver", "other"]) {
    for (const hidden of [false, true]) {
      test(`${role} receives ${hidden ? "hidden" : "shown"} drags owned by ${owner} only when the item is visible`, () => {
        const items = { hero: { ...token, owner, hidden } };
        expect(dragFor({ role, id: "receiver" }, items, [transform])).toEqual(
          !hidden || role === "gm" || (role !== "display" && owner === "receiver") ? [transform] : []);
      });
    }
  }
  for (const owner of ["gm", "sender", "other"]) {
    for (const tokens of [false, true]) for (const ownerOnly of [false, true]) {
      for (const restriction of ["none", "locked", "hidden", "map", "viewOnly", "welcomeScreen"] as const) {
        test(`${role} sends ${owner}'s drag with tokens ${tokens}, Owner Only ${ownerOnly} and ${restriction}`, () => {
          const item = { ...token, owner, locked: restriction === "locked", hidden: restriction === "hidden",
            layer: restriction === "map" ? "map" as const : "character" as const };
          const rules = { switches: { ...switches, tokens, ownerOnly },
            viewOnly: restriction === "viewOnly", welcomeScreen: restriction === "welcomeScreen" };
          const allowed = role === "gm" || (role !== "display" && !rules.viewOnly && !rules.welcomeScreen &&
            !item.locked && item.layer !== "map" && (!item.hidden || owner === "sender") &&
            (role === "trusted" || (tokens && (!ownerOnly || owner === "sender"))));
          expect(dragFrom({ role, id: "sender" }, rules, { hero: item }, [transform])).toEqual(allowed ? [transform] : []);
        });
      }
    }
  }
}
test("drag filters omit missing and inherited ids and preserve packet order", () => {
  const items = { hero: token, second: { ...token, id: "second" } };
  const drag = [{ ...transform, id: "second" }, { ...transform, id: "missing" }, transform, { ...transform, id: "constructor" }];
  for (const filtered of [dragFrom({ role: "gm", id: "gm" }, { switches }, items, drag), dragFor({ role: "gm", id: "gm" }, items, drag)]) {
    expect(filtered).toEqual([drag[0], transform]);
  }
});

for (const kind of ["image", "text", "shape"] as const) {
  for (const fog of [false, true]) for (const on of [false, true]) {
    test(`${kind} drags on ${fog ? "fog" : "drawing"} follow their governing room switch ${on}`, () => {
      const base = { ...token, owner: "sender", layer: fog ? "fog" as const : "drawing" as const };
      const item: Item = kind === "image" ? base : kind === "text" ? {
        ...base, kind, text: "Note", color: "red", size: 10, square: false,
      } : { ...base, kind, geometry: { type: "circle", radius: 5 }, color: "red", strokeWidth: 1, fill: false, blend: false, cut: false };
      const governingSwitch = fog ? "fog" : kind === "image" ? "tokens" : kind === "text" ? "notes" : "drawing";
      const rules = { switches: { ...switches, tokens: !on, notes: !on, drawing: !on, fog: !on, [governingSwitch]: on } };
      for (const role of ["gm", "trusted", "player", "display"] as const) {
        expect(dragFrom({ role, id: "sender" }, rules, { hero: item }, [transform])).toEqual(
          role === "gm" || role === "trusted" || (role === "player" && on) ? [transform] : []);
      }
    });
  }
}
