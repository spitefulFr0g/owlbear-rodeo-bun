import React, { useEffect, useState } from "react";
import { Box, Button, Flex, Input, Label, Select, Text } from "theme-ui";
import { useToasts } from "react-toast-notifications";

import Modal from "../Modal";
import MapEditor from "../map/MapEditor";
import TokenPreview from "../token/TokenPreview";

import { useLibrary } from "../../contexts/LibraryContext";
import { dockTabLabels } from "../../helpers/dock";
import { editorCommand, editorDraft, EditorDraft, editorMap, editorToken, previewFileId } from "../../helpers/assetManager";
import { getGridUpdatedInset } from "../../helpers/grid";
import { assetTypes, AssetType, LibraryAsset, maySetAssetType } from "../../sceneRules/library";
import { Person } from "../../sceneRules/types";
import { Grid, GridMeasurementType, GridType } from "../../types/Grid";

const gridTypes: { value: GridType; label: string }[] = [
  { value: "square", label: "Square" },
  { value: "hexVertical", label: "Hex Vertical" },
  { value: "hexHorizontal", label: "Hex Horizontal" },
];

const squareMeasurements: { value: GridMeasurementType; label: string }[] = [
  { value: "chebyshev", label: "Chessboard (D&D 5e)" },
  { value: "alternating", label: "Alternating Diagonal (D&D 3.5e)" },
  { value: "euclidean", label: "Euclidean" },
  { value: "manhattan", label: "Manhattan" },
];

const hexMeasurements: { value: GridMeasurementType; label: string }[] = [
  { value: "manhattan", label: "Manhattan" },
  { value: "euclidean", label: "Euclidean" },
];

const selectStyle = { color: "text", option: { color: "text", backgroundColor: "background" } };

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <Box mt={2} sx={{ flexGrow: 1, flexBasis: 0, minWidth: 0 }}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </Box>
  );
}

/** A map's saved grid: columns and rows refit the inset, as the old map settings did */
function GridFields({ grid, width, height, onChange }: {
  grid: Grid;
  width: number;
  height: number;
  onChange: (grid: Grid) => void;
}) {
  function resize(size: Grid["size"]) {
    const next = { ...grid, size };
    onChange({ ...next, inset: getGridUpdatedInset(next, width, height) });
  }
  const measurements = grid.type === "square" ? squareMeasurements : hexMeasurements;
  return (
    <>
      <Flex sx={{ gap: 2 }}>
        <Field label="Columns" htmlFor="assetGridX">
          <Input
            id="assetGridX"
            type="number"
            min={1}
            value={`${grid.size.x}`}
            onChange={(event) => resize({ ...grid.size, x: parseInt(event.target.value) || 0 })}
            my={1}
          />
        </Field>
        <Field label="Rows" htmlFor="assetGridY">
          <Input
            id="assetGridY"
            type="number"
            min={1}
            value={`${grid.size.y}`}
            onChange={(event) => resize({ ...grid.size, y: parseInt(event.target.value) || 0 })}
            my={1}
          />
        </Field>
      </Flex>
      <Flex sx={{ gap: 2 }}>
        <Field label="Grid type" htmlFor="assetGridType">
          <Select
            id="assetGridType"
            value={grid.type}
            onChange={(event) => {
              const type = event.target.value as GridType;
              const next: Grid = {
                ...grid,
                type,
                measurement: { ...grid.measurement, type: type === "square" ? "chebyshev" : "manhattan" },
              };
              onChange({ ...next, inset: getGridUpdatedInset(next, width, height) });
            }}
            sx={selectStyle}
            my={1}
          >
            {gridTypes.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Measurement" htmlFor="assetGridMeasurement">
          <Select
            id="assetGridMeasurement"
            value={grid.measurement.type}
            onChange={(event) =>
              onChange({ ...grid, measurement: { ...grid.measurement, type: event.target.value as GridMeasurementType } })
            }
            sx={selectStyle}
            my={1}
          >
            {measurements.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Scale" htmlFor="assetGridScale">
          <Input
            id="assetGridScale"
            value={grid.measurement.scale}
            autoComplete="off"
            onChange={(event) => onChange({ ...grid, measurement: { ...grid.measurement, scale: event.target.value } })}
            my={1}
          />
        </Field>
      </Flex>
    </>
  );
}

type AssetEditorProps = {
  asset: LibraryAsset;
  person: Person;
  onClose: () => void;
};

/**
 * The one editor for every library image: its name and type, and the defaults
 * the next placement takes. A map keeps its grid and any other type its size
 * and label, so both survive switching the type and back.
 */
function AssetEditor({ asset, person, onClose }: AssetEditorProps) {
  const { command, fetchFile } = useLibrary();
  const { addToast } = useToasts();
  const [draft, setDraft] = useState<EditorDraft>(() => editorDraft(asset));
  const [saving, setSaving] = useState(false);
  const map = draft.type === "map";
  const fileId = map ? previewFileId(asset) : asset.files.original.id;
  const [loaded, setLoaded] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    fetchFile(fileId)
      .then(() => current && setLoaded(fileId))
      .catch((error: Error) => addToast(`The preview could not load: ${error.message}`, { appearance: "error" }));
    return () => { current = false; };
  }, [fileId, fetchFile, addToast]);

  function changeDefaults(defaults: Partial<EditorDraft["defaults"]>) {
    setDraft((value) => ({ ...value, defaults: { ...value.defaults, ...defaults } }));
  }

  function handleSave() {
    const { command: edit, error } = editorCommand(asset, draft);
    if (error) {
      addToast(error, { appearance: "error" });
      return;
    }
    if (!edit) {
      onClose();
      return;
    }
    setSaving(true);
    command(edit)
      .then(onClose)
      .catch((reason: Error) => {
        setSaving(false);
        addToast(reason.message, { appearance: "error" });
      });
  }

  const types = assetTypes.filter((type) => type === asset.type || maySetAssetType(person.role, type));

  return (
    <Modal
      isOpen
      onRequestClose={onClose}
      contentLabel={`Edit ${asset.name}`}
      style={{ content: { width: "calc(100% - 16px)", maxWidth: map ? "640px" : "480px", maxHeight: "calc(100% - 16px)", overflowY: "auto" } }}
    >
      <Box>
        <Label py={1}>Edit asset</Label>
        <Flex sx={{ gap: 2 }}>
          <Field label="Name" htmlFor="assetName">
            <Input
              id="assetName"
              value={draft.name}
              autoComplete="off"
              onChange={(event) => setDraft((value) => ({ ...value, name: event.target.value }))}
              my={1}
            />
          </Field>
          <Box sx={{ width: "140px", flexShrink: 0 }}>
            <Field label="Type" htmlFor="assetType">
              <Select
                id="assetType"
                value={draft.type}
                onChange={(event) => setDraft((value) => ({ ...value, type: event.target.value as AssetType }))}
                sx={selectStyle}
                my={1}
              >
                {types.map((type) => (
                  <option key={type} value={type}>
                    {dockTabLabels[type]}
                  </option>
                ))}
              </Select>
            </Field>
          </Box>
        </Flex>
        <Box mt={2} sx={{ bg: "muted", borderRadius: "4px", overflow: "hidden" }}>
          {loaded !== fileId ? (
            <Text as="p" variant="caption" m={0} p={3}>
              Loading the preview…
            </Text>
          ) : map ? (
            <MapEditor
              map={editorMap(asset, draft.defaults.grid)}
              onSettingsChange={(change) => change.grid && changeDefaults({ grid: change.grid })}
            />
          ) : (
            <TokenPreview token={editorToken(asset, draft.defaults)} />
          )}
        </Box>
        {map ? (
          <GridFields
            grid={draft.defaults.grid}
            width={asset.width}
            height={asset.height}
            onChange={(grid) => changeDefaults({ grid })}
          />
        ) : (
          <Flex sx={{ gap: 2 }}>
            <Field label="Default size" htmlFor="assetSize">
              <Input
                id="assetSize"
                type="number"
                min={0.5}
                step={0.5}
                value={`${draft.defaults.defaultSize}`}
                onChange={(event) => changeDefaults({ defaultSize: parseFloat(event.target.value) || 0 })}
                my={1}
              />
            </Field>
            <Field label="Default label" htmlFor="assetLabel">
              <Input
                id="assetLabel"
                value={draft.defaults.defaultLabel}
                autoComplete="off"
                onChange={(event) => changeDefaults({ defaultLabel: event.target.value })}
                my={1}
              />
            </Field>
          </Flex>
        )}
        <Text as="p" variant="caption" mt={2} mb={0}>
          Changes apply when it is next placed. Copies already on the map keep their settings.
        </Text>
        <Flex mt={2} sx={{ gap: 2 }}>
          <Button variant="secondary" sx={{ flexGrow: 1 }} onClick={onClose}>
            Cancel
          </Button>
          <Button sx={{ flexGrow: 1 }} disabled={saving} onClick={handleSave}>
            Save
          </Button>
        </Flex>
      </Box>
    </Modal>
  );
}

export default AssetEditor;
