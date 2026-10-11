import { useState } from "react";
import { IconButton } from "theme-ui";
import { useToasts } from "react-toast-notifications";

import BringPlayersIcon from "../../icons/BringPlayersIcon";

import { useRoom } from "../../contexts/RoomContext";
import { useBringPlayers, useScene } from "../../scene/SceneContext";
import { mayBringPlayers } from "../../helpers/sceneList";

/**
 * Bring players here, for the GM: offered only on the open scene during a
 * session
 */
function BringPlayersButton() {
  const { scene, sceneList, readOnly } = useScene();
  const { session } = useRoom();
  const bringPlayers = useBringPlayers();
  const { addToast } = useToasts();
  const [isSending, setIsSending] = useState(false);

  if (!mayBringPlayers(sceneList, scene?.id, session)) return null;

  async function handleBring() {
    setIsSending(true);
    const answer = await bringPlayers();
    setIsSending(false);
    if (answer.ok) addToast("Players brought to your view");
    else addToast("Unable to bring players here. Try again in a moment.", {
        appearance: "error",
      });
  }

  return (
    <IconButton
      aria-label="Bring Players Here"
      title="Bring Players Here"
      onClick={handleBring}
      disabled={readOnly || isSending}
    >
      <BringPlayersIcon />
    </IconButton>
  );
}

export default BringPlayersButton;
