import { useContext, useEffect, useState } from "react";
import { Group } from "react-konva";

import World from "./World";
import PointerTool, { pointerSize, pointerTrailDuration } from "../tools/PointerTool";
import Pointer from "../konva/Pointer";

import { PlayerStateContext } from "../../contexts/PlayerContext";
import { useParty } from "../../contexts/PartyContext";

import colors from "../../helpers/colors";
import Vector2 from "../../helpers/Vector2";

import { useLive, useLiveMarks } from "../../scene/LiveContext";
import { LiveState } from "../../sceneRules";

const hidden: LiveState["pointer"] = { position: { x: 0, y: 0 }, visible: false };

type ScenePointersProps = {
  /** The pointer tool is selected; the right mouse button points with any tool */
  active: boolean;
};

/**
 * This connection's pointer, sent live to the others viewing the scene, and
 * theirs, each in its owner's colour
 */
function ScenePointers({ active }: ScenePointersProps) {
  const player = useContext(PlayerStateContext);
  const party = useParty();
  const { send, end, cleared } = useLive();
  const pointers = useLiveMarks("pointer");

  const [own, setOwn] = useState(hidden);

  // A snapshot or a lost connection lets go of a pointer being held
  useEffect(() => {
    setOwn(hidden);
  }, [cleared]);

  useEffect(() => {
    return () => end("pointer");
  }, [end]);

  function handlePoint(position: Vector2) {
    const state = { position: { x: position.x, y: position.y }, visible: true };
    setOwn(state);
    send("pointer", state);
  }

  function handlePointerUp(position: Vector2) {
    setOwn({ position, visible: false });
    end("pointer");
  }

  return (
    <Group>
      <PointerTool
        active={active}
        position={own.position}
        visible={own.visible}
        onPointerDown={handlePoint}
        onPointerMove={handlePoint}
        onPointerUp={handlePointerUp}
        color={player?.color || "blue"}
      />
      <World listening={false}>
        {Object.entries(pointers).map(
          ([connectionId, pointer]) =>
            pointer.visible && (
              <Pointer
                key={connectionId}
                position={pointer.position}
                color={colors[party[connectionId]?.color || "red"]}
                size={pointerSize}
                duration={pointerTrailDuration}
              />
            )
        )}
      </World>
    </Group>
  );
}

export default ScenePointers;
