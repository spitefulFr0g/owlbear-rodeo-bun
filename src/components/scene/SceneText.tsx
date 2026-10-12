import { memo, useEffect, useRef, useState } from "react";
import Konva from "konva";
import { Group, Rect, Text } from "react-konva";
import colors from "../../helpers/colors";
import { TextItem } from "../../sceneRules";

/** Text and its optional square share the item's centred local geometry. */
function SceneText({ item, ...props }: { item: TextItem } & Konva.NodeConfig) {
  const measure = useRef<Konva.Text>(null);
  const [fontSize, setFontSize] = useState(16);
  const padding = item.size / 10;
  useEffect(() => {
    const text = measure.current;
    if (!text) return;
    let size = Math.ceil(item.size / 16);
    for (
      let candidate = size;
      candidate < item.size - padding * 2;
      candidate++
    ) {
      text.fontSize(candidate);
      if (
        text.getTextWidth() + padding * 2 < item.size &&
        text.height() + padding * 2 < item.size
      )
        size = candidate;
    }
    setFontSize(size);
  }, [item.text, item.size, padding]);
  const color = colors[item.color as keyof typeof colors] || item.color;
  const fontScale = fontSize / 144;
  return (
    <Group
      {...props}
      id={item.id}
      name={props.name || "scene-text"}
      x={item.position.x}
      y={item.position.y}
      rotation={item.rotation}
      scaleX={item.scale.x}
      scaleY={item.scale.y}
      opacity={item.hidden ? 0.5 : 1}
    >
      <Group x={-item.size / 2} y={-item.size / 2}>
        {item.square && (
          <Rect
            width={item.size}
            height={item.size}
            fill={color}
            shadowColor="rgba(0, 0, 0, 0.16)"
            shadowOffset={{ x: 0, y: 3 }}
            shadowBlur={6}
            cornerRadius={0.25}
          />
        )}
        <Text
          text={item.text}
          fill={
            item.square
              ? item.color === "black" || item.color === "darkGray"
                ? "white"
                : "black"
              : color
          }
          align="left"
          verticalAlign="middle"
          padding={padding / fontScale}
          fontSize={144}
          scaleX={fontScale}
          scaleY={fontScale}
          width={item.size / fontScale}
          height={item.square ? item.size / fontScale : undefined}
          wrap="word"
        />
        <Text visible={false} ref={measure} text={item.text} wrap="none" />
      </Group>
    </Group>
  );
}
export default memo(SceneText);
