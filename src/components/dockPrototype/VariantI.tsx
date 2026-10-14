// PROTOTYPE variant I, F as a frosted overlay with cards: the dock is a
// see-through panel that slides in from the left over the map, beside a strip
// of type tabs it collapses to. The colour key doubles as the library filter.
// Assets are tiles with a stripe in their library's colour, and folders are
// tiles that open in place. Any asset opens as a floating inspector card, and
// several can stay open at once. The Asset Manager is a floating table that
// edits many assets at a time. Storage shows as a bar split by uploader.
import { ReactNode, useState } from "react";
import { Box, Button, Flex, IconButton, Input, Text } from "theme-ui";

import { Asset, AssetType, me, scenes, typeLabels } from "./data";
import { filterOptions, formatBytes, Proto, Section, SectionId, tabLabel, tabsFor } from "./model";
import {
  AssetDetails,
  CanvasDrop,
  dragSource,
  FloatingWindow,
  FolderGlyph,
  libraryAccent,
  libraryColour,
  moveLabel,
  selectStyle,
  shieldImageDrop,
  StorageBreakdown,
  TabIcon,
  Thumb,
  typesFor,
} from "./parts";

export const name = "Frosted overlay + inspector cards";

const STRIP = 44;
const PANEL = 340;
const glass = "hsla(230, 25%, 13%, 0.82)";

function sectionOf(asset: Asset, proto: Proto): SectionId {
  if (asset.library === "server") return "server";
  if (asset.library === "account") return "account";
  if (asset.uploader) return proto.role === "gm" ? "players" : asset.uploader === me ? "mine" : "players";
  return "room";
}

/** The colour key, which is also the library filter */
function ColourKey({ proto }: { proto: Proto }) {
  const colour = (value: string): string =>
    value === "room" ? libraryAccent[proto.role === "gm" ? "room" : "mine"] : value === "all" ? "hsl(0, 0%, 85%)" : libraryAccent[value as SectionId];
  return (
    <Flex sx={{ gap: 1, flexWrap: "wrap" }}>
      {filterOptions(proto.role).map((o) => {
        const active = proto.filter === o.value;
        return (
          <Flex
            key={o.value}
            onClick={() => proto.setFilter(o.value)}
            title={o.value === "all" ? "Show every library" : `Show only ${o.label}`}
            style={{ borderColor: colour(o.value), background: active ? colour(o.value) : "transparent", color: active ? "#111" : undefined }}
            sx={{ alignItems: "center", gap: 1, px: 2, borderRadius: 999, border: "1px solid", cursor: "pointer", fontFamily: "body2", fontSize: 0, py: "1px" }}
          >
            {!active && <Box style={{ width: 8, height: 8, borderRadius: 4, background: colour(o.value) }} />}
            {o.label}
          </Flex>
        );
      })}
      {proto.role === "gm" && (
        <Flex sx={{ alignItems: "center", gap: 1, px: 1, fontFamily: "body2", fontSize: 0, opacity: 0.8 }} title="Players' uploads into this room">
          <Box style={{ width: 8, height: 8, borderRadius: 4, background: libraryAccent.players }} />
          from players
        </Flex>
      )}
    </Flex>
  );
}

function Tile({ proto, asset, onInspect }: { proto: Proto; asset: Asset; onInspect: (a: Asset) => void }) {
  const id = sectionOf(asset, proto);
  return (
    <Box
      {...dragSource(asset)}
      onClick={() => proto.actions.place(asset)}
      title={`${asset.name}: click or drag onto the map`}
      sx={{
        position: "relative",
        borderRadius: "6px",
        overflow: "hidden",
        cursor: "grab",
        bg: "muted",
        borderBottom: "4px solid",
        "&:hover .inspect": { opacity: 1 },
        "&:hover": { boxShadow: "0 0 0 2px rgba(255,255,255,0.4)" },
      }}
      style={{ borderBottomColor: libraryAccent[id] }}
    >
      <Flex sx={{ justifyContent: "center", pt: 1 }}>
        <Thumb asset={asset} size={72} />
      </Flex>
      <Text sx={{ display: "block", fontFamily: "body2", fontSize: 0, px: 1, py: "2px", textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {asset.name}
      </Text>
      <Flex
        className="inspect"
        title="Open an inspector card"
        onClick={(e) => {
          e.stopPropagation();
          onInspect(asset);
        }}
        sx={{ position: "absolute", top: "3px", right: "3px", width: 20, height: 20, borderRadius: 10, bg: "background", alignItems: "center", justifyContent: "center", fontSize: 0, opacity: 0, cursor: "pointer" }}
      >
        i
      </Flex>
    </Box>
  );
}

function grid(children: ReactNode) {
  return <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 2, px: 2, pb: 2 }}>{children}</Box>;
}

type Drill = { section: SectionId; folder: string } | null;

function Panel({ proto, onInspect }: { proto: Proto; onInspect: (a: Asset) => void }) {
  const [drill, setDrill] = useState<Drill>(null);
  const drilled = drill && !proto.searching ? proto.dockSections.find((s) => s.id === drill.section) : undefined;
  const drilledFolder = drilled?.folders.find((f) => f.name === drill?.folder);

  function sectionBody(section: Section) {
    if (section.count === 0) {
      return (
        <Text variant="caption" sx={{ px: 3, pb: 2, display: "block" }}>
          Nothing here
        </Text>
      );
    }
    // While searching, folders open in place so every hit shows
    if (proto.searching) {
      return (
        <>
          {section.folders.map((f) => (
            <Box key={f.key}>
              <Text variant="caption" sx={{ px: 2, display: "block" }}>
                <FolderGlyph open /> {f.name}
              </Text>
              {grid(f.assets.map((a) => <Tile key={a.id} proto={proto} asset={a} onInspect={onInspect} />))}
            </Box>
          ))}
          {grid(section.assets.map((a) => <Tile key={a.id} proto={proto} asset={a} onInspect={onInspect} />))}
        </>
      );
    }
    return grid(
      <>
        {section.folders.map((f) => (
          <Flex
            key={f.key}
            onClick={() => setDrill({ section: section.id, folder: f.name })}
            style={{ background: libraryColour[section.id] }}
            sx={{ flexDirection: "column", alignItems: "center", justifyContent: "center", borderRadius: "6px", cursor: "pointer", minHeight: 100, "&:hover": { boxShadow: "0 0 0 2px rgba(255,255,255,0.4)" } }}
          >
            <Box sx={{ transform: "scale(2.2)", mb: 3 }}>
              <FolderGlyph />
            </Box>
            <Text sx={{ fontFamily: "body2", fontSize: 0, textAlign: "center", px: 1 }}>{f.name}</Text>
            <Text variant="caption">{f.assets.length}</Text>
          </Flex>
        ))}
        {section.assets.map((a) => (
          <Tile key={a.id} proto={proto} asset={a} onInspect={onInspect} />
        ))}
      </>
    );
  }

  return (
    <Flex
      style={{ background: glass, backdropFilter: "blur(10px)" }}
      sx={{ flexDirection: "column", height: "100%", borderRight: "1px solid", borderColor: "border", boxShadow: "8px 0 24px rgba(0,0,0,0.35)" }}
    >
      <Flex sx={{ alignItems: "center", px: 3, pt: 2 }}>
        <Text variant="heading" sx={{ fontSize: 3, flexGrow: 1 }}>
          {tabLabel(proto.tab)}
        </Text>
        <Button variant="secondary" sx={{ fontSize: 0, py: 1 }} onClick={() => proto.setManagerOpen(true)}>
          Manage…
        </Button>
      </Flex>
      {proto.tab === "scenes" ? (
        <Box sx={{ px: 3, pt: 2 }}>
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
          <Box sx={{ px: 3, py: 2 }}>
            <Flex sx={{ gap: 1, mb: 2 }}>
              <Input
                value={proto.search}
                onChange={(e) => proto.setSearch(e.target.value)}
                placeholder="Search"
                sx={{ p: "3px 8px", fontSize: 1, flexGrow: 1, bg: "muted" }}
              />
              <IconButton title="Upload into this room" onClick={proto.actions.upload}>
                ⤒
              </IconButton>
              <IconButton title="New folder" onClick={proto.actions.newFolder}>
                <FolderGlyph />
              </IconButton>
            </Flex>
            <ColourKey proto={proto} />
          </Box>
          <Box sx={{ flexGrow: 1, overflowY: "auto", minHeight: 0 }}>
            {drilled ? (
              <>
                <Flex
                  onClick={() => setDrill(null)}
                  style={{ background: libraryColour[drilled.id] }}
                  sx={{ alignItems: "center", gap: 2, px: 3, py: 1, mb: 2, cursor: "pointer", fontSize: 1, position: "sticky", top: 0, zIndex: 1 }}
                >
                  ‹ {drilled.heading} / {drill?.folder}
                </Flex>
                {drilledFolder ? (
                  grid(drilledFolder.assets.map((a) => <Tile key={a.id} proto={proto} asset={a} onInspect={onInspect} />))
                ) : (
                  <Text variant="caption" sx={{ px: 3 }}>
                    No {tabLabel(proto.tab).toLowerCase()}s in this folder
                  </Text>
                )}
              </>
            ) : (
              <>
                {proto.dockSections.length === 0 && (
                  <Text variant="caption" sx={{ px: 3 }}>
                    Nothing matches
                  </Text>
                )}
                {proto.dockSections.map((section) => (
                  <Box key={section.id}>
                    <Flex sx={{ alignItems: "center", gap: 2, px: 3, py: 1, position: "sticky", top: 0, zIndex: 1 }} style={{ background: glass }}>
                      <Box style={{ width: 4, height: 16, borderRadius: 2, background: libraryAccent[section.id] }} />
                      <Text sx={{ fontSize: 1, flexGrow: 1 }}>{section.heading}</Text>
                      {section.readOnly && <Text variant="caption">read-only</Text>}
                      <Text variant="caption">{section.count}</Text>
                    </Flex>
                    {sectionBody(section)}
                  </Box>
                ))}
              </>
            )}
          </Box>
          <Box sx={{ px: 3, py: 2, borderTop: "1px solid", borderColor: "muted" }}>
            <StorageBreakdown proto={proto} />
          </Box>
        </>
      )}
    </Flex>
  );
}

function Strip({ proto }: { proto: Proto }) {
  return (
    <Flex
      style={{ width: STRIP, background: glass, backdropFilter: "blur(10px)" }}
      sx={{ position: "absolute", left: 0, top: 0, bottom: 0, zIndex: 2, flexDirection: "column", alignItems: "center", py: 2, gap: 1, borderRight: "1px solid", borderColor: "muted" }}
    >
      <IconButton title={proto.collapsed ? "Slide the panel in" : "Slide the panel away"} onClick={() => proto.setCollapsed(!proto.collapsed)}>
        {proto.collapsed ? "»" : "«"}
      </IconButton>
      {tabsFor(proto.role).map((tab) => {
        const active = proto.tab === tab;
        return (
          <IconButton
            key={tab}
            title={tabLabel(tab)}
            onClick={() => {
              proto.setTab(tab);
              proto.setCollapsed(false);
            }}
            sx={{ color: active ? "primary" : "text", borderLeft: "3px solid", borderColor: active ? "primary" : "transparent", borderRadius: 0, width: STRIP }}
          >
            <TabIcon tab={tab} />
          </IconButton>
        );
      })}
    </Flex>
  );
}

function Inspector({ proto, id, index, onClose }: { proto: Proto; id: string; index: number; onClose: () => void }) {
  const asset = proto.assets.find((x) => x.id === id);
  // The card shows its own asset, whatever the manager has picked
  const view = { ...proto, selected: asset ?? null };
  return (
    <FloatingWindow
      title={asset ? asset.name : "Deleted"}
      accent={asset ? libraryColour[sectionOf(asset, proto)] : undefined}
      initial={{ x: STRIP + PANEL + 30 + index * 26, y: 90 + index * 26 }}
      width={250}
      height={430}
      onClose={onClose}
    >
      {asset ? (
        <>
          <AssetDetails proto={view} size={120} />
          <Box sx={{ p: 2, mt: "auto" }}>
            <Button sx={{ width: "100%", fontSize: 0 }} onClick={() => proto.actions.place(asset)}>
              Place on the map
            </Button>
          </Box>
        </>
      ) : (
        <Text variant="caption" sx={{ p: 2 }}>
          This asset was deleted
        </Text>
      )}
    </FloatingWindow>
  );
}

function Manager({ proto, onInspect }: { proto: Proto; onInspect: (a: Asset) => void }) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const types: (AssetType | "all")[] = ["all", ...typesFor(proto)];
  const picked = proto.assets.filter((x) => checked.has(x.id) && proto.mayEdit(x));

  function toggle(ids: string[], on: boolean) {
    setChecked((c) => {
      const next = new Set(c);
      for (const id of ids) on ? next.add(id) : next.delete(id);
      return next;
    });
  }

  const libraries = new Set(picked.map((x) => x.library));
  const move = libraries.size === 1 && picked[0] ? moveLabel(proto, picked[0]) : null;
  const folderNames = [...new Set(picked.flatMap((x) => proto.foldersFor(x)))].sort();

  function bulk(summary: string, each: (a: Asset) => void) {
    picked.forEach(each);
    proto.actions.say(summary);
  }

  const cell = { px: 2, py: "3px", fontSize: 1, whiteSpace: "nowrap" as const };

  function row(asset: Asset) {
    const editable = proto.mayEdit(asset);
    const on = checked.has(asset.id);
    return (
      <Box
        as="tr"
        key={asset.id}
        {...dragSource(asset)}
        onClick={() => editable && toggle([asset.id], !on)}
        sx={{ cursor: editable ? "pointer" : "default", bg: on ? "highlight" : "transparent", "&:hover": { bg: on ? "highlight" : "muted" } }}
      >
        <Box as="td" sx={cell}>
          <input type="checkbox" checked={on} disabled={!editable} readOnly />
        </Box>
        <Box as="td" sx={cell}>
          <Thumb asset={asset} size={24} />
        </Box>
        <Box as="td" sx={{ ...cell, width: "100%" }}>
          {asset.name}
        </Box>
        <Box as="td" sx={cell}>
          {typeLabels[asset.type]}
        </Box>
        <Box as="td" sx={cell}>
          {asset.uploader ?? ""}
        </Box>
        <Box as="td" sx={{ ...cell, textAlign: "right" }}>
          {formatBytes(asset.bytes)}
        </Box>
        <Box as="td" sx={cell}>
          <Box
            as="span"
            title="Open an inspector card"
            onClick={(e) => {
              e.stopPropagation();
              onInspect(asset);
            }}
            sx={{
              cursor: "pointer",
              display: "inline-block",
              width: "18px",
              height: "18px",
              lineHeight: "16px",
              textAlign: "center",
              fontSize: "11px",
              fontWeight: "bold",
              border: "1px solid",
              borderColor: "text",
              borderRadius: "50%",
              "&:hover": { bg: "muted" },
            }}
          >
            i
          </Box>
        </Box>
      </Box>
    );
  }

  return (
    <FloatingWindow title="Asset Manager" initial={{ x: 400, y: 50 }} width={820} height={580} onClose={() => proto.setManagerOpen(false)}>
      <Flex sx={{ gap: 2, p: 2, alignItems: "center", borderBottom: "1px solid", borderColor: "muted" }}>
        <Input
          value={proto.search}
          onChange={(e) => proto.setSearch(e.target.value)}
          placeholder="Search every library"
          sx={{ width: 200, p: "3px 8px", fontSize: 1 }}
        />
        <ColourKey proto={proto} />
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
      <Box sx={{ flexGrow: 1, overflowY: "auto", minHeight: 0 }}>
        <Box as="table" sx={{ width: "100%", borderCollapse: "collapse" }}>
          {proto.managerSections.map((section) => {
            const ids = [...section.folders.flatMap((f) => f.assets), ...section.assets].map((x) => x.id);
            const all = ids.length > 0 && ids.every((id) => checked.has(id));
            return (
              <tbody key={section.id}>
                <tr>
                  <td colSpan={7} style={{ background: libraryColour[section.id], padding: "4px 8px", fontSize: 14, position: "sticky", top: 0, zIndex: 1 }}>
                    <Flex sx={{ alignItems: "center", gap: 2 }}>
                      <input
                        type="checkbox"
                        checked={all}
                        disabled={section.readOnly || ids.length === 0}
                        onChange={() => toggle(ids, !all)}
                        title="Pick everything in this library"
                      />
                      <Text sx={{ flexGrow: 1 }}>{section.heading}</Text>
                      {section.readOnly && <Text variant="caption">read-only</Text>}
                      <Text variant="caption">{section.count}</Text>
                    </Flex>
                  </td>
                </tr>
                {section.count === 0 && (
                  <tr>
                    <td colSpan={7} style={{ padding: "3px 8px", fontSize: 14, color: "hsl(0, 0%, 70%)" }}>
                      Nothing here
                    </td>
                  </tr>
                )}
                {section.folders.flatMap((folder) => {
                  const open = proto.isOpen(folder.key);
                  return [
                    <Box as="tr" key={folder.key} onClick={() => proto.toggleFolder(folder.key)} sx={{ cursor: "pointer", "&:hover": { bg: "muted" } }}>
                      <td colSpan={7} style={{ padding: "3px 8px 3px 16px", fontSize: 14 }}>
                        <FolderGlyph open={open} /> {folder.name} <Text variant="caption">{folder.assets.length}</Text>
                      </td>
                    </Box>,
                    ...(open ? folder.assets.map(row) : []),
                  ];
                })}
                {section.assets.map(row)}
              </tbody>
            );
          })}
        </Box>
      </Box>
      {picked.length > 0 ? (
        <Flex sx={{ gap: 2, p: 2, alignItems: "center", bg: "highlight", flexWrap: "wrap" }}>
          <Text sx={{ fontSize: 1 }}>{picked.length} picked</Text>
          <select
            style={selectStyle}
            value=""
            onChange={(e: any) => {
              const type = e.target.value as AssetType;
              bulk(`${picked.length} assets are now ${typeLabels[type]}s`, (a) => proto.actions.setType(a, type));
            }}
          >
            <option value="">Set type…</option>
            {typesFor(proto).map((t) => (
              <option key={t} value={t}>
                {typeLabels[t]}
              </option>
            ))}
          </select>
          <select
            style={selectStyle}
            value="__pick"
            onChange={(e: any) => {
              let folder: string | null = e.target.value || null;
              if (folder === "__new") folder = window.prompt("New folder name") || null;
              if (e.target.value === "__new" && !folder) return;
              bulk(folder ? `Filed ${picked.length} assets in ${folder}` : `Took ${picked.length} assets out of their folders`, (a) => proto.actions.fileIn(a, folder));
            }}
          >
            <option value="__pick">File in…</option>
            <option value="">No folder</option>
            {folderNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
            <option value="__new">New folder…</option>
          </select>
          {move && (
            <Button variant="secondary" sx={{ fontSize: 0 }} onClick={() => bulk(`${move}: ${picked.length} assets, top level`, (a) => proto.actions.move(a))}>
              {move}
            </Button>
          )}
          <Button
            sx={{ fontSize: 0, bg: "error" }}
            onClick={() => {
              if (window.confirm(`Delete ${picked.length} assets? Placed copies keep working.`)) {
                bulk(`Deleted ${picked.length} assets; placed copies keep working`, (a) => proto.actions.remove(a));
                setChecked(new Set());
              }
            }}
          >
            Delete
          </Button>
          <Box sx={{ flexGrow: 1 }} />
          <Button variant="secondary" sx={{ fontSize: 0 }} onClick={() => setChecked(new Set())}>
            Clear
          </Button>
        </Flex>
      ) : (
        <Flex sx={{ gap: 2, p: 2, alignItems: "center", borderTop: "1px solid", borderColor: "muted" }}>
          <Box sx={{ width: 340 }}>
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
      )}
    </FloatingWindow>
  );
}

function VariantI({ proto, canvas, fullScreen }: { proto: Proto; canvas: ReactNode; fullScreen: boolean }) {
  const [cards, setCards] = useState<string[]>([]);
  function inspect(asset: Asset) {
    setCards((all) => (all.includes(asset.id) ? all : [...all, asset.id]));
  }
  return (
    <Flex sx={{ flexGrow: 1, minWidth: 0, position: "relative", overflow: "hidden" }} {...shieldImageDrop}>
      <CanvasDrop proto={proto}>{canvas}</CanvasDrop>
      {!fullScreen && (
        <>
          <Strip proto={proto} />
          <Box
            style={{ left: STRIP, width: PANEL, pointerEvents: proto.collapsed ? "none" : "auto" }}
            sx={{ position: "absolute", top: 0, bottom: 0, overflow: "hidden", zIndex: 1 }}
          >
            <Box
              style={{ transform: proto.collapsed ? "translateX(-100%)" : "translateX(0)" }}
              sx={{ height: "100%", transition: "transform 180ms ease-out" }}
            >
              <Panel proto={proto} onInspect={inspect} />
            </Box>
          </Box>
        </>
      )}
      {cards.map((id, i) => (
        <Inspector key={id} proto={proto} id={id} index={i} onClose={() => setCards((all) => all.filter((x) => x !== id))} />
      ))}
      {proto.managerOpen && <Manager proto={proto} onInspect={inspect} />}
    </Flex>
  );
}

export default VariantI;
