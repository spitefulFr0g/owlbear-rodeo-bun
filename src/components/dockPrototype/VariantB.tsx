// PROTOTYPE variant B: a bottom tray under the canvas whose libraries run
// left to right as shelves, and the Asset Manager as a full-screen table.
import { Fragment, ReactNode } from "react";
import { Box, Button, Flex, IconButton, Input, Text } from "theme-ui";

import { Asset, assetTypes, scenes, typeLabels } from "./data";
import { filterOptions, formatBytes, Proto, Section, tabLabel, tabsFor } from "./model";
import { FolderSelect, moveLabel, QuotaBar, selectStyle, TabIcon, Thumb, TypeSelect , FolderGlyph } from "./parts";

export const name = "Bottom tray + table";

function Chips({ proto }: { proto: Proto }) {
  return (
    <Flex sx={{ gap: "2px", bg: "muted", borderRadius: 999, p: "2px" }}>
      {filterOptions(proto.role).map((o) => (
        <Box
          key={o.value}
          as="button"
          onClick={() => proto.setFilter(o.value)}
          sx={{
            border: "none",
            borderRadius: 999,
            px: 2,
            py: "2px",
            fontFamily: "body2",
            fontSize: 0,
            cursor: "pointer",
            bg: proto.filter === o.value ? "primary" : "transparent",
            color: proto.filter === o.value ? "background" : "text",
          }}
        >
          {o.label}
        </Box>
      ))}
    </Flex>
  );
}

/** The same filter, search and order in the tray and in the manager */
function FilterRow({ proto }: { proto: Proto }) {
  return (
    <Flex sx={{ gap: 2, alignItems: "center" }}>
      <Chips proto={proto} />
      <Input
        value={proto.search}
        onChange={(e) => proto.setSearch(e.target.value)}
        placeholder="Search"
        sx={{ width: 160, p: "2px 8px", fontSize: 1, borderRadius: 999 }}
      />
      <select
        style={selectStyle}
        value={proto.sort}
        onChange={(e) => proto.setSort(e.target.value as any)}
      >
        <option value="name">By name</option>
        <option value="newest">Newest first</option>
      </select>
    </Flex>
  );
}

function ShelfTile({ proto, asset }: { proto: Proto; asset: Asset }) {
  return (
    <Flex
      sx={{ flexDirection: "column", alignItems: "center", width: 72, cursor: "grab" }}
      onClick={() => proto.actions.place(asset)}
      title={asset.name}
    >
      <Thumb asset={asset} size={56} />
      <Text sx={{ fontFamily: "body2", fontSize: 0, width: "100%", textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {asset.name}
      </Text>
      {asset.uploader && <Text variant="caption">{asset.uploader}</Text>}
    </Flex>
  );
}

function Shelf({ proto, section }: { proto: Proto; section: Section }) {
  if (section.count === 0) return null;
  return (
    <Flex sx={{ flexDirection: "column", flexShrink: 0, pr: 3, mr: 3, borderRight: "1px solid", borderColor: "muted" }}>
      <Text sx={{ fontSize: 1, mb: 1, color: section.readOnly ? "gray" : "text" }}>
        {section.heading} <Text variant="caption">{section.count}</Text>
      </Text>
      <Flex sx={{ gap: 2, alignItems: "flex-start" }}>
        {section.folders.map((folder) => {
          const open = proto.isOpen(folder.key);
          return (
            <Flex
              key={folder.key}
              sx={{
                gap: 2,
                bg: open ? "muted" : "transparent",
                borderRadius: "8px",
                p: open ? 1 : 0,
              }}
            >
              <Flex
                sx={{ flexDirection: "column", alignItems: "center", width: 72, cursor: "pointer" }}
                onClick={() => proto.toggleFolder(folder.key)}
                title={open ? "Close folder" : "Open folder"}
              >
                <Box sx={{ position: "relative", width: 56, height: 56 }}>
                  {folder.assets.slice(0, 3).map((asset, i) => (
                    <Box key={asset.id} style={{ position: "absolute", left: i * 5, top: i * 5, opacity: 1 - i * 0.2 }}>
                      <Thumb asset={asset} size={46} />
                    </Box>
                  )).reverse()}
                </Box>
                <Text sx={{ fontFamily: "body2", fontSize: 0, textAlign: "center" }}>
                  {open ? "▾" : "▸"} {folder.name} ({folder.assets.length})
                </Text>
              </Flex>
              {open &&
                folder.assets.map((asset) => (
                  <ShelfTile key={asset.id} proto={proto} asset={asset} />
                ))}
            </Flex>
          );
        })}
        {section.assets.map((asset) => (
          <ShelfTile key={asset.id} proto={proto} asset={asset} />
        ))}
      </Flex>
    </Flex>
  );
}

function Tray({ proto }: { proto: Proto }) {
  return (
    <Box sx={{ borderTop: "1px solid", borderColor: "muted" }}>
      <Flex sx={{ alignItems: "center", bg: "muted", px: 2, height: 40, gap: 1 }}>
        {tabsFor(proto.role).map((tab) => (
          <Flex
            key={tab}
            as="button"
            onClick={() => {
              if (proto.tab === tab) proto.setCollapsed(!proto.collapsed);
              else {
                proto.setTab(tab);
                proto.setCollapsed(false);
              }
            }}
            sx={{
              alignItems: "center",
              gap: 1,
              border: "none",
              bg: "transparent",
              cursor: "pointer",
              color: proto.tab === tab && !proto.collapsed ? "primary" : "text",
              borderBottom: "2px solid",
              borderColor: proto.tab === tab && !proto.collapsed ? "primary" : "transparent",
              height: "100%",
              px: 2,
              fontFamily: "body",
              fontSize: 1,
            }}
          >
            <TabIcon tab={tab} /> {tabLabel(tab)}
          </Flex>
        ))}
        <Box sx={{ flexGrow: 1 }} />
        {!proto.collapsed && proto.tab !== "scenes" && <FilterRow proto={proto} />}
        <Button sx={{ fontSize: 0, ml: 2 }} onClick={() => proto.setManagerOpen(true)}>
          Asset Manager
        </Button>
        <IconButton
          title={proto.collapsed ? "Open the tray" : "Collapse to the tab strip"}
          onClick={() => proto.setCollapsed(!proto.collapsed)}
        >
          {proto.collapsed ? "▴" : "▾"}
        </IconButton>
      </Flex>
      {!proto.collapsed && (
        <Flex sx={{ height: 150, overflowX: "auto", overflowY: "hidden", p: 2 }}>
          {proto.tab === "scenes" ? (
            <Flex sx={{ gap: 3, alignItems: "flex-start" }}>
              {scenes.map((scene) => (
                <Box key={scene} sx={{ width: 140, height: 90, bg: "muted", borderRadius: "6px", p: 2 }}>
                  {scene}
                </Box>
              ))}
              <Flex sx={{ flexDirection: "column", gap: 1 }}>
                <Button sx={{ fontSize: 0 }} onClick={() => proto.actions.newScene("library")}>
                  New scene from a Map asset
                </Button>
                <Button variant="secondary" sx={{ fontSize: 0 }} onClick={() => proto.actions.newScene("upload")}>
                  New scene from an upload
                </Button>
              </Flex>
            </Flex>
          ) : (
            proto.dockSections.map((section) => (
              <Shelf key={section.id} proto={proto} section={section} />
            ))
          )}
        </Flex>
      )}
    </Box>
  );
}

const days = (n: number) => (n === 0 ? "today" : n === 1 ? "yesterday" : `${n} days ago`);

function Row({ proto, asset, indent }: { proto: Proto; asset: Asset; indent: boolean }) {
  const editable = proto.mayEdit(asset);
  const move = moveLabel(proto, asset);
  return (
    <Box as="tr" sx={{ "&:hover": { bg: "muted" } }}>
      <Box as="td" sx={{ pl: indent ? 4 : 2, py: 1 }}>
        <Flex sx={{ alignItems: "center", gap: 2 }}>
          <Thumb asset={asset} size={28} />
          {editable ? (
            <Text sx={{ cursor: "text", borderBottom: "1px dashed", borderColor: "border" }} onClick={() => proto.actions.rename(asset)} title="Rename">
              {asset.name}
            </Text>
          ) : (
            <Text>{asset.name}</Text>
          )}
        </Flex>
      </Box>
      <Box as="td">{editable ? <TypeSelect proto={proto} asset={asset} /> : typeLabels[asset.type]}</Box>
      <Box as="td">{editable ? <FolderSelect proto={proto} asset={asset} /> : "—"}</Box>
      <Box as="td" sx={{ fontFamily: "body2", fontSize: 0 }}>{asset.uploader ?? ""}</Box>
      <Box as="td" sx={{ fontFamily: "body2", fontSize: 0 }}>{formatBytes(asset.bytes)}</Box>
      <Box as="td" sx={{ fontFamily: "body2", fontSize: 0 }}>{days(asset.added)}</Box>
      <Box as="td" sx={{ whiteSpace: "nowrap" }}>
        {move && (
          <Button variant="secondary" sx={{ fontSize: 0, p: "2px 6px", mr: 1 }} onClick={() => proto.actions.move(asset)}>
            {move}
          </Button>
        )}
        {editable && (
          <Button sx={{ fontSize: 0, p: "2px 6px", bg: "error" }} onClick={() => proto.actions.remove(asset)}>
            Delete
          </Button>
        )}
      </Box>
    </Box>
  );
}

function Manager({ proto }: { proto: Proto }) {
  return (
    <Flex sx={{ position: "fixed", inset: 0, zIndex: 100, bg: "background", flexDirection: "column" }}>
      <Flex sx={{ alignItems: "center", gap: 3, p: 3, borderBottom: "1px solid", borderColor: "muted" }}>
        <Button variant="secondary" onClick={() => proto.setManagerOpen(false)}>
          ← Back to the room
        </Button>
        <Text variant="heading" sx={{ fontSize: 4 }}>
          Asset Manager
        </Text>
        <Box sx={{ flexGrow: 1 }} />
        <Box sx={{ width: 220 }}>
          <QuotaBar proto={proto} />
        </Box>
        <Button onClick={proto.actions.upload}>Upload</Button>
        <Button variant="secondary" onClick={proto.actions.newFolder}>New folder</Button>
        <Button variant="secondary" onClick={proto.actions.importBrowser}>Import browser library</Button>
      </Flex>
      <Flex sx={{ p: 3, gap: 3, alignItems: "center" }}>
        <FilterRow proto={proto} />
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
      </Flex>
      <Box sx={{ flexGrow: 1, overflowY: "auto", px: 3, pb: 5 }}>
        <Box as="table" sx={{ width: "100%", borderCollapse: "collapse", "& td, & th": { textAlign: "left", pr: 2 } }}>
          <thead>
            <Box as="tr" sx={{ fontFamily: "body2", fontSize: 0, color: "gray" }}>
              <th>Name</th>
              <th>Type</th>
              <th>Folder</th>
              <th>Uploaded by</th>
              <th>Size</th>
              <th>Added</th>
              <th />
            </Box>
          </thead>
          <tbody>
            {proto.managerSections.map(
              (section) =>
                section.count > 0 && (
                  <Fragment key={section.id}>
                    <tr>
                      <td colSpan={7} style={{ paddingTop: 16, paddingBottom: 4, fontSize: 20, position: "sticky", top: 0, background: "hsl(230, 25%, 18%)", zIndex: 1 }}>
                        {section.heading} <Text variant="caption">{section.count}{section.readOnly ? " · read-only" : ""}</Text>
                      </td>
                    </tr>
                    {section.folders.map((folder) => (
                      <Fragment key={folder.key}>
                        <Box as="tr" sx={{ cursor: "pointer" }} onClick={() => proto.toggleFolder(folder.key)}>
                          <td colSpan={7} style={{ paddingLeft: 8, paddingTop: 4, paddingBottom: 4 }}>
                            {proto.isOpen(folder.key) ? "▾" : "▸"} <FolderGlyph />{folder.name}{" "}
                            <Text variant="caption">{folder.assets.length}</Text>
                          </td>
                        </Box>
                        {proto.isOpen(folder.key) &&
                          folder.assets.map((asset) => (
                            <Row key={asset.id} proto={proto} asset={asset} indent />
                          ))}
                      </Fragment>
                    ))}
                    {section.assets.map((asset) => (
                      <Row key={asset.id} proto={proto} asset={asset} indent={false} />
                    ))}
                  </Fragment>
                )
            )}
          </tbody>
        </Box>
      </Box>
    </Flex>
  );
}

function VariantB({
  proto,
  canvas,
  fullScreen,
}: {
  proto: Proto;
  canvas: ReactNode;
  fullScreen: boolean;
}) {
  return (
    <Flex sx={{ flexDirection: "column", flexGrow: 1, minWidth: 0 }}>
      <Flex sx={{ flexGrow: 1, minHeight: 0 }}>{canvas}</Flex>
      {!fullScreen && <Tray proto={proto} />}
      {proto.managerOpen && <Manager proto={proto} />}
    </Flex>
  );
}

export default VariantB;
