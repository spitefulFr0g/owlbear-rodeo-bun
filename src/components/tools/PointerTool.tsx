import { useEffect, useRef } from "react";
import World from "../scene/World";
import { worldNodeId } from "../../scene/worldPosition";

import {
  useInteractionEmitter,
  MapDragEvent,
  leftMouseButton,
  rightMouseButton,
} from "../../contexts/MapInteractionContext";
import { useMapStage } from "../../contexts/MapStageContext";

import { getRelativePointerPosition } from "../../helpers/konva";
import Vector2 from "../../helpers/Vector2";

import Pointer from "../konva/Pointer";

import colors, { Color } from "../../helpers/colors";

type MapPointerProps = {
  active: boolean;
  position: Vector2;
  onPointerDown?: (position: Vector2) => void;
  onPointerMove?: (position: Vector2) => void;
  onPointerUp?: (position: Vector2) => void;
  visible: boolean;
  color: Color;
};

function PointerTool({
  active,
  position,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  visible,
  color,
}: MapPointerProps) {
  const interactionEmitter = useInteractionEmitter();
  const mapStageRef = useMapStage();

  const brushDownRef = useRef(false);

  useEffect(() => {
    const mapStage = mapStageRef.current;

    function getBrushPosition() {
      if (!mapStage) {
        return;
      }
      const world = mapStage.findOne(`#${worldNodeId}`);
      return world && getRelativePointerPosition(world);
    }

    function handleBrushDown(props: MapDragEvent) {
      if ((leftMouseButton(props) && active) || rightMouseButton(props)) {
        const brushPosition = getBrushPosition();
        brushPosition && onPointerDown?.(brushPosition);
        brushDownRef.current = true;
      }
    }

    function handleBrushMove() {
      if (brushDownRef.current) {
        const brushPosition = getBrushPosition();
        brushPosition && visible && onPointerMove?.(brushPosition);
      }
    }

    function handleBrushUp() {
      if (brushDownRef.current) {
        const brushPosition = getBrushPosition();
        brushPosition && onPointerUp?.(brushPosition);
        brushDownRef.current = false;
      }
    }

    interactionEmitter?.on("dragStart", handleBrushDown);
    interactionEmitter?.on("drag", handleBrushMove);
    interactionEmitter?.on("dragEnd", handleBrushUp);

    return () => {
      interactionEmitter?.off("dragStart", handleBrushDown);
      interactionEmitter?.off("drag", handleBrushMove);
      interactionEmitter?.off("dragEnd", handleBrushUp);
    };
  });

  const size = 30;

  return (
    <World listening={false}>
      {visible && (
        <Pointer
          position={position}
          color={colors[color]}
          size={size}
          duration={200}
        />
      )}
    </World>
  );
}

PointerTool.defaultProps = {
  color: "red",
};

export default PointerTool;
