import type { Person } from "../sceneRules/types";
import {
  AssetType,
  LibraryAsset,
  LibraryFilter,
  LibraryFolder,
  LibrarySectionId,
  LibrarySnapshot,
  LibraryRole,
  sameLibrary,
} from "../sceneRules/library";

/** A tab along the top of the dock: an asset type, or the GM's Scenes */
export type DockTab = AssetType | "scenes";

export const dockTabLabels: Record<DockTab, string> = {
  map: "Map",
  prop: "Prop",
  mount: "Mount",
  character: "Character",
  attachment: "Attachment",
  scenes: "Scenes",
};

/** Map and Scenes are the GM's alone; a cast display has no dock */
export function dockTabs(role: LibraryRole): DockTab[] {
  if (role === "display") return [];
  if (role === "gm") {
    return ["map", "prop", "mount", "character", "attachment", "scenes"];
  }
  return ["prop", "mount", "character", "attachment"];
}

/** The libraries the filter offers, named as the dock's headings name them */
export function libraryFilters(
  role: LibraryRole
): { value: LibraryFilter; label: string }[] {
  if (role === "display") return [];
  return [
    { value: "all", label: "All" },
    ...(role === "gm"
      ? [
          { value: "room" as const, label: "This room" },
          { value: "account" as const, label: "My library" },
        ]
      : [{ value: "room" as const, label: "My uploads" }]),
    { value: "server", label: "Server set" },
  ];
}

export type QuotaPart = {
  /** The library heading whose colour the part takes */
  section: LibrarySectionId;
  label: string;
  bytes: number;
};

export type QuotaBar = {
  label: string;
  /** Held and reserved bytes together, as the server counts them */
  used: number;
  quota: number;
  parts: QuotaPart[];
};

/**
 * The bars at the foot of the dock. The GM's room bar is split into their own
 * uploads and each player's, largest first, with the account library its own
 * bar; a player's one bar is their uploads against the player quota.
 */
export function quotaBars(
  usage: LibrarySnapshot["usage"] | undefined,
  assets: readonly LibraryAsset[]
): QuotaBar[] {
  if (!usage) return [];
  if ("player" in usage) {
    const used = usage.player.bytes + usage.player.reservedBytes;
    return [
      {
        label: "My uploads",
        used,
        quota: usage.player.quota,
        parts: [{ section: "uploads", label: "My uploads", bytes: used }],
      },
    ];
  }
  const names = new Map<string, string>();
  for (const asset of assets) {
    if (asset.uploader && asset.uploaderName) {
      names.set(asset.uploader, asset.uploaderName);
    }
  }
  const players = Object.entries(usage.players)
    .filter(([, bytes]) => bytes > 0)
    .sort(([a, aBytes], [b, bBytes]) => bBytes - aBytes || a.localeCompare(b))
    .map(([id, bytes]) => ({
      section: "players" as const,
      label: names.get(id) || "A player",
      bytes,
    }));
  return [
    {
      label: "This room",
      used: usage.room.bytes + usage.room.reservedBytes,
      quota: usage.room.quota,
      parts: [
        { section: "room", label: "My uploads", bytes: usage.gmBytes },
        ...players,
      ],
    },
    {
      label: "My library",
      used: usage.account.bytes + usage.account.reservedBytes,
      quota: usage.account.quota,
      parts: [
        {
          section: "account",
          label: "My library",
          bytes: usage.account.bytes + usage.account.reservedBytes,
        },
      ],
    },
  ];
}

/** Each library's heading colour, and a brighter accent for gauges */
export const sectionColours: Record<
  LibrarySectionId,
  { heading: string; accent: string }
> = {
  room: { heading: "hsl(265, 35%, 32%)", accent: "hsl(265, 70%, 70%)" },
  uploads: { heading: "hsl(265, 35%, 32%)", accent: "hsl(265, 70%, 70%)" },
  players: { heading: "hsl(28, 45%, 30%)", accent: "hsl(28, 85%, 62%)" },
  account: { heading: "hsl(200, 40%, 28%)", accent: "hsl(200, 75%, 62%)" },
  server: { heading: "hsl(150, 25%, 26%)", accent: "hsl(150, 50%, 55%)" },
};

/** Whether a person may rename, refile, retype, move or delete an asset */
export function mayChangeAsset(asset: LibraryAsset, person: Person): boolean {
  if (person.role === "gm") return true;
  return person.role !== "display" && asset.library.kind === "room" && asset.uploader === person.id;
}

/** A folder an asset may be filed in: in its own library and its uploader's */
export function mayFileIn(asset: LibraryAsset, folder: LibraryFolder): boolean {
  return sameLibrary(folder.library, asset.library) && folder.owner === asset.uploader;
}

export type MoveAction = { destination: "room" | "account"; label: string };

/**
 * The GM's moves between this room's library and their account library. A
 * player's upload can also be taken into this room's own assets, where it
 * stops being theirs.
 */
export function moveActions(asset: LibraryAsset, role: LibraryRole): MoveAction[] {
  if (role !== "gm") return [];
  if (asset.library.kind === "account") return [{ destination: "room", label: "Move to this room" }];
  const add: MoveAction = { destination: "account", label: "Add to my library" };
  return asset.uploader === null ? [add] : [{ destination: "room", label: "Take into this room" }, add];
}
