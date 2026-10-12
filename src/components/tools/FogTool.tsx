import SceneFogFill from "../scene/SceneFogFill";
import { useState, useEffect, useCallback, useMemo } from "react";
import shortid from "shortid";
import { Group, Line } from "react-konva";
import useImage from "use-image";
import Color from "color";
import Konva from "konva";

import diagonalPattern from "../../images/DiagonalPattern.png";

import {
  useDebouncedStageScale,
  useInteractionEmitter,
  MapDragEvent,
  leftMouseButton,
} from "../../contexts/MapInteractionContext";
import { useMapStage } from "../../contexts/MapStageContext";
import { useGridSnappingSensitivity } from "../../contexts/GridContext";
import useWorldPlacement from "../../hooks/useWorldPlacement";
import { useKeyboard } from "../../contexts/KeyboardContext";

import Vector2, { BoundingBox } from "../../helpers/Vector2";
import {
  simplifyPoints,
  getFogShapesBoundingBoxes,
  getGuidesFromBoundingBoxes,
  findBestGuides,
  Guide,
} from "../../helpers/drawing";
import colors from "../../helpers/colors";
import { getRelativePointerPosition } from "../../helpers/konva";
import { useScene } from "../../scene/SceneContext";
import { fogItems, fogItem, fogShape, coveredFog, clipFog, cutsFog } from "../../scene/fogItem";
import SceneDrawing from "../scene/SceneDrawing";
import World from "../scene/World";
import { worldNodeId } from "../../scene/worldPosition";
import useSceneSnapping from "../../hooks/useSceneSnapping";

import useSetting from "../../hooks/useSetting";

import shortcuts from "../../shortcuts";

import { Fog, FogToolSettings } from "../../types/Fog";

import Tick from "../konva/Tick";

type MapFogProps = {
  visible?: boolean;
  onShapeError: (message: string) => void;
  active: boolean;
  toolSettings: FogToolSettings;
  editable: boolean;
};

function FogTool({ onShapeError, active, toolSettings, editable: permitted, visible }: MapFogProps) {
  const { scene, person, readOnly, act, canChange } = useScene();
  const editable = permitted && !readOnly;
  const items = useMemo(() => scene ? fogItems(scene) : [], [scene]);
  const shapes = useMemo(() => items.map(fogShape), [items]);
  const snap = useSceneSnapping();
  const addShapes = useCallback((shapes: Fog[], cut: boolean) => {
    if (cut && !shapes.some(shape => cutsFog(shape, items, scene?.fogFill))) { onShapeError("No fog to cut"); return; }
    const clipped = toolSettings.multilayer ? shapes : shapes.flatMap(shape =>
      cut && scene?.fogFill ? coveredFog(items, shape) : clipFog(shape, cut ? items.filter(item => item.cut && !item.hidden).map(fogShape) : coveredFog(items, scene?.fogFill ? shape : undefined)));
    if (!clipped.length) { onShapeError(cut ? "Fog already cut" : "Fog already placed"); return; }
    act(clipped.map(shape => ({ type: "add", item: fogItem(shape, person.id, cut, toolSettings.type === "brush") })));
  }, [items, scene?.fogFill, onShapeError, toolSettings, act, person.id]);
  const onShapesAdd = useCallback((shapes: Fog[]) => addShapes(shapes, false), [addShapes]);
  const onShapesCut = useCallback((shapes: Fog[]) => addShapes(shapes, true), [addShapes]);
  const onShapesRemove = (ids: string[]) => act(ids.map(id => ({ type: "delete", id })));
  const onShapesEdit = (edits: Partial<Fog>[]) => act(edits.map(edit => ({ type: "update", id: edit.id!, fields: { hidden: !edit.visible } })));
  const stageScale = useDebouncedStageScale();
  const placement = useWorldPlacement();
  const mapWidth = 1;
  const mapHeight = 1;
  const interactionEmitter = useInteractionEmitter();

  const units = scene?.grid.unitsPerCell || 150;
  const gridCellNormalizedSize = { x: units, y: units };
  const gridStrokeWidth = units / 10;
  const gridSnappingSensitivity = Math.max(useGridSnappingSensitivity(), 0);

  const [showFogGuides] = useSetting<boolean>("fog.showGuides");
  const [editOpacity] = useSetting<number>("fog.editOpacity");
  const mapStageRef = useMapStage();

  const [drawingShape, setDrawingShape] = useState<Fog | null>(null);
  const [isBrushDown, setIsBrushDown] = useState(false);
  const [hoveredShapes, setHoveredShapes] = useState<Fog[]>([]);

  // Shapes that have been merged for fog
  const [fogShapes, setFogShapes] = useState(shapes);
  // Bounding boxes for guides
  const [fogShapeBoundingBoxes, setFogShapeBoundingBoxes] = useState<
    BoundingBox[]
  >([]);
  const [guides, setGuides] = useState<Guide[]>([]);

  const shouldHover =
    active &&
    editable &&
    (toolSettings.type === "toggle" || toolSettings.type === "remove");

  const shouldUseGuides =
    active &&
    editable &&
    (toolSettings.type === "rectangle" || toolSettings.type === "polygon");

  const shouldRenderGuides = shouldUseGuides && showFogGuides;

  const [patternImage] = useImage(diagonalPattern);

  useEffect(() => {
    if (!active || !editable) { setDrawingShape(null); setHoveredShapes([]); setIsBrushDown(false); }
  }, [active, editable]);

  useEffect(() => {
    if (!active || !editable) {
      return;
    }

    const mapStage = mapStageRef.current;

    function getBrushPosition(snapping = true) {
      if (!mapStage) {
        return;
      }
      const mapImage = mapStage.findOne(`#${worldNodeId}`);
      if (!mapImage) return;
      let position = getRelativePointerPosition(mapImage);
      if (!position) {
        return;
      }
      if (shouldUseGuides && snapping) {
        position = snap(position);
        for (let guide of guides) {
          if (guide.orientation === "vertical") {
            position.x = guide.start.x * mapWidth;
          }
          if (guide.orientation === "horizontal") {
            position.y = guide.start.y * mapHeight;
          }
        }
      }
      return position;
    }

    function handleBrushDown(props: MapDragEvent) {
      if (!leftMouseButton(props)) {
        return;
      }
      if (toolSettings.type === "brush") {
        const brushPosition = getBrushPosition();
        if (!brushPosition) {
          return;
        }
        setDrawingShape({
          type: "fog",
          data: {
            points: [brushPosition],
            holes: [],
          },
          strokeWidth: 0.5,
          color: toolSettings.useFogCut ? "red" : "black",
          id: shortid.generate(),
          visible: true,
        });
      }
      if (toolSettings.type === "rectangle") {
        const brushPosition = getBrushPosition();
        if (!brushPosition) {
          return;
        }
        setDrawingShape({
          type: "fog",
          data: {
            points: [
              brushPosition,
              brushPosition,
              brushPosition,
              brushPosition,
            ],
            holes: [],
          },
          strokeWidth: 0.5,
          color: toolSettings.useFogCut ? "red" : "black",
          id: shortid.generate(),
          visible: true,
        });
      }
      setIsBrushDown(true);
    }

    function handleBrushMove(props: MapDragEvent) {
      if (!leftMouseButton(props)) {
        return;
      }
      if (toolSettings.type === "brush" && isBrushDown && drawingShape) {
        const brushPosition = getBrushPosition();
        if (!brushPosition) {
          return;
        }
        setDrawingShape((prevShape) => {
          if (!prevShape) {
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
          return {
            ...prevShape,
            data: {
              ...prevShape.data,
              points: [...prevPoints, brushPosition],
            },
          };
        });
      }
      if (toolSettings.type === "rectangle" && isBrushDown && drawingShape) {
        const prevPoints = drawingShape.data.points;
        const brushPosition = getBrushPosition();
        if (!brushPosition) {
          return;
        }
        setDrawingShape((prevShape) => {
          if (!prevShape) {
            return prevShape;
          }
          return {
            ...prevShape,
            data: {
              ...prevShape.data,
              points: [
                prevPoints[0],
                { x: brushPosition.x, y: prevPoints[1].y },
                brushPosition,
                { x: prevPoints[3].x, y: brushPosition.y },
              ],
            },
          };
        });
      }
    }

    function handleBrushUp(props: MapDragEvent) {
      if (!leftMouseButton(props)) {
        return;
      }
      if (
        (toolSettings.type === "brush" || toolSettings.type === "rectangle") &&
        drawingShape
      ) {
        let simplifiedShape = { ...drawingShape };
        if (toolSettings.type === "brush") {
          simplifiedShape.data.points = simplifyPoints(
            simplifiedShape.data.points,
            1 / (stageScale * placement.scale)
          );
        }
        const cut = toolSettings.useFogCut;
        let drawingShapes = [simplifiedShape];

        if (cut) onShapesCut(drawingShapes); else onShapesAdd(drawingShapes);
        setDrawingShape(null);
      }

      eraseHoveredShapes(props);

      setIsBrushDown(false);
    }

    function handlePointerClick(event: Konva.KonvaEventObject<MouseEvent>) {
      if (!leftMouseButton(event)) {
        return;
      }
      if (toolSettings.type === "polygon") {
        const brushPosition = getBrushPosition();
        if (brushPosition) {
          setDrawingShape((prevDrawingShape) => {
            if (prevDrawingShape) {
              return {
                ...prevDrawingShape,
                data: {
                  ...prevDrawingShape.data,
                  points: [...prevDrawingShape.data.points, brushPosition],
                },
              };
            } else {
              return {
                type: "fog",
                data: {
                  points: [brushPosition, brushPosition],
                  holes: [],
                },
                strokeWidth: 0.5,
                color: toolSettings.useFogCut ? "red" : "black",
                id: shortid.generate(),
                visible: true,
              };
            }
          });
        }
      }
    }

    function handlePointerMove() {
      if (shouldUseGuides) {
        let guides: Guide[] = [];
        const brushPosition = getBrushPosition(false);
        if (brushPosition) {
          guides.push(
            ...getGuidesFromBoundingBoxes(
              brushPosition,
              fogShapeBoundingBoxes,
              gridCellNormalizedSize,
              gridSnappingSensitivity
            )
          );

          setGuides(findBestGuides(brushPosition, guides));
        }
      }
      if (toolSettings.type === "polygon") {
        const brushPosition = getBrushPosition();
        if (toolSettings.type === "polygon" && drawingShape && brushPosition) {
          setDrawingShape((prevShape) => {
            if (!prevShape) {
              return prevShape;
            }
            return {
              ...prevShape,
              data: {
                ...prevShape.data,
                points: [...prevShape.data.points.slice(0, -1), brushPosition],
              },
            };
          });
        }
      }
    }

    function handelTouchEnd() {
      setGuides([]);
    }

    interactionEmitter?.on("dragStart", handleBrushDown);
    interactionEmitter?.on("drag", handleBrushMove);
    interactionEmitter?.on("dragEnd", handleBrushUp);
    // Use mouse events for polygon and erase to allow for single clicks
    mapStage?.on("mousedown touchstart", handlePointerMove);
    mapStage?.on("mousemove touchmove", handlePointerMove);
    mapStage?.on("click tap", handlePointerClick);
    mapStage?.on("touchend", handelTouchEnd);

    return () => {
      interactionEmitter?.off("dragStart", handleBrushDown);
      interactionEmitter?.off("drag", handleBrushMove);
      interactionEmitter?.off("dragEnd", handleBrushUp);
      mapStage?.off("mousedown touchstart", handlePointerMove);
      mapStage?.off("mousemove touchmove", handlePointerMove);
      mapStage?.off("click tap", handlePointerClick);
      mapStage?.off("touchend", handelTouchEnd);
    };
  });

  const finishDrawingPolygon = useCallback(() => {
    const cut = toolSettings.useFogCut;
    if (!drawingShape) {
      return;
    }
    let polygonShape = {
      ...drawingShape,
      data: {
        ...drawingShape.data,
        // Remove the last point as it hasn't been placed yet
        points: drawingShape.data.points.slice(0, -1),
      },
    };

    let polygonShapes = [polygonShape];
    if (cut) onShapesCut(polygonShapes); else onShapesAdd(polygonShapes);
    setDrawingShape(null);
  }, [
    toolSettings,
    drawingShape,
    onShapesCut,
    onShapesAdd,
  ]);

  // Add keyboard shortcuts
  function handleKeyDown(event: KeyboardEvent) {
    if (
      shortcuts.fogFinishPolygon(event) &&
      toolSettings.type === "polygon" &&
      drawingShape
    ) {
      finishDrawingPolygon();
    }
    if (shortcuts.fogCancelPolygon(event) && drawingShape) {
      setDrawingShape(null);
    }
    // Remove last point from polygon shape if delete pressed
    if (
      shortcuts.delete(event) &&
      drawingShape &&
      toolSettings.type === "polygon"
    ) {
      if (drawingShape.data.points.length > 2) {
        setDrawingShape((prevShape) => {
          if (!prevShape) {
            return prevShape;
          }
          return {
            ...prevShape,
            data: {
              ...prevShape.data,
              points: [
                // Shift last point to previous point
                ...prevShape.data.points.slice(0, -2),
                ...prevShape.data.points.slice(-1),
              ],
            },
          };
        });
      } else {
        setDrawingShape(null);
      }
    }
  }

  useKeyboard(handleKeyDown);

  // Update shape color when useFogCut changes
  useEffect(() => {
    setDrawingShape((prevShape) => {
      if (!prevShape) {
        return prevShape;
      }
      return {
        ...prevShape,
        color: toolSettings.useFogCut ? "red" : "black",
      };
    });
  }, [toolSettings.useFogCut]);

  function eraseHoveredShapes(event: any) {
    if (!leftMouseButton(event)) {
      return;
    }
    // Erase
    if (hoveredShapes.length > 0) {
      if (toolSettings.type === "remove") {
        onShapesRemove(hoveredShapes.map((shape) => shape.id));
      } else if (toolSettings.type === "toggle") {
        onShapesEdit(
          hoveredShapes.map((shape) => ({
            id: shape.id,
            visible: !shape.visible,
          }))
        );
      }
      setHoveredShapes([]);
    }
  }

  function handleShapeOver(shape: Fog, isDown: boolean) {
    if (shouldHover && isDown && canChange(toolSettings.type === "remove"
      ? { type: "delete", id: shape.id }
      : { type: "update", id: shape.id, fields: { hidden: !shape.visible } })) {
      if (hoveredShapes.findIndex((s) => s.id === shape.id) === -1) {
        setHoveredShapes((prevShapes) => [...prevShapes, shape]);
      }
    }
  }

  function renderShape(shape: Fog) {
    const opacity = editable ? editOpacity : 1;
    const stroke =
      editable && active
        ? colors.lightGray
        : colors[shape.color] || shape.color;
    // Control opacity only on fill as using opacity with stroke leads to performance issues
    const fill = new Color(colors[shape.color] || shape.color)
      .alpha(opacity)
      .string();
    return (
      <SceneDrawing
        key={shape.id}
        item={fogItem(shape, person.id, false, false)}
        onMouseMove={(e: Konva.KonvaEventObject<MouseEvent>) =>
          (!isBrushDown || leftMouseButton(e)) &&
          handleShapeOver(shape, isBrushDown)
        }
        onTouchOver={() => handleShapeOver(shape, isBrushDown)}
        onMouseDown={(e: Konva.KonvaEventObject<MouseEvent>) =>
          leftMouseButton(e) && handleShapeOver(shape, true)
        }
        onTouchStart={() => handleShapeOver(shape, true)}
        onMouseUp={eraseHoveredShapes}
        onTouchEnd={eraseHoveredShapes}
        stroke={stroke}
        strokeWidth={gridStrokeWidth * shape.strokeWidth}
        fill={fill}
        fillPatternImage={patternImage}
        fillPriority={!shape.visible ? "pattern" : "color"}
        // Disable collision if the fog is transparent and we're not editing it
        // This allows tokens to be moved under the fog
        hitFunc={editable && !active ? () => {} : undefined}
      />
    );
  }

  function renderHoveredShape(shape: Fog) {
    const editingShape: Fog = {
      ...shape,
      color: "primary",
    };
    return renderShape(editingShape);
  }

  function renderDrawingShape(shape: Fog) {
    const opacity = editable ? editOpacity : 1;
    const stroke =
      editable && active
        ? colors.lightGray
        : colors[shape.color] || shape.color;
    const fill = new Color(colors[shape.color] || shape.color)
      .alpha(opacity)
      .string();
    return (
      <SceneDrawing
        item={fogItem(shape, person.id, false, toolSettings.type === "brush")}
        fill={fill}
        stroke={stroke}
        strokeWidth={gridStrokeWidth * shape.strokeWidth}
        hitFunc={() => {}}
      />
    );
  }

  function renderPolygonAcceptTick(shape: Fog) {
    if (shape.data.points.length === 0) {
      return null;
    }
    const isCross = shape.data.points.length < 4;
    return (
      <Tick
        x={shape.data.points[0].x * mapWidth}
        y={shape.data.points[0].y * mapHeight}
        scale={1 / stageScale}
        cross={isCross}
        onClick={(e) => {
          e.cancelBubble = true;
          if (isCross) {
            setDrawingShape(null);
          } else {
            finishDrawingPolygon();
          }
        }}
      />
    );
  }

  function renderGuides() {
    return guides.map((guide, index) => (
      <Line
        points={[
          guide.start.x * mapWidth,
          guide.start.y * mapHeight,
          guide.end.x * mapWidth,
          guide.end.y * mapHeight,
        ]}
        stroke="hsl(260, 100%, 80%)"
        key={index}
        strokeWidth={gridStrokeWidth * 0.25}
        lineCap="round"
        lineJoin="round"
      />
    ));
  }

  useEffect(() => {
    function shapeVisible(shape: Fog) {
      return !(active && toolSettings.preview) || shape.visible;
    }

    if (editable) {
      const visibleShapes = shapes.filter(shapeVisible);
      // Only use bounding box guides when rendering them
      if (shouldRenderGuides) {
        setFogShapeBoundingBoxes(getFogShapesBoundingBoxes(visibleShapes, 5));
      } else {
        setFogShapeBoundingBoxes([]);
      }
      setFogShapes(visibleShapes);
    } else {
      // Hidden shapes are an owner-only hint, never part of the fog cover.
      setFogShapes([...(scene?.fogFill ? [] : coveredFog(items)), ...shapes.filter(shape => !shape.visible && !toolSettings.preview)]);
    }
  }, [shapes, items, scene?.fogFill, editable, active, toolSettings, shouldRenderGuides]);

  return (
    <World visible={visible}>
      <SceneFogFill opacity={person.role === "gm" && editable ? editOpacity : 1} />
      <Group>{fogShapes.map(renderShape)}</Group>
      {shouldRenderGuides && renderGuides()}
      {drawingShape && renderDrawingShape(drawingShape)}
      {drawingShape &&
        toolSettings &&
        toolSettings.type === "polygon" &&
        renderPolygonAcceptTick(drawingShape)}
      {hoveredShapes.length > 0 && hoveredShapes.map(renderHoveredShape)}
    </World>
  );
}

export default FogTool;
