import World from "./World";
import Ruler from "../konva/Ruler";

import { useParty } from "../../contexts/PartyContext";

import colors from "../../helpers/colors";

import { useLive, useLiveMarks } from "../../scene/LiveContext";
import { rulerText } from "../../scene/ruler";
import { useScene } from "../../scene/SceneContext";

/**
 * The rulers of the others viewing the scene, each in its owner's colour with
 * the distance its owner sees, above items and below fog
 */
function SceneRulers() {
  const { scene } = useScene();
  const party = useParty();
  const { marks } = useLive();
  const rulers = useLiveMarks("ruler");

  if (!scene) return null;
  const received = marks().ruler;

  return (
    <World listening={false}>
      {Object.entries(rulers).map(([connectionId, line]) => {
        // The line is smoothed; the distance is only ever one its owner was shown
        const measured = received[connectionId]?.to || line;
        return (
          <Ruler
            key={connectionId}
            start={line.start}
            end={line.end}
            text={rulerText(scene.grid, measured.start, measured.end)}
            color={colors[party[connectionId]?.color || "red"]}
          />
        );
      })}
    </World>
  );
}

export default SceneRulers;
