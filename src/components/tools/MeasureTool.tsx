import { useState, useEffect } from "react";
import { Label, Line, Tag, Text } from "react-konva";

import { useInteractionEmitter, MapDragEvent, leftMouseButton, useStageScale } from "../../contexts/MapInteractionContext";
import { useMapStage } from "../../contexts/MapStageContext";
import { getRelativePointerPosition } from "../../helpers/konva";
import { parseGridScale } from "../../helpers/grid";
import useSceneSnapping from "../../hooks/useSceneSnapping";
import useWorldPlacement from "../../hooks/useWorldPlacement";
import { useScene } from "../../scene/SceneContext";
import { gridDistance } from "../../scene/grid";
import { worldNodeId } from "../../scene/worldPosition";
import { Vector2 } from "../../sceneRules";
import World from "../scene/World";

/** Measures in world units on the scene's grid, above items and below fog */
function MeasureTool({ active }: { active: boolean }) {
  const { scene } = useScene();
  const emitter = useInteractionEmitter();
  const stage = useMapStage();
  const stageScale = useStageScale();
  const placement = useWorldPlacement();
  const [points, setPoints] = useState<Vector2[] | null>(null);
  const snap = useSceneSnapping(scene?.grid.measurement.type === "euclidean" ? 0 : 1, false);
  useEffect(() => {
    if (!active) { setPoints(null); return; }
    function position() {
      const world = stage.current?.findOne(`#${worldNodeId}`);
      const point = world && getRelativePointerPosition(world);
      return point && snap(point);
    }
    function down(event: MapDragEvent) {
      const point = position();
      if (leftMouseButton(event) && point) setPoints([point, point]);
    }
    function move(event: MapDragEvent) {
      const point = position();
      if (leftMouseButton(event) && point) setPoints((previous) => previous && [previous[0], point]);
    }
    function up() { setPoints(null); }
    emitter?.on("dragStart", down);
    emitter?.on("drag", move);
    emitter?.on("dragEnd", up);
    return () => {
      emitter?.off("dragStart", down);
      emitter?.off("drag", move);
      emitter?.off("dragEnd", up);
    };
  }, [active, emitter, stage, snap]);
  if (!points || !scene) return null;
  const scale = parseGridScale(scene.grid.measurement.scale);
  const length = gridDistance(scene.grid, points[0], points[1]);
  const zoom = stageScale * placement.scale;
  const line = points.reduce<number[]>((values, point) => [...values, point.x, point.y], []);
  return (
    <World listening={false}>
      <Line points={line} stroke="hsla(230, 25%, 18%, 0.8)" strokeWidth={15} lineCap="round" />
      <Line points={line} stroke="white" strokeWidth={2.5} lineCap="round" />
      <Label x={(points[0].x + points[1].x) / 2} y={(points[0].y + points[1].y) / 2} scaleX={1 / zoom} scaleY={1 / zoom}>
        <Tag fill="hsla(230, 25%, 18%, 0.8)" cornerRadius={4} />
        <Text text={`${(length * scale.multiplier).toFixed(scale.digits)}${scale.unit}`} fill="white" fontSize={24} padding={4} />
      </Label>
    </World>
  );
}

export default MeasureTool;
