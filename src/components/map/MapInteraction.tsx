import React, { useMemo, useRef, useState } from "react";
import { Box } from "theme-ui";
import ReactResizeDetector from "react-resize-detector";
import { Stage, Layer, Group } from "react-konva";
import Konva from "konva";

import usePreventOverscroll from "../../hooks/usePreventOverscroll";
import useStageInteraction from "../../hooks/useStageInteraction";
import usePreventContextMenu from "../../hooks/usePreventContextMenu";
import useFollowMapRect from "../../hooks/useFollowMapRect";
import useFitPlayerView from "../../hooks/useFitPlayerView";

import { useScene } from "../../scene/SceneContext";

import { MapRect } from "../../helpers/displayView";
import KonvaBridge from "../../helpers/KonvaBridge";

import {
  MapInteractionEmitter,
  MapInteractionProvider,
} from "../../contexts/MapInteractionContext";
import { useMapStage } from "../../contexts/MapStageContext";
import { GridProvider } from "../../contexts/GridContext";
import { useKeyboard } from "../../contexts/KeyboardContext";

import shortcuts from "../../shortcuts";
import { MapToolId } from "../../types/Map";

type SelectedToolChangeEventHanlder = (tool: MapToolId) => void;

type MapInteractionProps = {
  children?: React.ReactNode;
  controls: React.ReactNode;
  selectedToolId: MapToolId;
  onSelectedToolChange: SelectedToolChangeEventHanlder;
  // Keep this part of the map fitted to the window and ignore all input
  followRect?: MapRect;
  // Fit once when the scene arrives, leaving pan and zoom available
  initialRect?: MapRect;
};

function MapInteraction({
  children,
  controls,
  selectedToolId,
  onSelectedToolChange,
  followRect,
  initialRect,
}: MapInteractionProps) {
  const [stageWidth, setStageWidth] = useState(1);
  const [stageHeight, setStageHeight] = useState(1);
  const [stageScale, setStageScale] = useState(1);
  const [preventMapInteraction, setPreventMapInteraction] = useState(false);

  // Avoid state udpates when panning the map by using a ref and updating the konva element directly
  const stageTranslateRef = useRef({ x: 0, y: 0 });
  const mapStageRef = useMapStage();
  const mapLayerRef = useRef<Konva.Layer>(null);

  function handleResize(width?: number, height?: number) {
    if (width && height && width > 0 && height > 0) {
      setStageWidth(width);
      setStageHeight(height);
    }
  }

  const containerRef = useRef<HTMLDivElement>(null);
  usePreventOverscroll(containerRef);
  usePreventContextMenu(containerRef);

  const mapWidth = stageWidth;
  const mapHeight = stageHeight;

  const { scene, playerView } = useScene();
  const isFollowing = followRect !== undefined;
  useFollowMapRect(
    followRect,
    scene?.id,
    mapStageRef,
    { stageWidth, stageHeight },
    stageTranslateRef,
    setStageScale
  );

  const sceneId = scene?.id;
  const initialView = useMemo(() => initialRect && sceneId
    ? { ...initialRect, sceneId } : null, [initialRect, sceneId]);
  useFitPlayerView(
    playerView || initialView,
    scene?.id,
    mapStageRef,
    { stageWidth, stageHeight },
    stageTranslateRef,
    setStageScale
  );

  const previousSelectedToolRef = useRef(selectedToolId);
  const [currentMouseButtons, setCurentMouseButtons] = useState(0);

  const [interactionEmitter] = useState(new MapInteractionEmitter());

  useStageInteraction(
    mapStageRef,
    stageScale,
    setStageScale,
    stageTranslateRef,
    mapLayerRef,
    10,
    selectedToolId,
    preventMapInteraction || isFollowing,
    {
      onPinchStart: () => {
        // Change to move tool when pinching and zooming
        previousSelectedToolRef.current = selectedToolId;
        onSelectedToolChange("move");
      },
      onPinchEnd: () => {
        onSelectedToolChange(previousSelectedToolRef.current);
      },
      onDrag: (props) => {
        const { first, last, buttons } = props;
        if (buttons !== currentMouseButtons) {
          setCurentMouseButtons(buttons);
        }
        if (first) {
          interactionEmitter.emit("dragStart", props);
        } else if (last) {
          interactionEmitter.emit("dragEnd", props);
        } else {
          interactionEmitter.emit("drag", props);
        }
      },
    }
  );

  function handleKeyDown(event: KeyboardEvent) {
    // Change to move tool when pressing space
    if (shortcuts.move(event) && selectedToolId === "move") {
      // Stop active state on move icon from being selected
      event.preventDefault();
    }
    if (shortcuts.move(event) && selectedToolId !== "move") {
      event.preventDefault();
      previousSelectedToolRef.current = selectedToolId;
      onSelectedToolChange("move");
    }
    if (!event.repeat && shortcuts.move(event) && selectedToolId === "move") {
      previousSelectedToolRef.current = "move";
    }
  }

  function handleKeyUp(event: KeyboardEvent) {
    if (shortcuts.move(event) && selectedToolId === "move") {
      onSelectedToolChange(previousSelectedToolRef.current);
    }
  }

  useKeyboard(handleKeyDown, handleKeyUp);

  function getCursorForTool(tool: MapToolId) {
    if (currentMouseButtons === 2) {
      return "crosshair";
    } else if (currentMouseButtons > 2) {
      return "move";
    }
    switch (tool) {
      case "move":
        return "move";
      case "fog":
      case "drawing":
        return "crosshair";
      case "measure":
      case "pointer":
      case "note":
      case "select":
        return "crosshair";
      default:
        return "default";
    }
  }

  const mapInteraction = {
    stageScale,
    stageWidth,
    stageHeight,
    setPreventMapInteraction,
    mapWidth,
    mapHeight,
    interactionEmitter,
  };

  return (
    <MapInteractionProvider value={mapInteraction}>
      <GridProvider
        grid={null}
        width={mapWidth}
        height={mapHeight}
      >
        <Box
          sx={{
            position: "relative",
            cursor: isFollowing ? "inherit" : getCursorForTool(selectedToolId),
            pointerEvents: isFollowing ? "none" : undefined,
            touchAction: "none",
            outline: "none",
            width: "100%",
            height: "100%",
          }}
          ref={containerRef}
          className="map"
        >
          <ReactResizeDetector
            handleWidth
            handleHeight
            onResize={handleResize}
            targetRef={containerRef}
          >
            <KonvaBridge
              stageRender={(children) => (
                <Stage
                  width={stageWidth}
                  height={stageHeight}
                  scale={{ x: stageScale, y: stageScale }}
                  ref={mapStageRef}
                >
                  {children}
                </Stage>
              )}
            >
              <Layer ref={mapLayerRef}>
                {children}
                <Group id="portal" />
              </Layer>
            </KonvaBridge>
          </ReactResizeDetector>
          {controls}
        </Box>
      </GridProvider>
    </MapInteractionProvider>
  );
}

export default MapInteraction;
