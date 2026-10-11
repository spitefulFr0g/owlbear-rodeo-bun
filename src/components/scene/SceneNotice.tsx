import { useState } from "react";
import { Button, Flex, Text } from "theme-ui";
import { useToasts } from "react-toast-notifications";

import { useScene, useShowToPlayers } from "../../scene/SceneContext";
import { awayFromOpenScene } from "../../helpers/sceneList";

/** Stays on screen while the GM views a scene that is not the open scene */
function SceneNotice() {
  const { scene, sceneList, readOnly, viewScene } = useScene();
  const showToPlayers = useShowToPlayers();
  const { addToast } = useToasts();
  const [isSending, setIsSending] = useState(false);
  const away = awayFromOpenScene(sceneList, scene?.id);
  if (!away || !scene) return null;
  const viewedSceneId = scene.id;

  async function handleShow() {
    setIsSending(true);
    const answer = await showToPlayers(viewedSceneId);
    setIsSending(false);
    if (!answer.ok) addToast("Unable to show this scene to players. Try again in a moment.", {
        appearance: "error",
      });
  }

  return (
    <Flex
      role="status"
      sx={{
        position: "absolute",
        bottom: 0,
        left: "50%",
        transform: "translateX(-50%)",
        alignItems: "center",
        maxWidth: "calc(100% - 320px)",
        backgroundColor: "highlight",
        color: "hsl(210, 50%, 96%)",
        borderRadius: "4px",
      }}
      m={2}
      p={2}
    >
      <Text as="p" variant="body2" sx={{ overflowWrap: "anywhere" }} mr={2}>
        You are viewing {away.viewedName ? `“${away.viewedName}”` : "a scene"},
        which is not the open scene. Players do not see it.
      </Text>
      <Button
        type="button"
        sx={{ flexShrink: 0, color: "inherit", borderColor: "currentcolor" }}
        mr={2}
        disabled={readOnly || isSending}
        onClick={handleShow}
      >
        Show to players
      </Button>
      <Button
        type="button"
        sx={{ flexShrink: 0, color: "inherit", borderColor: "currentcolor" }}
        onClick={() => viewScene(away.openSceneId)}
        title={away.openName && `Back to “${away.openName}”`}
      >
        Back to the open scene
      </Button>
    </Flex>
  );
}

export default SceneNotice;
