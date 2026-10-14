// PROTOTYPE: fixed data for the dock and Asset Manager prototype (#136).
// Throwaway, lives only on the prototype/dock-asset-manager branch.
import Case from "case";

import { mapSources } from "../../maps";
import { tokenSources } from "../../tokens";

export type AssetType = "map" | "prop" | "mount" | "character" | "attachment";
export type Library = "room" | "account" | "server";

export type Asset = {
  id: string;
  name: string;
  type: AssetType;
  library: Library;
  folder?: string;
  src: string;
  /** Days ago */
  added: number;
  bytes: number;
  /** Set for a player's upload into the room library */
  uploader?: string;
};

export const assetTypes: AssetType[] = [
  "map",
  "prop",
  "mount",
  "character",
  "attachment",
];

export const typeLabels: Record<AssetType, string> = {
  map: "Map",
  prop: "Prop",
  mount: "Mount",
  character: "Character",
  attachment: "Attachment",
};

export const scenes = ["Goblin cave", "Shrine of the moon", "The Wayward Inn"];

/** The player the prototype pretends to be in player view */
export const me = "Mira";

const t = tokenSources as Record<string, string>;
const m = mapSources as Record<string, string>;
const MB = 1024 * 1024;

let next = 0;
function a(
  name: string,
  type: AssetType,
  library: Library,
  src: string,
  added: number,
  extra: Partial<Asset> = {}
): Asset {
  next += 1;
  return {
    id: `p${next}`,
    name,
    type,
    library,
    src,
    added,
    bytes: type === "map" ? (4 + (next % 7)) * MB : (150 + ((next * 97) % 450)) * 1024,
    ...extra,
  };
}

export const initialAssets: Asset[] = [
  // This room, the GM's own uploads
  a("Cave entrance", "map", "room", m.stone, 3, { folder: "Goblin cave" }),
  a("Cave depths", "map", "room", m.sand, 3, { folder: "Goblin cave" }),
  a("Goblin boss", "character", "room", t.goblinoid, 2, { folder: "Goblin cave" }),
  a("Goblin archer", "character", "room", t.goblinoid, 2, { folder: "Goblin cave" }),
  a("Spider nest", "prop", "room", t.plant, 1, { folder: "Goblin cave" }),
  a("Shrine", "map", "room", m.wood, 9, { folder: "Shrine of the moon" }),
  a("Altar", "prop", "room", t.construct, 9, { folder: "Shrine of the moon" }),
  a("Moon guardian", "character", "room", t.celestial, 8, { folder: "Shrine of the moon" }),
  a("Innkeeper", "character", "room", t.humanoid, 14),
  a("Warhorse", "mount", "room", t.beast, 12),
  a("Burning", "attachment", "room", t.elemental, 0),
  a("Barrel", "prop", "room", t.construct, 20),
  a("Rowboat", "mount", "room", t.ooze, 5),
  // This room, players' uploads
  a("Mira", "character", "room", t.rogue, 6, { uploader: "Mira", folder: "Party" }),
  a("Mira's pony", "mount", "room", t.beast, 6, { uploader: "Mira", folder: "Party" }),
  a("Hex mark", "attachment", "room", t.warlock, 1, { uploader: "Mira" }),
  a("Sneaky decoy", "prop", "room", t.shapechanger, 0, { uploader: "Mira" }),
  a("Tobin", "character", "room", t.paladin, 6, { uploader: "Tobin" }),
  a("Tobin's shield", "prop", "room", t.fighter, 4, { uploader: "Tobin" }),
  a("Bless", "attachment", "room", t.cleric, 2, { uploader: "Tobin" }),
  // My library
  a("Young red dragon", "character", "account", t.dragon, 40, { folder: "Monsters" }),
  a("Lich", "character", "account", t.undead, 38, { folder: "Monsters" }),
  a("Gelatinous cube", "character", "account", t.ooze, 60, { folder: "Monsters" }),
  a("Imp", "character", "account", t.fiend, 55, { folder: "Monsters" }),
  a("Forest clearing", "map", "account", m.grass, 70, { folder: "Battle maps" }),
  a("River crossing", "map", "account", m.water, 66, { folder: "Battle maps" }),
  a("Prone", "attachment", "account", t.monk, 90, { folder: "Conditions" }),
  a("Blessed", "attachment", "account", t.cleric, 90, { folder: "Conditions" }),
  a("Old wizard", "character", "account", t.wizard, 30),
  a("Griffon", "mount", "account", t.monstrosity, 25),
  a("Treasure chest", "prop", "account", t.titan, 100),
  // The server set, bundled and read-only
  ...Object.keys(mapSources).map((key, i) =>
    a(Case.capital(key), "map", "server", m[key], 400 + i)
  ),
  ...Object.keys(tokenSources).map((key, i) =>
    a(Case.capital(key), "character", "server", t[key], 400 + i)
  ),
];
