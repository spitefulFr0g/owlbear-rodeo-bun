import { editorCommand, editorDraft, locateAsset, managerSections, managerView } from "./assetManager";
import { libraryDefaults } from "./library";
import { LibraryAsset, LibraryFolder } from "../sceneRules/library";

const asset: LibraryAsset = {
  id: "goblin", name: "Goblin", type: "character", library: { kind: "room", id: "room" },
  folderId: "monsters", uploader: "ann", created: 1, uploading: false,
  files: { original: { id: "stored-original", size: 10 } }, width: 100, height: 100,
  outline: { type: "rect", x: 0, y: 0, width: 100, height: 100 }, defaults: libraryDefaults({ x: 10, y: 8 }),
};
const folder: LibraryFolder = { id: "monsters", name: "Monsters", library: asset.library, owner: "ann" };

test("changing an asset type preserves both saved map grid and token defaults", () => {
  const draft = editorDraft(asset);
  const defaults = { ...draft.defaults, defaultSize: 2, defaultLabel: "Chief" };
  const result = editorCommand(asset, { ...draft, type: "map", defaults });
  expect(result.command).toEqual({ action: "edit", id: "goblin", changes: { type: "map", defaults } });
  expect(result.command?.changes.defaults?.grid.size).toEqual({ x: 10, y: 8 });
  const map = { ...asset, type: "map" as const, defaults };
  expect(editorCommand(map, { ...editorDraft(map), type: "character" }).command?.changes).toEqual({ type: "character" });
  expect(asset.defaults.defaultSize).toBe(1);
});

test("the editor trims a valid name, sends only changes, and rejects empty names and invalid sizes", () => {
  const draft = editorDraft(asset);
  expect(editorCommand(asset, draft)).toEqual({});
  expect(editorCommand(asset, { ...draft, name: "  Chief  " }).command?.changes).toEqual({ name: "Chief" });
  expect(editorCommand(asset, { ...draft, name: "  " }).error).toBeDefined();
  expect(editorCommand(asset, { ...draft, defaults: { ...draft.defaults, defaultSize: 0 } }).error).toBeDefined();
  expect(editorCommand(asset, { ...draft, defaults: libraryDefaults({ x: 0, y: 8 }) }).error).toBeDefined();
});

test("a manager search reaches matching assets inside folders and the breadcrumb shows only that folder", () => {
  const sections = managerSections({ person: { role: "player", id: "ann" }, roomId: "room",
    assets: [asset], folders: [folder], serverSet: [], search: "gbl" });
  const uploads = sections.find(section => section.id === "uploads");
  expect(managerView(uploads, null).assets.map(value => value.id)).toEqual(["goblin"]);
  expect(managerView(uploads, "monsters").folder?.name).toBe("Monsters");
  expect(locateAsset(sections, "goblin")).toEqual({ section: "uploads", folderId: "monsters" });
});

test("the GM sees player uploads ungrouped with no player folders, and cast gets no sources", () => {
  const options = { roomId: "room", assets: [asset], folders: [folder], serverSet: [] };
  const players = managerSections({ ...options, person: { role: "gm", id: "gm" } }).find(section => section.id === "players");
  expect(players?.folders).toEqual([]);
  expect(players?.assets.map(value => value.id)).toEqual(["goblin"]);
  expect(managerSections({ ...options, person: { role: "display", id: "cast" } })).toEqual([]);
});
