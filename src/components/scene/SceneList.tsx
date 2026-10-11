import { ChangeEvent, ComponentType, FormEvent, useState } from "react";
import { Box, Button, Flex, Input, Label, Text } from "theme-ui";

import { useScene, SceneAnswer } from "../../scene/SceneContext";
import { ListedScene } from "../../helpers/sceneList";
import { maxSceneNameLength } from "../../sceneRules";

import SceneImporter from "./SceneImporter";

function refusal(answer: SceneAnswer) {
  switch (answer.error) {
    case "offline":
      return "Not connected to the room. Try again in a moment.";
    case "not_found":
      return "That scene is no longer in the room.";
    case "cap":
      return "This room holds as many scenes as it can.";
    case "invalid":
      return "A scene's name is 1 to 100 characters.";
    default:
      return "The room refused that.";
  }
}

export type SceneEntryProps = {
  scene: ListedScene;
  /** Tells the person why the server refused an action */
  onRefused: (answer: SceneAnswer) => void;
  /** The action took the GM to the canvas, so whatever holds the list may close */
  onDone: () => void;
};

function OpenSceneEntry({ scene, onRefused, onDone }: SceneEntryProps) {
  const { scene: viewed, viewScene } = useScene();
  async function handleOpen() {
    const answer = await viewScene(scene.id);
    if (answer.ok) onDone();
    else onRefused(answer);
  }
  return (
    <Button
      type="button"
      variant="secondary"
      disabled={viewed?.id === scene.id}
      onClick={handleOpen}
      aria-label={`Open ${scene.name}`}
    >
      Open
    </Button>
  );
}

/** What a GM can do to one scene of the list, in the order shown */
const sceneEntries: ComponentType<SceneEntryProps>[] = [OpenSceneEntry];

type SceneListProps = {
  onDone: () => void;
};

/**
 * The room's scenes and the actions on them, for the GM. It knows nothing of
 * the dialog that holds it.
 */
function SceneList({ onDone }: SceneListProps) {
  const { sceneList, createScene } = useScene();
  const [name, setName] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string>();
  const [isImporting, setIsImporting] = useState(false);

  if (!sceneList) return null;

  function handleRefused(answer: SceneAnswer) {
    setError(refusal(answer));
  }

  async function handleCreate(event: FormEvent<HTMLElement>) {
    event.preventDefault();
    setIsSending(true);
    setError(undefined);
    const answer = await createScene(name.trim());
    setIsSending(false);
    if (answer.ok) {
      setName("");
      onDone();
    } else {
      handleRefused(answer);
    }
  }

  return (
    <Box>
      <Box as="ul" sx={{ listStyle: "none", maxHeight: "50vh", overflowY: "auto" }} p={0} my={2}>
        {sceneList.scenes.map((scene) => (
          <Flex
            as="li"
            key={scene.id}
            sx={{ alignItems: "center", justifyContent: "space-between" }}
            py={1}
          >
            <Text sx={{ overflowWrap: "anywhere" }} mr={2}>{scene.name}</Text>
            <Flex sx={{ flexShrink: 0 }}>
              {sceneEntries.map((Entry, index) => (
                <Entry key={index} scene={scene} onRefused={handleRefused} onDone={onDone} />
              ))}
            </Flex>
          </Flex>
        ))}
      </Box>
      <Box as="form" onSubmit={handleCreate}>
        <Label htmlFor="newSceneName">New scene</Label>
        <Flex>
          <Input
            id="newSceneName"
            name="newSceneName"
            placeholder="Name"
            value={name}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setName(event.target.value)
            }
            maxLength={maxSceneNameLength}
            autoComplete="off"
            mr={2}
          />
          <Button sx={{ flexShrink: 0 }} disabled={!name.trim() || isSending}>
            Create empty
          </Button>
        </Flex>
      </Box>
      <Button
        type="button"
        variant="secondary"
        sx={{ width: "100%" }}
        mt={2}
        onClick={() => setIsImporting(true)}
      >
        Make a scene from a map
      </Button>
      {isImporting && (
        <SceneImporter
          onCancel={() => setIsImporting(false)}
          onCreated={() => {
            setIsImporting(false);
            onDone();
          }}
          refusal={refusal}
        />
      )}
      {error && (
        <Text as="p" variant="caption" sx={{ color: "highlight" }} mt={2}>
          {error}
        </Text>
      )}
    </Box>
  );
}

export default SceneList;
