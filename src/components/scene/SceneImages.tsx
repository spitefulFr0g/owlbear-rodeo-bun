import { Group, Image as KonvaImage, Label, Tag, Text } from "react-konva";
import useImage from "use-image";

import { useDataURL } from "../../contexts/AssetsContext";
import TokenOutline from "../konva/TokenOutline";

import { useScene } from "../../scene/SceneContext";
import { imagesInOrder } from "../../scene/shown";
import { worldNodeId } from "../../scene/worldPosition";

import { ImageItem } from "../../sceneRules";

import { mapSources } from "../../maps";
import { tokenSources } from "../../tokens";

import World from "./World";

type SceneImageProps = { item: ImageItem; labelSize: number };

export function SceneImage({ item, labelSize }: SceneImageProps) {
  const savedQuality = item.metadata.mapQuality;
  const quality =
    item.image.type === "file" &&
    typeof savedQuality === "string" &&
    item.image.resolutions?.[
      savedQuality as "low" | "medium" | "high" | "ultra"
    ]
      ? savedQuality
      : "original";
  const url = useDataURL(
    item.image.type === "file" ? { ...item.image, quality } : item.image,
    { ...mapSources, ...tokenSources }
  );
  const [image] = useImage(url || "");

  return (
    <Group
      name="scene-item"
      id={item.id}
      x={item.position.x}
      y={item.position.y}
      rotation={item.rotation}
      scaleX={item.scale.x}
      scaleY={item.scale.y}
    >
      <Group offsetX={item.width / 2} offsetY={item.height / 2}>
        <TokenOutline outline={item.outline} hidden={!!image} />
        <KonvaImage width={item.width} height={item.height} image={image} />
      </Group>
      {item.label ? (
        <Label
          y={item.height / 2 - labelSize / Math.abs(item.scale.y)}
          scaleX={1 / item.scale.x}
          scaleY={1 / item.scale.y}
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
};

/** Draws the scene's Image items layer by layer, each layer in its order */
function SceneImages({ placement = "aboveGrid" }: SceneImagesProps) {
  const { scene } = useScene();

  if (!scene) {
    return null;
  }

  return (
    <World
      id={placement === "aboveGrid" ? worldNodeId : undefined}
      listening={false}
    >
      {imagesInOrder(scene)
        .filter((item) =>
          placement === "belowGrid"
            ? item.layer === "map"
            : placement === "aboveRuler"
            ? item.layer === "fog"
            : item.layer !== "map" && item.layer !== "fog"
        )
        .map((item) => (
          <SceneImage
            item={item}
            labelSize={scene.grid.unitsPerCell / 6}
            key={item.id}
          />
        ))}
    </World>
  );
}

export default SceneImages;
