// PROTOTYPE: small pieces every variant may use (#136). No layout lives here.
import { Box, Button, Flex, Image, Text } from "theme-ui";

import SelectMapIcon from "../../icons/SelectMapIcon";
import TokenPropIcon from "../../icons/TokenPropIcon";
import TokenMountIcon from "../../icons/TokenMountIcon";
import TokenCharacterIcon from "../../icons/TokenCharacterIcon";
import TokenAttachmentIcon from "../../icons/TokenAttachmentIcon";
import GroupIcon from "../../icons/GroupIcon";

import { Asset, AssetType, assetTypes, typeLabels } from "./data";
import { formatBytes, Proto, Tab } from "./model";

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

/** Where an asset lives, as a GM or player would say it */
export function whereLabel(asset: Asset) {
  if (asset.library === "server") return "Server set";
  if (asset.library === "account") return "My library";
  return asset.uploader ? `This room, from ${asset.uploader}` : "This room";
}

/** The picked asset with its edits and actions, for an inspector or drawer */
export function AssetDetails({ proto, size = 160 }: { proto: Proto; size?: number }) {
  const asset = proto.selected;
  if (!asset) {
    return (
      <Flex sx={{ flexGrow: 1, alignItems: "center", justifyContent: "center", color: "gray", p: 3 }}>
        Pick an asset
      </Flex>
    );
  }
  const editable = proto.mayEdit(asset);
  const move = moveLabel(proto, asset);
  return (
    <Flex sx={{ flexDirection: "column", alignItems: "center", p: 3, gap: 2, overflowY: "auto" }}>
      <Thumb asset={asset} size={size} />
      <Text variant="heading" sx={{ fontSize: 3, textAlign: "center" }}>
        {asset.name}
      </Text>
      <Text variant="caption">
        {whereLabel(asset)} · {formatBytes(asset.bytes)}
      </Text>
      {editable ? (
        <Box sx={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 2, alignItems: "center", width: "100%" }}>
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
        <Text variant="caption">{asset.library === "server" ? "The server set is read-only" : "Only its uploader or the GM can change it"}</Text>
      )}
      <Flex sx={{ gap: 2, mt: 1, flexWrap: "wrap", justifyContent: "center" }}>
        {move && (
          <Button variant="secondary" sx={{ fontSize: 0 }} onClick={() => proto.actions.move(asset)}>
            {move}
          </Button>
        )}
        {editable && (
          <Button sx={{ bg: "error", fontSize: 0 }} onClick={() => proto.actions.remove(asset)}>
            Delete
          </Button>
        )}
      </Flex>
    </Flex>
  );
}

export function StarGlyph({ on }: { on: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill={on ? "#ffd54a" : "none"} stroke={on ? "#ffd54a" : "currentcolor"} strokeWidth="2">
      <path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z" />
    </svg>
  );
}

/** Asset types a role may see; players have no maps */
export function typesFor(proto: Proto) {
  return proto.role === "gm" ? assetTypes : assetTypes.filter((x) => x !== "map");
}
