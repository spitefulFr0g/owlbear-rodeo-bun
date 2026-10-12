import { useState, useEffect, useContext, useRef } from "react";

import { useInteractionEmitter, MapDragEvent, leftMouseButton } from "../../contexts/MapInteractionContext";
import { useMapStage } from "../../contexts/MapStageContext";
import { PlayerStateContext } from "../../contexts/PlayerContext";
import colors from "../../helpers/colors";
import { getRelativePointerPosition } from "../../helpers/konva";
import useSceneSnapping from "../../hooks/useSceneSnapping";
import { useLive } from "../../scene/LiveContext";
import { rulerText } from "../../scene/ruler";
import { useScene } from "../../scene/SceneContext";
import { worldNodeId } from "../../scene/worldPosition";
import { LiveState, Vector2 } from "../../sceneRules";
import Ruler from "../konva/Ruler";
import World from "../scene/World";

/**
 * Measures in world units on the scene's grid, above items and below fog. The
 * ruler is sent live to the others viewing the scene while it is held.
 */
function MeasureTool({ active }: { active: boolean }) {
  const { scene } = useScene();
  const player = useContext(PlayerStateContext);
  const emitter = useInteractionEmitter();
  const stage = useMapStage();
  const { send, end, cleared } = useLive();
  const [ruler, setRuler] = useState<LiveState["ruler"] | null>(null);
  const startRef = useRef<Vector2 | null>(null);
  const snap = useSceneSnapping(scene?.grid.measurement.type === "euclidean" ? 0 : 1, false);

  // A snapshot or a lost connection lets go of a ruler being held
  useEffect(() => {
    startRef.current = null;
    setRuler(null);
  }, [cleared]);

  useEffect(() => {
    return () => end("ruler");
  }, [end]);

  useEffect(() => {
    function release() {
      startRef.current = null;
      setRuler(null);
      end("ruler");
    }
    if (!active) { release(); return; }
    function position() {
      const world = stage.current?.findOne(`#${worldNodeId}`);
      const point = world && getRelativePointerPosition(world);
      return point && snap(point);
    }
    function measure(start: Vector2, point: Vector2) {
      const state = { start: { x: start.x, y: start.y }, end: { x: point.x, y: point.y } };
      setRuler(state);
      send("ruler", state);
    }
    function down(event: MapDragEvent) {
      const point = position();
      if (!leftMouseButton(event) || !point) return;
      startRef.current = point;
      measure(point, point);
    }
    function move(event: MapDragEvent) {
      const point = position();
      if (leftMouseButton(event) && point && startRef.current) measure(startRef.current, point);
    }
    emitter?.on("dragStart", down);
    emitter?.on("drag", move);
    emitter?.on("dragEnd", release);
    return () => {
      emitter?.off("dragStart", down);
      emitter?.off("drag", move);
      emitter?.off("dragEnd", release);
    };
  }, [active, emitter, stage, snap, send, end]);
  if (!ruler || !scene) return null;
  return (
    <World listening={false}>
      <Ruler
        start={ruler.start}
        end={ruler.end}
        text={rulerText(scene.grid, ruler.start, ruler.end)}
        color={colors[player?.color || "blue"]}
      />
    </World>
  );
}

export default MeasureTool;
