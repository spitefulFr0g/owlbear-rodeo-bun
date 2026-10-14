// PROTOTYPE variant G, after Roll20's recent uploads, Shard's favourites and a
// command palette: the dock is a hotbar along the bottom with the type tabs,
// then slots for pinned and recently placed assets. A tab or "/" opens a
// search-first palette above it, with results under the library headings,
// driven by the keyboard. The Asset Manager is a full-page library with Recent
// and Pinned on its left rail and a drawer for the picked asset.
// Pins and recents are additions for this variant; they are not in the decisions.
import { KeyboardEvent, ReactNode, useEffect, useRef, useState } from "react";
import { Box, Button, Flex, IconButton, Input, Text } from "theme-ui";

import { Asset, AssetType, initialAssets, scenes, typeLabels } from "./data";
import { filterOptions, Proto, Role, Section, tabLabel, tabsFor } from "./model";
import { AssetDetails, FolderGlyph, QuotaBar, selectStyle, StarGlyph, TabIcon, Thumb, typesFor } from "./parts";

export const name = "Hotbar + search palette (Roll20, Shard)";

const startingPins: Record<Role, string[]> = {
  gm: ["Goblin boss", "Burning", "Warhorse", "Young red dragon"],
  player: ["Mira", "Hex mark"],
};

function usePins(role: Role) {
  const [pinned, setPinned] = useState<string[]>(() =>
    startingPins[role].map((n) => initialAssets.find((x) => x.name === n)?.id ?? "").filter(Boolean)
  );
  const [recent, setRecent] = useState<string[]>([]);
  return {
    pinned,
    recent,
    isPinned: (id: string) => pinned.includes(id),
    togglePin: (id: string) => setPinned((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id])),
    used: (id: string) => setRecent((r) => [id, ...r.filter((x) => x !== id)].slice(0, 6)),
  };
}
type Pins = ReturnType<typeof usePins>;

function place(proto: Proto, pins: Pins, asset: Asset) {
  proto.actions.place(asset);
  pins.used(asset.id);
}

/** The assets the palette shows, in the order the keyboard walks them */
function walkOrder(proto: Proto, sections: Section[]) {
  const out: Asset[] = [];
  for (const s of sections) {
    for (const f of s.folders) if (proto.isOpen(f.key)) out.push(...f.assets);
    out.push(...s.assets);
  }
  return out;
}

function Slot({ asset, onClick, title }: { asset: Asset; onClick: () => void; title: string }) {
  return (
    <Box title={title} onClick={onClick} sx={{ cursor: "grab", borderRadius: "6px", p: "2px", "&:hover": { bg: "muted" } }}>
      <Thumb asset={asset} size={36} />
    </Box>
  );
}

function Hotbar({ proto, pins }: { proto: Proto; pins: Pins }) {
  const find = (id: string) => proto.assets.find((x) => x.id === id);
  const pinned = pins.pinned.map(find).filter((x): x is Asset => !!x);
  const recent = pins.recent.map(find).filter((x): x is Asset => !!x);
  const paletteOpen = !proto.collapsed;
  return (
    <Flex
      sx={{
        position: "absolute",
        left: "50%",
        bottom: 56,
        transform: "translateX(-50%)",
        zIndex: 10,
        bg: "background",
        borderRadius: "12px",
        boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
        alignItems: "center",
        gap: 1,
        px: 2,
        height: 52,
        maxWidth: "calc(100% - 130px)",
      }}
    >
      {tabsFor(proto.role).map((tab) => (
        <IconButton
          key={tab}
          title={`${tabLabel(tab)} (or press /)`}
          sx={{ color: paletteOpen && proto.tab === tab ? "primary" : "text" }}
          onClick={() => {
            if (paletteOpen && proto.tab === tab) proto.setCollapsed(true);
            else {
              proto.setTab(tab);
              proto.setCollapsed(false);
            }
          }}
        >
          <TabIcon tab={tab} />
        </IconButton>
      ))}
      <Box sx={{ width: 1, height: 32, bg: "muted", mx: 1 }} />
      <Text variant="caption" sx={{ writingMode: "vertical-rl", transform: "rotate(180deg)", fontSize: "10px" }}>
        Pinned
      </Text>
      {pinned.length === 0 && <Text variant="caption">none</Text>}
      {pinned.map((a) => (
        <Slot key={a.id} asset={a} title={`${a.name}: click to place`} onClick={() => place(proto, pins, a)} />
      ))}
      <Box sx={{ width: 1, height: 32, bg: "muted", mx: 1 }} />
      <Text variant="caption" sx={{ writingMode: "vertical-rl", transform: "rotate(180deg)", fontSize: "10px" }}>
        Recent
      </Text>
      {recent.length === 0 && <Text variant="caption" sx={{ fontSize: "10px", width: 60 }}>placed items show here</Text>}
      {recent.map((a) => (
        <Slot key={a.id} asset={a} title={`${a.name}: click to place again`} onClick={() => place(proto, pins, a)} />
      ))}
      <Box sx={{ width: 1, height: 32, bg: "muted", mx: 1 }} />
      <Button sx={{ fontSize: 0, py: 1, whiteSpace: "nowrap" }} onClick={() => proto.setManagerOpen(true)}>
        Library
      </Button>
    </Flex>
  );
}

function Palette({ proto, pins }: { proto: Proto; pins: Pins }) {
  const input = useRef<HTMLInputElement>(null);
  const [cursor, setCursor] = useState(0);
  const sections = proto.dockSections;
  const order = walkOrder(proto, sections);
  const current = order[Math.min(cursor, order.length - 1)];

  useEffect(() => {
    input.current?.focus();
  }, [proto.tab]);
  useEffect(() => setCursor(0), [proto.search, proto.filter, proto.tab]);

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(order.length - 1, c + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === "Enter" && current) {
      place(proto, pins, current);
    } else if (e.key === "Escape") {
      proto.setCollapsed(true);
    }
  }

  function Tile({ asset }: { asset: Asset }) {
    const lit = current?.id === asset.id;
    return (
      <Box
        onClick={() => place(proto, pins, asset)}
        sx={{
          width: 76,
          textAlign: "center",
          cursor: "grab",
          borderRadius: "6px",
          p: 1,
          position: "relative",
          bg: lit ? "highlight" : "transparent",
          outline: lit ? "2px solid" : "none",
          outlineColor: "primary",
          "&:hover": { bg: lit ? "highlight" : "muted" },
        }}
      >
        <Box
          title={pins.isPinned(asset.id) ? "Unpin" : "Pin to the hotbar"}
          onClick={(e) => {
            e.stopPropagation();
            pins.togglePin(asset.id);
          }}
          sx={{ position: "absolute", top: "2px", right: "4px", cursor: "pointer", color: "gray" }}
        >
          <StarGlyph on={pins.isPinned(asset.id)} />
        </Box>
        <Flex sx={{ justifyContent: "center" }}>
          <Thumb asset={asset} size={48} />
        </Flex>
        <Text sx={{ fontSize: 0, display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {asset.name}
        </Text>
        {asset.uploader && <Text variant="caption" sx={{ fontSize: "10px" }}>{asset.uploader}</Text>}
      </Box>
    );
  }

  return (
    <Flex
      sx={{
        position: "absolute",
        left: "50%",
        bottom: 118,
        transform: "translateX(-50%)",
        width: "min(620px, calc(100% - 130px))",
        maxHeight: "calc(100% - 190px)",
        zIndex: 10,
        bg: "background",
        borderRadius: "12px",
        boxShadow: "0 6px 28px rgba(0,0,0,0.6)",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {proto.tab === "scenes" ? (
        <Box sx={{ p: 3 }}>
          <Text sx={{ fontSize: 2 }}>Scenes</Text>
          {scenes.map((scene) => (
            <Box key={scene} sx={{ py: 1, fontSize: 1 }}>
              {scene}
            </Box>
          ))}
          <Flex sx={{ gap: 2, mt: 2 }}>
            <Button sx={{ fontSize: 0 }} onClick={() => proto.actions.newScene("library")}>New scene from a Map asset</Button>
            <Button variant="secondary" sx={{ fontSize: 0 }} onClick={() => proto.actions.newScene("upload")}>New scene from an upload</Button>
          </Flex>
        </Box>
      ) : (
        <>
          <Box sx={{ p: 2, borderBottom: "1px solid", borderColor: "muted" }}>
            <Input
              ref={input}
              value={proto.search}
              onChange={(e) => proto.setSearch(e.target.value)}
              onKeyDown={onKey}
              placeholder={`Find a ${tabLabel(proto.tab).toLowerCase()} in every library`}
              sx={{ fontSize: 3, p: 2, border: "none", bg: "muted" }}
            />
            <Flex sx={{ alignItems: "center", gap: 1, mt: 2 }}>
              {filterOptions(proto.role).map((o) => (
                <Box
                  key={o.value}
                  onClick={() => proto.setFilter(o.value)}
                  sx={{
                    cursor: "pointer",
                    fontFamily: "body2",
                    fontSize: 0,
                    px: 2,
                    borderRadius: 999,
                    border: "1px solid",
                    borderColor: proto.filter === o.value ? "primary" : "border",
                    color: proto.filter === o.value ? "primary" : "text",
                  }}
                >
                  {o.label}
                </Box>
              ))}
              <Box sx={{ flexGrow: 1 }} />
              <select style={selectStyle} value={proto.sort} onChange={(e: any) => proto.setSort(e.target.value)}>
                <option value="name">Folders, then by name</option>
                <option value="newest">Folders, then newest</option>
              </select>
            </Flex>
          </Box>
          <Box sx={{ overflowY: "auto", p: 2, minHeight: 0 }}>
            {sections.filter((s) => !proto.searching || s.count > 0).map((section) => (
              <Box key={section.id} sx={{ mb: 2 }}>
                <Text variant="caption" sx={{ display: "block", textTransform: "uppercase", letterSpacing: "0.05em", mb: 1 }}>
                  {section.heading} · {section.count}
                  {section.readOnly ? " · read-only" : ""}
                </Text>
                {section.count === 0 && <Text variant="caption">Nothing here</Text>}
                {section.folders.length > 0 && (
                  <Flex sx={{ gap: 1, flexWrap: "wrap", mb: 1 }}>
                    {section.folders.map((f) => (
                      <Flex
                        key={f.key}
                        onClick={() => proto.toggleFolder(f.key)}
                        sx={{
                          alignItems: "center",
                          cursor: "pointer",
                          px: 2,
                          py: "2px",
                          fontSize: 1,
                          borderRadius: 999,
                          bg: proto.isOpen(f.key) ? "primary" : "muted",
                          color: proto.isOpen(f.key) ? "background" : "text",
                        }}
                      >
                        <FolderGlyph open={proto.isOpen(f.key)} />
                        {f.name} · {f.assets.length}
                      </Flex>
                    ))}
                  </Flex>
                )}
                {section.folders
                  .filter((f) => proto.isOpen(f.key))
                  .map((f) => (
                    <Box key={f.key} sx={{ borderLeft: "2px solid", borderColor: "primary", pl: 2, mb: 1 }}>
                      <Text variant="caption">{f.name}</Text>
                      <Flex sx={{ flexWrap: "wrap" }}>
                        {f.assets.map((a) => (
                          <Tile key={a.id} asset={a} />
                        ))}
                      </Flex>
                    </Box>
                  ))}
                <Flex sx={{ flexWrap: "wrap" }}>
                  {section.assets.map((a) => (
                    <Tile key={a.id} asset={a} />
                  ))}
                </Flex>
              </Box>
            ))}
          </Box>
          <Flex sx={{ px: 2, py: 1, borderTop: "1px solid", borderColor: "muted" }}>
            <Text variant="caption">↑ ↓ to pick · Enter to place · Esc to close · / to reopen</Text>
          </Flex>
        </>
      )}
    </Flex>
  );
}

type Scope = "recent" | "pinned" | { section: string; folder: string | null };

function LibraryPage({ proto, pins }: { proto: Proto; pins: Pins }) {
  const [scope, setScope] = useState<Scope>({ section: "all", folder: null });
  const types: (AssetType | "all")[] = ["all", ...typesFor(proto)];
  const sections = proto.managerSections;

  const railItem = (label: string, active: boolean, onClick: () => void, count?: number, indent = false) => (
    <Flex
      key={label + indent}
      onClick={onClick}
      sx={{
        alignItems: "center",
        gap: 1,
        cursor: "pointer",
        py: 1,
        pl: indent ? 4 : 2,
        pr: 2,
        borderRadius: "6px",
        fontSize: indent ? 1 : 2,
        bg: active ? "highlight" : "transparent",
        "&:hover": { bg: active ? "highlight" : "muted" },
      }}
    >
      {indent && <FolderGlyph />}
      <Text sx={{ flexGrow: 1 }}>{label}</Text>
      {count !== undefined && <Text variant="caption">{count}</Text>}
    </Flex>
  );

  const byId = (ids: string[]) => ids.map((id) => proto.assets.find((x) => x.id === id)).filter((x): x is Asset => !!x);
  let groups: { title: string; assets: Asset[] }[];
  if (scope === "recent") groups = [{ title: "Recently placed", assets: byId(pins.recent) }];
  else if (scope === "pinned") groups = [{ title: "Pinned", assets: byId(pins.pinned) }];
  else
    groups = sections
      .filter((s) => scope.section === "all" || s.id === scope.section)
      .flatMap((s) => [
        ...s.folders
          .filter((f) => !scope.folder || f.name === scope.folder)
          .map((f) => ({ title: `${s.heading} › ${f.name}`, assets: f.assets })),
        // Loose assets get a group of their own unless it would be empty noise
        ...(scope.folder || (s.assets.length === 0 && (s.folders.length > 0 || proto.searching))
          ? []
          : [{ title: s.heading, assets: s.assets }]),
      ]);

  const isScope = (section: string, folder: string | null) =>
    typeof scope === "object" && scope.section === section && scope.folder === folder;

  return (
    // The top padding keeps the header clear of the prototype's state panel
    <Flex
      sx={{ position: "fixed", inset: 0, zIndex: 100, bg: "background", flexDirection: "column" }}
      style={{ paddingTop: 84 }}
    >
      <Flex sx={{ alignItems: "center", gap: 2, px: 3, py: 2, borderBottom: "1px solid", borderColor: "muted" }}>
        <Text variant="heading" sx={{ fontSize: 4, mr: 2 }}>
          Library
        </Text>
        <Input
          value={proto.search}
          onChange={(e) => proto.setSearch(e.target.value)}
          placeholder="Search every library"
          sx={{ width: 260, fontSize: 1, p: "4px 8px" }}
        />
        <select style={selectStyle} value={proto.filter} onChange={(e: any) => proto.setFilter(e.target.value)}>
          {filterOptions(proto.role).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select style={selectStyle} value={proto.sort} onChange={(e: any) => proto.setSort(e.target.value)}>
          <option value="name">Folders, then by name</option>
          <option value="newest">Folders, then newest</option>
        </select>
        <Flex sx={{ gap: 1 }}>
          {types.map((t) => (
            <Box
              key={t}
              onClick={() => proto.setManagerType(t)}
              sx={{
                cursor: "pointer",
                fontFamily: "body2",
                fontSize: 0,
                px: 2,
                borderRadius: 999,
                border: "1px solid",
                borderColor: proto.managerType === t ? "primary" : "border",
                color: proto.managerType === t ? "primary" : "text",
              }}
            >
              {t === "all" ? "All types" : typeLabels[t]}
            </Box>
          ))}
        </Flex>
        <Box sx={{ flexGrow: 1 }} />
        <IconButton onClick={() => proto.setManagerOpen(false)} title="Back to the table">
          ✕
        </IconButton>
      </Flex>
      <Flex sx={{ flexGrow: 1, minHeight: 0, mb: "64px" }}>
        <Flex sx={{ width: 240, flexShrink: 0, flexDirection: "column", p: 2, borderRight: "1px solid", borderColor: "muted" }}>
          <Box sx={{ flexGrow: 1, overflowY: "auto" }}>
            {railItem("Recent", scope === "recent", () => setScope("recent"), pins.recent.length)}
            {railItem("Pinned", scope === "pinned", () => setScope("pinned"), pins.pinned.length)}
            <Box sx={{ height: 1, bg: "muted", my: 2 }} />
            {railItem("All libraries", isScope("all", null), () => setScope({ section: "all", folder: null }))}
            {sections.map((s) => (
              <Box key={s.id}>
                {railItem(s.heading, isScope(s.id, null), () => setScope({ section: s.id, folder: null }), s.count)}
                {s.folders.map((f) =>
                  railItem(f.name, isScope(s.id, f.name), () => setScope({ section: s.id, folder: f.name }), f.assets.length, true)
                )}
              </Box>
            ))}
          </Box>
          <QuotaBar proto={proto} />
          {proto.role === "gm" && (
            <Button variant="secondary" sx={{ fontSize: 0, mt: 2 }} onClick={proto.actions.importBrowser}>
              Import browser library
            </Button>
          )}
        </Flex>
        <Box sx={{ flexGrow: 1, overflowY: "auto", p: 3 }}>
          <Flex
            onClick={proto.actions.upload}
            sx={{
              border: "2px dashed",
              borderColor: "border",
              borderRadius: "8px",
              p: 2,
              mb: 3,
              justifyContent: "center",
              alignItems: "center",
              gap: 3,
              cursor: "pointer",
              color: "gray",
            }}
          >
            <Text>
              Drop images here or click to upload into {proto.role === "gm" ? "this room" : "my uploads"}
            </Text>
            <Button
              variant="secondary"
              sx={{ fontSize: 0 }}
              onClick={(e) => {
                e.stopPropagation();
                proto.actions.newFolder();
              }}
            >
              New folder
            </Button>
          </Flex>
          {groups.map((g) => (
            <Box key={g.title} sx={{ mb: 3 }}>
              <Text sx={{ fontSize: 2, display: "block", mb: 2 }}>
                {g.title} <Text variant="caption">{g.assets.length}</Text>
              </Text>
              {g.assets.length === 0 && <Text variant="caption">Nothing here</Text>}
              <Flex sx={{ flexWrap: "wrap", gap: 3 }}>
                {g.assets.map((asset) => {
                  const active = proto.selected?.id === asset.id;
                  return (
                    <Box
                      key={asset.id}
                      onClick={() => proto.setSelectedId(asset.id)}
                      sx={{
                        width: 140,
                        cursor: "pointer",
                        borderRadius: "10px",
                        p: 2,
                        position: "relative",
                        bg: active ? "highlight" : "muted",
                        "&:hover": { outline: "1px solid", outlineColor: "primary" },
                      }}
                    >
                      <Box
                        onClick={(e) => {
                          e.stopPropagation();
                          pins.togglePin(asset.id);
                        }}
                        title={pins.isPinned(asset.id) ? "Unpin" : "Pin to the hotbar"}
                        sx={{ position: "absolute", top: 2, right: 2, zIndex: 1 }}
                      >
                        <StarGlyph on={pins.isPinned(asset.id)} />
                      </Box>
                      <Flex sx={{ justifyContent: "center" }}>
                        <Thumb asset={asset} size={110} />
                      </Flex>
                      <Text sx={{ fontSize: 1, display: "block", mt: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {asset.name}
                      </Text>
                      <Text variant="caption">
                        {typeLabels[asset.type]}
                        {asset.uploader ? ` · ${asset.uploader}` : ""}
                      </Text>
                    </Box>
                  );
                })}
              </Flex>
            </Box>
          ))}
        </Box>
        {proto.selected && (
          <Flex sx={{ width: 300, flexShrink: 0, flexDirection: "column", borderLeft: "1px solid", borderColor: "muted" }}>
            <Flex sx={{ justifyContent: "flex-end", p: 1 }}>
              <IconButton title="Close the drawer" onClick={() => proto.setSelectedId(null)}>
                ✕
              </IconButton>
            </Flex>
            <AssetDetails proto={proto} size={180} />
          </Flex>
        )}
      </Flex>
    </Flex>
  );
}

function VariantG({
  proto,
  canvas,
  fullScreen,
}: {
  proto: Proto;
  canvas: ReactNode;
  fullScreen: boolean;
}) {
  const pins = usePins(proto.role);
  const { setCollapsed } = proto;
  // "/" opens the palette from anywhere but a text field
  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")) return;
      if (e.key === "/") {
        e.preventDefault();
        setCollapsed(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setCollapsed]);
  return (
    <Flex sx={{ flexGrow: 1, minWidth: 0, position: "relative" }}>
      {canvas}
      {!fullScreen && !proto.collapsed && <Palette proto={proto} pins={pins} />}
      {!fullScreen && <Hotbar proto={proto} pins={pins} />}
      {proto.managerOpen && <LibraryPage proto={proto} pins={pins} />}
    </Flex>
  );
}

export default VariantG;
