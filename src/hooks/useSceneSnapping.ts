import { useCallback } from "react";

import { useGridSnappingSensitivity } from "../contexts/GridContext";

import { snapPosition } from "../scene/grid";
import { useScene } from "../scene/SceneContext";

import { Vector2 } from "../sceneRules";

/**
 * Returns a function that snaps a position in world units to the scene's
 * grid. It leaves the position alone when the grid's snapping is off, and
 * while the key that suspends snapping is held.
 * @param snappingSensitivity 1 = Always snap, 0 = never snap if undefined the default user setting will be used
 * @param useCorners Snap to grid cell corners
 */
function useSceneSnapping(
  snappingSensitivity: number | undefined = undefined,
  useCorners: boolean = true
) {
  const { scene } = useScene();
  const defaultSnappingSensitivity = useGridSnappingSensitivity();

  let sensitivity: number;
  if (defaultSnappingSensitivity === -1) {
    // Snapping disabled via shortcut
    sensitivity = 0;
  } else if (snappingSensitivity === undefined) {
    sensitivity = defaultSnappingSensitivity;
  } else {
    sensitivity = snappingSensitivity;
  }

  const grid = scene?.grid;
  const snapPositionToGrid = useCallback((position: Vector2): Vector2 => {
    if (!grid || !grid.snap) {
      return position;
    }
    return snapPosition(grid, position, sensitivity, useCorners);
  }, [grid, sensitivity, useCorners]);

  return snapPositionToGrid;
}

export default useSceneSnapping;
