// PROTOTYPE variant A: a side dock beside the canvas with an icon tab strip on
// the edge, and the Asset Manager as a large modal with folder drill-in.
import { ReactNode, useState } from "react";
import { Box, Button, Flex, IconButton, Input, Text } from "theme-ui";

import { Asset, assetTypes, scenes, typeLabels } from "./data";
import { filterOptions, Folder, Proto, Section, tabLabel, tabsFor } from "./model";
import { FolderSelect, moveLabel, QuotaBar, selectStyle, TabIcon, Thumb, TypeSelect , FolderGlyph } from "./parts";

export const name = "Side dock + modal";

function FilterBar({ proto }: { proto: Proto }) {
  return (
    <Flex sx={{ gap: 1, alignItems: "center", flexWrap: "wrap" }}>
      <select
        style={selectStyle}
        value={proto.filter}
        onChange={(e) => proto.setFilter(e.target.value as any)}
      >
        {filterOptions(proto.role).map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Input
        value={proto.search}
        onChange={(e) => proto.setSearch(e.target.value)}
        placeholder="Search"
        sx={{ flex: "1 1 80px", minWidth: 80, p: "2px 6px", fontSize: 1 }}
      />
      <Button
        variant="secondary"
        sx={{ fontSize: 0, p: "2px 6px", fontFamily: "body2" }}
        onClick={() => proto.setSort(proto.sort === "name" ? "newest" : "name")}
        title="Order"
      >
        {proto.sort === "name" ? "A–Z" : "Newest"}
      </Button>
    </Flex>
  );
}

function Heading({ children }: { children: ReactNode }) {
  return (
    <Text
      as="div"
      sx={{
        fontFamily: "body2",
        fontSize: 0,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        color: "gray",
        mt: 2,
        mb: 1,
      }}
    >
      {children}
    </Text>
  );
}

function DockTile({ proto, asset }: { proto: Proto; asset: Asset }) {
  return (
    <Flex
      sx={{ flexDirection: "column", alignItems: "center", cursor: "grab", minWidth: 0 }}
      onClick={() => proto.actions.place(asset)}
      title={asset.uploader ? `${asset.name} (from ${asset.uploader})` : asset.name}
    >
      <Thumb asset={asset} size={52} />
      <Text
        sx={{
          fontFamily: "body2",
          fontSize: 0,
          width: "100%",
          textAlign: "center",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {asset.name}
      </Text>
    </Flex>
  );
}

function Tiles({ proto, assets }: { proto: Proto; assets: Asset[] }) {
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 2 }}>
      {assets.map((asset) => (
        <DockTile key={asset.id} proto={proto} asset={asset} />
      ))}
    </Box>
  );
}

function DockSection({ proto, section }: { proto: Proto; section: Section }) {
  if (section.count === 0) return null;
  return (
    <Box>
      <Heading>
        {section.heading} · {section.count}
      </Heading>
      {section.folders.map((folder) => (
        <Box key={folder.key} mb={1}>
          <Flex
            sx={{ alignItems: "center", cursor: "pointer", py: 1, fontSize: 1 }}
            onClick={() => proto.toggleFolder(folder.key)}
          >
            <Box sx={{ width: 16 }}>{proto.isOpen(folder.key) ? "▾" : "▸"}</Box>
            <Text sx={{ flexGrow: 1 }}><FolderGlyph />{folder.name}</Text>
            <Text variant="caption">{folder.assets.length}</Text>
          </Flex>
          {proto.isOpen(folder.key) && (
            <Box sx={{ pl: 2, borderLeft: "2px solid", borderColor: "muted" }}>
              <Tiles proto={proto} assets={folder.assets} />
            </Box>
          )}
        </Box>
      ))}
      <Tiles proto={proto} assets={section.assets} />
    </Box>
  );
}

function ScenesPanel({ proto }: { proto: Proto }) {
  return (
    <Box>
      <Heading>Scenes</Heading>
      {scenes.map((scene) => (
        <Box key={scene} sx={{ py: 1, fontSize: 1 }}>
          {scene}
        </Box>
      ))}
      <Heading>New scene</Heading>
      <Flex sx={{ flexDirection: "column", gap: 1 }}>
        <Button sx={{ fontSize: 0 }} onClick={() => proto.actions.newScene("library")}>
          From a Map asset
        </Button>
        <Button sx={{ fontSize: 0 }} onClick={() => proto.actions.newScene("upload")}>
          Upload a map
        </Button>
      </Flex>
    </Box>
  );
}

function Dock({ proto }: { proto: Proto }) {
  return (
    <Flex sx={{ height: "100%" }}>
      {!proto.collapsed && (
        <Flex
          sx={{
            width: 240,
            flexDirection: "column",
            borderLeft: "1px solid",
            borderColor: "muted",
          }}
        >
          <Flex sx={{ alignItems: "center", p: 2, pb: 1 }}>
            <Text sx={{ flexGrow: 1 }}>{tabLabel(proto.tab)}</Text>
            <IconButton
              title="Collapse to the tab strip"
              onClick={() => proto.setCollapsed(true)}
            >
              »
            </IconButton>
          </Flex>
          {proto.tab !== "scenes" && (
            <Box px={2}>
              <FilterBar proto={proto} />
            </Box>
          )}
          <Box sx={{ flexGrow: 1, overflowY: "auto", px: 2, pb: 2 }}>
            {proto.tab === "scenes" ? (
              <ScenesPanel proto={proto} />
            ) : (
              proto.dockSections.map((section) => (
                <DockSection key={section.id} proto={proto} section={section} />
              ))
            )}
          </Box>
          <Box p={2} bg="muted">
            <Button sx={{ width: "100%" }} onClick={() => proto.setManagerOpen(true)}>
              Asset Manager
            </Button>
          </Box>
        </Flex>
      )}
      <Flex
        sx={{
          width: 48,
          flexDirection: "column",
          alignItems: "center",
          bg: "muted",
          pt: 2,
          gap: 1,
        }}
      >
        {tabsFor(proto.role).map((tab) => (
          <IconButton
            key={tab}
            title={tabLabel(tab)}
            onClick={() => {
              if (proto.tab === tab) proto.setCollapsed(!proto.collapsed);
              else {
                proto.setTab(tab);
                proto.setCollapsed(false);
              }
            }}
            sx={{
              color: proto.tab === tab && !proto.collapsed ? "primary" : "text",
            }}
          >
            <TabIcon tab={tab} />
          </IconButton>
        ))}
      </Flex>
    </Flex>
  );
}

function FolderCard({ folder, onOpen }: { folder: Folder; onOpen: () => void }) {
  return (
    <Flex
      sx={{ flexDirection: "column", cursor: "pointer" }}
      onClick={onOpen}
    >
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "2px",
          width: 96,
          height: 96,
          bg: "muted",
          borderRadius: "6px",
          p: "4px",
        }}
      >
        {folder.assets.slice(0, 4).map((asset) => (
          <Thumb key={asset.id} asset={asset} size={42} />
        ))}
      </Box>
      <Text sx={{ fontSize: 1, mt: 1 }}><FolderGlyph />{folder.name}</Text>
      <Text variant="caption">{folder.assets.length} assets</Text>
    </Flex>
  );
}

function ManagerTile({ proto, asset }: { proto: Proto; asset: Asset }) {
  const selected = proto.selected?.id === asset.id;
  return (
    <Flex
      sx={{
        flexDirection: "column",
        cursor: "pointer",
        p: 1,
        borderRadius: "6px",
        outline: selected ? "2px solid" : "none",
        outlineColor: "primary",
        width: 104,
      }}
      onClick={() => proto.setSelectedId(asset.id)}
    >
      <Thumb asset={asset} size={96} />
      <Text sx={{ fontSize: 1, mt: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {asset.name}
      </Text>
      <Text variant="caption">
        {typeLabels[asset.type]}
        {asset.uploader ? ` · ${asset.uploader}` : ""}
      </Text>
    </Flex>
  );
}

function Manager({ proto }: { proto: Proto }) {
  const [inFolder, setInFolder] = useState<string | null>(null);
  const sections = proto.managerSections;
  const openFolder = sections
    .flatMap((s) => s.folders.map((f) => ({ section: s, folder: f })))
    .find((x) => x.folder.key === inFolder);
  const selected = proto.selected;

  return (
    <Flex
      sx={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        bg: "rgba(0,0,0,0.73)",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={() => proto.setManagerOpen(false)}
    >
      <Flex
        sx={{
          width: "90vw",
          height: "84vh",
          bg: "background",
          borderRadius: "8px",
          flexDirection: "column",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <Flex sx={{ p: 3, pb: 2, alignItems: "center", gap: 2 }}>
          <Text variant="heading" sx={{ fontSize: 3, flexGrow: 1 }}>
            Asset Manager
          </Text>
          <Button onClick={proto.actions.upload}>Upload</Button>
          <Button variant="secondary" onClick={proto.actions.newFolder}>
            New folder
          </Button>
          <Button variant="secondary" onClick={proto.actions.importBrowser}>
            Import browser library
          </Button>
          <IconButton onClick={() => proto.setManagerOpen(false)} title="Close">
            ✕
          </IconButton>
        </Flex>
        <Flex sx={{ px: 3, gap: 3, alignItems: "center" }}>
          <Box sx={{ width: 380 }}>
            <FilterBar proto={proto} />
          </Box>
          <Flex sx={{ gap: 1 }}>
            {(["all", ...assetTypes] as const)
              .filter((t) => proto.role === "gm" || t !== "map")
              .map((t) => (
                <Button
                  key={t}
                  variant={proto.managerType === t ? "primary" : "secondary"}
                  sx={{ fontSize: 0, p: "2px 8px" }}
                  onClick={() => proto.setManagerType(t)}
                >
                  {t === "all" ? "All types" : typeLabels[t]}
                </Button>
              ))}
          </Flex>
        </Flex>
        <Box sx={{ flexGrow: 1, overflowY: "auto", px: 3, pb: 3 }}>
          {openFolder ? (
            <Box>
              <Flex sx={{ alignItems: "center", gap: 2, my: 2 }}>
                <Button variant="secondary" sx={{ fontSize: 0 }} onClick={() => setInFolder(null)}>
                  ← Back
                </Button>
                <Text>
                  {openFolder.section.heading} › <FolderGlyph />{openFolder.folder.name}
                </Text>
              </Flex>
              <Flex sx={{ flexWrap: "wrap", gap: 2 }}>
                {openFolder.folder.assets.map((asset) => (
                  <ManagerTile key={asset.id} proto={proto} asset={asset} />
                ))}
              </Flex>
            </Box>
          ) : (
            sections.map(
              (section) =>
                section.count > 0 && (
                  <Box key={section.id}>
                    <Heading>
                      {section.heading} · {section.count}
                      {section.readOnly ? " · read-only" : ""}
                    </Heading>
                    <Flex sx={{ flexWrap: "wrap", gap: 2 }}>
                      {section.folders.map((folder) => (
                        <FolderCard
                          key={folder.key}
                          folder={folder}
                          onOpen={() => setInFolder(folder.key)}
                        />
                      ))}
                      {section.assets.map((asset) => (
                        <ManagerTile key={asset.id} proto={proto} asset={asset} />
                      ))}
                    </Flex>
                  </Box>
                )
            )
          )}
        </Box>
        <Flex
          sx={{ bg: "muted", p: 2, px: 3, alignItems: "center", gap: 2, minHeight: 52 }}
        >
          {selected ? (
            <>
              <Thumb asset={selected} size={32} />
              <Text sx={{ flexGrow: 1 }}>{selected.name}</Text>
              {proto.mayEdit(selected) ? (
                <>
                  <Button variant="secondary" sx={{ fontSize: 0 }} onClick={() => proto.actions.rename(selected)}>
                    Rename
                  </Button>
                  <TypeSelect proto={proto} asset={selected} />
                  <FolderSelect proto={proto} asset={selected} />
                  {moveLabel(proto, selected) && (
                    <Button variant="secondary" sx={{ fontSize: 0 }} onClick={() => proto.actions.move(selected)}>
                      {moveLabel(proto, selected)}
                    </Button>
                  )}
                  <Button sx={{ fontSize: 0, bg: "error" }} onClick={() => proto.actions.remove(selected)}>
                    Delete
                  </Button>
                </>
              ) : (
                <Text variant="caption">Server set: read-only</Text>
              )}
            </>
          ) : (
            <Text variant="caption" sx={{ flexGrow: 1 }}>
              Select an asset to edit it
            </Text>
          )}
          <Box sx={{ width: 200, ml: 3 }}>
            <QuotaBar proto={proto} />
          </Box>
        </Flex>
      </Flex>
    </Flex>
  );
}

function VariantA({
  proto,
  canvas,
  fullScreen,
}: {
  proto: Proto;
  canvas: ReactNode;
  fullScreen: boolean;
}) {
  return (
    <>
      <Flex sx={{ flexGrow: 1, minWidth: 0 }}>{canvas}</Flex>
      {!fullScreen && <Dock proto={proto} />}
      {proto.managerOpen && <Manager proto={proto} />}
    </>
  );
}

export default VariantA;
