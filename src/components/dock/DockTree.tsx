import React, { useEffect, useMemo, useState } from "react";
import { Box, Flex, Text } from "theme-ui";

import Draggable from "../drag/Draggable";
import Droppable from "../drag/Droppable";
import DockRow, { openKeyboardMenu } from "./DockRow";
import ExpandMoreIcon from "../../icons/ExpandMoreIcon";

import { useLibrary } from "../../contexts/LibraryContext";
import { sectionColours } from "../../helpers/dock";
import {
  AssetType,
  LibraryFilter,
  LibraryFolder,
  LibrarySection,
  librarySections,
  LibraryViewAsset,
} from "../../sceneRules/library";
import { Person } from "../../sceneRules/types";

export const rowHint = "Click to place, right-click for more";

type DockTreeProps = {
  type: AssetType;
  person: Person;
  roomId: string;
  accountId?: string;
  /** Overrides the shared filter, as the server set's own window does */
  filter?: LibraryFilter;
  /** Changes to close every folder */
  collapseKey: number;
  onPlace: (asset: LibraryViewAsset) => void;
  onAssetMenu: (asset: LibraryViewAsset, event: React.MouseEvent) => void;
  onFolderMenu?: (folder: LibraryFolder, event: React.MouseEvent) => void;
};

function Chevron({ open }: { open: boolean }) {
  return (
    <Box
      sx={{
        width: "20px",
        height: "20px",
        flexShrink: 0,
        transform: open ? "none" : "rotate(-90deg)",
        transition: "transform 0.1s",
        "> svg": { width: "20px", height: "20px" },
      }}
    >
      <ExpandMoreIcon />
    </Box>
  );
}

/**
 * The libraries for one asset type as a tree of coloured headings, each
 * holding its folders by name and then its assets
 */
function DockTree({
  type,
  person,
  roomId,
  accountId,
  filter,
  collapseKey,
  onPlace,
  onAssetMenu,
  onFolderMenu,
}: DockTreeProps) {
  const library = useLibrary();
  const sections = useMemo(
    () =>
      librarySections({
        person,
        roomId,
        accountId,
        assets: library.assets,
        // Player folders are private organisation; the GM sees their uploads ungrouped.
        folders: person.role === "gm" ? library.folders.filter(folder => folder.owner === null) : library.folders,
        serverSet: library.serverSet,
        filter: filter || library.filter,
        order: library.order,
        search: library.search,
        type,
        // "From players" shows only when this tab has something under it
      }).filter((section) => section.id !== "players" || section.folders.length > 0 || section.assets.length > 0),
    [person, roomId, accountId, library.assets, library.folders, library.serverSet, filter, library.filter, library.order, library.search, type]
  );
  const [closedSections, setClosedSections] = useState<Set<string>>(new Set());
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());
  useEffect(() => setOpenFolders(new Set()), [collapseKey]);

  function toggle(set: Set<string>, id: string) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  }

  function row(asset: LibraryViewAsset, section: LibrarySection, depth: number) {
    const caption = section.id === "players" && "uploaderName" in asset ? asset.uploaderName : undefined;
    return (
      <Draggable interactiveChild key={asset.id} id={`asset:${asset.id}`} data={{ asset }}>
        <DockRow
          asset={asset}
          caption={caption}
          depth={depth}
          title={rowHint}
          onClick={() => onPlace(asset)}
          onContextMenu={(event) => {
            event.preventDefault();
            onAssetMenu(asset, event);
          }}
        />
      </Draggable>
    );
  }

  return (
    <Box>
      {sections.map((section) => {
        const colours = sectionColours[section.id];
        const open = !!library.search.trim() || !closedSections.has(section.id);
        const count = section.assets.length + section.folders.reduce((total, folder) => total + folder.assets.length, 0);
        return (
          <Box key={section.id} as="section" aria-label={section.heading}>
            <Flex
              as="button"
              aria-expanded={open}
              onClick={() => setClosedSections((set) => toggle(set, section.id))}
              sx={{
                width: "100%",
                alignItems: "center",
                height: "30px",
                px: 1,
                border: "none",
                bg: colours.heading,
                color: "white",
                fontFamily: "heading",
                fontSize: 1,
                cursor: "pointer",
                mt: "1px",
              }}
            >
              <Chevron open={open} />
              <Text sx={{ flexGrow: 1, textAlign: "left", fontFamily: "heading", fontSize: 1, color: "white" }}>
                {section.heading}
              </Text>
              <Text sx={{ fontSize: 0, opacity: 0.8, color: "white" }}>{count}</Text>
            </Flex>
            {open && (
              <Box sx={{ borderLeft: "3px solid", borderColor: colours.heading }}>
                {section.folders.map((folder) => {
                  const folderOpen = folder.open || openFolders.has(folder.id);
                  return (
                    <Droppable key={folder.id} id={`folder:${folder.id}`}>
                      <Flex
                        role="button"
                        tabIndex={0}
                        aria-expanded={folderOpen}
                        onClick={() => setOpenFolders((set) => toggle(set, folder.id))}
                        onKeyDown={(event) => {
                          openKeyboardMenu(event);
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setOpenFolders((set) => toggle(set, folder.id));
                          }
                        }}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          onFolderMenu?.(folder, event);
                        }}
                        sx={{
                          alignItems: "center",
                          height: "30px",
                          px: 1,
                          cursor: "pointer",
                          ":hover, :focus-visible": { bg: "rgba(255, 255, 255, 0.06)", outline: "none" },
                        }}
                      >
                        <Chevron open={folderOpen} />
                        <Text sx={{ flexGrow: 1, fontSize: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {folder.name}
                        </Text>
                        <Text variant="caption" sx={{ fontSize: 0, pr: 1 }}>
                          {folder.assets.length}
                        </Text>
                      </Flex>
                      {folderOpen && folder.assets.map((asset) => row(asset, section, 1))}
                    </Droppable>
                  );
                })}
                {section.assets.map((asset) => row(asset, section, 0))}
                {section.folders.length === 0 && section.assets.length === 0 && (
                  <Text as="p" variant="caption" m={0} px={2} py={1}>
                    {library.search.trim() ? "No matches" : "Nothing here"}
                  </Text>
                )}
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
}

export default DockTree;
