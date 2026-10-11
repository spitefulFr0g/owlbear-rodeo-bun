import Konva from "konva";
import { Group, Image as KonvaImage, Label, Tag, Text } from "react-konva";
import useImage from "use-image";

import { useDataURL } from "../../contexts/AssetsContext";
import {
  leftMouseButton,
  useSetPreventMapInteraction,
} from "../../contexts/MapInteractionContext";

import TokenOutline from "../konva/TokenOutline";

import useSceneSnapping from "../../hooks/useSceneSnapping";

import { useScene } from "../../scene/SceneContext";
import { imagesInOrder } from "../../scene/shown";
import { worldNodeId } from "../../scene/worldPosition";

import { ImageItem } from "../../sceneRules";

import { mapSources } from "../../maps";
import { tokenSources } from "../../tokens";

import World from "./World";

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
  const savedQuality = item.metadata.mapQuality;
  const quality = item.image.type === "file" && typeof savedQuality === "string" &&
    item.image.resolutions?.[savedQuality as "low" | "medium" | "high" | "ultra"]
    ? savedQuality : "original";
  const url = useDataURL(
    item.image.type === "file" ? { ...item.image, quality } : item.image,
    { ...mapSources, ...tokenSources }
  );
  const [image] = useImage(url || "");

  const setPreventMapInteraction = useSetPreventMapInteraction();

  const snapPositionToGrid = useSceneSnapping();

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

  function handleDragMove(event: Konva.KonvaEventObject<DragEvent>) {
    // Only the image itself is dragged, not something inside it
    if (event.target === event.currentTarget) {
      event.target.position(snapPositionToGrid(event.target.position()));
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
      onDragMove={handleDragMove}
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
  placement?: "belowGrid" | "aboveGrid" | "aboveRuler";
  /** The images can be dragged: the move tool is in hand */
  active?: boolean;
  /** The id of the image being dragged, drawn on top of its layer */
  dragging?: string;
  onDragStart?: SceneImageDragHandler;
  /** The node's position is where the image was dropped, in world units */
  onDragEnd?: SceneImageDragHandler;
};

/** Draws the scene's Image items layer by layer, each layer in its order */
function SceneImages({
  placement = "aboveGrid",
  active = false,
  dragging,
  onDragStart,
  onDragEnd,
}: SceneImagesProps) {
  const { scene, readOnly } = useScene();

  if (!scene) {
    return null;
  }

  return (
    <World id={placement === "aboveGrid" ? worldNodeId : undefined} listening={active}>
      {imagesInOrder(scene, dragging).filter((item) =>
        placement === "belowGrid" ? item.layer === "map" :
        placement === "aboveRuler" ? item.layer === "fog" :
        item.layer !== "map" && item.layer !== "fog"
      ).map((item) => (
        <SceneImage
          item={item}
          labelSize={scene.grid.unitsPerCell / 6}
          draggable={active && !readOnly && !item.locked}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          key={item.id}
        />
      ))}
    </World>
  );
}

export default SceneImages;
