// PROTOTYPE: in-memory state shared by every variant of the dock and Asset
// Manager prototype (#136). Holds data and rules only; each variant owns its
// layout. Nothing persists: a reload starts from the fixed data again.
import { useMemo, useState } from "react";
import Fuse from "fuse.js";

import { Asset, AssetType, initialAssets, me, typeLabels } from "./data";

export type Role = "gm" | "player";
/** "room" is "This room" for the GM and "My uploads" for a player */
export type Filter = "all" | "room" | "account" | "server";
export type Sort = "name" | "newest";
export type Tab = AssetType | "scenes";

export type SectionId = "room" | "players" | "account" | "server" | "mine";

export type Folder = { key: string; name: string; assets: Asset[] };

export type Section = {
  id: SectionId;
  heading: string;
  readOnly: boolean;
  folders: Folder[];
  assets: Asset[];
  count: number;
};

export const sectionHeadings: Record<SectionId, string> = {
  room: "This room",
  players: "From players",
  account: "My library",
  server: "Server set",
  mine: "My uploads",
};

export function filterOptions(role: Role): { value: Filter; label: string }[] {
  return role === "gm"
    ? [
        { value: "all", label: "All" },
        { value: "room", label: "This room" },
        { value: "account", label: "My library" },
        { value: "server", label: "Server set" },
      ]
    : [
        { value: "all", label: "All" },
        { value: "room", label: "My uploads" },
        { value: "server", label: "Server set" },
      ];
}

export function tabsFor(role: Role): Tab[] {
  return role === "gm"
    ? ["map", "prop", "mount", "character", "attachment", "scenes"]
    : ["prop", "mount", "character", "attachment"];
}

export function tabLabel(tab: Tab) {
  return tab === "scenes" ? "Scenes" : typeLabels[tab];
}

function sectionOf(asset: Asset, role: Role): SectionId | null {
  if (asset.library === "server") return "server";
  if (role === "gm") {
    if (asset.library === "account") return "account";
    return asset.uploader ? "players" : "room";
  }
  return asset.library === "room" && asset.uploader === me ? "mine" : null;
}

const sectionOrder: Record<Role, SectionId[]> = {
  gm: ["room", "players", "account", "server"],
  player: ["mine", "server"],
};

function filterAllows(filter: Filter, id: SectionId) {
  if (filter === "all") return true;
  if (filter === "room") return id === "room" || id === "players" || id === "mine";
  return filter === id;
}

export type ViewOptions = {
  role: Role;
  type: AssetType | "all";
  filter: Filter;
  search: string;
  sort: Sort;
};

/** The headings, folders and tiles to draw, in order */
export function buildSections(assets: Asset[], options: ViewOptions): Section[] {
  const { role, type, filter, search, sort } = options;
  let visible = assets.filter(
    (asset) => type === "all" || asset.type === type
  );
  if (search.trim()) {
    const fuse = new Fuse(visible, {
      keys: ["name", "folder"],
      threshold: 0.35,
      ignoreLocation: true,
    });
    const hits = new Set(fuse.search(search.trim()).map((r) => r.item.id));
    visible = visible.filter((asset) => hits.has(asset.id));
  }
  const compare =
    sort === "name"
      ? (x: Asset, y: Asset) => x.name.localeCompare(y.name)
      : (x: Asset, y: Asset) => x.added - y.added;

  const sections: Section[] = [];
  for (const id of sectionOrder[role]) {
    if (!filterAllows(filter, id)) continue;
    const own = visible.filter((asset) => sectionOf(asset, role) === id);
    // "From players" shows only when there is something from players
    if (id === "players" && own.length === 0) continue;
    // The GM sees players' uploads ungrouped; the server set has no folders
    const grouped = id !== "players" && id !== "server";
    const byFolder = new Map<string, Asset[]>();
    const loose: Asset[] = [];
    for (const asset of own) {
      if (grouped && asset.folder) {
        byFolder.set(asset.folder, [...(byFolder.get(asset.folder) ?? []), asset]);
      } else {
        loose.push(asset);
      }
    }
    sections.push({
      id,
      heading: sectionHeadings[id],
      readOnly: id === "server",
      folders: [...byFolder.entries()]
        .sort(([x], [y]) => x.localeCompare(y))
        .map(([name, items]) => ({
          key: `${id}/${name}`,
          name,
          assets: items.sort(compare),
        })),
      assets: loose.sort(compare),
      count: own.length,
    });
  }
  return sections;
}

export function formatBytes(bytes: number) {
  return bytes >= 1024 * 1024 * 1024
    ? `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
    : `${Math.round(bytes / 1024 / 1024)} MB`;
}

export function usePrototype(role: Role) {
  const [assets, setAssets] = useState<Asset[]>(initialAssets);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("name");
  const [tab, setTab] = useState<Tab>(role === "gm" ? "map" : "character");
  const [collapsed, setCollapsed] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const [managerType, setManagerType] = useState<AssetType | "all">("all");
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState("Nothing yet");

  // The role toggle resets the tab when it would show a GM-only tab
  const safeTab = tabsFor(role).includes(tab) ? tab : "character";

  const dockSections = useMemo(
    () =>
      safeTab === "scenes"
        ? []
        : buildSections(assets, { role, type: safeTab, filter, search, sort }),
    [assets, role, safeTab, filter, search, sort]
  );
  const managerSections = useMemo(
    () => buildSections(assets, { role, type: managerType, filter, search, sort }),
    [assets, role, managerType, filter, search, sort]
  );

  const searching = search.trim() !== "";
  function isOpen(key: string) {
    return searching || openFolders.has(key);
  }
  function toggleFolder(key: string) {
    setOpenFolders((open) => {
      const next = new Set(open);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function update(id: string, change: Partial<Asset>) {
    setAssets((all) => all.map((x) => (x.id === id ? { ...x, ...change } : x)));
  }
  function find(id: string) {
    return assets.find((x) => x.id === id);
  }

  const selected = selectedId ? find(selectedId) ?? null : null;

  function mayEdit(asset: Asset) {
    if (asset.library === "server") return false;
    return role === "gm" || asset.uploader === me;
  }

  /** Folder names already used where this asset lives */
  function foldersFor(asset: Asset) {
    const names = new Set<string>();
    for (const x of assets) {
      if (
        x.folder &&
        x.library === asset.library &&
        (x.uploader ?? null) === (asset.uploader ?? null)
      ) {
        names.add(x.folder);
      }
    }
    return [...names].sort();
  }

  const actions = {
    place(asset: Asset) {
      setLastAction(
        asset.type === "map"
          ? `Would place "${asset.name}" on the Map layer at the drop point, locked and unaligned`
          : `Would place "${asset.name}" on the ${typeLabels[asset.type]} layer at the drop point`
      );
    },
    rename(asset: Asset) {
      const name = window.prompt("Name", asset.name);
      if (name) {
        update(asset.id, { name });
        setLastAction(`Renamed to "${name}"`);
      }
    },
    setType(asset: Asset, type: AssetType) {
      update(asset.id, { type });
      setLastAction(`"${asset.name}" is now a ${typeLabels[type]}`);
    },
    fileIn(asset: Asset, folder: string | null) {
      let name = folder;
      if (folder === "__new") {
        name = window.prompt("New folder name") || null;
        if (!name) return;
      }
      update(asset.id, { folder: name ?? undefined });
      setLastAction(name ? `Filed "${asset.name}" in ${name}` : `"${asset.name}" moved to the top level`);
    },
    move(asset: Asset) {
      const to = asset.library === "account" ? "room" : "account";
      // A move lands at the top level and leaves the player's dock
      update(asset.id, { library: to, folder: undefined, uploader: undefined });
      setLastAction(
        to === "account"
          ? `Moved "${asset.name}" to my library, top level`
          : `Moved "${asset.name}" to this room, top level`
      );
    },
    remove(asset: Asset) {
      setAssets((all) => all.filter((x) => x.id !== asset.id));
      if (selectedId === asset.id) setSelectedId(null);
      setLastAction(`Deleted "${asset.name}"; placed copies keep working`);
    },
    upload() {
      setLastAction(
        role === "gm"
          ? "Would upload into this room, whatever the filter shows"
          : "Would upload into my uploads in this room"
      );
    },
    newFolder() {
      const name = window.prompt("New folder name");
      if (name) setLastAction(`Would make an empty folder "${name}"`);
    },
    importBrowser() {
      setLastAction("Would import this browser's library into my library");
    },
    newScene(from: "library" | "upload") {
      setLastAction(
        from === "library"
          ? "Would open the importer on a Map asset from the libraries"
          : "Would open the importer on a fresh upload"
      );
    },
  };

  const quota =
    role === "gm"
      ? {
          label: "This room",
          used: assets
            .filter((x) => x.library === "room")
            .reduce((sum, x) => sum + x.bytes, 0),
          of: 2 * 1024 * 1024 * 1024,
        }
      : {
          label: "My uploads",
          used: assets
            .filter((x) => x.library === "room" && x.uploader === me)
            .reduce((sum, x) => sum + x.bytes, 0),
          of: 100 * 1024 * 1024,
        };

  return {
    role,
    assets,
    filter,
    setFilter,
    search,
    setSearch,
    searching,
    sort,
    setSort,
    tab: safeTab,
    setTab,
    collapsed,
    setCollapsed,
    managerOpen,
    setManagerOpen,
    managerType,
    setManagerType,
    dockSections,
    managerSections,
    isOpen,
    toggleFolder,
    selected,
    setSelectedId,
    mayEdit,
    foldersFor,
    actions,
    quota,
    lastAction,
  };
}

export type Proto = ReturnType<typeof usePrototype>;
