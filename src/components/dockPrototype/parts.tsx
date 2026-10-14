// PROTOTYPE: small pieces every variant may use (#136). No layout lives here.
import { DragEvent, ReactNode, useEffect, useRef, useState } from "react";
import { Box, Button, Flex, IconButton, Image, Text } from "theme-ui";

import SelectMapIcon from "../../icons/SelectMapIcon";
import TokenPropIcon from "../../icons/TokenPropIcon";
import TokenMountIcon from "../../icons/TokenMountIcon";
import TokenCharacterIcon from "../../icons/TokenCharacterIcon";
import TokenAttachmentIcon from "../../icons/TokenAttachmentIcon";
import GroupIcon from "../../icons/GroupIcon";

import { Asset, AssetType, assetTypes, typeLabels, unlistedBytes } from "./data";
import { formatBytes, Proto, SectionId, Tab } from "./model";

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

/** One colour per library, shared by the variants that colour-code them */
export const libraryColour: Record<SectionId, string> = {
  room: "hsl(265, 35%, 32%)",
  players: "hsl(28, 45%, 30%)",
  account: "hsl(200, 40%, 28%)",
  server: "hsl(150, 25%, 26%)",
  mine: "hsl(265, 35%, 32%)",
};

/** A brighter shade of a library's colour, for thin marks such as gauges */
export const libraryAccent: Record<SectionId, string> = {
  room: "hsl(265, 70%, 70%)",
  players: "hsl(28, 85%, 62%)",
  account: "hsl(200, 75%, 62%)",
  server: "hsl(150, 50%, 55%)",
  mine: "hsl(265, 70%, 70%)",
};

export type StoragePart = { id: SectionId; label: string; bytes: number };

/**
 * What fills the quota, split so a gauge can colour each part: for the GM, the
 * room's own uploads and each player's; for a player, their own uploads
 */
export function storageParts(proto: Proto): StoragePart[] {
  const room = proto.assets.filter((x) => x.library === "room");
  const sum = (xs: typeof room) => xs.reduce((total, x) => total + x.bytes, 0);
  if (proto.role === "player") {
    return [{ id: "mine", label: "My uploads", bytes: proto.quota.used }];
  }
  const players = [...new Set(room.filter((x) => x.uploader).map((x) => x.uploader as string))].sort();
  return [
    { id: "room", label: "GM's uploads", bytes: sum(room.filter((x) => !x.uploader)) + unlistedBytes[""] },
    ...players.map((name) => ({
      id: "players" as SectionId,
      label: `From ${name}`,
      bytes: sum(room.filter((x) => x.uploader === name)) + (unlistedBytes[name] ?? 0),
    })),
  ];
}

export function formatQuota(of: number) {
  return of >= 1024 * 1024 * 1024 ? `${of / 1024 / 1024 / 1024} GB` : `${of / 1024 / 1024} MB`;
}

// Raises the window the user last touched above the others
let topWindow = 50;

/** A small window over the canvas that the user drags by its title bar */
export function FloatingWindow({
  title,
  initial,
  width,
  height,
  onClose,
  accent,
  children,
}: {
  title: ReactNode;
  initial: { x: number; y: number };
  width: number;
  height: number;
  onClose: () => void;
  /** The title bar's colour, when the window belongs to one library */
  accent?: string;
  children: ReactNode;
}) {
  const [pos, setPos] = useState(initial);
  const [z, setZ] = useState(() => ++topWindow);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  useEffect(() => {
    function move(e: MouseEvent) {
      if (drag.current) setPos({ x: e.clientX - drag.current.dx, y: e.clientY - drag.current.dy });
    }
    function up() {
      drag.current = null;
    }
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, []);
  return (
    <Flex
      onMouseDown={() => setZ(++topWindow)}
      style={{ position: "fixed", left: pos.x, top: pos.y, width, height, zIndex: z }}
      sx={{
        bg: "background",
        flexDirection: "column",
        border: "1px solid",
        borderColor: "border",
        borderRadius: "6px",
        boxShadow: "0 6px 24px rgba(0,0,0,0.6)",
        overflow: "hidden",
      }}
    >
      <Flex
        onMouseDown={(e) => {
          drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
        }}
        style={accent ? { background: accent } : undefined}
        sx={{ alignItems: "center", px: 2, py: 1, bg: "muted", cursor: "move", userSelect: "none", flexShrink: 0 }}
      >
        <Text sx={{ flexGrow: 1, fontSize: 1 }}>{title}</Text>
        <IconButton sx={{ width: 24, height: 24 }} onClick={onClose}>
          ✕
        </IconButton>
      </Flex>
      {children}
    </Flex>
  );
}

const assetDrag = "application/x-prototype-asset";

function ours(e: DragEvent) {
  return e.dataTransfer.types.includes(assetDrag);
}

/** Props that make an element drag an asset */
export function dragSource(asset: Asset) {
  return {
    draggable: true,
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.setData(assetDrag, asset.id);
      e.dataTransfer.effectAllowed = "copyMove";
    },
  };
}

/** Props that make an element take an asset dropped on it */
export function dropTarget(onDrop: (id: string) => void) {
  return {
    onDragOver: (e: DragEvent) => {
      if (ours(e)) e.preventDefault();
    },
    onDrop: (e: DragEvent) => {
      if (!ours(e)) return;
      e.preventDefault();
      e.stopPropagation();
      onDrop(e.dataTransfer.getData(assetDrag));
    },
  };
}

/** Keeps the room's image-drop overlay from opening on the prototype's own drags */
export const shieldImageDrop = {
  onDragEnter: (e: DragEvent) => ours(e) && e.stopPropagation(),
  onDragLeave: (e: DragEvent) => ours(e) && e.stopPropagation(),
  onDragOver: (e: DragEvent) => ours(e) && e.stopPropagation(),
  onDrop: (e: DragEvent) => ours(e) && e.stopPropagation(),
};

/** The map, taking a dragged asset as a place at the drop point */
export function CanvasDrop({ proto, children }: { proto: Proto; children: ReactNode }) {
  return (
    <Flex
      sx={{ flexGrow: 1, minWidth: 0 }}
      {...dropTarget((id) => {
        const asset = proto.assets.find((x) => x.id === id);
        if (asset) proto.actions.place(asset);
      })}
    >
      {children}
    </Flex>
  );
}

/** The quota as one bar split by uploader, with a legend under it */
export function StorageBreakdown({ proto }: { proto: Proto }) {
  const parts = storageParts(proto);
  const { label, used, of } = proto.quota;
  const mb = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MB`;
  return (
    <Box sx={{ fontFamily: "body2", fontSize: 0 }}>
      <Flex sx={{ justifyContent: "space-between" }}>
        <Text>{label}</Text>
        <Text>
          {mb(used)} of {formatQuota(of)} · {mb(of - used)} free
        </Text>
      </Flex>
      <Flex sx={{ height: "8px", bg: "muted", borderRadius: "4px", mt: "3px", overflow: "hidden" }}>
        {parts.map((p, i) => (
          <Box
            key={p.label}
            title={`${p.label}: ${mb(p.bytes)}`}
            style={{ width: `${(p.bytes / of) * 100}%`, background: libraryAccent[p.id], opacity: 1 - i * 0.2 }}
          />
        ))}
      </Flex>
      {parts.length > 1 && (
        <Flex sx={{ gap: 2, mt: "3px", flexWrap: "wrap" }}>
          {parts.map((p, i) => (
            <Flex key={p.label} sx={{ alignItems: "center", gap: "4px" }}>
              <Box style={{ width: 8, height: 8, borderRadius: 2, background: libraryAccent[p.id], opacity: 1 - i * 0.2 }} />
              <Text>
                {p.label} {mb(p.bytes)}
              </Text>
            </Flex>
          ))}
        </Flex>
      )}
    </Box>
  );
}
