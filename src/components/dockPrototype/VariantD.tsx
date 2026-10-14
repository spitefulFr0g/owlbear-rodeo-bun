// PROTOTYPE variant D: a tab strip on the edge opens a flyout over the canvas
// with one column per library side by side. The Asset Manager is a column
// browser: library, then folder, then asset, then its details.
import { ReactNode, useState } from "react";
import { Box, Button, Flex, IconButton, Input, Text } from "theme-ui";

import { Asset, assetTypes, scenes, typeLabels } from "./data";
import { filterOptions, formatBytes, Proto, Section, SectionId, tabLabel, tabsFor } from "./model";
import { FolderSelect, moveLabel, QuotaBar, selectStyle, TabIcon, Thumb, TypeSelect , FolderGlyph } from "./parts";

export const name = "Flyout columns + column browser";

function FilterBar({ proto }: { proto: Proto }) {
  return (
    <Flex sx={{ gap: 2, alignItems: "center" }}>
      <Text sx={{ fontFamily: "body2", fontSize: 0 }}>Show</Text>
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
        sx={{ width: 180, p: "2px 6px", fontSize: 1 }}
      />
      <select
        style={selectStyle}
        value={proto.sort}
        onChange={(e) => proto.setSort(e.target.value as any)}
      >
        <option value="name">Folders, then by name</option>
        <option value="newest">Folders, then newest</option>
      </select>
    </Flex>
  );
}

function MiniTile({ proto, asset }: { proto: Proto; asset: Asset }) {
  return (
    <Flex
      sx={{ flexDirection: "column", alignItems: "center", cursor: "grab", minWidth: 0 }}
      onClick={() => proto.actions.place(asset)}
      title={asset.uploader ? `${asset.name} (from ${asset.uploader})` : asset.name}
    >
      <Thumb asset={asset} size={60} />
      <Text sx={{ fontFamily: "body2", fontSize: 0, width: "100%", textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {asset.name}
      </Text>
    </Flex>
  );
}

function LibraryColumn({ proto, section, wide }: { proto: Proto; section: Section; wide: boolean }) {
  const columns = wide ? 4 : 2;
  return (
    <Flex
      sx={{
        flexDirection: "column",
        minWidth: wide ? 340 : 170,
        flexGrow: 1,
        flexShrink: 0,
        borderRight: "1px solid",
        borderColor: "muted",
        minHeight: 0,
      }}
    >
      <Box sx={{ p: 2, bg: "muted" }}>
        <Text sx={{ fontSize: 1 }}>{section.heading}</Text>{" "}
        <Text variant="caption">
          {section.count}
          {section.readOnly ? " · read-only" : ""}
        </Text>
      </Box>
      <Box sx={{ overflowY: "auto", p: 2, flexGrow: 1 }}>
        {section.count === 0 && <Text variant="caption">No matches</Text>}
        {section.folders.map((folder) => (
          <Box key={folder.key} sx={{ mb: 2 }}>
            <Flex
              sx={{ cursor: "pointer", fontSize: 1, alignItems: "center", gap: 1, bg: "muted", borderRadius: "4px", px: 1 }}
              onClick={() => proto.toggleFolder(folder.key)}
            >
              {proto.isOpen(folder.key) ? "▾" : "▸"} <Text sx={{ flexGrow: 1 }}>{folder.name}</Text>
              <Text variant="caption">{folder.assets.length}</Text>
            </Flex>
            {proto.isOpen(folder.key) && (
              <Box sx={{ display: "grid", gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 1, mt: 1 }}>
                {folder.assets.map((asset) => (
                  <MiniTile key={asset.id} proto={proto} asset={asset} />
                ))}
              </Box>
            )}
          </Box>
        ))}
        <Box sx={{ display: "grid", gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 1 }}>
          {section.assets.map((asset) => (
            <MiniTile key={asset.id} proto={proto} asset={asset} />
          ))}
        </Box>
      </Box>
    </Flex>
  );
}

function Flyout({ proto }: { proto: Proto }) {
  const sections = proto.dockSections;
  return (
    <Flex
      sx={{
        position: "absolute",
        right: 0,
        top: 0,
        bottom: 0,
        zIndex: 10,
        bg: "background",
        flexDirection: "column",
        boxShadow: "-6px 0 20px rgba(0,0,0,0.45)",
        maxWidth: "calc(100% - 60px)",
      }}
    >
      <Flex sx={{ p: 2, gap: 2, alignItems: "center", borderBottom: "1px solid", borderColor: "muted" }}>
        <Text sx={{ fontSize: 2 }}>{tabLabel(proto.tab)}</Text>
        {proto.tab !== "scenes" && <FilterBar proto={proto} />}
        <Box sx={{ flexGrow: 1 }} />
        <Button sx={{ fontSize: 0 }} onClick={() => proto.setManagerOpen(true)}>
          Asset Manager
        </Button>
        <IconButton title="Collapse to the tab strip" onClick={() => proto.setCollapsed(true)}>
          ✕
        </IconButton>
      </Flex>
      {proto.tab === "scenes" ? (
        <Box p={3}>
          {scenes.map((scene) => (
            <Box key={scene} sx={{ py: 1 }}>
              {scene}
            </Box>
          ))}
          <Flex sx={{ gap: 2, mt: 2 }}>
            <Button sx={{ fontSize: 0 }} onClick={() => proto.actions.newScene("library")}>
              New scene from a Map asset
            </Button>
            <Button variant="secondary" sx={{ fontSize: 0 }} onClick={() => proto.actions.newScene("upload")}>
              New scene from an upload
            </Button>
          </Flex>
        </Box>
      ) : (
        <Flex sx={{ flexGrow: 1, minHeight: 0, overflowX: "auto" }}>
          {sections.map((section) => (
            <LibraryColumn key={section.id} proto={proto} section={section} wide={sections.length === 1} />
          ))}
        </Flex>
      )}
    </Flex>
  );
}

function Strip({ proto }: { proto: Proto }) {
  return (
    <Flex sx={{ width: 48, flexDirection: "column", alignItems: "center", bg: "muted", pt: 2, gap: 1, zIndex: 11 }}>
      {tabsFor(proto.role).map((tab) => {
        const active = proto.tab === tab && !proto.collapsed;
        return (
          <IconButton
            key={tab}
            title={tabLabel(tab)}
            sx={{ color: active ? "background" : "text", bg: active ? "primary" : "transparent" }}
            onClick={() => {
              if (active) proto.setCollapsed(true);
              else {
                proto.setTab(tab);
                proto.setCollapsed(false);
              }
            }}
          >
            <TabIcon tab={tab} />
          </IconButton>
        );
      })}
    </Flex>
  );
}

function Column({ title, children, width }: { title: string; children: ReactNode; width: number | string }) {
  return (
    <Flex sx={{ flexDirection: "column", width, flexShrink: 0, borderRight: "1px solid", borderColor: "muted", minHeight: 0 }}>
      <Text variant="caption" sx={{ p: 2, textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {title}
      </Text>
      <Box sx={{ overflowY: "auto", flexGrow: 1 }}>{children}</Box>
    </Flex>
  );
}

function Item({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <Flex
      onClick={onClick}
      sx={{
        alignItems: "center",
        gap: 2,
        px: 2,
        py: 1,
        cursor: "pointer",
        fontSize: 1,
        bg: active ? "highlight" : "transparent",
        "&:hover": { bg: active ? "highlight" : "muted" },
      }}
    >
      {children}
    </Flex>
  );
}

function Manager({ proto }: { proto: Proto }) {
  const sections = proto.managerSections;
  const [sectionId, setSectionId] = useState<SectionId | null>(null);
  const [folderName, setFolderName] = useState<string | null>(null);
  const section = sections.find((s) => s.id === sectionId) ?? sections[0];
  const folder = section?.folders.find((f) => f.name === folderName);
  const assets = folder ? folder.assets : section?.assets ?? [];
  const asset = proto.selected;
  const move = asset && moveLabel(proto, asset);

  return (
    <Flex
      sx={{ position: "fixed", inset: 0, zIndex: 100, bg: "rgba(0,0,0,0.73)", alignItems: "center", justifyContent: "center" }}
      onClick={() => proto.setManagerOpen(false)}
    >
      <Flex
        sx={{ width: "94vw", height: "86vh", bg: "background", borderRadius: "8px", flexDirection: "column", overflow: "hidden" }}
        onClick={(e) => e.stopPropagation()}
      >
        <Flex sx={{ p: 2, px: 3, gap: 3, alignItems: "center", borderBottom: "1px solid", borderColor: "muted" }}>
          <Text variant="heading" sx={{ fontSize: 3 }}>
            Asset Manager
          </Text>
          <FilterBar proto={proto} />
          <select
            style={selectStyle}
            value={proto.managerType}
            onChange={(e) => proto.setManagerType(e.target.value as any)}
          >
            <option value="all">All types</option>
            {assetTypes
              .filter((t) => proto.role === "gm" || t !== "map")
              .map((t) => (
                <option key={t} value={t}>
                  {typeLabels[t]}
                </option>
              ))}
          </select>
          <Box sx={{ flexGrow: 1 }} />
          <IconButton onClick={() => proto.setManagerOpen(false)} title="Close">
            ✕
          </IconButton>
        </Flex>
        <Flex sx={{ flexGrow: 1, minHeight: 0 }}>
          <Column title="Library" width={200}>
            {sections.map((s) => (
              <Item
                key={s.id}
                active={s.id === section?.id}
                onClick={() => {
                  setSectionId(s.id);
                  setFolderName(null);
                }}
              >
                <Text sx={{ flexGrow: 1 }}>{s.heading}</Text>
                <Text variant="caption">{s.count}</Text>
              </Item>
            ))}
            <Box sx={{ p: 2, mt: 3 }}>
              <QuotaBar proto={proto} />
              <Flex sx={{ flexDirection: "column", gap: 1, mt: 3 }}>
                <Button sx={{ fontSize: 0 }} onClick={proto.actions.upload}>Upload</Button>
                <Button variant="secondary" sx={{ fontSize: 0 }} onClick={proto.actions.importBrowser}>
                  Import browser library
                </Button>
              </Flex>
            </Box>
          </Column>
          <Column title="Folder" width={200}>
            {section && (
              <>
                <Item active={!folder} onClick={() => setFolderName(null)}>
                  <Text sx={{ flexGrow: 1 }}>{section.id === "players" ? "All player uploads" : section.id === "server" ? "Everything" : "Top level"}</Text>
                  <Text variant="caption">{section.assets.length}</Text>
                </Item>
                {section.folders.map((f) => (
                  <Item key={f.key} active={f.name === folder?.name} onClick={() => setFolderName(f.name)}>
                    <Text sx={{ flexGrow: 1 }}><FolderGlyph />{f.name}</Text>
                    <Text variant="caption">{f.assets.length}</Text>
                  </Item>
                ))}
                {!section.readOnly && section.id !== "players" && (
                  <Box p={2}>
                    <Button variant="secondary" sx={{ fontSize: 0 }} onClick={proto.actions.newFolder}>
                      New folder
                    </Button>
                  </Box>
                )}
              </>
            )}
          </Column>
          <Column title="Assets" width={260}>
            {assets.map((a) => (
              <Item key={a.id} active={a.id === asset?.id} onClick={() => proto.setSelectedId(a.id)}>
                <Thumb asset={a} size={28} />
                <Text sx={{ flexGrow: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</Text>
                <Text variant="caption">{a.uploader ?? typeLabels[a.type]}</Text>
              </Item>
            ))}
          </Column>
          <Flex sx={{ flexGrow: 1, flexDirection: "column", alignItems: "center", p: 3, gap: 2, overflowY: "auto" }}>
            {asset ? (
              <>
                <Thumb asset={asset} size={200} />
                <Text variant="heading" sx={{ fontSize: 3 }}>{asset.name}</Text>
                <Text variant="caption">
                  {typeLabels[asset.type]} · {formatBytes(asset.bytes)}
                  {asset.uploader ? ` · uploaded by ${asset.uploader}` : ""}
                </Text>
                {proto.mayEdit(asset) ? (
                  <Flex sx={{ gap: 2, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
                    <Button variant="secondary" sx={{ fontSize: 0 }} onClick={() => proto.actions.rename(asset)}>Rename</Button>
                    <TypeSelect proto={proto} asset={asset} />
                    <FolderSelect proto={proto} asset={asset} />
                    {move && (
                      <Button variant="secondary" sx={{ fontSize: 0 }} onClick={() => proto.actions.move(asset)}>{move}</Button>
                    )}
                    <Button sx={{ fontSize: 0, bg: "error" }} onClick={() => proto.actions.remove(asset)}>Delete</Button>
                  </Flex>
                ) : (
                  <Text variant="caption">The server set is read-only</Text>
                )}
              </>
            ) : (
              <Text sx={{ color: "gray", mt: 5 }}>Pick an asset</Text>
            )}
          </Flex>
        </Flex>
      </Flex>
    </Flex>
  );
}

function VariantD({
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
      <Flex sx={{ flexGrow: 1, minWidth: 0, position: "relative" }}>
        {canvas}
        {!fullScreen && !proto.collapsed && <Flyout proto={proto} />}
      </Flex>
      {!fullScreen && <Strip proto={proto} />}
      {proto.managerOpen && <Manager proto={proto} />}
    </>
  );
}

export default VariantD;
