import {
  useGridCellPixelSize,
  useGridOffset,
} from "../contexts/GridContext";

import { worldPlacement } from "../scene/grid";
import { useScene } from "../scene/SceneContext";

import { defaultSceneGrid } from "../sceneRules";

/** Where the scene's world sits on the canvas, over the 1.0 map when there is one */
function useWorldPlacement() {
  const { scene } = useScene();
  // Both are zero when there is no 1.0 map
  const cell = useGridCellPixelSize();
  const offset = useGridOffset();

  return worldPlacement(
    cell.width > 0 && cell.height > 0 ? { cell, offset } : undefined,
    scene?.grid || defaultSceneGrid
  );
}

export default useWorldPlacement;
