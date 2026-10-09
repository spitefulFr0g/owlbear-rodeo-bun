/**
 * A rectangle of the map, in units where the map is 1 wide and 1 high.
 * It can reach past the edges of the map.
 */
export type MapRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** The part of a map the followed player can see, as sent to cast displays */
export type DisplayView = MapRect & { mapId: string };

/** The pan and zoom of the map stage */
export type StageTransform = {
  x: number;
  y: number;
  scale: number;
};

/** The size of a window's stage and of the map as it is laid out inside it */
export type MapFrame = {
  stageWidth: number;
  stageHeight: number;
  mapWidth: number;
  mapHeight: number;
  // Offset of the map layer that centres the map in the stage
  layerX: number;
  layerY: number;
};

export const fullMapRect: MapRect = { x: 0, y: 0, width: 1, height: 1 };

/** @returns the rectangle of the map that a window is showing */
export function getVisibleMapRect(
  transform: StageTransform,
  frame: MapFrame
): MapRect {
  return {
    x: (-transform.x / transform.scale - frame.layerX) / frame.mapWidth,
    y: (-transform.y / transform.scale - frame.layerY) / frame.mapHeight,
    width: frame.stageWidth / transform.scale / frame.mapWidth,
    height: frame.stageHeight / transform.scale / frame.mapHeight,
  };
}

/**
 * @returns the pan and zoom that centre a rectangle of the map in a window
 * with all of it visible. A window of another shape shows more at the sides.
 */
export function fitMapRect(rect: MapRect, frame: MapFrame): StageTransform {
  const scale = Math.min(
    frame.stageWidth / (rect.width * frame.mapWidth),
    frame.stageHeight / (rect.height * frame.mapHeight)
  );
  const centerX = (rect.x + rect.width / 2) * frame.mapWidth + frame.layerX;
  const centerY = (rect.y + rect.height / 2) * frame.mapHeight + frame.layerY;
  return {
    x: frame.stageWidth / 2 - centerX * scale,
    y: frame.stageHeight / 2 - centerY * scale,
    scale,
  };
}

export function isSameMapRect(a: MapRect, b: MapRect, tolerance = 1e-6) {
  return (
    Math.abs(a.x - b.x) < tolerance &&
    Math.abs(a.y - b.y) < tolerance &&
    Math.abs(a.width - b.width) < tolerance &&
    Math.abs(a.height - b.height) < tolerance
  );
}
