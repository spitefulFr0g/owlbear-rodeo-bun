import { DisplayView, fitMapRect, MapFrame, StageTransform } from "./displayView";

/**
 * The view a GM carries to players and trusted players, in world units: on
 * Show to players, where they start on the new open scene
 */
export type PlayerView = DisplayView;

/**
 * @returns the pan and zoom that show all of a player view in a window, as a
 * cast display fits the GM's view, with `mapWidth` and `mapHeight` the size of
 * one world unit. Null when the view is of a scene the window does not hold,
 * or cannot be fitted.
 */
export function fitPlayerView(
  view: PlayerView,
  heldSceneId: string | undefined,
  frame: MapFrame
): StageTransform | null {
  if (view.sceneId !== heldSceneId) {
    return null;
  }
  const transform = fitMapRect(view, frame);
  if (!Object.values(transform).every(Number.isFinite)) {
    return null;
  }
  return transform;
}
