import React, { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Box, Close, Flex, Text } from "theme-ui";

type FloatingWindowProps = {
  title: string;
  onClose: () => void;
  /** Where the window first opens, in page pixels */
  initial?: { x: number; y: number };
  width?: number;
  height?: number;
  /** Shown in the title bar's colour, as a library heading is */
  colour?: string;
  children: React.ReactNode;
};

/**
 * A window above the room that is moved by its title bar. It does not block
 * the room beneath it, so it can sit beside the dock while the GM works.
 */
function FloatingWindow({
  title,
  onClose,
  initial = { x: 120, y: 80 },
  width = 320,
  height = 420,
  colour,
  children,
}: FloatingWindowProps) {
  const [position, setPosition] = useState(initial);
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    dragRef.current = { x: event.clientX - position.x, y: event.clientY - position.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const offset = dragRef.current;
    if (!offset) return;
    // Keep the title bar on screen so the window can always be grabbed again
    setPosition({
      x: Math.min(Math.max(event.clientX - offset.x, 0), window.innerWidth - 80),
      y: Math.min(Math.max(event.clientY - offset.y, 0), window.innerHeight - 40),
    });
  }

  function handlePointerUp() {
    dragRef.current = null;
  }

  return createPortal(
    <Flex
      role="dialog"
      aria-label={title}
      sx={{
        position: "fixed",
        left: position.x,
        top: position.y,
        width,
        height,
        maxHeight: "calc(100vh - 16px)",
        flexDirection: "column",
        bg: "background",
        border: "1px solid",
        borderColor: "border",
        borderRadius: "4px",
        boxShadow: "0 4px 16px rgba(0, 0, 0, 0.4)",
        zIndex: 60,
        overflow: "hidden",
      }}
    >
      <Flex
        sx={{
          alignItems: "center",
          height: "36px",
          flexShrink: 0,
          px: 2,
          bg: colour || "muted",
          cursor: "move",
          touchAction: "none",
          userSelect: "none",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <Text variant="heading" sx={{ flexGrow: 1, fontSize: 1, color: colour ? "white" : "text" }}>
          {title}
        </Text>
        <Close
          aria-label={`Close ${title}`}
          title="Close"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onClose}
          sx={{ color: colour ? "white" : "text" }}
        />
      </Flex>
      <Box sx={{ flexGrow: 1, overflowY: "auto" }}>{children}</Box>
    </Flex>,
    document.body
  );
}

export default FloatingWindow;
