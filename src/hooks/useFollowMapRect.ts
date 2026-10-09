import { useEffect, useRef } from "react";
import Konva from "konva";

import { MapStage } from "../contexts/MapStageContext";
import {
  fitMapRect,
  isSameMapRect,
  MapFrame,
  MapRect,
} from "../helpers/displayView";
import Vector2 from "../helpers/Vector2";

// Time for the stage to cover about two thirds of the way to a new rectangle (ms)
const followTime = 120;

/**
 * Keep a rectangle of the map fitted to the stage, easing to it as it changes
 *
 * @param rect The rectangle to show, undefined to leave the stage alone
 * @param mapId Jump to the rectangle when this changes instead of easing
 */
function useFollowMapRect(
  rect: MapRect | undefined,
  mapId: string | undefined,
  stageRef: MapStage,
  layerRef: React.RefObject<Konva.Layer>,
  frame: Omit<MapFrame, "layerX" | "layerY">,
  stageTranslateRef: React.MutableRefObject<Vector2>,
  setStageScale: React.Dispatch<React.SetStateAction<number>>
) {
  const rectRef = useRef(rect);
  const mapIdRef = useRef(mapId);
  const frameRef = useRef(frame);
  useEffect(() => {
    rectRef.current = rect;
    mapIdRef.current = mapId;
    frameRef.current = frame;
  });

  const isFollowing = rect !== undefined;
  useEffect(() => {
    if (!isFollowing) {
      return;
    }
    // The rectangle the stage is showing as it eases towards the one to show
    let shown: MapRect | undefined;
    let shownMapId: string | undefined;
    let prevTime = performance.now();
    let request = requestAnimationFrame(update);

    function update(time: number) {
      request = requestAnimationFrame(update);
      const deltaTime = time - prevTime;
      prevTime = time;

      const target = rectRef.current;
      const stage = stageRef.current;
      const layer = layerRef.current;
      if (!target || !stage || !layer) {
        return;
      }

      if (!shown || shownMapId !== mapIdRef.current) {
        shown = target;
        shownMapId = mapIdRef.current;
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

      // Read the layer as it is now, it only moves when the map changes
      const transform = fitMapRect(shown, {
        ...frameRef.current,
        layerX: layer.x(),
        layerY: layer.y(),
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
  }, [isFollowing, stageRef, layerRef, stageTranslateRef, setStageScale]);
}

export default useFollowMapRect;
