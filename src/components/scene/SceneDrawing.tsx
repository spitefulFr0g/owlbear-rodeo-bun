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

function ShapeDrawing({ item }: { item: ShapeItem }) {
  const props = { ...style(item), fillEnabled: item.fill };
  const geometry = item.geometry;
  if (geometry.type === "rectangle") return <Rect width={geometry.width} height={geometry.height} {...props} />;
  if (geometry.type === "circle") return <Circle radius={geometry.radius} {...props} />;
  return <Line points={flatten(geometry.points)} closed {...props} />;
}

function CurveDrawing({ item }: { item: CurveItem }) {
  return <Line points={flatten(item.points)} tension={0.5} closed={item.closed} fillEnabled={item.fill} lineCap="round" lineJoin="round" {...style(item)} />;
}

function LineDrawing({ item }: { item: LineItem }) {
  return <Line points={flatten(item.points)} lineCap="round" {...style(item)} />;
}

/** Each kind draws its local geometry inside the item's world transform. */
function SceneDrawing({ item, ...props }: { item: DrawingItem } & Konva.NodeConfig) {
  return (
    <Group id={item.id} x={item.position.x} y={item.position.y} rotation={item.rotation} scaleX={item.scale.x} scaleY={item.scale.y} {...props}>
      {item.kind === "shape" ? <ShapeDrawing item={item} /> : item.kind === "curve" ? <CurveDrawing item={item} /> : <LineDrawing item={item} />}
    </Group>
  );
}

export default SceneDrawing;
