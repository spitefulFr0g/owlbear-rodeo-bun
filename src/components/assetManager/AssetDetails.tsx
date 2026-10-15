import React from "react";
import prettyBytes from "pretty-bytes";
import { Box, Button, Flex, Select, Text } from "theme-ui";

import { Thumbnail } from "../dock/DockRow";

import { dockTabLabels, mayChangeAsset, mayFileIn, moveActions } from "../../helpers/dock";
import { assetBytes, LibraryAsset, LibraryCommand, LibraryFolder, LibraryViewAsset } from "../../sceneRules/library";
import { Person } from "../../sceneRules/types";

const gridTypeLabels = { square: "square", hexVertical: "vertical hex", hexHorizontal: "horizontal hex" };

const actionButton = { width: "100%", mt: 1, py: 1, fontSize: 1 };

type AssetDetailsProps = {
  asset?: LibraryViewAsset;
  /** The heading of the source it sits in, such as "My library" */
  where: string;
  person: Person;
  folders: readonly LibraryFolder[];
  onPlace: (asset: LibraryViewAsset) => void;
  onEdit: (asset: LibraryAsset) => void;
  onDelete: (asset: LibraryAsset) => void;
  onCommand: (command: LibraryCommand) => void;
};

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Flex sx={{ fontSize: 0, py: "2px", gap: 2 }}>
      <Text variant="caption" sx={{ fontSize: 0, width: "64px", flexShrink: 0 }}>
        {label}
      </Text>
      <Text sx={{ fontSize: 0, minWidth: 0, overflowWrap: "anywhere" }}>{children}</Text>
    </Flex>
  );
}

/** The selected asset's preview, details and the actions a person may take on it */
function AssetDetails({ asset, where, person, folders, onPlace, onEdit, onDelete, onCommand }: AssetDetailsProps) {
  if (!asset) {
    return (
      <Text as="p" variant="caption" m={0} p={2}>
        Select an asset to see it here.
      </Text>
    );
  }
  const stored = "files" in asset ? asset : undefined;
  const changeable = !!stored && mayChangeAsset(stored, person);
  const folder = stored?.folderId ? folders.find((candidate) => candidate.id === stored.folderId) : undefined;
  const { grid } = stored?.defaults || {};

  return (
    <Box p={2}>
      <Flex sx={{ justifyContent: "center", py: 2, bg: "muted", borderRadius: "4px" }}>
        <Thumbnail asset={asset} size={160} />
      </Flex>
      <Text as="h3" variant="heading" sx={{ fontSize: 2, mt: 2, overflowWrap: "anywhere" }}>
        {asset.name}
      </Text>
      <Box my={1}>
        <Detail label="Type">{dockTabLabels[asset.type]}</Detail>
        <Detail label="Library">{where}</Detail>
        {stored && <Detail label="Folder">{folder ? folder.name : "None"}</Detail>}
        {stored?.uploader && (
          <Detail label="Uploader">{stored.uploader === person.id ? "You" : stored.uploaderName || "A player"}</Detail>
        )}
        {stored && <Detail label="Size">{prettyBytes(assetBytes(stored.files))}</Detail>}
        {stored && <Detail label="Pixels">{`${stored.width} × ${stored.height}`}</Detail>}
        {stored && <Detail label="Added">{new Date(asset.created).toLocaleDateString()}</Detail>}
        {stored && grid && stored.type === "map" && (
          <Detail label="Grid">{`${grid.size.x} × ${grid.size.y} ${gridTypeLabels[grid.type]}`}</Detail>
        )}
        {stored && stored.type !== "map" && (
          <Detail label="Placed as">
            {`Size ${stored.defaults.defaultSize}${stored.defaults.defaultLabel ? `, labelled ${stored.defaults.defaultLabel}` : ""}`}
          </Detail>
        )}
      </Box>
      <Button sx={actionButton} onClick={() => onPlace(asset)}>
        Place on the map
      </Button>
      {stored && changeable ? (
        <>
          <Button variant="secondary" sx={actionButton} onClick={() => onEdit(stored)}>
            Edit…
          </Button>
          <Box mt={1}>
            <Select
              aria-label="Folder"
              value={stored.folderId || ""}
              onChange={(event) =>
                onCommand({ action: "edit", id: stored.id, changes: { folderId: event.target.value || null } })
              }
              sx={{ py: 1, pl: 2, fontSize: 1, color: "text", option: { color: "text", backgroundColor: "background" } }}
            >
              <option value="">No folder</option>
              {folders
                .filter((candidate) => mayFileIn(stored, candidate))
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {`In ${candidate.name}`}
                  </option>
                ))}
            </Select>
          </Box>
          {moveActions(stored, person.role).map((move) => (
            <Button
              key={move.destination}
              variant="secondary"
              sx={actionButton}
              onClick={() => onCommand({ action: "move", id: stored.id, destination: move.destination })}
            >
              {move.label}
            </Button>
          ))}
          <Button variant="secondary" sx={{ ...actionButton, mt: 2 }} onClick={() => onDelete(stored)}>
            Delete…
          </Button>
        </>
      ) : (
        <Text as="p" variant="caption" mt={2} mb={0}>
          {stored ? "Read-only. Only its uploader or the GM may change it." : "Read-only. The server set can be placed but not changed."}
        </Text>
      )}
    </Box>
  );
}

export default AssetDetails;
