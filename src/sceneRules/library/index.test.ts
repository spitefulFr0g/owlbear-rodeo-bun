import { assetBytes, checkAssetCount, checkAssetName, checkFolderCount, checkFolderName, checkPlayerQuota, checkQuota, defaultLibraryQuota, defaultPlayerQuota, fuzzyLibraryMatch, legacyCategoryToAssetType, librarySections, mayPlaceImage, maySetAssetType, mayUpload, quotaError } from "./index";
import type { LibraryAsset, LibraryViewOptions, PlacementContext } from "./index";

const asset = (fields: Partial<LibraryAsset> = {}): LibraryAsset => ({
  id: "asset", library: { kind: "room", id: "room" }, name: "Goblin", type: "character", folderId: null,
  uploader: null, created: 1, uploading: false, files: { original: { id: "original", size: 10 }, thumbnail: { id: "thumb", size: 2 } },
  width: 100, height: 100, outline: { type: "rect", x: 0, y: 0, width: 100, height: 100 },
  defaults: { defaultSize: 1, defaultLabel: "", grid: { type: "square", size: { x: 10, y: 8 }, inset: { topLeft: { x: 0, y: 0 }, bottomRight: { x: 1, y: 1 } }, measurement: { type: "chebyshev", scale: "5ft" } } }, ...fields,
});
const context = (role: PlacementContext["person"]["role"], assets: LibraryAsset[] = []): PlacementContext => ({ person: { role, id: "me" }, roomId: "room", accountId: "account", assets, placedFileIds: new Set(["placed"]) });

test("the server set is available to anyone and cast displays receive no library", () => {
  for (const role of ["gm", "player", "trusted", "display"] as const) expect(mayPlaceImage({ type: "default", key: "builtin" }, context(role))).toBe(true);
  expect(mayPlaceImage({ type: "file", file: "placed" }, context("display"))).toBe(false);
});
test("GM placement accepts this room, their account and placed files only", () => {
  for (const entry of [asset(), asset({ library: { kind: "account", id: "account" } })]) expect(mayPlaceImage({ type: "file", file: "original", thumbnail: "thumb" }, context("gm", [entry]))).toBe(true);
  for (const entry of [asset({ library: { kind: "room", id: "other" } }), asset({ library: { kind: "account", id: "other" } }), asset({ uploading: true })]) expect(mayPlaceImage({ type: "file", file: "original" }, context("gm", [entry]))).toBe(false);
  expect(mayPlaceImage({ type: "file", file: "placed" }, context("gm"))).toBe(true);
});
test("players and trusted players place own uploads and placed files independent of upload permission", () => {
  for (const role of ["player", "trusted"] as const) {
    for (const uploads of [true, false]) {
      expect(mayUpload(role, uploads)).toBe(role === "trusted" || uploads);
      expect(mayPlaceImage({ type: "file", file: "original" }, context(role, [asset({ uploader: "me" })]))).toBe(true);
      for (const entry of [asset(), asset({ uploader: "other" }), asset({ uploader: "me", library: { kind: "account", id: "account" } })]) expect(mayPlaceImage({ type: "file", file: "original" }, context(role, [entry]))).toBe(false);
      expect(mayPlaceImage({ type: "file", file: "placed" }, context(role))).toBe(true);
    }
  }
});
test("every named thumbnail and resolution must have placement authority", () => {
  const own = context("player", [asset({ uploader: "me", files: { original: { id: "original", size: 1 }, low: { id: "low", size: 1 } } })]);
  expect(mayPlaceImage({ type: "file", file: "original", resolutions: { low: "low" } }, own)).toBe(true);
  for (const image of [{ type: "file", file: "original", thumbnail: "hidden" }, { type: "file", file: "original", resolutions: { ultra: "hidden" } }, { type: "file", file: "asset" }] as const) expect(mayPlaceImage(image, own)).toBe(false);
});
test("names trim whitespace and caps include reserved assets", () => {
  for (const check of [checkAssetName, checkFolderName]) {
    expect(check("  Goblin  ")).toBe("Goblin");
    expect(check("x".repeat(100))).toHaveLength(100);
    for (const name of [null, {}, 1, "", " \n", "x".repeat(101)]) expect(check(name)).toBeUndefined();
  }
  expect(checkAssetCount(9998, 1)).toBe(true);
  expect(checkAssetCount(9999, 1)).toBe(false);
  expect(checkFolderCount(999)).toBe(true);
  expect(checkFolderCount(1000)).toBe(false);
  expect(checkAssetCount(-1)).toBe(false);
});
test("only the GM may set Map and legacy vehicle becomes Mount", () => {
  for (const role of ["gm", "trusted", "player", "display"] as const) {
    expect(maySetAssetType(role, "map")).toBe(role === "gm");
    expect(maySetAssetType(role, "mount")).toBe(role !== "display");
    expect(maySetAssetType(role, "vehicle")).toBe(false);
  }
  expect(legacyCategoryToAssetType("vehicle")).toBe("mount");
});
test("quotas count original and every derived role plus reservations, allowing equality", () => {
  const bytes = assetBytes({ original: { id: "o", size: 10 }, thumbnail: { id: "t", size: 2 }, low: { id: "l", size: 3 }, medium: { id: "m", size: 4 }, high: { id: "h", size: 5 }, ultra: { id: "u", size: 6 } });
  expect(bytes).toBe(30);
  const usage = { bytes: 60, reservedBytes: 10, quota: 100 };
  expect(checkQuota(usage, bytes)).toBe(true);
  expect(checkQuota(usage, bytes + 1)).toBe(false);
  expect(quotaError(30, usage, "room", { ...usage, quota: 99 })).toBe("Player quota exceeded");
  expect(quotaError(31, usage, "room")).toBe("Room quota exceeded");
  expect(quotaError(31, usage, "account")).toBe("Account quota exceeded");
  expect(checkQuota({ ...usage, quota: 50 }, 1)).toBe(false);
  expect(usage.bytes).toBe(60);
  expect(checkQuota(usage, NaN)).toBe(false);
  expect(checkPlayerQuota(100, 100)).toBe(true);
  expect(checkPlayerQuota(101, 100)).toBe(false);
  expect(checkPlayerQuota(-1, 100)).toBe(false);
  expect(defaultLibraryQuota).toBe(2_000_000_000);
  expect(defaultPlayerQuota).toBe(100_000_000);
});
const view = (fields: Partial<LibraryViewOptions> = {}): LibraryViewOptions => ({ ...context("gm"), folders: [], serverSet: [], ...fields });
test("sections have role-specific headings and omit From players when empty", () => {
  expect(librarySections(view()).map(section => section.heading)).toEqual(["This room", "My library", "Server set"]);
  expect(librarySections(view({ assets: [asset({ uploader: "player" })] })).map(section => section.heading)).toEqual(["This room", "From players", "My library", "Server set"]);
  for (const role of ["player", "trusted"] as const) expect(librarySections(view({ person: { role, id: "me" }, assets: [asset(), asset({ uploader: "other" }), asset({ uploader: "me" })] })).map(section => [section.heading, section.assets.length])).toEqual([["My uploads", 1], ["Server set", 0]]);
  expect(librarySections(view({ person: { role: "display", id: "cast" } }))).toEqual([]);
});
test("folders remain alphabetic while assets follow name or newest order and library filter", () => {
  const options = view({ assets: [asset({ id: "z", name: "Zombie", created: 2 }), asset({ id: "a", name: "Archer", created: 1 })], folders: [ { id: "z", name: "Z", library: { kind: "room", id: "room" }, owner: null }, { id: "a", name: "A", library: { kind: "room", id: "room" }, owner: null } ] });
  expect(librarySections(options)[0].assets.map(entry => entry.name)).toEqual(["Archer", "Zombie"]);
  const newest = librarySections({ ...options, order: "newest", filter: "room" });
  expect(newest.map(section => section.id)).toEqual(["room"]);
  expect(newest[0].folders.map(folder => folder.name)).toEqual(["A", "Z"]);
  expect(newest[0].assets.map(entry => entry.name)).toEqual(["Zombie", "Archer"]);
  expect(librarySections({ ...options, filter: "account" }).map(section => section.id)).toEqual(["account"]);
});
test("fuzzy name search opens folders holding matches and respects type filtering", () => {
  const options = view({ search: "gbl", assets: [asset({ folderId: "monsters" }), asset({ id: "other", name: "Dragon" })], folders: [{ id: "monsters", name: "Monsters", library: { kind: "room", id: "room" }, owner: null }] });
  const section = librarySections(options)[0];
  expect(section.folders[0].open).toBe(true);
  expect(section.folders[0].assets.map(entry => entry.name)).toEqual(["Goblin"]);
  expect(section.assets).toEqual([]);
  expect(librarySections({ ...options, type: "map" })[0].folders).toEqual([]);
  expect(fuzzyLibraryMatch("Goblin", " GBL ")).toBe(true);
  expect(fuzzyLibraryMatch("Goblin", "glb")).toBe(false);
});
