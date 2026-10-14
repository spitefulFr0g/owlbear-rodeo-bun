// PROTOTYPE: small pieces every variant may use (#136). No layout lives here.
import { Box, Image } from "theme-ui";

import SelectMapIcon from "../../icons/SelectMapIcon";
import TokenPropIcon from "../../icons/TokenPropIcon";
import TokenMountIcon from "../../icons/TokenMountIcon";
import TokenCharacterIcon from "../../icons/TokenCharacterIcon";
import TokenAttachmentIcon from "../../icons/TokenAttachmentIcon";
import GroupIcon from "../../icons/GroupIcon";

import { Asset, AssetType, assetTypes, typeLabels } from "./data";
import { Proto, Tab } from "./model";

export function TabIcon({ tab }: { tab: Tab }) {
  switch (tab) {
    case "map":
      return <SelectMapIcon />;
    case "prop":
      return <TokenPropIcon />;
    case "mount":
      return <TokenMountIcon />;
    case "character":
      return <TokenCharacterIcon />;
    case "attachment":
      return <TokenAttachmentIcon />;
    case "scenes":
      return <GroupIcon />;
  }
}

export function Thumb({ asset, size }: { asset: Asset; size: number }) {
  return (
    <Image
      src={asset.src}
      draggable={false}
      sx={{
        width: size,
        height: size,
        minWidth: size,
        objectFit: "cover",
        borderRadius: asset.type === "map" ? "4px" : "50%",
        display: "block",
      }}
    />
  );
}

export const selectStyle = {
  background: "hsl(230, 25%, 18%)",
  color: "hsl(210, 50%, 96%)",
  border: "1px solid hsla(210, 50%, 96%, 0.5)",
  borderRadius: 4,
  fontSize: 12,
  padding: "2px 4px",
};

export function TypeSelect({ proto, asset }: { proto: Proto; asset: Asset }) {
  const types: AssetType[] =
    proto.role === "gm" ? assetTypes : assetTypes.filter((x) => x !== "map");
  return (
    <select
      style={selectStyle}
      value={asset.type}
      disabled={!proto.mayEdit(asset)}
      onChange={(e: any) => proto.actions.setType(asset, e.target.value)}
      onClick={(e: any) => e.stopPropagation()}
    >
      {types.map((x) => (
        <option key={x} value={x}>
          {typeLabels[x]}
        </option>
      ))}
    </select>
  );
}

export function FolderSelect({ proto, asset }: { proto: Proto; asset: Asset }) {
  return (
    <select
      style={selectStyle}
      value={asset.folder ?? ""}
      disabled={!proto.mayEdit(asset)}
      onChange={(e: any) => proto.actions.fileIn(asset, e.target.value || null)}
      onClick={(e: any) => e.stopPropagation()}
    >
      <option value="">No folder</option>
      {proto.foldersFor(asset).map((name) => (
        <option key={name} value={name}>
          {name}
        </option>
      ))}
      <option value="__new">New folder…</option>
    </select>
  );
}

/** The label of the one move an asset allows, or null */
export function moveLabel(proto: Proto, asset: Asset) {
  if (proto.role !== "gm" || asset.library === "server") return null;
  return asset.library === "account" ? "Move to this room" : "Add to my library";
}

export function QuotaBar({ proto }: { proto: Proto }) {
  const { label, used, of } = proto.quota;
  const share = Math.min(1, used / of);
  return (
    <Box sx={{ fontFamily: "body2", fontSize: 0 }}>
      <Box>
        {label}: {Math.round(used / 1024 / 1024)} MB of{" "}
        {of >= 1024 * 1024 * 1024 ? `${of / 1024 / 1024 / 1024} GB` : `${of / 1024 / 1024} MB`}
      </Box>
      <Box sx={{ height: "4px", bg: "muted", borderRadius: "2px", mt: "2px" }}>
        <Box
          sx={{
            height: "100%",
            width: `${share * 100}%`,
            bg: "primary",
            borderRadius: "2px",
          }}
        />
      </Box>
    </Box>
  );
}

export function FolderGlyph({ open = false }: { open?: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentcolor" style={{ verticalAlign: "-3px", marginRight: 4, flexShrink: 0 }}>
      {open ? (
        <path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z" />
      ) : (
        <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
      )}
    </svg>
  );
}
