import { Group, Image as KonvaImage, Label, Tag, Text } from "react-konva";
import useImage from "use-image";

import { useDataURL } from "../../contexts/AssetsContext";
import {
  useGridCellPixelSize,
  useGridOffset,
} from "../../contexts/GridContext";

import TokenOutline from "../konva/TokenOutline";

import { useScene } from "../../scene/SceneContext";
import { imagesInOrder } from "../../scene/shown";
import { worldNodeId } from "../../scene/worldPosition";

import { ImageItem } from "../../sceneRules";

import { tokenSources } from "../../tokens";

type SceneImageProps = {
  item: ImageItem;
  labelSize: number;
};

function SceneImage({ item, labelSize }: SceneImageProps) {
  const url = useDataURL(item.image, tokenSources);
  const [image] = useImage(url || "");

  return (
    <Group x={item.position.x} y={item.position.y}>
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

/**
 * Draws the scene's Image items layer by layer, each layer in its order.
 * Until the scene has its own grid, a world cell is a cell of the 1.0 map's
 * grid and the world's origin is that grid's top left corner.
 */
function SceneImages() {
  const { scene } = useScene();
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
      listening={false}
    >
      {imagesInOrder(scene).map((item) => (
        <SceneImage
          item={item}
          labelSize={scene.grid.unitsPerCell / 6}
          key={item.id}
        />
      ))}
    </Group>
  );
}

export default SceneImages;
