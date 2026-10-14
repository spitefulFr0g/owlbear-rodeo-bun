// PROTOTYPE variant H, F on a rail with tear-off palettes: a slim rail on the
// right edge holds the type tabs, the library filter as coloured swatches and
// a storage gauge. The panel slides out of the rail, pushing the map over, and
// back in when collapsed, so the rail is the tab strip. Any library or folder tears
// off into a floating palette in its library's colour, holding every type in
// it, to keep an encounter's assets at hand. The Asset Manager is a floating
// window with every library together under coloured headings.
import { ReactNode, useMemo, useState } from "react";
import { Box, Button, Flex, IconButton, Input, Text } from "theme-ui";

import { Asset, AssetType, scenes, typeLabels } from "./data";
import { buildSections, Filter, filterOptions, Proto, SectionId, tabLabel, tabsFor } from "./model";
import {
  AssetDetails,
  CanvasDrop,
  dragSource,
  FloatingWindow,
  FolderGlyph,
  formatQuota,
  libraryAccent,
  libraryColour,
  selectStyle,
  shieldImageDrop,
  StorageBreakdown,
  storageParts,
  TabIcon,
  Thumb,
  typesFor,
} from "./parts";

export const name = "Rail + tear-off palettes";

const RAIL = 52;
const PANEL = 320;

/** The swatch colour for a filter value; "room" is "My uploads" for a player */
function filterColour(proto: Proto, value: Filter) {
  if (value === "all") return "linear-gradient(135deg, hsl(265, 35%, 40%), hsl(200, 40%, 36%), hsl(150, 25%, 34%))";
  if (value === "room") return libraryColour[proto.role === "gm" ? "room" : "mine"];
  return libraryColour[value];
}

function tint(id: SectionId, alpha: number) {
  return libraryColour[id].replace("hsl(", "hsla(").replace(")", `, ${alpha})`);
}

function Swatches({ proto, vertical }: { proto: Proto; vertical: boolean }) {
  return (
    <Flex sx={{ flexDirection: vertical ? "column" : "row", gap: 1, alignItems: "center" }}>
      {filterOptions(proto.role).map((o) => {
        const active = proto.filter === o.value;
        return (
          <Flex
            key={o.value}
            title={`Show ${o.label === "All" ? "every library" : o.label}`}
            onClick={() => proto.setFilter(o.value)}
            style={{ background: filterColour(proto, o.value) }}
            sx={{
              width: vertical ? 30 : "auto",
              height: vertical ? 30 : 24,
              px: vertical ? 0 : 2,
              borderRadius: "6px",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              fontFamily: "body2",
              fontSize: 0,
              fontWeight: 600,
              border: "2px solid",
              borderColor: active ? "text" : "transparent",
              opacity: active ? 1 : 0.75,
            }}
          >
            {vertical ? o.label.split(" ").map((w) => w[0]).join("").slice(0, 2) : o.label}
          </Flex>
        );
      })}
    </Flex>
  );
}

/** A tall thin gauge that fills from the bottom, one colour per uploader */
function RailGauge({ proto }: { proto: Proto }) {
  const parts = storageParts(proto);
  const { used, of, label } = proto.quota;
  const share = Math.round((used / of) * 100);
  const detail = [
    `${label}: ${Math.round(used / 1024 / 1024)} MB of ${formatQuota(of)}`,
    ...parts.map((p) => `${p.label}: ${Math.round(p.bytes / 1024 / 1024)} MB`),
  ].join("\n");
  return (
    <Flex title={detail} sx={{ flexDirection: "column", alignItems: "center", gap: 1, cursor: "help" }}>
      <Flex
        sx={{
          width: 12,
          height: 110,
          bg: "muted",
          borderRadius: "6px",
          overflow: "hidden",
          flexDirection: "column-reverse",
          border: "1px solid",
          borderColor: "border",
        }}
      >
        {parts.map((p, i) => (
          <Box
            key={p.label}
            style={{ height: `${(p.bytes / of) * 100}%`, background: libraryAccent[p.id], opacity: 1 - i * 0.2 }}
          />
        ))}
      </Flex>
      <Text sx={{ fontFamily: "body2", fontSize: "10px" }}>{share}%</Text>
    </Flex>
  );
}

function Rail({ proto }: { proto: Proto }) {
  return (
    <Flex
      sx={{
        width: RAIL,
        flexShrink: 0,
        flexDirection: "column",
        alignItems: "center",
        gap: 1,
        py: 2,
        bg: "background",
        borderLeft: "1px solid",
        borderColor: "muted",
        zIndex: 2,
      }}
    >
      <IconButton
        title={proto.collapsed ? "Slide the panel out" : "Slide the panel away"}
        onClick={() => proto.setCollapsed(!proto.collapsed)}
      >
        {proto.collapsed ? "«" : "»"}
      </IconButton>
      {tabsFor(proto.role).map((tab) => {
        const active = proto.tab === tab;
        return (
          <IconButton
            key={tab}
            title={tabLabel(tab)}
            onClick={() => {
              // A second click on the open tab slides the panel away
              if (active && !proto.collapsed) proto.setCollapsed(true);
              else {
                proto.setTab(tab);
                proto.setCollapsed(false);
              }
            }}
            sx={{
              borderRadius: "8px",
              bg: active && !proto.collapsed ? "highlight" : "transparent",
              color: active ? "primary" : "text",
            }}
          >
            <TabIcon tab={tab} />
          </IconButton>
        );
      })}
      <Box sx={{ width: 28, height: 1, bg: "border", my: 1 }} />
      <Swatches proto={proto} vertical />
      <Box sx={{ flexGrow: 1 }} />
      <RailGauge proto={proto} />
      <IconButton title="Open the Asset Manager" onClick={() => proto.setManagerOpen(true)} sx={{ mt: 1 }}>
        ⊞
      </IconButton>
    </Flex>
  );
}

type Tear = { section: SectionId; folder: string | null };

function Row({ proto, asset }: { proto: Proto; asset: Asset }) {
  return (
    <Flex
      {...dragSource(asset)}
      title="Click or drag onto the map"
      onClick={() => proto.actions.place(asset)}
      sx={{ alignItems: "center", gap: 2, py: "3px", px: 2, cursor: "grab", fontSize: 1, "&:hover": { bg: "muted" } }}
    >
      <Thumb asset={asset} size={28} />
      <Text sx={{ flexGrow: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{asset.name}</Text>
      {asset.uploader && <Text variant="caption">{asset.uploader}</Text>}
    </Flex>
  );
}

function TearButton({ onClick }: { onClick: () => void }) {
  return (
    <Box
      as="span"
      title="Tear off into a floating palette"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      sx={{ cursor: "pointer", px: 1, borderRadius: "4px", fontSize: 1, opacity: 0.7, "&:hover": { opacity: 1, bg: "muted" } }}
    >
      ⇱
    </Box>
  );
}

function Panel({ proto, tear }: { proto: Proto; tear: (t: Tear) => void }) {
  const [closed, setClosed] = useState<Set<SectionId>>(new Set());
  function toggle(id: SectionId) {
    setClosed((c) => {
      const next = new Set(c);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  return (
    <Flex sx={{ flexDirection: "column", height: "100%", bg: "background", borderLeft: "1px solid", borderColor: "muted", boxShadow: "-8px 0 24px rgba(0,0,0,0.4)" }}>
      <Flex sx={{ alignItems: "center", px: 3, pt: 2, pb: 1 }}>
        <Text variant="heading" sx={{ fontSize: 3, flexGrow: 1 }}>
          {tabLabel(proto.tab)}
        </Text>
        {proto.tab !== "scenes" && (
          <>
            <IconButton title="Upload into this room" onClick={proto.actions.upload} sx={{ fontSize: 2 }}>
              ⤒
            </IconButton>
            <IconButton title="New folder" onClick={proto.actions.newFolder}>
              <FolderGlyph />
            </IconButton>
          </>
        )}
      </Flex>
      {proto.tab === "scenes" ? (
        <Box sx={{ px: 3 }}>
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
          <Flex sx={{ gap: 1, px: 3, pb: 2, alignItems: "center" }}>
            <Input
              value={proto.search}
              onChange={(e) => proto.setSearch(e.target.value)}
              placeholder={`Search ${tabLabel(proto.tab).toLowerCase()}s`}
              sx={{ p: "3px 8px", fontSize: 1, flexGrow: 1 }}
            />
            <IconButton
              title={proto.sort === "name" ? "Ordered by name; click for newest" : "Newest first; click for by name"}
              sx={{ fontSize: 0, width: 36 }}
              onClick={() => proto.setSort(proto.sort === "name" ? "newest" : "name")}
            >
              {proto.sort === "name" ? "A-Z" : "New"}
            </IconButton>
          </Flex>
          <Box sx={{ flexGrow: 1, overflowY: "auto", minHeight: 0, pb: 2 }}>
            {proto.dockSections.length === 0 && (
              <Text variant="caption" sx={{ px: 3 }}>
                Nothing matches
              </Text>
            )}
            {proto.dockSections.map((section) => {
              const open = !closed.has(section.id) || proto.searching;
              return (
                <Box key={section.id} sx={{ mb: 1 }}>
                  <Flex
                    onClick={() => toggle(section.id)}
                    style={{ background: libraryColour[section.id], borderLeftColor: libraryAccent[section.id] }}
                    sx={{ alignItems: "center", gap: 1, px: 2, py: 1, cursor: "pointer", fontSize: 1, borderLeft: "4px solid", position: "sticky", top: 0, zIndex: 1 }}
                  >
                    <Text sx={{ fontSize: 0, width: 12 }}>{open ? "▾" : "▸"}</Text>
                    <Text sx={{ flexGrow: 1 }}>{section.heading}</Text>
                    {section.readOnly && <Text variant="caption">read-only ·</Text>}
                    <Text variant="caption">{section.count}</Text>
                    <TearButton onClick={() => tear({ section: section.id, folder: null })} />
                  </Flex>
                  {open && (
                    <Box style={{ background: tint(section.id, 0.12) }}>
                      {section.count === 0 && (
                        <Text variant="caption" sx={{ px: 3, display: "block" }}>
                          Nothing here
                        </Text>
                      )}
                      {section.folders.map((folder) => {
                        const folderOpen = proto.isOpen(folder.key);
                        return (
                          <Box key={folder.key}>
                            <Flex
                              onClick={() => proto.toggleFolder(folder.key)}
                              sx={{ alignItems: "center", gap: 1, px: 2, py: "3px", cursor: "pointer", fontSize: 1, "&:hover": { bg: "muted" } }}
                            >
                              <FolderGlyph open={folderOpen} />
                              <Text sx={{ flexGrow: 1 }}>{folder.name}</Text>
                              <Text variant="caption">{folder.assets.length}</Text>
                              <TearButton onClick={() => tear({ section: section.id, folder: folder.name })} />
                            </Flex>
                            {folderOpen && (
                              <Box sx={{ ml: 3, borderLeft: "1px solid", borderColor: "border" }}>
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
                  )}
                </Box>
              );
            })}
          </Box>
          <Text variant="caption" sx={{ px: 3, py: 1, borderTop: "1px solid", borderColor: "muted" }}>
            Click or drag onto the map · ⇱ tears off a palette
          </Text>
        </>
      )}
    </Flex>
  );
}

/** A torn-off library or folder: every type in it, whatever the panel shows */
function Palette({ proto, tear, index, onClose }: { proto: Proto; tear: Tear; index: number; onClose: () => void }) {
  const section = useMemo(
    () =>
      buildSections(proto.assets, { role: proto.role, type: "all", filter: "all", search: "", sort: proto.sort }).find(
        (s) => s.id === tear.section
      ),
    [proto.assets, proto.role, proto.sort, tear.section]
  );
  const groups = !section
    ? []
    : tear.folder
    ? section.folders.filter((f) => f.name === tear.folder).map((f) => ({ title: null, assets: f.assets }))
    : [...section.folders.map((f) => ({ title: f.name, assets: f.assets })), { title: section.folders.length ? "Loose" : null, assets: section.assets }];
  const title = section ? (tear.folder ? `${section.heading} › ${tear.folder}` : section.heading) : "Gone";
  return (
    <FloatingWindow
      title={title}
      accent={libraryColour[tear.section]}
      initial={{ x: 90 + index * 28, y: 110 + index * 28 }}
      width={300}
      height={280}
      onClose={onClose}
    >
      <Box sx={{ overflowY: "auto", p: 2, flexGrow: 1 }} style={{ background: tint(tear.section, 0.15) }}>
        {groups.every((g) => g.assets.length === 0) && <Text variant="caption">Nothing here</Text>}
        {groups
          .filter((g) => g.assets.length > 0)
          .map((g) => (
            <Box key={g.title ?? "all"} sx={{ mb: 2 }}>
              {g.title && (
                <Text variant="caption" sx={{ display: "block", mb: 1 }}>
                  {g.title}
                </Text>
              )}
              <Flex sx={{ flexWrap: "wrap", gap: 1 }}>
                {g.assets.map((asset) => (
                  <Flex
                    key={asset.id}
                    {...dragSource(asset)}
                    onClick={() => proto.actions.place(asset)}
                    title={`${asset.name} (${typeLabels[asset.type]}): click or drag onto the map`}
                    sx={{ width: 62, flexDirection: "column", alignItems: "center", cursor: "grab", borderRadius: "4px", p: "2px", "&:hover": { bg: "muted" } }}
                  >
                    <Thumb asset={asset} size={44} />
                    <Text sx={{ fontFamily: "body2", fontSize: "10px", width: "100%", textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {asset.name}
                    </Text>
                  </Flex>
                ))}
              </Flex>
            </Box>
          ))}
      </Box>
    </FloatingWindow>
  );
}

function Manager({ proto }: { proto: Proto }) {
  const types: (AssetType | "all")[] = ["all", ...typesFor(proto)];
  return (
    <FloatingWindow title="Asset Manager" initial={{ x: 120, y: 60 }} width={820} height={560} onClose={() => proto.setManagerOpen(false)}>
      <Flex sx={{ gap: 2, px: 2, py: 2, alignItems: "center", flexWrap: "wrap", borderBottom: "1px solid", borderColor: "muted" }}>
        <Input
          value={proto.search}
          onChange={(e) => proto.setSearch(e.target.value)}
          placeholder="Search every library"
          sx={{ width: 190, p: "3px 8px", fontSize: 1 }}
        />
        <Swatches proto={proto} vertical={false} />
        <Box sx={{ flexGrow: 1 }} />
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
      </Flex>
      <Flex sx={{ flexGrow: 1, minHeight: 0 }}>
        <Box sx={{ flexGrow: 1, overflowY: "auto" }}>
          {proto.managerSections.map((section) => (
            <Box key={section.id}>
              <Flex
                style={{ background: libraryColour[section.id], borderLeftColor: libraryAccent[section.id] }}
                sx={{ alignItems: "center", gap: 2, px: 2, py: 1, fontSize: 1, borderLeft: "4px solid", position: "sticky", top: 0, zIndex: 1 }}
              >
                <Text sx={{ flexGrow: 1 }}>{section.heading}</Text>
                {section.readOnly && <Text variant="caption">read-only</Text>}
                <Text variant="caption">{section.count}</Text>
              </Flex>
              <Box sx={{ p: 2 }} style={{ background: tint(section.id, 0.1) }}>
                {section.count === 0 && <Text variant="caption">Nothing here</Text>}
                {section.folders.map((folder) => {
                  const open = proto.isOpen(folder.key);
                  return (
                    <Box key={folder.key} sx={{ mb: 1 }}>
                      <Flex onClick={() => proto.toggleFolder(folder.key)} sx={{ alignItems: "center", gap: 1, cursor: "pointer", fontSize: 1, py: 1 }}>
                        <FolderGlyph open={open} />
                        <Text>{folder.name}</Text>
                        <Text variant="caption">{folder.assets.length}</Text>
                      </Flex>
                      {open && <Tiles proto={proto} assets={folder.assets} />}
                    </Box>
                  );
                })}
                <Tiles proto={proto} assets={section.assets} />
              </Box>
            </Box>
          ))}
        </Box>
        <Box sx={{ width: 240, flexShrink: 0, borderLeft: "1px solid", borderColor: "muted", overflowY: "auto" }}>
          <AssetDetails proto={proto} size={130} />
        </Box>
      </Flex>
      <Flex sx={{ gap: 2, p: 2, alignItems: "center", borderTop: "1px solid", borderColor: "muted" }}>
        <Box sx={{ width: 320 }}>
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

function Tiles({ proto, assets }: { proto: Proto; assets: Asset[] }) {
  return (
    <Flex sx={{ flexWrap: "wrap", gap: 2, mb: 1 }}>
      {assets.map((asset) => {
        const active = proto.selected?.id === asset.id;
        return (
          <Flex
            key={asset.id}
            {...dragSource(asset)}
            onClick={() => proto.setSelectedId(asset.id)}
            sx={{ width: 80, flexDirection: "column", alignItems: "center", cursor: "pointer", borderRadius: "4px", p: 1, bg: active ? "highlight" : "transparent", "&:hover": { bg: active ? "highlight" : "muted" } }}
          >
            <Thumb asset={asset} size={58} />
            <Text sx={{ fontSize: 0, textAlign: "center", width: "100%", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{asset.name}</Text>
          </Flex>
        );
      })}
    </Flex>
  );
}

function VariantH({ proto, canvas, fullScreen }: { proto: Proto; canvas: ReactNode; fullScreen: boolean }) {
  const [tears, setTears] = useState<(Tear & { key: string })[]>([]);
  function tear(t: Tear) {
    const key = `${t.section}/${t.folder ?? ""}`;
    setTears((all) => (all.some((x) => x.key === key) ? all : [...all, { ...t, key }]));
    proto.actions.say(`Tore off ${t.folder ?? "the library"} into a palette`);
  }
  return (
    <Flex sx={{ flexGrow: 1, minWidth: 0, position: "relative" }} {...shieldImageDrop}>
      <CanvasDrop proto={proto}>{canvas}</CanvasDrop>
      {!fullScreen && (
        <>
          {/* The panel slides out of the rail and pushes the map, so the map's tools stay in view */}
          <Box
            style={{ width: proto.collapsed ? 0 : PANEL }}
            sx={{ flexShrink: 0, overflow: "hidden", transition: "width 180ms ease-out" }}
          >
            <Box sx={{ width: PANEL, height: "100%" }}>
              <Panel proto={proto} tear={tear} />
            </Box>
          </Box>
          <Rail proto={proto} />
        </>
      )}
      {tears.map((t, i) => (
        <Palette key={t.key} proto={proto} tear={t} index={i} onClose={() => setTears((all) => all.filter((x) => x.key !== t.key))} />
      ))}
      {proto.managerOpen && <Manager proto={proto} />}
    </Flex>
  );
}

export default VariantH;
