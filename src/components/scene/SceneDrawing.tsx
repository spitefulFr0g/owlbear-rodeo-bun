import { memo } from "react";
import Konva from "konva";
import { Circle, Group, Line, Rect } from "react-konva";
import colors from "../../helpers/colors";
import { DrawingItem } from "../../scene/drawingItem";
import { CurveItem, LineItem, ShapeItem, Vector2 } from "../../sceneRules";

const flatten = (points: Vector2[]) => points.flatMap((point) => [point.x, point.y]);
const style = (item: DrawingItem) => ({
  fill: colors[item.color as keyof typeof colors] || item.color, stroke: colors[item.color as keyof typeof colors] || item.color,
  strokeWidth: item.strokeWidth, opacity: item.blend ? 0.5 : 1,
});

function ShapeDrawing({ item, config }: { item: ShapeItem; config: Konva.NodeConfig }) {
  const props = { ...style(item), fillEnabled: item.fill, ...config };
  const geometry = item.geometry;
  if (geometry.type === "rectangle") return <Rect width={geometry.width} height={geometry.height} {...props} />;
  if (geometry.type === "circle") return <Circle radius={geometry.radius} {...props} />;
  return <Line points={flatten(geometry.points)} closed {...props} sceneFunc={geometry.type === "polygon" ? (context, shape) => {
    context.beginPath();
    const area = (ring: Vector2[]) => ring.reduce((sum, point, index) => {
      const next = ring[(index + 1) % ring.length];
      return sum + point.x * next.y - next.x * point.y;
    }, 0);
    for (const [index, points] of [geometry.points, ...geometry.holes].entries()) {
      const ring = index > 0 && Math.sign(area(points)) === Math.sign(area(geometry.points)) ? [...points].reverse() : points;
      if (!ring.length) continue;
      context.moveTo(ring[0].x, ring[0].y);
      ring.slice(1).forEach(point => context.lineTo(point.x, point.y));
      context.closePath();
    }
    context.fillStrokeShape(shape);
  } : undefined} />;
}

function CurveDrawing({ item, config }: { item: CurveItem; config: Konva.NodeConfig }) {
  return <Line points={flatten(item.points)} tension={0.5} closed={item.closed} fillEnabled={item.fill} lineCap="round" lineJoin="round" {...style(item)} {...config} />;
}

function LineDrawing({ item, config }: { item: LineItem; config: Konva.NodeConfig }) {
  return <Line points={flatten(item.points)} lineCap="round" {...style(item)} {...config} />;
}

/** Each kind draws its local geometry inside the item's world transform. */
function SceneDrawing({ item, ...props }: { item: DrawingItem } & Konva.NodeConfig) {
  const { fill, stroke, strokeWidth, opacity, fillPatternImage, fillPriority, hitFunc, ...nodeProps } = props;
  const config: Konva.NodeConfig = {};
  for (const [key, value] of Object.entries({ fill, stroke, strokeWidth, opacity, fillPatternImage, fillPriority, hitFunc })) {
    if (value !== undefined) config[key] = value;
  }
  return (
    <Group {...nodeProps} id={item.id} x={item.position.x} y={item.position.y} rotation={item.rotation} scaleX={item.scale.x} scaleY={item.scale.y} opacity={item.hidden ? 0.5 : 1}>
      {item.kind === "shape" ? <ShapeDrawing item={item} config={config} /> : item.kind === "curve" ? <CurveDrawing item={item} config={config} /> : <LineDrawing item={item} config={config} />}
    </Group>
  );
}

export default memo(SceneDrawing);
