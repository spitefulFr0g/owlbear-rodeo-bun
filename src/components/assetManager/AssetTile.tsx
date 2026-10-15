import React from "react";
import { Box, Flex, Text } from "theme-ui";

import { openKeyboardMenu, Thumbnail } from "../dock/DockRow";
import GroupIcon from "../../icons/GroupIcon";

import { dockTabLabels } from "../../helpers/dock";
import { LibraryViewAsset, LibraryViewFolder } from "../../sceneRules/library";

export const tileHint = "Click to select, double-click to place, right-click for more";

type ItemProps = {
  selected?: boolean;
  title?: string;
  onClick: () => void;
  onDoubleClick?: () => void;
  onContextMenu?: (event: React.MouseEvent) => void;
  children: React.ReactNode;
  list: boolean;
  accent: string;
};

/** A focusable tile or row that selects on click and opens on Enter */
function Item({ selected, title, onClick, onDoubleClick, onContextMenu, children, list, accent }: ItemProps) {
  return (
    <Box
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      title={title}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onKeyDown={(event) => {
        if (onContextMenu) openKeyboardMenu(event);
        if (event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          onClick();
        } else if (event.key === "Enter") {
          event.preventDefault();
          event.stopPropagation();
          (onDoubleClick || onClick)();
        }
      }}
      onContextMenu={(event) => {
        if (!onContextMenu) return;
        event.preventDefault();
        onContextMenu(event);
      }}
      sx={{
        display: "flex",
        flexDirection: list ? "row" : "column",
        alignItems: "center",
        gap: list ? 2 : 1,
        p: list ? "4px 8px" : 1,
        height: list ? "32px" : "auto",
        borderRadius: "4px",
        border: "1px solid",
        borderColor: selected ? accent : "transparent",
        bg: selected ? "rgba(255, 255, 255, 0.08)" : "transparent",
        cursor: "pointer",
        ":hover, :focus-visible": { bg: "rgba(255, 255, 255, 0.06)", outline: "none" },
      }}
    >
      {children}
    </Box>
  );
}

function Name({ children, list }: { children: React.ReactNode; list: boolean }) {
  return (
    <Text
      sx={{
        fontSize: list ? 1 : 0,
        width: list ? "auto" : "100%",
        flexGrow: list ? 1 : 0,
        minWidth: 0,
        textAlign: list ? "left" : "center",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </Text>
  );
}

type AssetTileProps = {
  asset: LibraryViewAsset;
  list: boolean;
  selected: boolean;
  accent: string;
  /** Who uploaded it, shown where uploads from several people mix */
  caption?: string;
  onSelect: () => void;
  onPlace: () => void;
  onContextMenu: (event: React.MouseEvent) => void;
};

/** An asset as a thumbnail tile, or as a row in the list view */
export function AssetTile({ asset, list, selected, accent, caption, onSelect, onPlace, onContextMenu }: AssetTileProps) {
  return (
    <Item
      list={list}
      selected={selected}
      accent={accent}
      title={tileHint}
      onClick={onSelect}
      onDoubleClick={onPlace}
      onContextMenu={onContextMenu}
    >
      <Thumbnail asset={asset} size={list ? 24 : 64} />
      <Name list={list}>{asset.name}</Name>
      {!list && caption && <Text variant="caption" sx={{ fontSize: 0 }}>{caption}</Text>}
      {list && (
        <>
          <Text variant="caption" sx={{ fontSize: 0, width: "72px", flexShrink: 0 }}>
            {dockTabLabels[asset.type]}
          </Text>
          <Text
            variant="caption"
            sx={{ fontSize: 0, width: "96px", flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {caption || ""}
          </Text>
        </>
      )}
    </Item>
  );
}

type FolderTileProps = {
  folder: LibraryViewFolder;
  list: boolean;
  accent: string;
  onOpen: () => void;
  onContextMenu?: (event: React.MouseEvent) => void;
};

/** A folder to open, and to drop assets on to file them */
export function FolderTile({ folder, list, accent, onOpen, onContextMenu }: FolderTileProps) {
  return (
    <Item
      list={list}
      accent={accent}
      title="Click to open, or drop an asset here to file it"
      onClick={onOpen}
      onContextMenu={onContextMenu}
    >
      <Flex
        sx={{
          width: list ? "24px" : "64px",
          height: list ? "24px" : "64px",
          flexShrink: 0,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "4px",
          bg: "muted",
          color: accent,
          "> svg": { width: list ? "18px" : "36px", height: list ? "18px" : "36px" },
        }}
      >
        <GroupIcon />
      </Flex>
      <Name list={list}>{folder.name}</Name>
      <Text variant="caption" sx={{ fontSize: 0, flexShrink: 0 }}>
        {folder.assets.length}
      </Text>
    </Item>
  );
}
