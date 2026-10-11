import { useRef, useState } from "react";
import Konva from "konva";

import DragOverlay, { isPointerOver } from "../components/map/DragOverlay";
import SceneImages from "../components/scene/SceneImages";

import { useMapStage } from "../contexts/MapStageContext";

import { useScene } from "../scene/SceneContext";

import { Change, ImageItem } from "../sceneRules";

/**
 * The scene's Image items, dragged with the move tool: dropped on the map an
 * image moves there, dropped on the remove icon it is deleted.
 */
function useSceneImages(active: boolean) {
  const { act } = useScene();
  const mapStageRef = useMapStage();

  const [dragging, setDragging] = useState<string>();
  const removeRef = useRef<HTMLDivElement>(null);

  function handleDragStart(item: ImageItem) {
    setDragging(item.id);
  }

  function handleDragEnd(item: ImageItem, node: Konva.Node) {
    const mapStage = mapStageRef.current;
    const removed = !!mapStage && isPointerOver(mapStage, removeRef.current);
    setDragging(undefined);
    const change: Change = removed
      ? { type: "delete", id: item.id }
      : { type: "update", id: item.id, fields: { position: node.position() } };
    if (!act([change])) {
      // Nothing was sent, so the image goes back to where the scene has it
      node.position(item.position);
    }
  }

  const sceneImages = (
    <SceneImages
      active={active}
      dragging={dragging}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    />
  );

  const sceneDragOverlay = dragging !== undefined && (
    <DragOverlay dragging removeRef={removeRef} />
  );

  return { sceneImages, sceneDragOverlay };
}

export default useSceneImages;
