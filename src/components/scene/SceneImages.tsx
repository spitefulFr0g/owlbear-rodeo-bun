import Konva from "konva";
import { Group, Image as KonvaImage, Label, Tag, Text } from "react-konva";
import useImage from "use-image";

import { useDataURL } from "../../contexts/AssetsContext";
import {
  useGridCellPixelSize,
  useGridOffset,
} from "../../contexts/GridContext";
import {
  leftMouseButton,
  useSetPreventMapInteraction,
} from "../../contexts/MapInteractionContext";

import TokenOutline from "../konva/TokenOutline";

import { useScene } from "../../scene/SceneContext";
import { imagesInOrder } from "../../scene/shown";
import { worldNodeId } from "../../scene/worldPosition";

import { ImageItem } from "../../sceneRules";

import { tokenSources } from "../../tokens";

export type SceneImageDragHandler = (item: ImageItem, node: Konva.Node) => void;

type SceneImageProps = {
  item: ImageItem;
  labelSize: number;
  draggable: boolean;
  onDragStart?: SceneImageDragHandler;
  onDragEnd?: SceneImageDragHandler;
};

function SceneImage({
  item,
  labelSize,
  draggable,
  onDragStart,
  onDragEnd,
}: SceneImageProps) {
  const url = useDataURL(item.image, tokenSources);
  const [image] = useImage(url || "");

  const setPreventMapInteraction = useSetPreventMapInteraction();

  // Keep the map still while an image that can be dragged is held
  function hold(held: boolean) {
    if (draggable) {
      setPreventMapInteraction(held);
    }
  }

  function handleMouse(
    event: Konva.KonvaEventObject<MouseEvent>,
    held: boolean
  ) {
    if (leftMouseButton(event)) {
      hold(held);
    }
  }

  function handleDragEnd(event: Konva.KonvaEventObject<DragEvent>) {
    setPreventMapInteraction(false);
    onDragEnd?.(item, event.target);
  }

  return (
    <Group
      x={item.position.x}
      y={item.position.y}
      draggable={draggable}
      onMouseDown={(event) => handleMouse(event, true)}
      onMouseUp={(event) => handleMouse(event, false)}
      onTouchStart={() => hold(true)}
      onTouchEnd={() => hold(false)}
      onDragStart={(event) => onDragStart?.(item, event.target)}
      onDragEnd={handleDragEnd}
    >
      <Group
        rotation={item.rotation}
        scaleX={item.scale.x}
        scaleY={item.scale.y}
        offsetX={item.width / 2}
        offsetY={item.height / 2}
      >
        <TokenOutline outline={item.outline} hidden={!!image} />
        <KonvaImage width={item.width} height={item.height} image={image} />
      </Group>
      {item.label ? (
        <Label
          y={(item.height * Math.abs(item.scale.y)) / 2 - labelSize}
          // Centre the label under the image once its width is known
          ref={(label) => {
            label?.offsetX(label.width() / 2);
          }}
        >
          <Tag fill="hsla(230, 25%, 18%, 0.8)" cornerRadius={labelSize / 2} />
          <Text
            text={item.label}
            fontSize={labelSize}
            lineHeight={1}
            padding={labelSize / 4}
            fill="white"
            wrap="none"
          />
        </Label>
      ) : null}
    </Group>
  );
}

type SceneImagesProps = {
  /** The images can be dragged: the move tool is in hand */
  active?: boolean;
  /** The id of the image being dragged, drawn on top of its layer */
  dragging?: string;
  onDragStart?: SceneImageDragHandler;
  /** The node's position is where the image was dropped, in world units */
  onDragEnd?: SceneImageDragHandler;
};

/**
 * Draws the scene's Image items layer by layer, each layer in its order.
 * Until the scene has its own grid, a world cell is a cell of the 1.0 map's
 * grid and the world's origin is that grid's top left corner.
 */
function SceneImages({
  active = false,
  dragging,
  onDragStart,
  onDragEnd,
}: SceneImagesProps) {
  const { scene, readOnly } = useScene();
  const gridCellPixelSize = useGridCellPixelSize();
  const gridOffset = useGridOffset();

  if (!scene) {
    return null;
  }

  const cellPixels = Math.min(
    gridCellPixelSize.width,
    gridCellPixelSize.height
  );
  const scale = cellPixels / scene.grid.unitsPerCell;

  return (
    <Group
      id={worldNodeId}
      x={gridOffset.x}
      y={gridOffset.y}
      scaleX={scale}
      scaleY={scale}
      listening={active}
    >
      {imagesInOrder(scene, dragging).map((item) => (
        <SceneImage
          item={item}
          labelSize={scene.grid.unitsPerCell / 6}
          draggable={active && !readOnly && !item.locked}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          key={item.id}
        />
      ))}
    </Group>
  );
}

export default SceneImages;
