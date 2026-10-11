import Konva from "konva";

import { Vector2 } from "../sceneRules";

/** The id of the canvas node whose own coordinates are world units */
export const worldNodeId = "sceneItems";

/** Where a point of the page is in the scene, in world units */
export function clientPositionToWorld(
  mapStage: Konva.Stage,
  clientPosition: Vector2,
  checkMapBounds = true
): Vector2 | undefined {
  const world = mapStage.findOne(`#${worldNodeId}`);
  const map = document.querySelector(".map");
  if (!world || !map) {
    return;
  }
  const mapRect = map.getBoundingClientRect();

  if (
    checkMapBounds &&
    (clientPosition.x < mapRect.left ||
      clientPosition.x > mapRect.right ||
      clientPosition.y < mapRect.top ||
      clientPosition.y > mapRect.bottom)
  ) {
    return;
  }

  const transform = world.getAbsoluteTransform().copy().invert();
  return transform.point({
    x: clientPosition.x - mapRect.left,
    y: clientPosition.y - mapRect.top,
  });
}
