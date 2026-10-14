// PROTOTYPE variant F, after Foundry VTT's sidebar: the dock is a full-height
// sidebar on the right, with the type tabs along its top and a directory tree
// of compact rows. Libraries are coloured top-level folders, and every row has
// a right-click menu. The dock collapses to a column of tab icons. The server
// set is a read-only "compendium" that pops out in its own window. The Asset
// Manager is a floating file-picker window that leaves the map in view, with a
// source per library, a breadcrumb, tile or list view and a preview pane.
import { ReactNode, useEffect, useRef, useState } from "react";
import { Box, Button, Flex, IconButton, Input, Text } from "theme-ui";

import { Asset, AssetType, scenes, typeLabels } from "./data";
import { filterOptions, Proto, Section, SectionId, tabLabel, tabsFor } from "./model";
import {
  AssetDetails,
  FolderGlyph,
  FolderSelect,
  moveLabel,
  QuotaBar,
  selectStyle,
  TabIcon,
  Thumb,
  TypeSelect,
  typesFor,
} from "./parts";

export const name = "Sidebar directory + file picker (Foundry)";

const libraryColour: Record<SectionId, string> = {
  room: "hsl(265, 35%, 32%)",
  players: "hsl(28, 45%, 30%)",
  account: "hsl(200, 40%, 28%)",
  server: "hsl(150, 25%, 26%)",
  mine: "hsl(265, 35%, 32%)",
};

type Menu = { asset: Asset; x: number; y: number };

function Row({
  proto,
  asset,
  depth,
  onMenu,
}: {
  proto: Proto;
  asset: Asset;
  depth: number;
  onMenu: (m: Menu) => void;
}) {
  return (
    <Flex
      title="Click to place, right-click for more"
      onClick={() => proto.actions.place(asset)}
      onContextMenu={(e) => {
        e.preventDefault();
        onMenu({ asset, x: e.clientX, y: e.clientY });
      }}
      sx={{
        alignItems: "center",
        gap: 2,
        py: "2px",
        pl: `${8 + depth * 14}px`,
        pr: 2,
        cursor: "grab",
        fontSize: 1,
        "&:hover": { bg: "muted" },
      }}
    >
      <Thumb asset={asset} size={24} />
      <Text sx={{ flexGrow: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{asset.name}</Text>
      {asset.uploader && <Text variant="caption">{asset.uploader}</Text>}
    </Flex>
  );
}

function Directory({
  proto,
  sections,
  closed,
  toggleLibrary,
  onMenu,
}: {
  proto: Proto;
  sections: Section[];
  closed: Set<SectionId>;
  toggleLibrary: (id: SectionId) => void;
  onMenu: (m: Menu) => void;
}) {
  return (
    <Box>
      {sections.map((section) => {
        const open = !closed.has(section.id) || proto.searching;
        return (
          <Box key={section.id} sx={{ mb: 1 }}>
            <Flex
              onClick={() => toggleLibrary(section.id)}
              sx={{
                alignItems: "center",
                gap: 1,
                px: 2,
                py: 1,
                cursor: "pointer",
                bg: libraryColour[section.id],
                fontSize: 1,
                borderTop: "1px solid rgba(255,255,255,0.15)",
              }}
            >
              <FolderGlyph open={open} />
              <Text sx={{ flexGrow: 1 }}>{section.heading}</Text>
              <Text variant="caption">{section.count}</Text>
            </Flex>
            {open && (
              <Box sx={{ borderLeft: "3px solid", borderColor: libraryColour[section.id] }}>
                {section.count === 0 && (
                  <Text variant="caption" sx={{ pl: 3, display: "block" }}>
                    Nothing here
                  </Text>
                )}
                {section.folders.map((folder) => {
                  const folderOpen = proto.isOpen(folder.key);
                  return (
                    <Box key={folder.key}>
                      <Flex
                        onClick={() => proto.toggleFolder(folder.key)}
                        sx={{
                          alignItems: "center",
                          gap: 1,
                          pl: "8px",
                          pr: 2,
                          py: "2px",
                          cursor: "pointer",
                          fontSize: 1,
                          bg: "rgba(255,255,255,0.04)",
                          "&:hover": { bg: "muted" },
                        }}
                      >
                        <FolderGlyph open={folderOpen} />
                        <Text sx={{ flexGrow: 1 }}>{folder.name}</Text>
                        <Text variant="caption">{folder.assets.length}</Text>
                      </Flex>
                      {folderOpen &&
                        folder.assets.map((asset) => (
                          <Row key={asset.id} proto={proto} asset={asset} depth={1} onMenu={onMenu} />
                        ))}
                    </Box>
                  );
                })}
                {section.assets.map((asset) => (
                  <Row key={asset.id} proto={proto} asset={asset} depth={0} onMenu={onMenu} />
                ))}
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
}

function ContextMenu({ proto, menu, onClose }: { proto: Proto; menu: Menu; onClose: () => void }) {
  const asset = proto.assets.find((x) => x.id === menu.asset.id);
  if (!asset) return null;
  const editable = proto.mayEdit(asset);
  const move = moveLabel(proto, asset);
  const item = {
    py: 1,
    px: 2,
    cursor: "pointer",
    fontSize: 1,
    "&:hover": { bg: "muted" },
  };
  return (
    <Box
      sx={{ position: "fixed", inset: 0, zIndex: 300 }}
      onClick={onClose}
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <Box
        onClick={(e) => e.stopPropagation()}
        style={{ position: "fixed", left: Math.min(menu.x, window.innerWidth - 230), top: Math.min(menu.y, window.innerHeight - 240) }}
        sx={{ width: 220, bg: "background", border: "1px solid", borderColor: "border", borderRadius: "4px", boxShadow: "0 4px 16px rgba(0,0,0,0.6)", py: 1 }}
      >
        <Text variant="caption" sx={{ px: 2, display: "block" }}>
          {asset.name}
        </Text>
        <Box sx={item} onClick={() => { proto.actions.place(asset); onClose(); }}>Place on the map</Box>
        {editable ? (
          <>
            <Box sx={item} onClick={() => { proto.actions.rename(asset); onClose(); }}>Rename…</Box>
            <Flex sx={{ ...item, alignItems: "center", gap: 2, cursor: "default" }}>
              Type <TypeSelect proto={proto} asset={asset} />
            </Flex>
            <Flex sx={{ ...item, alignItems: "center", gap: 2, cursor: "default" }}>
              Folder <FolderSelect proto={proto} asset={asset} />
            </Flex>
            {move && <Box sx={item} onClick={() => { proto.actions.move(asset); onClose(); }}>{move}</Box>}
            <Box sx={{ ...item, color: "error" }} onClick={() => { proto.actions.remove(asset); onClose(); }}>Delete</Box>
          </>
        ) : (
          <Text variant="caption" sx={{ px: 2, display: "block" }}>
            Read-only
          </Text>
        )}
      </Box>
    </Box>
  );
}

/** A small window over the canvas that the user drags by its title bar */
function Window({
  title,
  initial,
  width,
  height,
  onClose,
  children,
}: {
  title: string;
  initial: { x: number; y: number };
  width: number;
  height: number;
  onClose: () => void;
  children: ReactNode;
}) {
  const [pos, setPos] = useState(initial);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  useEffect(() => {
    function move(e: MouseEvent) {
      if (drag.current) setPos({ x: e.clientX - drag.current.dx, y: e.clientY - drag.current.dy });
    }
    function up() {
      drag.current = null;
    }
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, []);
  return (
    <Flex
      style={{ position: "fixed", left: pos.x, top: pos.y, width, height }}
      sx={{
        zIndex: 50,
        bg: "background",
        flexDirection: "column",
        border: "1px solid",
        borderColor: "border",
        borderRadius: "6px",
        boxShadow: "0 6px 24px rgba(0,0,0,0.6)",
        overflow: "hidden",
      }}
    >
      <Flex
        onMouseDown={(e) => {
          drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
        }}
        sx={{ alignItems: "center", px: 2, py: 1, bg: "muted", cursor: "move", userSelect: "none" }}
      >
        <Text sx={{ flexGrow: 1, fontSize: 1 }}>{title}</Text>
        <IconButton sx={{ width: 24, height: 24 }} onClick={onClose}>
          ✕
        </IconButton>
      </Flex>
      {children}
    </Flex>
  );
}

function Sidebar({
  proto,
  onMenu,
  openCompendium,
}: {
  proto: Proto;
  onMenu: (m: Menu) => void;
  openCompendium: () => void;
}) {
  const [closed, setClosed] = useState<Set<SectionId>>(new Set());
  function toggleLibrary(id: SectionId) {
    setClosed((c) => {
      const next = new Set(c);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  const tabs = tabsFor(proto.role);

  if (proto.collapsed) {
    return (
      <Flex sx={{ flexDirection: "column", width: 44, bg: "background", alignItems: "center", py: 1, borderLeft: "1px solid", borderColor: "muted" }}>
        <IconButton title="Open the sidebar" onClick={() => proto.setCollapsed(false)}>
          «
        </IconButton>
        {tabs.map((tab) => (
          <IconButton
            key={tab}
            title={tabLabel(tab)}
            onClick={() => {
              proto.setTab(tab);
              proto.setCollapsed(false);
            }}
          >
            <TabIcon tab={tab} />
          </IconButton>
        ))}
      </Flex>
    );
  }

  const sections = proto.dockSections.filter((s) => s.id !== "server");
  const server = proto.dockSections.find((s) => s.id === "server");
  // "Collapse all" shuts every library and folder, as Foundry's directories do
  function collapseAll() {
    for (const s of proto.dockSections) for (const f of s.folders) if (proto.isOpen(f.key)) proto.toggleFolder(f.key);
    setClosed(new Set(proto.dockSections.map((s) => s.id)));
  }

  return (
    <Flex sx={{ flexDirection: "column", width: 300, bg: "background", borderLeft: "1px solid", borderColor: "muted", minHeight: 0 }}>
      <Flex sx={{ alignItems: "center", borderBottom: "1px solid", borderColor: "muted" }}>
        {tabs.map((tab) => (
          <IconButton
            key={tab}
            title={tabLabel(tab)}
            onClick={() => proto.setTab(tab)}
            sx={{
              flexGrow: 1,
              borderRadius: 0,
              height: 40,
              color: proto.tab === tab ? "primary" : "text",
              borderBottom: "2px solid",
              borderColor: proto.tab === tab ? "primary" : "transparent",
            }}
          >
            <TabIcon tab={tab} />
          </IconButton>
        ))}
        <IconButton title="Collapse to the tab strip" onClick={() => proto.setCollapsed(true)}>
          »
        </IconButton>
      </Flex>
      <Text sx={{ px: 2, pt: 2, fontSize: 2 }}>{tabLabel(proto.tab)}</Text>
      {proto.tab === "scenes" ? (
        <Box sx={{ p: 2 }}>
          {scenes.map((scene) => (
            <Box key={scene} sx={{ py: 1, fontSize: 1 }}>
              {scene}
            </Box>
          ))}
          <Button sx={{ fontSize: 0, mt: 2, width: "100%" }} onClick={() => proto.actions.newScene("library")}>
            New scene from a Map asset
          </Button>
          <Button variant="secondary" sx={{ fontSize: 0, mt: 1, width: "100%" }} onClick={() => proto.actions.newScene("upload")}>
            New scene from an upload
          </Button>
        </Box>
      ) : (
        <>
          <Flex sx={{ gap: 1, px: 2, pt: 2 }}>
            <Button sx={{ fontSize: 0, flexGrow: 1, py: 1 }} onClick={proto.actions.upload}>
              Upload
            </Button>
            <Button variant="secondary" sx={{ fontSize: 0, flexGrow: 1, py: 1 }} onClick={proto.actions.newFolder}>
              New folder
            </Button>
            <Button variant="secondary" sx={{ fontSize: 0, flexGrow: 1, py: 1 }} onClick={() => proto.setManagerOpen(true)}>
              Manager
            </Button>
          </Flex>
          <Flex sx={{ gap: 1, px: 2, py: 2, alignItems: "center" }}>
            <Input
              value={proto.search}
              onChange={(e) => proto.setSearch(e.target.value)}
              placeholder="Search"
              sx={{ p: "2px 6px", fontSize: 1, flexGrow: 1 }}
            />
            <select style={selectStyle} value={proto.filter} onChange={(e: any) => proto.setFilter(e.target.value)}>
              {filterOptions(proto.role).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <IconButton
              title={proto.sort === "name" ? "Ordered by name; click for newest" : "Newest first; click for by name"}
              sx={{ fontSize: 0, width: 36 }}
              onClick={() => proto.setSort(proto.sort === "name" ? "newest" : "name")}
            >
              {proto.sort === "name" ? "A-Z" : "New"}
            </IconButton>
            <IconButton title="Collapse all folders" sx={{ fontSize: 1 }} onClick={collapseAll}>
              ⇈
            </IconButton>
          </Flex>
          <Box sx={{ flexGrow: 1, overflowY: "auto", minHeight: 0 }}>
            <Directory proto={proto} sections={sections} closed={closed} toggleLibrary={toggleLibrary} onMenu={onMenu} />
          </Box>
          {server && (
            <Flex
              onClick={openCompendium}
              title="Open the server set in its own window"
              sx={{
                alignItems: "center",
                gap: 2,
                px: 2,
                py: 2,
                cursor: "pointer",
                bg: libraryColour.server,
                fontSize: 1,
              }}
            >
              <Text sx={{ flexGrow: 1 }}>Server set (compendium)</Text>
              <Text variant="caption">{server.count} · read-only ↗</Text>
            </Flex>
          )}
          <Text variant="caption" sx={{ px: 2, py: 1 }}>
            Click to place, right-click for more
          </Text>
        </>
      )}
    </Flex>
  );
}

function Compendium({ proto, onClose, onMenu }: { proto: Proto; onClose: () => void; onMenu: (m: Menu) => void }) {
  const server = proto.dockSections.find((s) => s.id === "server");
  return (
    <Window title={`Server set: ${tabLabel(proto.tab)}`} initial={{ x: 140, y: 90 }} width={280} height={420} onClose={onClose}>
      <Text variant="caption" sx={{ px: 2, py: 1 }}>
        Read-only. Uses the sidebar's search.
      </Text>
      <Box sx={{ overflowY: "auto", flexGrow: 1 }}>
        {!server || server.count === 0 ? (
          <Text variant="caption" sx={{ px: 2 }}>
            Nothing here
          </Text>
        ) : (
          server.assets.map((asset) => <Row key={asset.id} proto={proto} asset={asset} depth={0} onMenu={onMenu} />)
        )}
      </Box>
    </Window>
  );
}

function Picker({ proto }: { proto: Proto }) {
  const sections = proto.managerSections;
  const [source, setSource] = useState<SectionId | null>(null);
  const [folder, setFolder] = useState<string | null>(null);
  const [view, setView] = useState<"tiles" | "list">("tiles");
  const section = sections.find((s) => s.id === source) ?? sections[0];
  const current = section?.folders.find((f) => f.name === folder);
  const types: (AssetType | "all")[] = ["all", ...typesFor(proto)];

  function pick(asset: Asset) {
    proto.setSelectedId(asset.id);
  }

  const items = current ? current.assets : section?.assets ?? [];
  return (
    <Window
      title="Asset Manager"
      initial={{ x: 150, y: 50 }}
      width={800}
      height={560}
      onClose={() => proto.setManagerOpen(false)}
    >
      <Flex sx={{ gap: 1, px: 2, pt: 2, alignItems: "center", flexWrap: "wrap" }}>
        {sections.map((s) => (
          <Box
            key={s.id}
            onClick={() => {
              setSource(s.id);
              setFolder(null);
            }}
            sx={{
              cursor: "pointer",
              px: 2,
              py: 1,
              fontSize: 1,
              borderRadius: "4px 4px 0 0",
              bg: s.id === section?.id ? libraryColour[s.id] : "transparent",
              border: "1px solid",
              borderColor: s.id === section?.id ? "border" : "transparent",
              borderBottom: "none",
            }}
          >
            {s.heading} <Text variant="caption">{s.count}</Text>
          </Box>
        ))}
      </Flex>
      <Flex sx={{ gap: 2, px: 2, py: 2, alignItems: "center", borderTop: "1px solid", borderColor: "border" }}>
        <Text sx={{ fontSize: 1 }}>
          <Box as="span" sx={{ cursor: "pointer", textDecoration: "underline" }} onClick={() => setFolder(null)}>
            {section?.heading ?? "Nothing"}
          </Box>
          {folder && ` › ${folder}`}
        </Text>
        <Box sx={{ flexGrow: 1 }} />
        <Input
          value={proto.search}
          onChange={(e) => proto.setSearch(e.target.value)}
          placeholder="Search"
          sx={{ width: 150, p: "2px 6px", fontSize: 1 }}
        />
        <select style={selectStyle} value={proto.filter} onChange={(e: any) => proto.setFilter(e.target.value)}>
          {filterOptions(proto.role).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select style={selectStyle} value={proto.managerType} onChange={(e: any) => proto.setManagerType(e.target.value)}>
          {types.map((t) => (
            <option key={t} value={t}>
              {t === "all" ? "All types" : typeLabels[t]}
            </option>
          ))}
        </select>
        <select style={selectStyle} value={proto.sort} onChange={(e: any) => proto.setSort(e.target.value)}>
          <option value="name">By name</option>
          <option value="newest">Newest</option>
        </select>
        <select style={selectStyle} value={view} onChange={(e: any) => setView(e.target.value)}>
          <option value="tiles">Tiles</option>
          <option value="list">List</option>
        </select>
      </Flex>
      <Flex sx={{ flexGrow: 1, minHeight: 0, borderTop: "1px solid", borderColor: "muted" }}>
        <Box sx={{ flexGrow: 1, overflowY: "auto", p: 2 }}>
          <Flex sx={{ flexWrap: view === "tiles" ? "wrap" : "nowrap", flexDirection: view === "tiles" ? "row" : "column", gap: view === "tiles" ? 2 : 0 }}>
            {!current &&
              section?.folders.map((f) =>
                view === "tiles" ? (
                  <Flex
                    key={f.key}
                    onClick={() => setFolder(f.name)}
                    sx={{ width: 88, height: 96, flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer", borderRadius: "4px", "&:hover": { bg: "muted" } }}
                  >
                    <Box sx={{ transform: "scale(2.4)", mb: 3 }}>
                      <FolderGlyph />
                    </Box>
                    <Text sx={{ fontSize: 0, textAlign: "center" }}>{f.name}</Text>
                  </Flex>
                ) : (
                  <Flex key={f.key} onClick={() => setFolder(f.name)} sx={{ gap: 2, py: 1, cursor: "pointer", fontSize: 1, "&:hover": { bg: "muted" } }}>
                    <FolderGlyph />
                    <Text sx={{ flexGrow: 1 }}>{f.name}</Text>
                    <Text variant="caption">{f.assets.length}</Text>
                  </Flex>
                )
              )}
            {items.map((asset) => {
              const active = proto.selected?.id === asset.id;
              return view === "tiles" ? (
                <Flex
                  key={asset.id}
                  onClick={() => pick(asset)}
                  sx={{ width: 88, flexDirection: "column", alignItems: "center", cursor: "pointer", borderRadius: "4px", p: 1, bg: active ? "highlight" : "transparent", "&:hover": { bg: active ? "highlight" : "muted" } }}
                >
                  <Thumb asset={asset} size={64} />
                  <Text sx={{ fontSize: 0, textAlign: "center", width: "100%", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {asset.name}
                  </Text>
                </Flex>
              ) : (
                <Flex
                  key={asset.id}
                  onClick={() => pick(asset)}
                  sx={{ gap: 2, py: "2px", alignItems: "center", cursor: "pointer", fontSize: 1, bg: active ? "highlight" : "transparent", "&:hover": { bg: active ? "highlight" : "muted" } }}
                >
                  <Thumb asset={asset} size={24} />
                  <Text sx={{ flexGrow: 1 }}>{asset.name}</Text>
                  <Text variant="caption">{typeLabels[asset.type]}</Text>
                  {asset.uploader && <Text variant="caption">{asset.uploader}</Text>}
                </Flex>
              );
            })}
            {section && section.count === 0 && <Text variant="caption">Nothing here</Text>}
          </Flex>
        </Box>
        <Box sx={{ width: 240, flexShrink: 0, borderLeft: "1px solid", borderColor: "muted", overflowY: "auto" }}>
          <AssetDetails proto={proto} size={140} />
        </Box>
      </Flex>
      <Flex sx={{ gap: 2, p: 2, alignItems: "center", borderTop: "1px solid", borderColor: "muted" }}>
        <Box sx={{ width: 220 }}>
          <QuotaBar proto={proto} />
        </Box>
        <Box sx={{ flexGrow: 1 }} />
        <Button sx={{ fontSize: 0 }} onClick={proto.actions.upload}>Upload</Button>
        <Button variant="secondary" sx={{ fontSize: 0 }} onClick={proto.actions.newFolder}>New folder</Button>
        {proto.role === "gm" && (
          <Button variant="secondary" sx={{ fontSize: 0 }} onClick={proto.actions.importBrowser}>
            Import browser library
          </Button>
        )}
      </Flex>
    </Window>
  );
}

function VariantF({
  proto,
  canvas,
  fullScreen,
}: {
  proto: Proto;
  canvas: ReactNode;
  fullScreen: boolean;
}) {
  const [menu, setMenu] = useState<Menu | null>(null);
  const [compendium, setCompendium] = useState(false);
  return (
    <Flex sx={{ flexGrow: 1, minWidth: 0, position: "relative" }}>
      <Flex sx={{ flexGrow: 1, minWidth: 0 }}>{canvas}</Flex>
      {!fullScreen && <Sidebar proto={proto} onMenu={setMenu} openCompendium={() => setCompendium(true)} />}
      {compendium && proto.tab !== "scenes" && (
        <Compendium proto={proto} onClose={() => setCompendium(false)} onMenu={setMenu} />
      )}
      {proto.managerOpen && <Picker proto={proto} />}
      {menu && <ContextMenu proto={proto} menu={menu} onClose={() => setMenu(null)} />}
    </Flex>
  );
}

export default VariantF;
