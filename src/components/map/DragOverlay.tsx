import { useEffect, useRef, useState } from "react";
import { Box, IconButton } from "theme-ui";
import Konva from "konva";

import RemoveTokenIcon from "../../icons/RemoveTokenIcon";
import { useMapStage } from "../../contexts/MapStageContext";

type DragOverlayProps = {
  dragging: boolean;
  /** Called when a drag ends over the remove icon */
  onRemove?: () => void;
  /** Given the remove icon, for a caller that decides for itself where a drag ended */
  removeRef?: React.RefObject<HTMLDivElement>;
};

/** Whether the map stage's pointer is over an element of the page */
export function isPointerOver(mapStage: Konva.Stage, element: Element | null) {
  const map = document.querySelector(".map");
  const pointerPosition = mapStage.getPointerPosition();
  if (!map || !pointerPosition || !element) {
    return false;
  }
  const mapRect = map.getBoundingClientRect();
  const x = pointerPosition.x + mapRect.left;
  const y = pointerPosition.y + mapRect.top;
  const rect = element.getBoundingClientRect();
  return x > rect.left && y > rect.top && x < rect.right && y < rect.bottom;
}

function DragOverlay({ dragging, onRemove, removeRef }: DragOverlayProps) {
  const [isRemoveHovered, setIsRemoveHovered] = useState(false);
  const ownRemoveRef = useRef<HTMLDivElement>(null);
  const removeTokenRef = removeRef || ownRemoveRef;

  const mapStageRef = useMapStage();

  // Detect token hover on remove icon manually to support touch devices
  useEffect(() => {
    function detectRemoveHover() {
      const mapStage = mapStageRef.current;
      if (!mapStage || !dragging || !removeTokenRef.current) {
        return;
      }
      const hovered = isPointerOver(mapStage, removeTokenRef.current);
      if (hovered !== isRemoveHovered) {
        setIsRemoveHovered(hovered);
      }
    }

    let handler: NodeJS.Timeout;
    if (dragging) {
      handler = setInterval(detectRemoveHover, 100);
    }

    return () => {
      if (handler) {
        clearInterval(handler);
      }
    };
  }, [isRemoveHovered, dragging, mapStageRef, removeTokenRef]);

  // Detect drag end of token image and remove it if it is over the remove icon
  useEffect(() => {
    if (!dragging && isRemoveHovered) {
      onRemove?.();
    }
  });

  if (!dragging) {
    return null;
  }

  return (
    <Box
      sx={{
        position: "absolute",
        bottom: "32px",
        left: "50%",
        borderRadius: "50%",
        transform: isRemoveHovered
          ? "translateX(-50%) scale(2.0)"
          : "translateX(-50%) scale(1.5)",
        transition: "transform 250ms ease",
        color: isRemoveHovered ? "primary" : "text",
        pointerEvents: "none",
      }}
      bg="overlay"
      ref={removeTokenRef}
    >
      <IconButton>
        <RemoveTokenIcon />
      </IconButton>
    </Box>
  );
}

export default DragOverlay;
