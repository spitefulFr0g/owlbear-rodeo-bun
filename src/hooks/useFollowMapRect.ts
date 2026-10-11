import { useEffect, useRef } from "react";

import { MapStage } from "../contexts/MapStageContext";
import {
  fitMapRect,
  isSameMapRect,
  MapFrame,
  MapRect,
} from "../helpers/displayView";
import { worldNodeId } from "../scene/worldPosition";
import Vector2 from "../helpers/Vector2";

// Time for the stage to cover about two thirds of the way to a new rectangle (ms)
const followTime = 120;

/**
 * Keep a rectangle of the scene fitted to the stage, easing to it as it changes
 *
 * @param rect The rectangle to show, undefined to leave the stage alone
 * @param sceneId Jump to the rectangle when this changes instead of easing
 */
function useFollowMapRect(
  rect: MapRect | undefined,
  sceneId: string | undefined,
  stageRef: MapStage,
  frame: Pick<MapFrame, "stageWidth" | "stageHeight">,
  stageTranslateRef: React.MutableRefObject<Vector2>,
  setStageScale: React.Dispatch<React.SetStateAction<number>>
) {
  const rectRef = useRef(rect);
  const sceneIdRef = useRef(sceneId);
  const frameRef = useRef(frame);
  useEffect(() => {
    rectRef.current = rect;
    sceneIdRef.current = sceneId;
    frameRef.current = frame;
  });

  const isFollowing = rect !== undefined;
  useEffect(() => {
    if (!isFollowing) {
      return;
    }
    // The rectangle the stage is showing as it eases towards the one to show
    let shown: MapRect | undefined;
    let shownSceneId: string | undefined;
    let prevTime = performance.now();
    let request = requestAnimationFrame(update);

    function update(time: number) {
      request = requestAnimationFrame(update);
      const deltaTime = time - prevTime;
      prevTime = time;

      const target = rectRef.current;
      const stage = stageRef.current;
      const world = stage?.findOne(`#${worldNodeId}`);
      if (!target || !stage || !world) {
        return;
      }

      if (!shown || shownSceneId !== sceneIdRef.current) {
        shown = target;
        shownSceneId = sceneIdRef.current;
      } else if (isSameMapRect(shown, target, 1e-5)) {
        shown = target;
      } else {
        const alpha = 1 - Math.exp(-deltaTime / followTime);
        shown = {
          x: shown.x + (target.x - shown.x) * alpha,
          y: shown.y + (target.y - shown.y) * alpha,
          width: shown.width + (target.width - shown.width) * alpha,
          height: shown.height + (target.height - shown.height) * alpha,
        };
      }

      // Read the world placement independently of the current stage pan and zoom
      const local = stage.getAbsoluteTransform().copy().invert().multiply(world.getAbsoluteTransform());
      const origin = local.point({ x: 0, y: 0 });
      const unit = local.point({ x: 1, y: 1 });
      const transform = fitMapRect(shown, {
        ...frameRef.current,
        mapWidth: unit.x - origin.x,
        mapHeight: unit.y - origin.y,
        layerX: origin.x,
        layerY: origin.y,
      });
      if (
        !Number.isFinite(transform.scale) ||
        (Math.abs(stage.x() - transform.x) < 0.01 &&
          Math.abs(stage.y() - transform.y) < 0.01 &&
          Math.abs(stage.scaleX() - transform.scale) < 1e-6)
      ) {
        return;
      }
      const translate = { x: transform.x, y: transform.y };
      stage.position(translate);
      stageTranslateRef.current = translate;
      setStageScale(transform.scale);
      stage.batchDraw();
    }

    return () => {
      cancelAnimationFrame(request);
    };
  }, [isFollowing, stageRef, stageTranslateRef, setStageScale]);
}

export default useFollowMapRect;
