import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Box, Divider, Flex, Select, Text } from "theme-ui";

import ConfirmModal from "../../modals/ConfirmModal";
import DockNameModal from "./DockNameModal";

import { useLibrary } from "../../contexts/LibraryContext";
import { dockTabLabels, mayChangeAsset, mayFileIn, moveAction } from "../../helpers/dock";
import {
  assetTypes,
  LibraryAsset,
  LibraryFolder,
  LibraryViewAsset,
  maySetAssetType,
} from "../../sceneRules/library";
import { Person } from "../../sceneRules/types";
import { BundledLibraryAsset } from "../../helpers/serverSet";

export type DockMenuTarget =
  | { kind: "asset"; asset: LibraryViewAsset; x: number; y: number }
  | { kind: "folder"; folder: LibraryFolder; x: number; y: number };

type DockMenuProps = {
  target: DockMenuTarget;
  person: Person;
  onPlace: (asset: LibraryViewAsset) => void;
  /** Reports a refused action in the person's words */
  onError: (message: string) => void;
  onClose: () => void;
};

function MenuItem({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <Box
      as="button"
      onClick={onClick}
      sx={{
        display: "block",
        width: "100%",
        textAlign: "left",
        px: 3,
        py: 1,
        border: "none",
        bg: "transparent",
        color: "text",
        fontFamily: "body2",
        fontSize: 1,
        cursor: "pointer",
        ":hover, :focus-visible": { bg: "rgba(255, 255, 255, 0.08)", outline: "none" },
      }}
    >
      {children}
    </Box>
  );
}

function MenuSelect({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <Flex as="label" sx={{ alignItems: "center", px: 3, py: 1, fontSize: 1, fontFamily: "body2" }}>
      <Text sx={{ flexGrow: 1, fontSize: 1 }}>{label}</Text>
      <Box sx={{ ml: 2, width: "120px", flexShrink: 0 }}>
        <Select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          sx={{ py: "2px", pl: 1, pr: "20px", fontSize: 1, color: "text", option: { color: "text", backgroundColor: "background" } }}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </Box>
    </Flex>
  );
}

/** The actions on a dock row, opened by right-clicking it */
function DockMenu({ target, person, onPlace, onError, onClose }: DockMenuProps) {
  const { command, folders, openExtension } = useLibrary();
  const [dialog, setDialog] = useState<"rename" | "delete" | null>(null);

  useEffect(() => {
    if (dialog) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [dialog, onClose]);

  function run(value: Parameters<typeof command>[0]) {
    onClose();
    command(value).catch((error: Error) => onError(error.message));
  }

  const asset = target.kind === "asset" && "files" in target.asset ? (target.asset as LibraryAsset) : undefined;
  const folder = target.kind === "folder" ? target.folder : undefined;
  const name = target.kind === "asset" ? target.asset.name : target.folder.name;
  const changeable = asset ? mayChangeAsset(asset, person) : !!folder;
  const move = asset && moveAction(asset, person.role);

  let items: React.ReactNode;
  if (target.kind === "asset") {
    items = (
      <>
        <MenuItem onClick={() => { onClose(); onPlace(target.asset); }}>Place on the map</MenuItem>
        {person.role === "gm" && (
          <MenuItem onClick={() => { onClose(); openExtension({ extension: "manager", asset: target.asset as LibraryAsset | BundledLibraryAsset }); }}>
            Open in Asset Manager
          </MenuItem>
        )}
        {asset && changeable ? (
          <>
            <MenuItem onClick={() => setDialog("rename")}>Rename…</MenuItem>
            <MenuSelect
              label="Type"
              value={asset.type}
              options={assetTypes
                .filter((type) => type === asset.type || maySetAssetType(person.role, type))
                .map((type) => ({ value: type, label: dockTabLabels[type] }))}
              onChange={(type) => run({ action: "edit", id: asset.id, changes: { type: type as LibraryAsset["type"] } })}
            />
            <MenuSelect
              label="Folder"
              value={asset.folderId || ""}
              options={[
                { value: "", label: "None" },
                ...folders
                  .filter((candidate) => mayFileIn(asset, candidate))
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((candidate) => ({ value: candidate.id, label: candidate.name })),
              ]}
              onChange={(folderId) => run({ action: "edit", id: asset.id, changes: { folderId: folderId || null } })}
            />
            {move && (
              <MenuItem onClick={() => run({ action: "move", id: asset.id, destination: move.destination })}>
                {move.label}
              </MenuItem>
            )}
            <Divider my={1} />
            <MenuItem onClick={() => setDialog("delete")}>Delete…</MenuItem>
          </>
        ) : (
          <Text as="p" variant="caption" px={3} py={1} m={0}>
            Read-only
          </Text>
        )}
      </>
    );
  } else {
    items = (
      <>
        <MenuItem onClick={() => setDialog("rename")}>Rename folder…</MenuItem>
        <MenuItem onClick={() => setDialog("delete")}>Delete folder…</MenuItem>
      </>
    );
  }

  const id = asset?.id || folder?.id || "";
  return (
    <>
      {!dialog &&
        createPortal(
          <Box
            sx={{ position: "fixed", inset: 0, zIndex: 70 }}
            onClick={onClose}
            onContextMenu={(event) => { event.preventDefault(); onClose(); }}
          >
            <Box
              role="menu"
              aria-label={`${name} actions`}
              onClick={(event) => event.stopPropagation()}
              sx={{
                position: "fixed",
                left: Math.min(target.x, window.innerWidth - 230),
                top: Math.min(target.y, window.innerHeight - 260),
                width: "220px",
                py: 1,
                bg: "background",
                border: "1px solid",
                borderColor: "border",
                borderRadius: "4px",
                boxShadow: "0 4px 12px rgba(0, 0, 0, 0.4)",
              }}
            >
              <Text
                as="p"
                variant="caption"
                px={3}
                pb={1}
                m={0}
                sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              >
                {name}
              </Text>
              {items}
            </Box>
          </Box>,
          document.body
        )}
      <DockNameModal
        isOpen={dialog === "rename"}
        label={folder ? "Folder name" : "Asset name"}
        name={name}
        submitText="Rename"
        onRequestClose={onClose}
        onSubmit={(value) =>
          run(folder ? { action: "folder-edit", id, name: value } : { action: "edit", id, changes: { name: value } })
        }
      />
      <ConfirmModal
        isOpen={dialog === "delete"}
        label={folder ? `Delete the folder ${name}?` : `Delete ${name}?`}
        description={
          folder
            ? "Its assets stay, at the top of the library."
            : "It leaves the library and its storage is freed."
        }
        confirmText="Delete"
        onRequestClose={onClose}
        onConfirm={() => run(folder ? { action: "folder-delete", id } : { action: "delete", id })}
      />
    </>
  );
}

export default DockMenu;
