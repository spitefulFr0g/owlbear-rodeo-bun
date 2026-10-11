import { ChangeEvent, FormEvent, useState } from "react";
import { Box, Button, Flex, Input, Label, Text, useThemeUI } from "theme-ui";
import SimpleBar from "simplebar-react";
import { v4 as uuid } from "uuid";

import Modal from "../components/Modal";
import LoadingOverlay from "../components/LoadingOverlay";
import MapSettings from "../components/map/MapSettings";
import MapEditor from "../components/map/MapEditor";

import useMapEdits from "../hooks/useMapEdits";
import useResponsiveLayout from "../hooks/useResponsiveLayout";

import { useMapData } from "../contexts/MapDataContext";
import { SceneAnswer, useScene } from "../scene/SceneContext";
import { importedSceneName, sceneFromMap } from "../scene/mapItem";
import { maxSceneNameLength } from "../sceneRules";
import { imageFiles } from "../scene/shown";

import { Map } from "../types/Map";

type ImportSceneProps = {
  isOpen: boolean;
  /** A map of the browser library */
  map: Map;
  /** Back to the map picker */
  onPickAnother: () => void;
  onCancel: () => void;
  /** The scene was made and this GM connection moved to it */
  onCreated: () => void;
  /** Says why the server refused */
  refusal: (answer: SceneAnswer) => string;
};

/**
 * The importer: aligns a map to the grid, names the scene and makes it with
 * the map on it. The alignment is saved on the map's own record.
 */
function ImportSceneModal({
  isOpen,
  map,
  onPickAnother,
  onCancel,
  onCreated,
  refusal,
}: ImportSceneProps) {
  const { theme } = useThemeUI();
  const { updateMap } = useMapData();
  const { createScene, share } = useScene();
  const { edited, change, save } = useMapEdits(map, updateMap);

  // Undefined until the GM types a name, the scene is named after the map till then
  const [typedName, setTypedName] = useState<string>();
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string>();

  async function handleCreate(event: FormEvent<HTMLElement>) {
    event.preventDefault();
    setIsSending(true);
    setError(undefined);
    const create = sceneFromMap(await save(), typedName, uuid());
    try {
      // The server must hold an image's bytes before an item names them
      await share(imageFiles(create.map));
    } catch (error) {
      console.error(error);
      setIsSending(false);
      setError("The map's images could not be sent to the room.");
      return;
    }
    const answer = await createScene(create.name, {
      grid: create.grid,
      map: create.map,
    });
    setIsSending(false);
    if (answer.ok) onCreated();
    else setError(refusal(answer));
  }

  const layout = useResponsiveLayout();

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onCancel}
      style={{
        content: {
          maxWidth: layout.modalSize,
          width: "calc(100% - 16px)",
          padding: 0,
          display: "flex",
          overflow: "hidden",
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
          New scene from a map
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
          <MapEditor map={edited} onSettingsChange={change} />
          <MapSettings map={edited} onSettingsChange={change} />
        </SimpleBar>
        <Box as="form" onSubmit={handleCreate} m={3}>
          <Label htmlFor="importedSceneName">Scene name</Label>
          <Input
            id="importedSceneName"
            name="importedSceneName"
            value={typedName ?? importedSceneName(edited, undefined)}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setTypedName(event.target.value)
            }
            maxLength={maxSceneNameLength}
            autoComplete="off"
            my={1}
          />
          {error && (
            <Text as="p" variant="caption" sx={{ color: "highlight" }} my={1}>
              {error}
            </Text>
          )}
          <Flex mt={2}>
            <Button
              type="button"
              variant="secondary"
              sx={{ flexGrow: 1 }}
              mr={2}
              disabled={isSending}
              onClick={onPickAnother}
            >
              Choose another map
            </Button>
            <Button
              sx={{ flexGrow: 1 }}
              disabled={isSending || !importedSceneName(edited, typedName)}
            >
              Create scene
            </Button>
          </Flex>
        </Box>
      </Flex>
      <>{isSending && <LoadingOverlay bg="overlay" />}</>
    </Modal>
  );
}

export default ImportSceneModal;
