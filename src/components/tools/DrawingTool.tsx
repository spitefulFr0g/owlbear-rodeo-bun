import { useState, useEffect } from "react";
import shortid from "shortid";

import {
  useDebouncedStageScale,
  useInteractionEmitter,
  leftMouseButton,
  MapDragEvent,
} from "../../contexts/MapInteractionContext";
import { useMapStage } from "../../contexts/MapStageContext";

import Vector2 from "../../helpers/Vector2";
import {
  getDefaultShapeData,
  getUpdatedShapeData,
  simplifyPoints,
} from "../../helpers/drawing";
import { getRelativePointerPosition } from "../../helpers/konva";

import useSceneSnapping from "../../hooks/useSceneSnapping";
import useWorldPlacement from "../../hooks/useWorldPlacement";
import { useScene } from "../../scene/SceneContext";
import {
  drawingItem,
  drawingsInOrder,
  deleteDrawings,
  toolStrokeWidth,
} from "../../scene/drawingItem";
import SceneDrawing from "../scene/SceneDrawing";
import World from "../scene/World";
import { worldNodeId } from "../../scene/worldPosition";

import {
  Drawing,
  DrawingToolSettings,
  drawingToolIsShape,
  Shape,
} from "../../types/Drawing";

type DrawingToolProps = {
  visible?: boolean;
  renderItems?: boolean;
  active: boolean;
  toolSettings: DrawingToolSettings;
};

function DrawingTool({
  active,
  toolSettings,
  visible,
  renderItems = true,
}: DrawingToolProps) {
  const { scene, person, readOnly, act, canChange } = useScene();
  const drawings = scene ? drawingsInOrder(scene) : [];
  const placement = useWorldPlacement();
  const stageScale = useDebouncedStageScale();
  const interactionEmitter = useInteractionEmitter();
  const gridStrokeWidth = (scene?.grid.unitsPerCell || 150) / 10;
  const mapStageRef = useMapStage();
  const [drawing, setDrawing] = useState<Drawing | null>(null);
  const [isBrushDown, setIsBrushDown] = useState(false);
  const [erasingDrawings, setErasingDrawings] = useState<string[]>([]);

  const shouldHover = toolSettings.type === "erase" && active;

  const isBrush =
    toolSettings.type === "brush" || toolSettings.type === "paint";
  const isShape =
    toolSettings.type === "line" ||
    toolSettings.type === "rectangle" ||
    toolSettings.type === "circle" ||
    toolSettings.type === "triangle";

  const snapPositionToGrid = useSceneSnapping();

  useEffect(() => {
    if (!active || readOnly) {
      setDrawing(null);
      setIsBrushDown(false);
      setErasingDrawings([]);
    }
  }, [active, readOnly]);

  useEffect(() => {
    if (!active || readOnly) {
      return;
    }
    const mapStage = mapStageRef.current;

    function getBrushPosition() {
      if (!mapStage || !scene) {
        return;
      }
      const mapImage = mapStage.findOne(`#${worldNodeId}`);
      if (!mapImage) return;
      let position = getRelativePointerPosition(mapImage);
      if (!position) {
        return;
      }
      if (isShape) {
        position = snapPositionToGrid(position);
      }
      return position;
    }

    function handleBrushDown(props: MapDragEvent) {
      if (!leftMouseButton(props)) {
        return;
      }
      const brushPosition = getBrushPosition();
      if (!brushPosition) {
        return;
      }
      const commonShapeData = {
        color: toolSettings.color,
        blend: toolSettings.useBlending,
        id: shortid.generate(),
      };
      const type = toolSettings.type;
      if (isBrush) {
        setDrawing({
          type: "path",
          pathType: type === "brush" ? "stroke" : "fill",
          data: { points: [brushPosition] },
          strokeWidth: toolStrokeWidth(toolSettings),
          ...commonShapeData,
        });
      } else if (isShape && drawingToolIsShape(type)) {
        setDrawing({
          type: "shape",
          shapeType: type,
          data: getDefaultShapeData(type, brushPosition),
          strokeWidth: toolStrokeWidth(toolSettings),
          ...commonShapeData,
        } as Shape);
      }
      setIsBrushDown(true);
    }

    function handleBrushMove(props: MapDragEvent) {
      if (!leftMouseButton(props)) {
        return;
      }
      const brushPosition = getBrushPosition();
      if (!brushPosition) {
        return;
      }
      if (isBrushDown && drawing) {
        if (isBrush) {
          setDrawing((prevShape) => {
            if (prevShape?.type !== "path") {
              return prevShape;
            }
            const prevPoints = prevShape.data.points;
            if (
              Vector2.compare(
                prevPoints[prevPoints.length - 1],
                brushPosition,
                1 / (stageScale * placement.scale)
              )
            ) {
              return prevShape;
            }
            const simplified = simplifyPoints(
              [...prevPoints, brushPosition],
              1 / (stageScale * placement.scale)
            );
            return {
              ...prevShape,
              data: { points: simplified },
            };
          });
        } else if (isShape) {
          setDrawing((prevShape) => {
            if (prevShape?.type !== "shape") {
              return prevShape;
            }
            return {
              ...prevShape,
              data: getUpdatedShapeData(
                prevShape.shapeType,
                prevShape.data,
                brushPosition,
                { x: 1, y: 1 },
                1,
                1
              ),
            } as Shape;
          });
        }
      }
    }

    function handleBrushUp(props: MapDragEvent) {
      if (!leftMouseButton(props)) {
        return;
      }
      if (isBrush && drawing && drawing.type === "path") {
        if (drawing.data.points.length > 1) {
          act([
            {
              type: "add",
              item: drawingItem(drawing, person.id, gridStrokeWidth),
            },
          ]);
        }
      } else if (isShape && drawing) {
        act([
          {
            type: "add",
            item: drawingItem(drawing, person.id, gridStrokeWidth),
          },
        ]);
      }

      eraseHoveredShapes();

      setDrawing(null);
      setIsBrushDown(false);
    }

    interactionEmitter?.on("dragStart", handleBrushDown);
    interactionEmitter?.on("drag", handleBrushMove);
    interactionEmitter?.on("dragEnd", handleBrushUp);

    return () => {
      interactionEmitter?.off("dragStart", handleBrushDown);
      interactionEmitter?.off("drag", handleBrushMove);
      interactionEmitter?.off("dragEnd", handleBrushUp);
    };
  });

  function handleShapeOver(id: string, isDown: boolean) {
    if (shouldHover && isDown && canChange({ type: "delete", id })) {
      setErasingDrawings((ids) => (ids.includes(id) ? ids : [...ids, id]));
    }
  }

  function eraseHoveredShapes() {
    deleteDrawings(erasingDrawings, act);
    setErasingDrawings([]);
  }

  return (
    <World visible={visible} listening={shouldHover && !readOnly}>
      {renderItems &&
        drawings.map((item) => (
          <SceneDrawing
            item={
              erasingDrawings.includes(item.id)
                ? { ...item, color: "primary" }
                : item
            }
            key={item.id}
            onMouseMove={() => handleShapeOver(item.id, isBrushDown)}
            onTouchMove={() => handleShapeOver(item.id, isBrushDown)}
            onMouseDown={() => handleShapeOver(item.id, true)}
            onTouchStart={() => handleShapeOver(item.id, true)}
            onMouseUp={eraseHoveredShapes}
            onTouchEnd={eraseHoveredShapes}
          />
        ))}
      {drawing && (
        <SceneDrawing
          item={drawingItem(drawing, person.id, gridStrokeWidth)}
          listening={false}
        />
      )}
    </World>
  );
}

export default DrawingTool;
