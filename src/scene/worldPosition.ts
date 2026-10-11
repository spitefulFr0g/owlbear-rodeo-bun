import Konva from "konva";

import { Vector2 } from "../sceneRules";
import { MapFrame, MapRect } from "../helpers/displayView";

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

/**
 * How world units are laid out in a stage of a size, apart from the stage's
 * own pan and zoom: `mapWidth` and `mapHeight` are the size of one world unit
 */
export function worldFrame(
  mapStage: Konva.Stage,
  size: Pick<MapFrame, "stageWidth" | "stageHeight">
): MapFrame | undefined {
  const world = mapStage.findOne(`#${worldNodeId}`);
  if (!world) {
    return;
  }
  const local = mapStage
    .getAbsoluteTransform()
    .copy()
    .invert()
    .multiply(world.getAbsoluteTransform());
  const origin = local.point({ x: 0, y: 0 });
  const unit = local.point({ x: 1, y: 1 });
  return {
    ...size,
    mapWidth: unit.x - origin.x,
    mapHeight: unit.y - origin.y,
    layerX: origin.x,
    layerY: origin.y,
  };
}

/** The rectangle of the scene a stage is showing, in world units */
export function visibleWorldRect(mapStage: Konva.Stage): MapRect | undefined {
  const world = mapStage.findOne(`#${worldNodeId}`);
  if (!world) {
    return;
  }
  const inverse = world.getAbsoluteTransform().copy().invert();
  const topLeft = inverse.point({ x: 0, y: 0 });
  const bottomRight = inverse.point({
    x: mapStage.width(),
    y: mapStage.height(),
  });
  const rect = {
    ...topLeft,
    width: bottomRight.x - topLeft.x,
    height: bottomRight.y - topLeft.y,
  };
  return Object.values(rect).every(Number.isFinite) ? rect : undefined;
}
