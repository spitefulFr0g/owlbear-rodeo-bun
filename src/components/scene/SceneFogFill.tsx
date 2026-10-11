import Konva from "konva";
import { Shape } from "react-konva";
import { coveredFog } from "../../sceneRules/fog";
import { fogItems } from "../../scene/fogItem";
import { useScene } from "../../scene/SceneContext";
import { Fog } from "../../types/Fog";

/** Fill only the current viewport, so the unbounded world never acquires an edge. */
function SceneFogFill({ opacity }: { opacity: number }) {
  const { scene } = useScene();
  if (!scene?.fogFill) return null;
  const items = fogItems(scene);
  function draw(context: Konva.Context, shape: Konva.Shape) {
    const stage = shape.getStage();
    if (!stage) return;
    const inverse = shape.getAbsoluteTransform().copy().invert();
    const a = inverse.point({ x: -1, y: -1 });
    const b = inverse.point({ x: stage.width() + 1, y: stage.height() + 1 });
    const fill: Fog = { id: "fill", type: "fog", color: "black", visible: true, strokeWidth: 0,
      data: { points: [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }], holes: [] } };
    context.beginPath();
    for (const cover of coveredFog(items, fill)) {
      for (const ring of [cover.data.points, ...cover.data.holes]) {
        if (!ring.length) continue;
        context.moveTo(ring[0].x, ring[0].y);
        ring.slice(1).forEach(point => context.lineTo(point.x, point.y));
        context.closePath();
      }
    }
    context.fillStrokeShape(shape);
  }
  return <Shape sceneFunc={draw} fill="black" opacity={opacity} listening={false} />;
}

export default SceneFogFill;
