import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { Box, Button, Flex, Checkbox, Input, Label, Text, useThemeUI } from "theme-ui";
import SimpleBar from "simplebar-react";

import Modal from "../components/Modal";
import LoadingOverlay from "../components/LoadingOverlay";
import MapSettings from "../components/map/MapSettings";
import MapEditor from "../components/map/MapEditor";

import useMapEdits from "../hooks/useMapEdits";
import useResponsiveLayout from "../hooks/useResponsiveLayout";

import { shownFile } from "../helpers/shownFile";
import { importedSceneName } from "../scene/mapItem";
import { maxSceneNameLength } from "../sceneRules";

import { Map } from "../types/Map";

type ImportSceneProps = {
  isOpen: boolean;
  /** What the importer is doing, said at its top */
  label: string;
  /** A library map, or none for an empty scene */
  map: Map | undefined;
  /** Said where the map would be when there is none */
  noMapText?: string;
  /** The name to start from. Without one the scene is named after the map until the GM types */
  startName?: string;
  startFogFill?: boolean;
  confirmText: string;
  pickText: string;
  /** Return to the New scene choices */
  onPickAnother: () => void;
  /** Takes the map off. Not offered without it */
  onRemoveMap?: () => void;
  onCancel: () => void;
  /**
   * Given the map as it is now saved and the scene's name. Resolves with
   * nothing once done, or with what to tell the GM went wrong.
   */
  onSaveMap: (id: string, changes: Partial<Map>) => Promise<void>;
  onConfirm: (map: Map | undefined, name: string, fogFill: boolean) => Promise<string | undefined>;
  /** Brings a stored file into this browser, so a map uploaded elsewhere can be aligned */
  fetchFile: (id: string) => Promise<unknown>;
};

/**
 * The importer: aligns a map to the grid and names the scene. The alignment
 * is saved through the room library facade before creating the scene.
 */
function ImportSceneModal({
  isOpen,
  label,
  map,
  noMapText,
  startName,
  startFogFill = false,
  confirmText,
  pickText,
  onPickAnother,
  onRemoveMap,
  onCancel,
  onConfirm,
  onSaveMap,
  fetchFile,
}: ImportSceneProps) {
  const { theme } = useThemeUI();
  const { edited, change, save } = useMapEdits(map, onSaveMap);

  // The file the editor shows, fetched before it mounts, as it reads only
  // what this browser holds. Choosing another quality fetches that copy.
  const shown = edited?.type === "file" ? shownFile(edited) : undefined;
  const [fetched, setFetched] = useState<string>();
  const [fetchError, setFetchError] = useState<string>();
  useEffect(() => {
    if (!shown) return;
    let current = true;
    setFetchError(undefined);
    fetchFile(shown)
      .then(() => current && setFetched(shown))
      .catch((error: Error) => current && setFetchError(`The map could not load: ${error.message}`));
    return () => { current = false; };
  }, [shown, fetchFile]);

  // Undefined until the GM types a name
  const [typedName, setTypedName] = useState(startName);
  const name = edited
    ? importedSceneName(edited, typedName)
    : (typedName || "").trim();
  const [fogFill, setFogFill] = useState(startFogFill);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string>();

  async function handleConfirm(event: FormEvent<HTMLElement>) {
    event.preventDefault();
    setIsSending(true);
    setError(undefined);
    let failure: string | undefined;
    try {
      failure = await onConfirm(await save(), name, fogFill);
    } catch (error) {
      console.error(error);
      failure = error instanceof Error ? error.message : "Unable to save the scene. Try again in a moment.";
    }
    // Done, whoever opened the importer has closed it
    if (failure === undefined) return;
    setIsSending(false);
    setError(failure);
  }

  const layout = useResponsiveLayout();

  return (
    <Modal
      contentLabel={label}
      allowClose={!isSending}
      isOpen={isOpen}
      onRequestClose={isSending ? undefined : onCancel}
      style={{
        content: {
          maxWidth: layout.modalSize,
          width: "calc(100% - 16px)",
          padding: 0,
          display: "flex",
          overflowY: "auto",
        },
      }}
    >
      <Flex
        sx={{
          flexDirection: "column",
          width: "100%",
        }}
      >
        <Label pt={2} pb={1} px={3}>
          {label}
        </Label>
        <SimpleBar
          style={{
            minHeight: 0,
            padding: "16px",
            backgroundColor: theme.colors?.muted as string,
            margin: "0 8px",
            height: "100%",
          }}
        >
          {edited ? (
            <>
              {shown && fetched !== shown ? (
                <Text as="p" variant="body2" sx={{ textAlign: "center" }} my={4} role={fetchError ? "alert" : undefined}>
                  {fetchError || "Loading the map…"}
                </Text>
              ) : (
                <MapEditor key={edited.id} map={edited} onSettingsChange={change} />
              )}
              <MapSettings map={edited} onSettingsChange={change} />
            </>
          ) : (
            <Text as="p" variant="body2" sx={{ textAlign: "center" }} my={4}>
              {noMapText}
            </Text>
          )}
        </SimpleBar>
        <Box as="form" onSubmit={handleConfirm} m={3}>
          <Label htmlFor="importedSceneName">Scene name</Label>
          <Input
            id="importedSceneName"
            name="importedSceneName"
            value={typedName ?? name}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setTypedName(event.target.value)
            }
            maxLength={maxSceneNameLength}
            autoComplete="off"
            my={1}
          />
          <Label><Checkbox checked={fogFill} disabled={isSending} onChange={(event) => setFogFill(event.target.checked)} />Fog Fill</Label>
          {error && (
            <Text as="p" role="alert" variant="caption" sx={{ color: "highlight" }} my={1}>
              {error}
            </Text>
          )}
          <Flex mt={2} sx={{ flexWrap: "wrap", gap: 2 }}>
            <Button
              type="button"
              variant="secondary"
              sx={{ flexGrow: 1 }}
              mr={2}
              disabled={isSending}
              onClick={onPickAnother}
            >
              {pickText}
            </Button>
            {onRemoveMap && (
              <Button
                type="button"
                variant="secondary"
                sx={{ flexGrow: 1 }}
                mr={2}
                disabled={isSending}
                onClick={onRemoveMap}
              >
                Remove map
              </Button>
            )}
            <Button sx={{ flexGrow: 1 }} disabled={isSending || !name}>
              {confirmText}
            </Button>
          </Flex>
        </Box>
      </Flex>
      <>{isSending && <LoadingOverlay bg="overlay" />}</>
    </Modal>
  );
}

export default ImportSceneModal;
