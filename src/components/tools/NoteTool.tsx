import { useEffect, useRef, useState } from "react";
import Konva from "konva";
import shortid from "shortid";
import {
  useInteractionEmitter,
  MapDragEvent,
  leftMouseButton,
} from "../../contexts/MapInteractionContext";
import { useMapStage } from "../../contexts/MapStageContext";
import { getRelativePointerPosition } from "../../helpers/konva";
import useSceneSnapping from "../../hooks/useSceneSnapping";
import { useScene } from "../../scene/SceneContext";
import { worldNodeId } from "../../scene/worldPosition";
import { TextItem } from "../../sceneRules";
import SceneText from "../scene/SceneText";
import World from "../scene/World";

function NoteTool({
  active,
  onEdit,
}: {
  active: boolean;
  onEdit: (id: string, node: Konva.Node) => void;
}) {
  const { scene, person, readOnly, act } = useScene();
  const emitter = useInteractionEmitter();
  const stage = useMapStage();
  const snap = useSceneSnapping();
  const draft = useRef<TextItem | null>(null);
  const [preview, setPreview] = useState<TextItem | null>(null);
  useEffect(() => {
    if (!active || readOnly) {
      draft.current = null;
      setPreview(null);
      return;
    }
    function position() {
      const world = stage.current?.findOne(`#${worldNodeId}`);
      const point = world && getRelativePointerPosition(world);
      return point ? snap(point) : undefined;
    }
    function down(event: MapDragEvent) {
      const point = position();
      if (!leftMouseButton(event) || !point || !scene) return;
      draft.current = {
        id: shortid.generate(),
        kind: "text",
        layer: "note",
        position: point,
        rotation: 0,
        scale: { x: 1, y: 1 },
        order: 0,
        owner: person.id,
        locked: false,
        hidden: false,
        metadata: {},
        text: "",
        color: "yellow",
        size: scene.grid.unitsPerCell * 2,
        square: true,
      };
      setPreview(draft.current);
    }
    function move(event: MapDragEvent) {
      const point = position();
      if (!leftMouseButton(event) || !point || !draft.current) return;
      draft.current = { ...draft.current, position: point };
      setPreview(draft.current);
    }
    function up(event: MapDragEvent) {
      if (!leftMouseButton(event) || !draft.current) return;
      const item = draft.current;
      const node = stage.current?.findOne(`#${item.id}`);
      act([{ type: "add", item }]);
      if (node) onEdit(item.id, node);
      draft.current = null;
      setPreview(null);
    }
    emitter?.on("dragStart", down);
    emitter?.on("drag", move);
    emitter?.on("dragEnd", up);
    return () => {
      emitter?.off("dragStart", down);
      emitter?.off("drag", move);
      emitter?.off("dragEnd", up);
    };
  }, [active, readOnly, scene, person.id, stage, snap, emitter, act, onEdit]);
  return (
    <World>{preview && <SceneText item={preview} listening={false} />}</World>
  );
}
export default NoteTool;
