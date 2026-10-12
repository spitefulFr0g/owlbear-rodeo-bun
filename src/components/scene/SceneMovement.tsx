import World from "./World";
import Ruler from "../konva/Ruler";
import { usePlayerState } from "../../contexts/PlayerContext";
import { useScene } from "../../scene/SceneContext";
import { rulerText } from "../../scene/ruler";
import { TokenMovement } from "../../sceneRules";
import colors from "../../helpers/colors";

/** The picked-up token's local distance, above items and below fog. */
export default function SceneMovement({ movement }: { movement: TokenMovement | null }) {
  const { scene, readOnly } = useScene();
  const player = usePlayerState();
  if (!movement || !scene?.movementMode || readOnly) return null;
  return (
    <World listening={false}>
      <Ruler
        start={movement.start}
        end={movement.end}
        text={rulerText(scene.grid, movement.start, movement.end)}
        color={colors[player.color || "blue"]}
      />
    </World>
  );
}
