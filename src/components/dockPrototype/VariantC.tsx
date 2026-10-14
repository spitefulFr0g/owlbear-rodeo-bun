// PROTOTYPE variant C: the dock floats over the canvas as a list palette with
// accordion libraries. The Asset Manager is the same palette grown to fill the
// room, with an inspector beside the list.
import { ReactNode, useState } from "react";
import { Box, Button, Flex, IconButton, Input, Text } from "theme-ui";

import { Asset, assetTypes, scenes, typeLabels } from "./data";
import { filterOptions, formatBytes, Proto, Section, SectionId, tabLabel, tabsFor } from "./model";
import { FolderSelect, moveLabel, QuotaBar, TabIcon, Thumb, TypeSelect , FolderGlyph } from "./parts";

export const name = "Floating palette grows into manager";

function FilterTabs({ proto }: { proto: Proto }) {
  return (
    <Box>
      <Input
        value={proto.search}
        onChange={(e) => proto.setSearch(e.target.value)}
        placeholder="Search all libraries…"
        sx={{ p: "4px 8px", fontSize: 1, mb: 1 }}
      />
      <Flex sx={{ alignItems: "center", borderBottom: "1px solid", borderColor: "muted" }}>
        {filterOptions(proto.role).map((o) => (
          <Box
            key={o.value}
            onClick={() => proto.setFilter(o.value)}
            sx={{
              px: 2,
              py: 1,
              cursor: "pointer",
              fontFamily: "body2",
              fontSize: 0,
              borderBottom: "2px solid",
              borderColor: proto.filter === o.value ? "primary" : "transparent",
              color: proto.filter === o.value ? "primary" : "text",
            }}
          >
            {o.label}
          </Box>
        ))}
        <Box sx={{ flexGrow: 1 }} />
        <Box
          onClick={() => proto.setSort(proto.sort === "name" ? "newest" : "name")}
          sx={{ cursor: "pointer", fontFamily: "body2", fontSize: 0, color: "gray" }}
          title="Order"
        >
          {proto.sort === "name" ? "A→Z" : "Newest"} ⇅
        </Box>
      </Flex>
    </Box>
  );
}

function AssetRow({ proto, asset, onPick }: { proto: Proto; asset: Asset; onPick: (a: Asset) => void }) {
  const selected = proto.managerOpen && proto.selected?.id === asset.id;
  return (
    <Flex
      sx={{
        alignItems: "center",
        gap: 2,
        py: "3px",
        px: 1,
        cursor: proto.managerOpen ? "pointer" : "grab",
        borderRadius: "4px",
        bg: selected ? "highlight" : "transparent",
        "&:hover": { bg: selected ? "highlight" : "muted" },
      }}
      onClick={() => onPick(asset)}
    >
      <Thumb asset={asset} size={32} />
      <Text sx={{ flexGrow: 1, fontSize: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {asset.name}
      </Text>
      {asset.uploader && <Text variant="caption">{asset.uploader}</Text>}
      {proto.managerOpen && <Text variant="caption">{typeLabels[asset.type]}</Text>}
    </Flex>
  );
}

function Accordion({ proto, sections, onPick }: { proto: Proto; sections: Section[]; onPick: (a: Asset) => void }) {
  const [closed, setClosed] = useState<Set<SectionId>>(new Set());
  return (
    <Box>
      {sections.map((section) => {
        const open = !closed.has(section.id);
        return (
          <Box key={section.id} sx={{ borderBottom: "1px solid", borderColor: "muted" }}>
            <Flex
              sx={{ alignItems: "center", py: 1, cursor: "pointer", position: "sticky", top: 0, bg: "background", zIndex: 1 }}
              onClick={() =>
                setClosed((c) => {
                  const next = new Set(c);
                  next.has(section.id) ? next.delete(section.id) : next.add(section.id);
                  return next;
                })
              }
            >
              <Box sx={{ width: 16 }}>{open ? "▾" : "▸"}</Box>
              <Text sx={{ flexGrow: 1, fontSize: 1 }}>{section.heading}</Text>
              <Text variant="caption">
                {section.count}
                {section.readOnly ? " · read-only" : ""}
              </Text>
            </Flex>
            {open && (
              <Box pb={1}>
                {section.count === 0 && <Text variant="caption" sx={{ pl: 3 }}>Nothing here</Text>}
                {section.folders.map((folder) => (
                  <Box key={folder.key}>
                    <Flex
                      sx={{ alignItems: "center", gap: 2, py: "3px", pl: 1, cursor: "pointer", fontSize: 1 }}
                      onClick={() => proto.toggleFolder(folder.key)}
                    >
                      <Box sx={{ width: 32, textAlign: "center" }}><FolderGlyph open={proto.isOpen(folder.key)} /></Box>
                      <Text sx={{ flexGrow: 1 }}>{folder.name}</Text>
                      <Text variant="caption">{folder.assets.length}</Text>
                    </Flex>
                    {proto.isOpen(folder.key) && (
                      <Box sx={{ pl: 3 }}>
                        {folder.assets.map((asset) => (
                          <AssetRow key={asset.id} proto={proto} asset={asset} onPick={onPick} />
                        ))}
                      </Box>
                    )}
                  </Box>
                ))}
                {section.assets.map((asset) => (
                  <AssetRow key={asset.id} proto={proto} asset={asset} onPick={onPick} />
                ))}
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
}

function Inspector({ proto }: { proto: Proto }) {
  const asset = proto.selected;
  if (!asset) {
    return (
      <Flex sx={{ flexGrow: 1, alignItems: "center", justifyContent: "center", color: "gray" }}>
        Pick an asset from the list
      </Flex>
    );
  }
  const editable = proto.mayEdit(asset);
  const move = moveLabel(proto, asset);
  const where =
    asset.library === "server" ? "Server set" : asset.library === "account" ? "My library" : asset.uploader ? `This room, from ${asset.uploader}` : "This room";
  return (
    <Flex sx={{ flexGrow: 1, flexDirection: "column", alignItems: "center", p: 3, gap: 2, overflowY: "auto" }}>
      <Thumb asset={asset} size={180} />
      <Text variant="heading" sx={{ fontSize: 3 }}>
        {asset.name}
      </Text>
      <Text variant="caption">
        {where} · {formatBytes(asset.bytes)}
      </Text>
      {editable ? (
        <Box sx={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 2, alignItems: "center", width: 280 }}>
          <Text sx={{ fontSize: 1 }}>Name</Text>
          <Button variant="secondary" sx={{ fontSize: 0 }} onClick={() => proto.actions.rename(asset)}>
            Rename…
          </Button>
          <Text sx={{ fontSize: 1 }}>Type</Text>
          <TypeSelect proto={proto} asset={asset} />
          <Text sx={{ fontSize: 1 }}>Folder</Text>
          <FolderSelect proto={proto} asset={asset} />
        </Box>
      ) : (
        <Text variant="caption">The server set is read-only</Text>
      )}
      <Flex sx={{ gap: 2, mt: 2 }}>
        {move && (
          <Button variant="secondary" onClick={() => proto.actions.move(asset)}>
            {move}
          </Button>
        )}
        {editable && (
          <Button sx={{ bg: "error" }} onClick={() => proto.actions.remove(asset)}>
            Delete
          </Button>
        )}
      </Flex>
      <Text variant="caption" sx={{ maxWidth: 280, textAlign: "center", mt: 2 }}>
        Changes apply to items placed afterwards, not to items already on a canvas.
      </Text>
    </Flex>
  );
}

function Palette({ proto }: { proto: Proto }) {
  const big = proto.managerOpen;
  return (
    <Flex
      sx={{
        position: "absolute",
        left: 2,
        top: 2,
        bottom: big ? 70 : "auto",
        right: big ? 60 : "auto",
        maxHeight: big ? "none" : "calc(100% - 90px)",
        zIndex: 10,
        bg: "background",
        borderRadius: "8px",
        boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
        overflow: "hidden",
      }}
    >
      <Flex sx={{ flexDirection: "column", bg: "muted", py: 1, width: 44, alignItems: "center" }}>
        {tabsFor(proto.role).map((tab) => (
          <IconButton
            key={tab}
            title={tabLabel(tab)}
            sx={{ color: !big && proto.tab === tab && !proto.collapsed ? "primary" : "text" }}
            onClick={() => {
              proto.setManagerOpen(false);
              if (proto.tab === tab && !big) proto.setCollapsed(!proto.collapsed);
              else {
                proto.setTab(tab);
                proto.setCollapsed(false);
              }
            }}
          >
            <TabIcon tab={tab} />
          </IconButton>
        ))}
        <Box sx={{ flexGrow: 1 }} />
        <IconButton
          title={big ? "Shrink back to the dock" : "Grow into the Asset Manager"}
          sx={{ color: big ? "primary" : "text" }}
          onClick={() => {
            proto.setCollapsed(false);
            proto.setManagerOpen(!big);
          }}
        >
          {big ? "⤡" : "⤢"}
        </IconButton>
      </Flex>
      {(!proto.collapsed || big) && (
        <Flex sx={{ flexDirection: "column", width: big ? 380 : 260, p: 2, gap: 1, minHeight: 0 }}>
          <Flex sx={{ alignItems: "center" }}>
            <Text sx={{ flexGrow: 1 }}>{big ? "Asset Manager" : tabLabel(proto.tab)}</Text>
            {!big && (
              <IconButton title="Collapse to the tab strip" onClick={() => proto.setCollapsed(true)}>
                ‹
              </IconButton>
            )}
          </Flex>
          {big && (
            <Flex sx={{ gap: 1, flexWrap: "wrap" }}>
              {(["all", ...assetTypes] as const)
                .filter((t) => proto.role === "gm" || t !== "map")
                .map((t) => (
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
          )}
          {(big || proto.tab !== "scenes") && <FilterTabs proto={proto} />}
          <Box sx={{ overflowY: "auto", flexGrow: 1, minHeight: 0 }}>
            {!big && proto.tab === "scenes" ? (
              <Box>
                {scenes.map((scene) => (
                  <Box key={scene} sx={{ py: 1, fontSize: 1 }}>
                    {scene}
                  </Box>
                ))}
                <Button sx={{ fontSize: 0, mt: 2, mr: 1 }} onClick={() => proto.actions.newScene("library")}>
                  New scene from a Map asset
                </Button>
                <Button variant="secondary" sx={{ fontSize: 0, mt: 1 }} onClick={() => proto.actions.newScene("upload")}>
                  New scene from an upload
                </Button>
              </Box>
            ) : (
              <Accordion
                proto={proto}
                sections={big ? proto.managerSections : proto.dockSections}
                onPick={(asset) => (big ? proto.setSelectedId(asset.id) : proto.actions.place(asset))}
              />
            )}
          </Box>
          {big && (
            <Box sx={{ borderTop: "1px solid", borderColor: "muted", pt: 2 }}>
              <QuotaBar proto={proto} />
              <Flex sx={{ gap: 1, mt: 2 }}>
                <Button sx={{ fontSize: 0 }} onClick={proto.actions.upload}>Upload</Button>
                <Button variant="secondary" sx={{ fontSize: 0 }} onClick={proto.actions.newFolder}>New folder</Button>
                <Button variant="secondary" sx={{ fontSize: 0 }} onClick={proto.actions.importBrowser}>Import browser library</Button>
              </Flex>
            </Box>
          )}
        </Flex>
      )}
      {big && (
        <Flex sx={{ flexGrow: 1, borderLeft: "1px solid", borderColor: "muted" }}>
          <Inspector proto={proto} />
        </Flex>
      )}
    </Flex>
  );
}

function VariantC({
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
      {!fullScreen && <Palette proto={proto} />}
    </Flex>
  );
}

export default VariantC;
