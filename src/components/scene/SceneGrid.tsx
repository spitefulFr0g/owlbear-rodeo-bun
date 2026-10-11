import Konva from "konva";
import { Shape } from "react-konva";
import useImage from "use-image";

import { cellSize } from "../../scene/grid";
import { useScene } from "../../scene/SceneContext";

import World from "./World";

import squarePatternDark from "../../images/SquarePatternDark.png";
import squarePatternLight from "../../images/SquarePatternLight.png";
import hexPatternDark from "../../images/HexPatternDark.png";
import hexPatternLight from "../../images/HexPatternLight.png";

/** Fills whatever part of the world the stage is showing, so the grid has no edge */
function fillView(context: Konva.Context, shape: Konva.Shape) {
  const stage = shape.getStage();
  if (!stage) {
    return;
  }
  const toWorld = shape.getAbsoluteTransform().copy().invert();
  const topLeft = toWorld.point({ x: 0, y: 0 });
  const bottomRight = toWorld.point({ x: stage.width(), y: stage.height() });
  context.beginPath();
  context.rect(
    topLeft.x,
    topLeft.y,
    bottomRight.x - topLeft.x,
    bottomRight.y - topLeft.y
  );
  context.closePath();
  context.fillStrokeShape(shape);
}

/** Draws the scene's grid across the whole canvas, when the grid is shown */
function SceneGrid({ stroke }: { stroke: "black" | "white" }) {
  const { scene } = useScene();
  const type = scene?.grid.type;

  let imageSource;
  if (type === "square") {
    imageSource = stroke === "black" ? squarePatternDark : squarePatternLight;
  } else {
    imageSource = stroke === "black" ? hexPatternDark : hexPatternLight;
  }
  const [patternImage] = useImage(imageSource);

  if (!scene || !scene.grid.shown) {
    return null;
  }

  const cell = cellSize(scene.grid);

  let patternProps: Record<any, any> = {};
  if (type === "square") {
    // Square grid pattern is 150 DPI
    const scale = cell.width / 300;
    patternProps.fillPatternScaleX = scale;
    patternProps.fillPatternScaleY = scale;
    patternProps.fillPatternOffsetX = cell.width / scale / 2;
    patternProps.fillPatternOffsetY = cell.height / scale / 2;
  } else if (type === "hexVertical") {
    // Hex tile pattern is 153 DPI to better fit hex tiles
    const scale = cell.width / 153;
    patternProps.fillPatternScaleX = scale;
    patternProps.fillPatternScaleY = scale;
    patternProps.fillPatternOffsetY = cell.radius / scale / 2;
  } else if (type === "hexHorizontal") {
    const scale = cell.height / 153;
    patternProps.fillPatternScaleX = scale;
    patternProps.fillPatternScaleY = scale;
    patternProps.fillPatternOffsetY = -cell.radius / scale / 2;
    patternProps.fillPatternRotation = 90;
  }

  return (
    <World listening={false}>
      <Shape
        sceneFunc={fillView}
        fillPatternImage={patternImage}
        fillPatternRepeat="repeat"
        opacity={stroke === "black" ? 0.8 : 0.4}
        {...patternProps}
      />
    </World>
  );
}

export default SceneGrid;
