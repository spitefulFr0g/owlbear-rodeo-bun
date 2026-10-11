import { useCallback, useEffect, useState } from "react";
import Konva from "konva";
import { useScene } from "../scene/SceneContext";
import { layers, TextItem } from "../sceneRules";
import { useToolPermissions } from "../contexts/RoomContext";
import {
  useSetPreventMapInteraction,
  leftMouseButton,
} from "../contexts/MapInteractionContext";
import { MapToolId } from "../types/Map";
import SceneText from "../components/scene/SceneText";
import World from "../components/scene/World";
import NoteTool from "../components/tools/NoteTool";
import SceneItemMenu from "../components/scene/SceneItemMenu";

function useMapNotes(selectedToolId: MapToolId) {
  const { scene, readOnly, person, setSelection } = useScene();
  const permissions = useToolPermissions();
  const editable = permissions.notes && !readOnly && person.role !== "display";
  const interactive = editable && selectedToolId === "note";
  const [editor, setEditor] = useState<{
    id: string;
    left: number;
    top: number;
    text: string;
  } | null>(null);
  const open = useCallback(
    (id: string, node: Konva.Node, text = "") => {
      const rect = node.getClientRect();
      const map = document.querySelector(".map")?.getBoundingClientRect();
      if (!map) return;
      setSelection([id]);
      setEditor({
        id,
        left: Math.max(
          map.left,
          Math.min(map.right - 180, map.left + rect.x + rect.width / 2 - 90)
        ),
        top: Math.max(
          map.top,
          Math.min(map.bottom - 240, map.top + rect.y + rect.height + 20)
        ),
        text,
      });
    },
    [setSelection]
  );
  const item = editor && scene?.items[editor.id];
  const note = item?.kind === "text" ? item : undefined;
  useEffect(() => {
    if (!editable || (editor && !note)) setEditor(null);
  }, [editable, editor, note]);
  const items = scene
    ? Object.values(scene.items)
        .filter((item): item is TextItem => item.kind === "text")
        .sort(
          (a, b) =>
            layers.indexOf(a.layer) - layers.indexOf(b.layer) ||
            a.order - b.order ||
            a.id.localeCompare(b.id)
        )
    : [];
  const notes = (
    <World id="notes">
      {items.map((item) => (
        <SceneNote
          key={item.id}
          item={item}
          interactive={interactive}
          onEdit={open}
        />
      ))}
    </World>
  );
  const noteMenu = (
    <SceneItemMenu
      position={editor ? { x: editor.left, y: editor.top } : null}
      close={() => setEditor(null)}
    />
  );
  return {
    notes,
    noteMenu,
    noteTool: (
      <NoteTool active={editable && selectedToolId === "note"} onEdit={open} />
    ),
  };
}
export default useMapNotes;

/** Canvas interactions run beneath MapInteraction's providers. */
function SceneNote({
  item,
  interactive,
  onEdit,
}: {
  item: TextItem;
  interactive: boolean;
  onEdit: (id: string, node: Konva.Node, text?: string) => void;
}) {
  const { person } = useScene();
  const prevent = useSetPreventMapInteraction();
  const editable = interactive && (!item.locked || person.role === "gm");
  return (
    <SceneText
      item={item}
      draggable={false}
      onMouseDown={(event: Konva.KonvaEventObject<MouseEvent>) => {
        if (editable && leftMouseButton(event)) prevent(true);
      }}
      onTouchStart={() => {
        if (editable) prevent(true);
      }}
      onMouseUp={() => prevent(false)}
      onTouchEnd={() => prevent(false)}
      onClick={(event: Konva.KonvaEventObject<MouseEvent>) => {
        if (editable && leftMouseButton(event))
          onEdit(item.id, event.currentTarget, item.text);
      }}
      onTap={(event: Konva.KonvaEventObject<TouchEvent>) => {
        if (editable) onEdit(item.id, event.currentTarget, item.text);
      }}
    />
  );
}
