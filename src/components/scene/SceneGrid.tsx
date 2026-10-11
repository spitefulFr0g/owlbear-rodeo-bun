import Konva from "konva";
import { Shape } from "react-konva";

import { gridLines } from "../../scene/gridLines";
import { useScene } from "../../scene/SceneContext";

import World from "./World";

/** Draws the scene's grid across the whole canvas, when the grid is shown */
function SceneGrid() {
  const { scene } = useScene();

  if (!scene || !scene.grid.shown) {
    return null;
  }
  const grid = scene.grid;

  /** Strokes whatever part of the world the stage is showing, so the grid has no edge */
  function strokeView(context: Konva.Context, shape: Konva.Shape) {
    const stage = shape.getStage();
    if (!stage) {
      return;
    }
    const toWorld = shape.getAbsoluteTransform().copy().invert();
    const topLeft = toWorld.point({ x: 0, y: 0 });
    const bottomRight = toWorld.point({ x: stage.width(), y: stage.height() });
    const lines = gridLines(grid, {
      x: topLeft.x,
      y: topLeft.y,
      width: bottomRight.x - topLeft.x,
      height: bottomRight.y - topLeft.y,
    });
    // One path, so see-through lines do not darken where they cross
    context.beginPath();
    for (const line of lines) {
      context.moveTo(line[0], line[1]);
      for (let i = 2; i < line.length; i += 2) {
        context.lineTo(line[i], line[i + 1]);
      }
    }
    context.strokeShape(shape);
  }

  return (
    <World listening={false}>
      <Shape
        sceneFunc={strokeView}
        stroke={grid.color}
        strokeWidth={grid.lineWidth}
        opacity={grid.opacity}
      />
    </World>
  );
}

export default SceneGrid;
