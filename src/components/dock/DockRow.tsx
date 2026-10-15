import React, { useEffect } from "react";
import { Box, Flex, Image, Text } from "theme-ui";

import { useAssetURL } from "../../contexts/AssetsContext";
import { useLibrary } from "../../contexts/LibraryContext";
import { LibraryViewAsset } from "../../sceneRules/library";
import { mapSources, unknownSource } from "../../maps";
import { tokenSources } from "../../tokens";

const defaultSources = { ...mapSources, ...tokenSources };

/** The smallest stored image of an asset, fetched into the byte cache once */
export function Thumbnail({ asset, size = 24 }: { asset: LibraryViewAsset; size?: number }) {
  const { fetchFile } = useLibrary();
  const fileId = "files" in asset ? (asset.files.thumbnail || asset.files.original).id : null;
  useEffect(() => {
    if (fileId) fetchFile(fileId).catch(() => undefined);
  }, [fileId, fetchFile]);
  const url = useAssetURL(
    fileId || ("key" in asset ? asset.key : null),
    fileId ? "file" : "default",
    defaultSources,
    unknownSource
  );
  const round = asset.type !== "map";
  return (
    <Box
      sx={{
        width: `${size}px`,
        height: `${size}px`,
        flexShrink: 0,
        borderRadius: round ? "50%" : "2px",
        overflow: "hidden",
        bg: "muted",
      }}
    >
      {url && (
        <Image
          src={url}
          alt=""
          draggable={false}
          sx={{ width: "100%", height: "100%", objectFit: round ? "cover" : "contain" }}
        />
      )}
    </Box>
  );
}

/** Use the standard keyboard menu keys at the focused row, not at the pointer. */
export function openKeyboardMenu(event: React.KeyboardEvent) {
  if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
  event.preventDefault();
  event.stopPropagation();
  const rect = event.currentTarget.getBoundingClientRect();
  event.currentTarget.dispatchEvent(new MouseEvent("contextmenu", {
    bubbles: true, cancelable: true, clientX: rect.left, clientY: rect.bottom,
  }));
}

type DockRowProps = {
  asset: LibraryViewAsset;
  caption?: string;
  /** Indentation inside a folder */
  depth?: number;
  title?: string;
  onClick?: () => void;
  onContextMenu?: (event: React.MouseEvent) => void;
};

/** One compact asset row: thumbnail, name and, under it, who uploaded it */
function DockRow({ asset, caption, depth = 0, title, onClick, onContextMenu }: DockRowProps) {
  return (
    <Flex
      role="button"
      tabIndex={0}
      title={title}
      onClick={onClick}
      onKeyDown={(event) => {
        openKeyboardMenu(event);
        if (onClick && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          event.stopPropagation();
          onClick();
        }
      }}
      onContextMenu={onContextMenu}
      sx={{
        alignItems: "center",
        height: caption ? "38px" : "32px",
        pl: `${8 + depth * 16}px`,
        pr: 2,
        cursor: onClick ? "pointer" : "default",
        ":hover, :focus-visible": { bg: "rgba(255, 255, 255, 0.06)", outline: "none" },
      }}
    >
      <Thumbnail asset={asset} />
      <Flex sx={{ flexDirection: "column", minWidth: 0, ml: 2 }}>
        <Text
          sx={{ fontSize: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
        >
          {asset.name}
        </Text>
        {caption && (
          <Text
            variant="caption"
            sx={{ fontSize: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {caption}
          </Text>
        )}
      </Flex>
    </Flex>
  );
}

export default DockRow;
