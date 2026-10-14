// PROTOTYPE variant J, F as a binder with lanes: the dock is a side panel that
// widens out of its tab strip and pushes the map over. Coloured binder tabs
// stick out of its edge, one per library, and jump to that library's heading.
// Drag an asset onto the map to place it, or onto a folder to file it. A ring
// in the header shows storage. The Asset Manager is a floating window with one
// lane per library side by side; dragging between lanes moves an asset and
// dragging onto a folder files it.
import { ReactNode, useRef, useState } from "react";
import { Box, Button, Flex, IconButton, Input, Text } from "theme-ui";

import { Asset, AssetType, Library, scenes, typeLabels } from "./data";
import { filterOptions, Proto, SectionId, sectionHeadings, tabLabel, tabsFor } from "./model";
import {
  CanvasDrop,
  dragSource,
  dropTarget,
  FloatingWindow,
  FolderGlyph,
  FolderSelect,
  formatQuota,
  libraryAccent,
  libraryColour,
  moveLabel,
  selectStyle,
  shieldImageDrop,
  StorageBreakdown,
  storageParts,
  TabIcon,
  Thumb,
  TypeSelect,
  typesFor,
  whereLabel,
} from "./parts";

export const name = "Binder tabs + library lanes";

const OPEN = 310;
const SHUT = 44;

function libraryOf(id: SectionId): Library | null {
  if (id === "server") return null;
  return id === "account" ? "account" : "room";
}

/** Files or moves an asset dropped on a library or one of its folders */
function dropInto(proto: Proto, id: string, section: SectionId, folder: string | null) {
  const asset = proto.assets.find((x) => x.id === id);
  if (!asset) return;
  const to = libraryOf(section);
  if (asset.library === "server") return proto.actions.say("The server set is read-only; drag it onto the map instead");
  if (!to) return proto.actions.say("Nothing goes into the server set");
  if (!proto.mayEdit(asset)) return proto.actions.say("Only its uploader or the GM can change it");
  if (asset.library === to) {
    // A player's upload stays theirs, and the GM's own never joins "From players"
    if ((section === "players") !== !!asset.uploader && proto.role === "gm") {
      return proto.actions.say("Uploads stay with whoever uploaded them");
    }
    if ((asset.folder ?? null) !== folder) proto.actions.fileIn(asset, folder);
    return;
  }
  if (proto.role === "gm") proto.actions.move(asset);
}

/** Highlights whichever drop target a drag is over */
function useDropHover() {
  const [over, setOver] = useState<string | null>(null);
  return {
    over,
    props: (key: string, onDrop: (id: string) => void) => {
      const target = dropTarget((id) => {
        setOver(null);
        onDrop(id);
      });
      return {
        ...target,
        onDragEnter: () => setOver(key),
        onDragLeave: (e: any) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setOver((o) => (o === key ? null : o));
        },
      };
    },
  };
}

function StorageRing({ proto }: { proto: Proto }) {
  const [hover, setHover] = useState(false);
  const parts = storageParts(proto);
  const { used, of } = proto.quota;
  let at = 0;
  const stops = parts.map((p, i) => {
    const from = at;
    at += (p.bytes / of) * 100;
    const colour = libraryAccent[p.id];
    return `${colour} ${from}% ${at}%`.replace(")", `, ${1 - i * 0.2})`).replace("hsl(", "hsla(");
  });
  const ring = `conic-gradient(${[...stops, `rgba(255,255,255,0.12) ${at}% 100%`].join(", ")})`;
  return (
    <Box sx={{ position: "relative" }} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <Flex
        style={{ background: ring }}
        sx={{ width: 34, height: 34, borderRadius: "50%", alignItems: "center", justifyContent: "center", cursor: "help" }}
      >
        <Flex sx={{ width: 24, height: 24, borderRadius: "50%", bg: "background", alignItems: "center", justifyContent: "center", fontFamily: "body2", fontSize: "9px" }}>
          {Math.round((used / of) * 100)}%
        </Flex>
      </Flex>
      {hover && (
        <Box sx={{ position: "absolute", right: 0, top: 40, width: 280, p: 2, bg: "background", border: "1px solid", borderColor: "border", borderRadius: "6px", zIndex: 5, boxShadow: "0 4px 16px rgba(0,0,0,0.5)" }}>
          <StorageBreakdown proto={proto} />
          <Text variant="caption" sx={{ display: "block", mt: 1 }}>
            {Math.round((of - used) / 1024 / 1024)} MB left of {formatQuota(of)}
          </Text>
        </Box>
      )}
    </Box>
  );
}

function BinderTabs({ proto, jump }: { proto: Proto; jump: (id: SectionId) => void }) {
  const ids: SectionId[] = proto.role === "gm" ? ["room", "players", "account", "server"] : ["mine", "server"];
  return (
    <Flex sx={{ position: "absolute", left: -26, top: 96, flexDirection: "column", gap: "3px", zIndex: 3 }}>
      {ids.map((id) => (
        <Box
          key={id}
          title={`Jump to ${sectionHeadings[id]}`}
          onClick={() => jump(id)}
          style={{ background: libraryColour[id], borderLeftColor: libraryAccent[id] }}
          sx={{
            width: 26,
            py: 2,
            cursor: "pointer",
            borderRadius: "6px 0 0 6px",
            borderLeft: "3px solid",
            writingMode: "vertical-rl",
            transform: "rotate(180deg)",
            fontFamily: "body2",
            fontSize: 0,
            textAlign: "center",
            boxShadow: "-2px 2px 6px rgba(0,0,0,0.4)",
            "&:hover": { width: 30 },
          }}
        >
          {sectionHeadings[id]}
        </Box>
      ))}
    </Flex>
  );
}

function Row({ proto, asset }: { proto: Proto; asset: Asset }) {
  return (
    <Flex
      {...dragSource(asset)}
      title="Drag onto the map, or onto a folder to file it. Click to place."
      onClick={() => proto.actions.place(asset)}
      sx={{ alignItems: "center", gap: 2, py: "3px", px: 2, cursor: "grab", fontSize: 1, borderRadius: "4px", "&:hover": { bg: "muted" } }}
    >
      <Thumb asset={asset} size={32} />
      <Text sx={{ flexGrow: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{asset.name}</Text>
      {asset.uploader && <Text variant="caption">{asset.uploader}</Text>}
    </Flex>
  );
}

function Dock({ proto }: { proto: Proto }) {
  const headings = useRef<Partial<Record<SectionId, HTMLDivElement | null>>>({});
  const drop = useDropHover();

  function jump(id: SectionId) {
    proto.setCollapsed(false);
    if (proto.tab === "scenes") proto.setTab(proto.role === "gm" ? "map" : "character");
    if (!proto.dockSections.some((s) => s.id === id)) proto.setFilter("all");
    // Waits for the panel to open and the heading to render
    setTimeout(() => headings.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" }), 200);
  }

  const tabs = tabsFor(proto.role);
  return (
    <Box
      style={{ width: proto.collapsed ? SHUT : OPEN }}
      // The margin keeps a gutter for the binder tabs so they don't cover the map's controls
      sx={{ position: "relative", flexShrink: 0, ml: "26px", transition: "width 200ms ease-out", bg: "background", borderLeft: "1px solid", borderColor: "border" }}
    >
      <BinderTabs proto={proto} jump={jump} />
      {proto.collapsed ? (
        <Flex sx={{ flexDirection: "column", alignItems: "center", py: 1 }}>
          <IconButton title="Open the dock" onClick={() => proto.setCollapsed(false)}>
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
              sx={{ color: proto.tab === tab ? "primary" : "text" }}
            >
              <TabIcon tab={tab} />
            </IconButton>
          ))}
        </Flex>
      ) : (
        <Flex sx={{ flexDirection: "column", height: "100%", width: OPEN, overflow: "hidden" }}>
          <Flex sx={{ alignItems: "center", gap: 2, px: 2, pt: 2 }}>
            <IconButton title="Shrink to the tab strip" onClick={() => proto.setCollapsed(true)}>
              »
            </IconButton>
            <Text variant="heading" sx={{ fontSize: 3, flexGrow: 1 }}>
              {tabLabel(proto.tab)}
            </Text>
            <StorageRing proto={proto} />
          </Flex>
          <Flex sx={{ px: 2, pt: 2, gap: "2px" }}>
            {tabs.map((tab) => {
              const active = proto.tab === tab;
              return (
                <Flex
                  key={tab}
                  onClick={() => proto.setTab(tab)}
                  title={tabLabel(tab)}
                  sx={{
                    flex: 1,
                    flexDirection: "column",
                    alignItems: "center",
                    cursor: "pointer",
                    py: 1,
                    borderRadius: "6px",
                    bg: active ? "highlight" : "transparent",
                    color: active ? "primary" : "text",
                    "&:hover": { bg: active ? "highlight" : "muted" },
                  }}
                >
                  <TabIcon tab={tab} />
                  <Text sx={{ fontFamily: "body2", fontSize: "9px" }}>{tabLabel(tab)}</Text>
                </Flex>
              );
            })}
          </Flex>
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
              <Flex sx={{ gap: 1, p: 2, alignItems: "center" }}>
                <Input
                  value={proto.search}
                  onChange={(e) => proto.setSearch(e.target.value)}
                  placeholder="Search"
                  sx={{ p: "3px 8px", fontSize: 1, flexGrow: 1 }}
                />
                <select style={selectStyle} value={proto.filter} onChange={(e: any) => proto.setFilter(e.target.value)}>
                  {filterOptions(proto.role).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <select style={selectStyle} value={proto.sort} onChange={(e: any) => proto.setSort(e.target.value)}>
                  <option value="name">A-Z</option>
                  <option value="newest">New</option>
                </select>
              </Flex>
              <Box sx={{ flexGrow: 1, overflowY: "auto", minHeight: 0, px: 2 }}>
                {proto.dockSections.length === 0 && <Text variant="caption">Nothing matches</Text>}
                {proto.dockSections.map((section) => (
                  <Box
                    key={section.id}
                    sx={{ mb: 2, borderRadius: "8px", overflow: "hidden", border: "1px solid", borderColor: "muted" }}
                    {...drop.props(section.id, (id) => dropInto(proto, id, section.id, null))}
                  >
                    <Flex
                      ref={(el: HTMLDivElement | null) => (headings.current[section.id] = el)}
                      style={{ background: libraryColour[section.id], outline: drop.over === section.id ? `2px solid ${libraryAccent[section.id]}` : undefined }}
                      sx={{ alignItems: "center", gap: 2, px: 2, py: 1, fontSize: 1 }}
                    >
                      <Text sx={{ flexGrow: 1 }}>{section.heading}</Text>
                      {section.readOnly && <Text variant="caption">read-only</Text>}
                      <Text variant="caption">{section.count}</Text>
                    </Flex>
                    <Box sx={{ p: 1 }}>
                      {section.count === 0 && (
                        <Text variant="caption" sx={{ px: 1 }}>
                          Nothing here
                        </Text>
                      )}
                      {section.folders.map((folder) => {
                        const open = proto.isOpen(folder.key);
                        const over = drop.over === folder.key;
                        return (
                          <Box key={folder.key} {...drop.props(folder.key, (id) => dropInto(proto, id, section.id, folder.name))}>
                            <Flex
                              onClick={() => proto.toggleFolder(folder.key)}
                              style={{ outline: over ? `2px dashed ${libraryAccent[section.id]}` : undefined }}
                              sx={{ alignItems: "center", gap: 1, px: 1, py: "3px", cursor: "pointer", fontSize: 1, borderRadius: "4px", "&:hover": { bg: "muted" } }}
                            >
                              <Box style={{ color: libraryAccent[section.id] }}>
                                <FolderGlyph open={open} />
                              </Box>
                              <Text sx={{ flexGrow: 1 }}>{folder.name}</Text>
                              <Text variant="caption">{over ? "drop to file here" : folder.assets.length}</Text>
                            </Flex>
                            {open && (
                              <Box sx={{ pl: 3 }}>
                                {folder.assets.map((asset) => (
                                  <Row key={asset.id} proto={proto} asset={asset} />
                                ))}
                              </Box>
                            )}
                          </Box>
                        );
                      })}
                      {section.assets.map((asset) => (
                        <Row key={asset.id} proto={proto} asset={asset} />
                      ))}
                    </Box>
                  </Box>
                ))}
              </Box>
              <Flex sx={{ gap: 1, p: 2, borderTop: "1px solid", borderColor: "muted" }}>
                <Button sx={{ fontSize: 0, flexGrow: 1, py: 1 }} onClick={proto.actions.upload}>
                  Upload
                </Button>
                <Button variant="secondary" sx={{ fontSize: 0, flexGrow: 1, py: 1 }} onClick={proto.actions.newFolder}>
                  New folder
                </Button>
                <Button variant="secondary" sx={{ fontSize: 0, flexGrow: 1, py: 1 }} onClick={() => proto.setManagerOpen(true)}>
                  Lanes ↗
                </Button>
              </Flex>
            </>
          )}
        </Flex>
      )}
    </Box>
  );
}

function Lanes({ proto }: { proto: Proto }) {
  const drop = useDropHover();
  const types: (AssetType | "all")[] = ["all", ...typesFor(proto)];
  const asset = proto.selected;
  const move = asset ? moveLabel(proto, asset) : null;

  function tile(a: Asset) {
    const active = proto.selected?.id === a.id;
    return (
      <Flex
        key={a.id}
        {...dragSource(a)}
        onClick={() => proto.setSelectedId(a.id)}
        title="Drag onto a folder or another library, or onto the map"
        sx={{ flexDirection: "column", alignItems: "center", cursor: "grab", borderRadius: "4px", p: 1, bg: active ? "highlight" : "transparent", "&:hover": { bg: active ? "highlight" : "muted" } }}
      >
        <Thumb asset={a} size={56} />
        <Text sx={{ fontFamily: "body2", fontSize: "10px", width: "100%", textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</Text>
      </Flex>
    );
  }

  return (
    <FloatingWindow title="Asset Manager" initial={{ x: 40, y: 50 }} width={980} height={590} onClose={() => proto.setManagerOpen(false)}>
      <Flex sx={{ gap: 2, p: 2, alignItems: "center", borderBottom: "1px solid", borderColor: "muted" }}>
        <Input
          value={proto.search}
          onChange={(e) => proto.setSearch(e.target.value)}
          placeholder="Search every library"
          sx={{ width: 200, p: "3px 8px", fontSize: 1 }}
        />
        <select style={selectStyle} value={proto.filter} onChange={(e: any) => proto.setFilter(e.target.value)}>
          {filterOptions(proto.role).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <Flex sx={{ gap: 1 }}>
          {types.map((t) => (
            <Box
              key={t}
              onClick={() => proto.setManagerType(t)}
              sx={{ cursor: "pointer", fontFamily: "body2", fontSize: 0, px: 2, borderRadius: 999, border: "1px solid", borderColor: proto.managerType === t ? "primary" : "border", color: proto.managerType === t ? "primary" : "text" }}
            >
              {t === "all" ? "All types" : typeLabels[t]}
            </Box>
          ))}
        </Flex>
        <Box sx={{ flexGrow: 1 }} />
        <select style={selectStyle} value={proto.sort} onChange={(e: any) => proto.setSort(e.target.value)}>
          <option value="name">By name</option>
          <option value="newest">Newest</option>
        </select>
      </Flex>
      <Flex sx={{ flexGrow: 1, minHeight: 0, gap: 2, p: 2, overflowX: "auto" }}>
        {proto.managerSections.map((section) => {
          const over = drop.over === section.id;
          return (
            <Flex
              key={section.id}
              {...drop.props(section.id, (id) => dropInto(proto, id, section.id, null))}
              style={{ outline: over ? `2px solid ${libraryAccent[section.id]}` : undefined }}
              sx={{ flex: "1 0 220px", flexDirection: "column", minHeight: 0, borderRadius: "8px", overflow: "hidden", border: "1px solid", borderColor: "muted" }}
            >
              <Flex style={{ background: libraryColour[section.id] }} sx={{ alignItems: "center", gap: 2, px: 2, py: 1, fontSize: 1 }}>
                <Text sx={{ flexGrow: 1 }}>{section.heading}</Text>
                <Text variant="caption">{section.readOnly ? "read-only · " : ""}{section.count}</Text>
              </Flex>
              <Box sx={{ flexGrow: 1, overflowY: "auto", p: 1 }}>
                {over && !section.readOnly && (
                  <Text variant="caption" sx={{ display: "block", textAlign: "center" }}>
                    Drop to put it here, top level
                  </Text>
                )}
                {section.count === 0 && <Text variant="caption">Nothing here</Text>}
                {section.folders.map((folder) => {
                  const open = proto.isOpen(folder.key);
                  const overFolder = drop.over === folder.key;
                  return (
                    <Box key={folder.key} sx={{ mb: 1 }} {...drop.props(folder.key, (id) => dropInto(proto, id, section.id, folder.name))}>
                      <Flex
                        onClick={() => proto.toggleFolder(folder.key)}
                        style={{ outline: overFolder ? `2px dashed ${libraryAccent[section.id]}` : undefined }}
                        sx={{ alignItems: "center", gap: 1, px: 1, py: "3px", cursor: "pointer", fontSize: 1, borderRadius: "4px", bg: "muted" }}
                      >
                        <Box style={{ color: libraryAccent[section.id] }}>
                          <FolderGlyph open={open} />
                        </Box>
                        <Text sx={{ flexGrow: 1 }}>{folder.name}</Text>
                        <Text variant="caption">{folder.assets.length}</Text>
                      </Flex>
                      {open && <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", pl: 1 }}>{folder.assets.map(tile)}</Box>}
                    </Box>
                  );
                })}
                <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>{section.assets.map(tile)}</Box>
              </Box>
            </Flex>
          );
        })}
      </Flex>
      {asset && (
        <Flex sx={{ gap: 2, px: 2, py: 1, alignItems: "center", borderTop: "1px solid", borderColor: "muted", bg: "muted", flexWrap: "wrap" }}>
          <Thumb asset={asset} size={36} />
          <Box sx={{ mr: 2 }}>
            <Text sx={{ display: "block", fontSize: 1 }}>{asset.name}</Text>
            <Text variant="caption">{whereLabel(asset)}</Text>
          </Box>
          {proto.mayEdit(asset) ? (
            <>
              <Button variant="secondary" sx={{ fontSize: 0 }} onClick={() => proto.actions.rename(asset)}>
                Rename…
              </Button>
              <TypeSelect proto={proto} asset={asset} />
              <FolderSelect proto={proto} asset={asset} />
              {move && (
                <Button variant="secondary" sx={{ fontSize: 0 }} onClick={() => proto.actions.move(asset)}>
                  {move}
                </Button>
              )}
              <Button sx={{ fontSize: 0, bg: "error" }} onClick={() => proto.actions.remove(asset)}>
                Delete
              </Button>
            </>
          ) : (
            <Text variant="caption">{asset.library === "server" ? "The server set is read-only" : "Only its uploader or the GM can change it"}</Text>
          )}
          <Box sx={{ flexGrow: 1 }} />
          <IconButton title="Unpick" onClick={() => proto.setSelectedId(null)}>
            ✕
          </IconButton>
        </Flex>
      )}
      <Flex sx={{ gap: 2, p: 2, alignItems: "center", borderTop: "1px solid", borderColor: "muted" }}>
        <Box sx={{ width: 380 }}>
          <StorageBreakdown proto={proto} />
        </Box>
        <Box sx={{ flexGrow: 1 }} />
        <Button sx={{ fontSize: 0 }} onClick={proto.actions.upload}>
          Upload
        </Button>
        <Button variant="secondary" sx={{ fontSize: 0 }} onClick={proto.actions.newFolder}>
          New folder
        </Button>
        {proto.role === "gm" && (
          <Button variant="secondary" sx={{ fontSize: 0 }} onClick={proto.actions.importBrowser}>
            Import browser library
          </Button>
        )}
      </Flex>
    </FloatingWindow>
  );
}

function VariantJ({ proto, canvas, fullScreen }: { proto: Proto; canvas: ReactNode; fullScreen: boolean }) {
  return (
    <Flex sx={{ flexGrow: 1, minWidth: 0, position: "relative" }} {...shieldImageDrop}>
      <CanvasDrop proto={proto}>{canvas}</CanvasDrop>
      {!fullScreen && <Dock proto={proto} />}
      {proto.managerOpen && <Lanes proto={proto} />}
    </Flex>
  );
}

export default VariantJ;
