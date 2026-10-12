import { Group, Label, Line, Tag, Text } from "react-konva";

import { useStageScale } from "../../contexts/MapInteractionContext";

import useWorldPlacement from "../../hooks/useWorldPlacement";

import { Vector2 } from "../../sceneRules";

const background = "hsla(230, 25%, 18%, 0.8)";

type RulerProps = {
  /** In world units, drawn inside the world */
  start: Vector2;
  end: Vector2;
  /** The distance as written */
  text: string;
  /** Its owner's colour */
  color: string;
};

function Ruler({ start, end, text, color }: RulerProps) {
  const stageScale = useStageScale();
  const placement = useWorldPlacement();
  // The distance stays one size on screen however far the canvas is zoomed
  const zoom = stageScale * placement.scale;
  const line = [start.x, start.y, end.x, end.y];

  return (
    <Group>
      <Line points={line} stroke={background} strokeWidth={15} lineCap="round" />
      <Line points={line} stroke={color} strokeWidth={4} lineCap="round" />
      <Label
        x={(start.x + end.x) / 2}
        y={(start.y + end.y) / 2}
        scaleX={1 / zoom}
        scaleY={1 / zoom}
      >
        <Tag fill={background} stroke={color} strokeWidth={2} cornerRadius={4} />
        <Text text={text} fill="white" fontSize={24} padding={4} />
      </Label>
    </Group>
  );
}

export default Ruler;
