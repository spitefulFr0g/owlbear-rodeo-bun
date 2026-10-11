import { ImageItem, Layer, SceneGrid, Vector2 } from "../sceneRules";
import { Token, TokenCategory } from "../types/Token";

const categoryLayers: Record<TokenCategory, Layer> = {
  character: "character",
  vehicle: "mount",
  prop: "prop",
  attachment: "attachment",
};

/**
 * The Image item a token from the token bar becomes, centred on `position`.
 * The server sets the owner and the order when it takes the add.
 */
export function tokenItem(
  token: Token,
  position: Vector2,
  grid: SceneGrid,
  owner: string,
  id: string
): ImageItem {
  // Size is in cells across, the height follows the image's proportions
  const scale = (token.defaultSize * grid.unitsPerCell) / token.width;
  return {
    id,
    kind: "image",
    layer: categoryLayers[token.defaultCategory],
    position: { x: position.x, y: position.y },
    rotation: 0,
    scale: { x: scale, y: scale },
    order: 0,
    owner,
    locked: false,
    hidden: false,
    metadata: {},
    image:
      token.type === "file"
        ? { type: "file", file: token.file, thumbnail: token.thumbnail }
        : { type: "default", key: token.key },
    width: token.width,
    height: token.height,
    label: token.defaultLabel,
    outline: token.outline,
  };
}
