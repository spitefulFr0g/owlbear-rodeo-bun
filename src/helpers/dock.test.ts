import { dockTabs, libraryFilters, mayChangeAsset, mayFileIn, moveActions, quotaBars } from "./dock";
import { libraryDefaults } from "./library";
import { LibraryAsset } from "../sceneRules/library";

function upload(uploader: string, uploaderName?: string): LibraryAsset {
  return {
    id: `asset-${uploader}`, library: { kind: "room", id: "room" }, name: "Goblin", type: "character",
    folderId: null, uploader, uploaderName, created: 1, files: { original: { id: `file-${uploader}`, size: 10 } },
    width: 10, height: 10, outline: { type: "rect", x: 0, y: 0, width: 10, height: 10 },
    defaults: libraryDefaults(), uploading: false,
  };
}

test("map and scenes tabs are the GM's alone and a cast display has no dock", () => {
  expect(dockTabs("gm")).toEqual(["map", "prop", "mount", "character", "attachment", "scenes"]);
  expect(dockTabs("player")).toEqual(["prop", "mount", "character", "attachment"]);
  expect(dockTabs("trusted")).toEqual(dockTabs("player"));
  expect(dockTabs("display")).toEqual([]);
});

test("the filter offers only the libraries a role can see", () => {
  expect(libraryFilters("gm").map(option => option.value)).toEqual(["all", "room", "account", "server"]);
  expect(libraryFilters("player").map(option => option.label)).toEqual(["All", "My uploads", "Server set"]);
  expect(libraryFilters("display")).toEqual([]);
});

test("the GM's room bar splits into their uploads and each player's, largest first", () => {
  const bars = quotaBars({
    room: { bytes: 600, reservedBytes: 50, quota: 2000 }, gmBytes: 300,
    players: { ann: 100, bob: 250, gone: 0 }, playerQuota: 500,
    account: { bytes: 40, reservedBytes: 2, quota: 1000 },
  }, [upload("ann", "Ann"), upload("bob")]);
  expect(bars).toEqual([
    { label: "This room", used: 650, quota: 2000, parts: [
      { section: "room", label: "My uploads", bytes: 300 },
      { section: "players", label: "A player", bytes: 250 },
      { section: "players", label: "Ann", bytes: 100 },
    ] },
    { label: "My library", used: 42, quota: 1000, parts: [{ section: "account", label: "My library", bytes: 42 }] },
  ]);
});

test("a player's bar counts their uploads, reservations included, against the player quota", () => {
  expect(quotaBars({ player: { bytes: 70, reservedBytes: 5, quota: 100 } }, [])).toEqual([
    { label: "My uploads", used: 75, quota: 100, parts: [{ section: "uploads", label: "My uploads", bytes: 75 }] },
  ]);
  expect(quotaBars(undefined, [])).toEqual([]);
});

test("only the GM or the uploader may change an asset, and an asset files only into its own library's folders", () => {
  const asset = upload("ann", "Ann");
  expect(mayChangeAsset(asset, { role: "gm", id: "account" })).toBe(true);
  expect(mayChangeAsset(asset, { role: "player", id: "ann" })).toBe(true);
  expect(mayChangeAsset(asset, { role: "trusted", id: "bob" })).toBe(false);
  expect(mayChangeAsset(asset, { role: "display", id: "ann" })).toBe(false);
  const folder = { id: "f", library: { kind: "room" as const, id: "room" }, name: "Kit", owner: "ann" };
  expect(mayFileIn(asset, folder)).toBe(true);
  expect(mayFileIn(asset, { ...folder, owner: null })).toBe(false);
  expect(mayFileIn(asset, { ...folder, owner: "bob" })).toBe(false);
  expect(mayFileIn(asset, { ...folder, library: { kind: "account", id: "room" } })).toBe(false);
});

test("the GM adds room assets to their library and back, takes over player uploads, and nobody else moves anything", () => {
  const asset = upload("ann");
  expect(moveActions({ ...asset, uploader: null }, "gm")).toEqual([{ destination: "account", label: "Add to my library" }]);
  expect(moveActions(asset, "gm")).toEqual([
    { destination: "room", label: "Take into this room" },
    { destination: "account", label: "Add to my library" },
  ]);
  expect(moveActions({ ...asset, library: { kind: "account", id: "account" } }, "gm")).toEqual([{ destination: "room", label: "Move to this room" }]);
  expect(moveActions(asset, "trusted")).toEqual([]);
  expect(moveActions(asset, "player")).toEqual([]);
});
