// PROTOTYPE variant E, after Owlbear Rodeo 2.2: the dock floats at the bottom
// of the canvas as a slim bar of type tabs that opens into a shelf, one
// sideways-scrolling row per library. A search looks across every type, with
// a type badge on each tile. The Asset Manager is a large window with a tab per
// type, a library and folder tree, and multi-select with a bulk action bar.
import { ReactNode, useState } from "react";
import { Box, Button, Flex, IconButton, Input, Text } from "theme-ui";

import { Asset, AssetType, scenes, typeLabels } from "./data";
import { buildSections, filterOptions, Proto, Section, SectionId, tabLabel, tabsFor } from "./model";
import { FolderGlyph, QuotaBar, selectStyle, TabIcon, Thumb, typesFor } from "./parts";

export const name = "Bottom shelf dock (Owlbear Rodeo 2.2)";

function OrderSelect({ proto }: { proto: Proto }) {
  return (
    <select style={selectStyle} value={proto.sort} onChange={(e: any) => proto.setSort(e.target.value)}>
      <option value="name">Folders, then by name</option>
      <option value="newest">Folders, then newest</option>
    </select>
  );
}

function FilterSelect({ proto }: { proto: Proto }) {
  return (
    <select style={selectStyle} value={proto.filter} onChange={(e: any) => proto.setFilter(e.target.value)}>
      {filterOptions(proto.role).map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function Tile({ proto, asset, badge }: { proto: Proto; asset: Asset; badge: boolean }) {
  return (
    <Box
      title={`${asset.name}: click to place`}
      onClick={() => proto.actions.place(asset)}
      sx={{ width: 72, flexShrink: 0, cursor: "grab", textAlign: "center", position: "relative" }}
    >
      <Box sx={{ display: "flex", justifyContent: "center" }}>
        <Thumb asset={asset} size={60} />
      </Box>
      {badge && (
        <Box
          sx={{
            position: "absolute",
            top: 0,
            left: 0,
            bg: "primary",
            color: "background",
            fontFamily: "body2",
            fontSize: "10px",
            px: "4px",
            borderRadius: "4px",
          }}
        >
          {typeLabels[asset.type]}
        </Box>
      )}
      <Text sx={{ fontSize: 0, display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {asset.name}
      </Text>
      {asset.uploader && <Text variant="caption" sx={{ fontSize: "10px" }}>{asset.uploader}</Text>}
    </Box>
  );
}

function Shelf({ proto, section, badge }: { proto: Proto; section: Section; badge: boolean }) {
  return (
    <Flex sx={{ alignItems: "flex-start", gap: 2, mb: 2 }}>
      <Box sx={{ width: 96, flexShrink: 0, pt: 1 }}>
        <Text sx={{ fontSize: 1, display: "block" }}>{section.heading}</Text>
        <Text variant="caption">
          {section.count}
          {section.readOnly ? " · read-only" : ""}
        </Text>
      </Box>
      <Flex sx={{ gap: 2, overflowX: "auto", pb: 1, minWidth: 0, flexGrow: 1 }}>
        {section.count === 0 && <Text variant="caption" sx={{ pt: 1 }}>Nothing here</Text>}
        {section.folders.map((folder) => {
          const open = proto.isOpen(folder.key);
          return (
            <Flex key={folder.key} sx={{ gap: 2, flexShrink: 0, bg: open ? "muted" : "transparent", borderRadius: "8px", pr: open ? 2 : 0 }}>
              <Box
                onClick={() => proto.toggleFolder(folder.key)}
                title={open ? "Close the folder" : "Open the folder in the row"}
                sx={{
                  width: 72,
                  height: 82,
                  flexShrink: 0,
                  cursor: "pointer",
                  border: "1px solid",
                  borderColor: open ? "primary" : "border",
                  borderRadius: "8px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  color: open ? "primary" : "text",
                }}
              >
                <Box sx={{ transform: "scale(2)", mb: 2 }}>
                  <FolderGlyph open={open} />
                </Box>
                <Text sx={{ fontSize: 0, px: 1, textAlign: "center", lineHeight: 1.1 }}>{folder.name}</Text>
                <Text variant="caption" sx={{ fontSize: "10px" }}>{folder.assets.length}</Text>
              </Box>
              {open && folder.assets.map((asset) => <Tile key={asset.id} proto={proto} asset={asset} badge={badge} />)}
            </Flex>
          );
        })}
        {section.assets.map((asset) => (
          <Tile key={asset.id} proto={proto} asset={asset} badge={badge} />
        ))}
      </Flex>
    </Flex>
  );
}

function Dock({ proto }: { proto: Proto }) {
  // As in Owlbear Rodeo 2.2, a search reaches every type, not just the open tab
  const everyType = proto.searching;
  const sections = everyType
    ? buildSections(
        proto.assets.filter((x) => typesFor(proto).includes(x.type)),
        { role: proto.role, type: "all", filter: proto.filter, search: proto.search, sort: proto.sort }
      ).filter((s) => s.count > 0)
    : proto.dockSections;
  const open = !proto.collapsed;
  return (
    <Box
      sx={{
        position: "absolute",
        left: "50%",
        bottom: 56,
        transform: "translateX(-50%)",
        width: "min(940px, calc(100% - 130px))",
        zIndex: 10,
        bg: "background",
        borderRadius: "12px",
        boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
        overflow: "hidden",
      }}
    >
      {open && (
        <Box sx={{ height: 210, overflowY: "auto", p: 2 }}>
          {everyType && (
            <Text variant="caption" sx={{ display: "block", mb: 1 }}>
              Searching every type for "{proto.search}"
            </Text>
          )}
          {!everyType && proto.tab === "scenes" ? (
            <Flex sx={{ gap: 2, flexWrap: "wrap" }}>
              {scenes.map((scene) => (
                <Box key={scene} sx={{ border: "1px solid", borderColor: "border", borderRadius: "8px", p: 2, width: 140, fontSize: 1 }}>
                  {scene}
                </Box>
              ))}
              <Button sx={{ fontSize: 0 }} onClick={() => proto.actions.newScene("library")}>
                New scene from a Map asset
              </Button>
              <Button variant="secondary" sx={{ fontSize: 0 }} onClick={() => proto.actions.newScene("upload")}>
                New scene from an upload
              </Button>
            </Flex>
          ) : (
            sections.map((section) => <Shelf key={section.id} proto={proto} section={section} badge={everyType} />)
          )}
        </Box>
      )}
      <Flex
        sx={{
          alignItems: "center",
          gap: 1,
          px: 2,
          height: 48,
          borderTop: open ? "1px solid" : "none",
          borderColor: "muted",
        }}
      >
        {tabsFor(proto.role).map((tab) => {
          const active = proto.tab === tab && open && !everyType;
          return (
            <Flex
              key={tab}
              title={active ? `${tabLabel(tab)}: click again to shrink the dock` : tabLabel(tab)}
              onClick={() => {
                if (proto.tab === tab && open) proto.setCollapsed(true);
                else {
                  proto.setTab(tab);
                  proto.setCollapsed(false);
                }
              }}
              sx={{
                alignItems: "center",
                gap: 1,
                cursor: "pointer",
                px: 2,
                py: 1,
                borderRadius: 999,
                bg: active ? "primary" : "transparent",
                color: active ? "background" : "text",
                fontFamily: "body2",
                fontSize: 0,
                "& svg": { width: 18, height: 18 },
              }}
            >
              <TabIcon tab={tab} />
              {tabLabel(tab)}
            </Flex>
          );
        })}
        <Box sx={{ flexGrow: 1 }} />
        <Input
          value={proto.search}
          onChange={(e) => {
            proto.setSearch(e.target.value);
            proto.setCollapsed(false);
          }}
          placeholder="Search every type"
          sx={{ width: 150, p: "2px 6px", fontSize: 1 }}
        />
        <FilterSelect proto={proto} />
        <Button sx={{ fontSize: 0, py: 1 }} onClick={() => proto.setManagerOpen(true)}>
          Asset Manager
        </Button>
        <IconButton title={open ? "Shrink to the tab strip" : "Open the shelf"} onClick={() => proto.setCollapsed(open)}>
          {open ? "▾" : "▴"}
        </IconButton>
      </Flex>
    </Box>
  );
}

type Scope = { section: SectionId | null; folder: string | null };

function Card({
  proto,
  asset,
  picked,
  onToggle,
}: {
  proto: Proto;
  asset: Asset;
  picked: boolean;
  onToggle: () => void;
}) {
  return (
    <Box
      onClick={onToggle}
      sx={{
        width: 116,
        cursor: "pointer",
        borderRadius: "8px",
        p: 1,
        position: "relative",
        border: "2px solid",
        borderColor: picked ? "primary" : "transparent",
        bg: picked ? "highlight" : "transparent",
        "&:hover": { bg: picked ? "highlight" : "muted" },
      }}
    >
      <input
        type="checkbox"
        checked={picked}
        readOnly
        style={{ position: "absolute", top: 6, left: 6, zIndex: 1 }}
      />
      <Flex sx={{ justifyContent: "center" }}>
        <Thumb asset={asset} size={96} />
      </Flex>
      <Text sx={{ fontSize: 1, display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {asset.name}
      </Text>
      <Text variant="caption">
        {typeLabels[asset.type]}
        {asset.uploader ? ` · ${asset.uploader}` : ""}
        {proto.mayEdit(asset) ? "" : " · read-only"}
      </Text>
    </Box>
  );
}

function Manager({ proto }: { proto: Proto }) {
  const [scope, setScope] = useState<Scope>({ section: null, folder: null });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const sections = proto.managerSections;
  const types: (AssetType | "all")[] = ["all", ...typesFor(proto)];

  function toggle(id: string) {
    setPicked((p) => {
      const next = new Set(p);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const pickedAssets = proto.assets.filter((x) => picked.has(x.id));
  const editable = pickedAssets.filter((x) => proto.mayEdit(x));
  const fromRoom = editable.filter((x) => x.library === "room");
  const fromAccount = editable.filter((x) => x.library === "account");

  function done(text: string) {
    proto.actions.say(text);
    setPicked(new Set());
  }

  const shown = sections.filter((s) => !scope.section || s.id === scope.section);
  const crumbs = ["All libraries"];
  if (scope.section) crumbs.push(sections.find((s) => s.id === scope.section)?.heading ?? "");
  if (scope.folder) crumbs.push(scope.folder);

  return (
    <Flex
      sx={{ position: "fixed", inset: 0, zIndex: 100, bg: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center" }}
      onClick={() => proto.setManagerOpen(false)}
    >
      <Flex
        onClick={(e) => e.stopPropagation()}
        sx={{ width: "92%", height: "84%", bg: "background", borderRadius: "12px", flexDirection: "column", overflow: "hidden", mb: 5 }}
      >
        <Flex sx={{ alignItems: "flex-end", px: 3, pt: 2, gap: 3, borderBottom: "1px solid", borderColor: "muted" }}>
          <Text variant="heading" sx={{ fontSize: 3, pb: 2 }}>
            Asset Manager
          </Text>
          {types.map((t) => (
            <Box
              key={t}
              onClick={() => proto.setManagerType(t)}
              sx={{
                cursor: "pointer",
                pb: 2,
                fontSize: 1,
                borderBottom: "3px solid",
                borderColor: proto.managerType === t ? "primary" : "transparent",
                color: proto.managerType === t ? "primary" : "text",
              }}
            >
              {t === "all" ? "All" : typeLabels[t]}
            </Box>
          ))}
          <Box sx={{ flexGrow: 1 }} />
          <IconButton sx={{ mb: 1 }} onClick={() => proto.setManagerOpen(false)}>
            ✕
          </IconButton>
        </Flex>
        <Flex sx={{ alignItems: "center", gap: 2, px: 3, py: 2 }}>
          <Input
            value={proto.search}
            onChange={(e) => proto.setSearch(e.target.value)}
            placeholder="Search"
            sx={{ width: 220, p: "2px 8px", fontSize: 1 }}
          />
          <FilterSelect proto={proto} />
          <OrderSelect proto={proto} />
          <Box sx={{ flexGrow: 1 }} />
          <Button sx={{ fontSize: 0 }} onClick={proto.actions.upload}>Upload</Button>
          <Button variant="secondary" sx={{ fontSize: 0 }} onClick={proto.actions.newFolder}>New folder</Button>
          {proto.role === "gm" && (
            <Button variant="secondary" sx={{ fontSize: 0 }} onClick={proto.actions.importBrowser}>
              Import browser library
            </Button>
          )}
        </Flex>
        <Flex sx={{ flexGrow: 1, minHeight: 0 }}>
          <Flex sx={{ width: 220, flexShrink: 0, flexDirection: "column", borderRight: "1px solid", borderColor: "muted", p: 2 }}>
            <Box sx={{ flexGrow: 1, overflowY: "auto" }}>
              <TreeRow label="All libraries" active={!scope.section} onClick={() => setScope({ section: null, folder: null })} />
              {sections.map((section) => (
                <Box key={section.id}>
                  <TreeRow
                    label={section.heading}
                    count={section.count}
                    active={scope.section === section.id && !scope.folder}
                    onClick={() => setScope({ section: section.id, folder: null })}
                  />
                  {section.folders.map((folder) => (
                    <TreeRow
                      key={folder.key}
                      label={folder.name}
                      count={folder.assets.length}
                      indent
                      active={scope.section === section.id && scope.folder === folder.name}
                      onClick={() => setScope({ section: section.id, folder: folder.name })}
                    />
                  ))}
                </Box>
              ))}
            </Box>
            <QuotaBar proto={proto} />
          </Flex>
          <Box sx={{ flexGrow: 1, overflowY: "auto", p: 3 }}>
            <Text variant="caption" sx={{ display: "block", mb: 2 }}>
              {crumbs.join(" › ")}
            </Text>
            {shown.map((section) => {
              const folders = section.folders.filter((f) => !scope.folder || f.name === scope.folder);
              return (
                <Box key={section.id} sx={{ mb: 3 }}>
                  {!scope.folder && (
                    <Text sx={{ fontSize: 2, display: "block", mb: 1 }}>
                      {section.heading} <Text variant="caption">{section.count}</Text>
                    </Text>
                  )}
                  <Flex sx={{ flexWrap: "wrap", gap: 2 }}>
                    {!scope.folder &&
                      folders.map((folder) => (
                        <Flex
                          key={folder.key}
                          onClick={() => setScope({ section: section.id, folder: folder.name })}
                          sx={{
                            width: 116,
                            height: 140,
                            cursor: "pointer",
                            border: "1px solid",
                            borderColor: "border",
                            borderRadius: "8px",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 2,
                          }}
                        >
                          <Box sx={{ transform: "scale(2.5)" }}>
                            <FolderGlyph />
                          </Box>
                          <Text sx={{ fontSize: 1, textAlign: "center" }}>{folder.name}</Text>
                          <Text variant="caption">{folder.assets.length}</Text>
                        </Flex>
                      ))}
                    {(scope.folder ? folders.flatMap((f) => f.assets) : section.assets).map((asset) => (
                      <Card key={asset.id} proto={proto} asset={asset} picked={picked.has(asset.id)} onToggle={() => toggle(asset.id)} />
                    ))}
                    {section.count === 0 && <Text variant="caption">Nothing here</Text>}
                  </Flex>
                </Box>
              );
            })}
          </Box>
        </Flex>
        {picked.size > 0 && (
          <Flex sx={{ alignItems: "center", gap: 2, px: 3, py: 2, bg: "muted" }}>
            <Text sx={{ fontSize: 1 }}>
              {picked.size} selected
              {editable.length < picked.size ? ` (${picked.size - editable.length} read-only, left alone)` : ""}
            </Text>
            <Box sx={{ flexGrow: 1 }} />
            {editable.length > 0 && (
              <Button
                variant="secondary"
                sx={{ fontSize: 0 }}
                onClick={() => {
                  const folder = window.prompt("File them in which folder? Leave empty for the top level", "");
                  if (folder === null) return;
                  editable.forEach((x) => proto.actions.fileIn(x, folder || null));
                  done(folder ? `Filed ${editable.length} in ${folder}` : `Moved ${editable.length} to the top level`);
                }}
              >
                File in folder…
              </Button>
            )}
            {proto.role === "gm" && fromRoom.length > 0 && (
              <Button
                variant="secondary"
                sx={{ fontSize: 0 }}
                onClick={() => {
                  fromRoom.forEach((x) => proto.actions.move(x));
                  done(`Moved ${fromRoom.length} to my library, top level`);
                }}
              >
                Add {fromRoom.length} to my library
              </Button>
            )}
            {proto.role === "gm" && fromAccount.length > 0 && (
              <Button
                variant="secondary"
                sx={{ fontSize: 0 }}
                onClick={() => {
                  fromAccount.forEach((x) => proto.actions.move(x));
                  done(`Moved ${fromAccount.length} to this room, top level`);
                }}
              >
                Move {fromAccount.length} to this room
              </Button>
            )}
            {editable.length > 0 && (
              <Button
                sx={{ fontSize: 0, bg: "error" }}
                onClick={() => {
                  editable.forEach((x) => proto.actions.remove(x));
                  done(`Deleted ${editable.length}; placed copies keep working`);
                }}
              >
                Delete {editable.length}
              </Button>
            )}
            <Button variant="secondary" sx={{ fontSize: 0 }} onClick={() => setPicked(new Set())}>
              Clear
            </Button>
          </Flex>
        )}
      </Flex>
    </Flex>
  );
}

function TreeRow({
  label,
  count,
  indent = false,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  indent?: boolean;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Flex
      onClick={onClick}
      sx={{
        alignItems: "center",
        cursor: "pointer",
        py: 1,
        pl: indent ? 3 : 1,
        pr: 1,
        borderRadius: "4px",
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
}

function VariantE({
  proto,
  canvas,
  fullScreen,
}: {
  proto: Proto;
  canvas: ReactNode;
  fullScreen: boolean;
}) {
  return (
    <Flex sx={{ flexGrow: 1, minWidth: 0, position: "relative" }}>
      {canvas}
      {!fullScreen && <Dock proto={proto} />}
      {proto.managerOpen && <Manager proto={proto} />}
    </Flex>
  );
}

export default VariantE;
