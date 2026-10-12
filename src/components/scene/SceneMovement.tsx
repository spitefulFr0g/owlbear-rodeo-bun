import World from "./World";
import Ruler from "../konva/Ruler";
import { usePlayerState } from "../../contexts/PlayerContext";
import { useScene } from "../../scene/SceneContext";
import { rulerText } from "../../scene/ruler";
import { TokenMovement, tokenMovement } from "../../sceneRules";
import { useParty } from "../../contexts/PartyContext";
import { useLive, useLiveMarks } from "../../scene/LiveContext";
import { dragTransforms } from "../../scene/live";
import colors from "../../helpers/colors";

/** Local and received token distances, above items and below fog. */
export default function SceneMovement({ movement }: { movement: TokenMovement | null }) {
  const { scene, readOnly } = useScene();
  const party = useParty();
  const { marks, held } = useLive();
  const drags = useLiveMarks("drag");
  if (!scene?.movementMode) return null;
  const received = marks().drag;
  const drawn = dragTransforms(drags, held);
  return (
    <World listening={false}>
      {movement && !readOnly && <LocalMovement movement={movement} />}
      {Object.entries(drags).map(([connectionId, drag]) => {
        // Match the item's live overlay, including local holds and competing drags.
        const items = drag.items.filter(item => drawn[item.id] === item);
        const line = tokenMovement(scene, items);
        if (!line) return null;
        // Smoothing moves the line; the label keeps the sender's latest distance.
        const measured = tokenMovement(scene, received[connectionId]?.to.items || items, line.id);
        if (!measured) return null;
        return <Ruler
          key={connectionId}
          start={line.start}
          end={line.end}
          text={rulerText(scene.grid, measured.start, measured.end)}
          color={colors[party[connectionId]?.color || "red"]}
        />;
      })}
    </World>
  );
}

/** Only an editing connection has a player state; cast displays have none. */
function LocalMovement({ movement }: { movement: TokenMovement }) {
  const { scene } = useScene();
  const player = usePlayerState();
  if (!scene) return null;
  return <Ruler
    start={movement.start}
    end={movement.end}
    text={rulerText(scene.grid, movement.start, movement.end)}
    color={colors[player.color || "blue"]}
  />;
}
