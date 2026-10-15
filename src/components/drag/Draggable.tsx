import React from "react";
import { useDraggable } from "@dnd-kit/core";
import { Data } from "@dnd-kit/core/dist/store/types";

type DraggableProps = {
  id: string;
  children: React.ReactNode;
  data?: Data;
  /** The child supplies its own focusable placement/selection action. */
  interactiveChild?: boolean;
};

function Draggable({ id, children, data, interactiveChild }: DraggableProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    data,
  });

  const style = {
    cursor: isDragging ? "grabbing" : "grab",
    touchAction: "none",
    opacity: isDragging ? 0.5 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}
      role={interactiveChild ? undefined : attributes.role}
      tabIndex={interactiveChild ? -1 : attributes.tabIndex}>
      {children}
    </div>
  );
}

export default Draggable;
