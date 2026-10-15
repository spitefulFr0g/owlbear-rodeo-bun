import { v4 as uuid } from "uuid";
import { useMapStage } from "../contexts/MapStageContext";
import { useScene } from "../scene/SceneContext";
import { clientPositionToWorld, visibleWorldRect } from "../scene/worldPosition";
import { LibraryAsset } from "../sceneRules/library";
import { dropPositions, libraryImage, libraryItem, PlaceableAsset } from "../helpers/library";

/** Click uses the current visible world centre; drop converts page coordinates at call time. */
export default function useLibraryPlacement() {
  const stage = useMapStage();
  const { scene, person, readOnly, canChange, act } = useScene();
  return (assets: (LibraryAsset | PlaceableAsset)[], clientPoint?: { x: number; y: number }, worldPoint?: { x: number; y: number }): boolean => {
    if (!stage.current || !scene || readOnly || assets.length === 0) return false;
    const rect = visibleWorldRect(stage.current);
    const center = worldPoint || (clientPoint ? clientPositionToWorld(stage.current, clientPoint)
      : rect && { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
    if (!center) return false;
    const positions = dropPositions(assets.length, center, scene.grid.unitsPerCell);
    const changes = assets.map((asset, index) => ({ type: "add" as const,
      item: libraryItem("files" in asset ? { ...asset, image: libraryImage(asset) } : asset,
        positions[index], scene.grid, person.id, uuid()) }));
    if (!changes.every(canChange)) return false;
    return act(changes);
  };
}
