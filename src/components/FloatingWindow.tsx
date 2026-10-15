import React, { useCallback, useEffect, useRef, useState } from "react";
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
  const windowRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(initial);
  const clamp = useCallback((point: { x: number; y: number }) => {
    return {
      x: Math.max(8, Math.min(point.x, window.innerWidth - Math.min(width, window.innerWidth - 16) - 8)),
      y: Math.max(8, Math.min(point.y, window.innerHeight - Math.min(height, window.innerHeight - 16) - 8)),
    };
  }, [width, height]);
  useEffect(() => {
    const previous = document.activeElement;
    windowRef.current?.focus();
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  useEffect(() => {
    const fit = () => setPosition(point => clamp(point));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [clamp]);
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
    setPosition(clamp({ x: event.clientX - offset.x, y: event.clientY - offset.y }));
  }

  function handlePointerUp() {
    dragRef.current = null;
  }

  return createPortal(
    <Flex
      ref={windowRef}
      tabIndex={-1}
      role="dialog"
      aria-label={title}
      sx={{
        position: "fixed",
        left: `${position.x}px`,
        top: `${position.y}px`,
        width,
        maxWidth: "calc(100vw - 16px)",
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
        <Text
          as="button"
          aria-label={`Move ${title}; use arrow keys`}
          onKeyDown={(event: React.KeyboardEvent) => {
            const delta = { ArrowLeft: [-16, 0], ArrowRight: [16, 0], ArrowUp: [0, -16], ArrowDown: [0, 16] }[event.key];
            if (!delta) return;
            event.preventDefault();
            event.stopPropagation();
            setPosition(point => clamp({ x: point.x + delta[0], y: point.y + delta[1] }));
          }}
          sx={{ flexGrow: 1, fontSize: 1, color: colour ? "white" : "text", bg: "transparent", border: "none", textAlign: "left", cursor: "move" }}
        >
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
