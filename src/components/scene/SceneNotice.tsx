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
        bottom: 56,
        "@media (min-width: 1024px)": { bottom: 0 },
        left: "50%",
        transform: "translateX(-50%)",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 2,
        width: "calc(100% - 32px)",
        maxWidth: 760,
        backgroundColor: "highlight",
        color: "hsl(210, 50%, 96%)",
        borderRadius: "4px",
      }}
      my={2}
      p={2}
    >
      <Text as="p" variant="body2" sx={{ overflowWrap: "anywhere", flexBasis: "100%", minWidth: 0 }} mr={2}>
        You are viewing {away.viewedName ? `“${away.viewedName}”` : "a scene"},
        which is not the open scene. Players do not see it.
      </Text>
      <Button
        type="button"
        sx={{ flexShrink: 1, maxWidth: "100%", whiteSpace: "normal", color: "inherit", borderColor: "currentcolor" }}
        mr={2}
        disabled={readOnly || isSending}
        onClick={handleShow}
      >
        Show to players
      </Button>
      <Button
        type="button"
        sx={{ flexShrink: 1, maxWidth: "100%", whiteSpace: "normal", color: "inherit", borderColor: "currentcolor" }}
        disabled={readOnly || isSending}
        onClick={async () => {
          const answer = await viewScene(away.openSceneId);
          if (!answer.ok) addToast("Unable to open the scene. Try again in a moment.", { appearance: "error" });
        }}
        title={away.openName && `Back to “${away.openName}”`}
      >
        Back to the open scene
      </Button>
    </Flex>
  );
}

export default SceneNotice;
