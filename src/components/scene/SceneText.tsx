import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import Konva from "konva";
import { Group, Rect, Text } from "react-konva";
import colors from "../../helpers/colors";
import { TextItem } from "../../sceneRules";

const fontSize = 144;

/** Text and its optional square share the item's centred local geometry. */
function SceneText({ item, ...props }: { item: TextItem } & Konva.NodeConfig) {
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
      {item.square ? <NoteContent item={item} /> : <TextContent item={item} />}
    </Group>
  );
}

/** A note's text, shrunk to fit inside its square. */
function NoteContent({ item }: { item: TextItem }) {
  const measure = useRef<Konva.Text>(null);
  const [fittedSize, setFittedSize] = useState(16);
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
    setFittedSize(size);
  }, [item.text, item.size, padding]);
  const fontScale = fittedSize / fontSize;
  return (
    <Group x={-item.size / 2} y={-item.size / 2}>
      <Rect
        width={item.size}
        height={item.size}
        fill={itemColor(item)}
        shadowColor="rgba(0, 0, 0, 0.16)"
        shadowOffset={{ x: 0, y: 3 }}
        shadowBlur={6}
        cornerRadius={0.25}
      />
      <Text
        text={item.text}
        fill={item.color === "black" || item.color === "darkGray" ? "white" : "black"}
        align="left"
        verticalAlign="middle"
        padding={padding / fontScale}
        fontSize={fontSize}
        scaleX={fontScale}
        scaleY={fontScale}
        width={item.size / fontScale}
        height={item.size / fontScale}
        wrap="word"
      />
      <Text visible={false} ref={measure} text={item.text} wrap="none" />
    </Group>
  );
}

/**
 * Text with no square: each line is the item's size tall and as wide as it
 * needs, centred on the item's position. Empty text keeps a dashed square one
 * line high, as an empty note keeps its square, so it can still be picked.
 */
function TextContent({ item }: { item: TextItem }) {
  const measure = useRef<Konva.Text>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (measure.current) setWidth(measure.current.width());
  }, [item.text]);
  const lines = item.text.split("\n").length;
  const scale = item.size / fontSize;
  const color = itemColor(item);
  const dark = item.color === "black" || item.color === "darkGray";
  if (!item.text)
    return (
      <Rect
        x={-item.size / 2}
        y={-item.size / 2}
        width={item.size}
        height={item.size}
        stroke={color}
        strokeWidth={item.size / 24}
        dash={[item.size / 8, item.size / 8]}
        fill="rgba(0, 0, 0, 0.01)"
      />
    );
  return (
    <>
      <Text
        text={item.text}
        fill={color}
        align="center"
        fontSize={fontSize}
        lineHeight={1}
        width={width}
        x={(-width * scale) / 2}
        y={(-lines * item.size) / 2}
        scaleX={scale}
        scaleY={scale}
        wrap="none"
        shadowColor={dark ? "rgba(255, 255, 255, 0.6)" : "rgba(0, 0, 0, 0.6)"}
        shadowBlur={fontSize / 12}
      />
      <Text
        visible={false}
        ref={measure}
        text={item.text}
        fontSize={fontSize}
        lineHeight={1}
        wrap="none"
      />
    </>
  );
}

function itemColor(item: TextItem): string {
  return colors[item.color as keyof typeof colors] || item.color;
}

export default memo(SceneText);
