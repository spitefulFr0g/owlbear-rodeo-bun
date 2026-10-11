import { useEffect, useRef } from "react";

import { MapStage } from "../contexts/MapStageContext";
import { MapFrame } from "../helpers/displayView";
import { fitPlayerView, PlayerView } from "../helpers/playerView";
import { worldFrame } from "../scene/worldPosition";
import Vector2 from "../helpers/Vector2";

/**
 * Move the stage to a view a GM carried here, once: the person is free to pan
 * and zoom afterwards
 *
 * @param view The view last carried, a new object each time one arrives
 * @param sceneId The scene the stage is drawing
 */
function useFitPlayerView(
  view: PlayerView | null,
  sceneId: string | undefined,
  stageRef: MapStage,
  frame: Pick<MapFrame, "stageWidth" | "stageHeight">,
  stageTranslateRef: React.MutableRefObject<Vector2>,
  setStageScale: React.Dispatch<React.SetStateAction<number>>
) {
  const fittedRef = useRef<PlayerView | null>(null);
  const { stageWidth, stageHeight } = frame;

  useEffect(() => {
    const stage = stageRef.current;
    // A stage that has yet to be measured is one pixel wide
    if (!view || view === fittedRef.current || !stage || stageWidth <= 1 || stageHeight <= 1) {
      return;
    }
    const worldLayout = worldFrame(stage, { stageWidth, stageHeight });
    if (!worldLayout) {
      return;
    }
    fittedRef.current = view;
    const transform = fitPlayerView(view, sceneId, worldLayout);
    if (!transform) {
      return;
    }
    const translate = { x: transform.x, y: transform.y };
    stage.position(translate);
    stageTranslateRef.current = translate;
    setStageScale(transform.scale);
    stage.batchDraw();
  }, [view, sceneId, stageRef, stageWidth, stageHeight, stageTranslateRef, setStageScale]);
}

export default useFitPlayerView;
