import React from "react";
import { Group } from "react-konva";

import useWorldPlacement from "../../hooks/useWorldPlacement";

type WorldProps = {
  visible?: boolean;
  id?: string;
  listening?: boolean;
  children?: React.ReactNode;
};

/** A part of the canvas whose own coordinates are world units */
function World({ id, listening, visible, children }: WorldProps) {
  const { x, y, scale } = useWorldPlacement();
  return (
    <Group
      visible={visible}
      id={id}
      x={x}
      y={y}
      scaleX={scale}
      scaleY={scale}
      listening={listening}
    >
      {children}
    </Group>
  );
}

export default World;
