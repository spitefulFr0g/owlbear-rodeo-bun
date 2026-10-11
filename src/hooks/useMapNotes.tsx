import { useCallback, useEffect, useState } from "react";
import Konva from "konva";
import { Box, Button, Flex } from "theme-ui";
import { useScene, useToolPermissions } from "../scene/SceneContext";
import { layers, maxTextLength, TextItem } from "../sceneRules";
import {
  useSetPreventMapInteraction,
  leftMouseButton,
} from "../contexts/MapInteractionContext";
import { MapToolId } from "../types/Map";
import colors, { colorOptions } from "../helpers/colors";
import SceneText from "../components/scene/SceneText";
import World from "../components/scene/World";
import NoteTool from "../components/tools/NoteTool";
import MapMenu from "../components/map/MapMenu";
import TextareaAutosize from "../components/TextareaAutoSize";

function useMapNotes(selectedToolId: MapToolId) {
  const { scene, readOnly, act, person } = useScene();
  const permissions = useToolPermissions();
  const editable = permissions.notes && !readOnly && person.role !== "display";
  const interactive = editable && selectedToolId === "note";
  const [editor, setEditor] = useState<{
    id: string;
    left: number;
    top: number;
    text: string;
  } | null>(null);
  const open = useCallback((id: string, node: Konva.Node, text = "") => {
    const rect = node.getClientRect();
    const map = document.querySelector(".map")?.getBoundingClientRect();
    if (!map) return;
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
  }, []);
  const item = editor && scene?.items[editor.id];
  const note = item?.kind === "text" ? item : undefined;
  useEffect(() => {
    if (!editable || (editor && !note)) setEditor(null);
  }, [editable, editor, note]);
  function close() {
    if (editor && note && editable && editor.text !== note.text)
      act([{ type: "update", id: note.id, fields: { text: editor.text } }]);
    setEditor(null);
  }
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
          item={editor?.id === item.id ? { ...item, text: editor.text } : item}
          interactive={interactive}
          onEdit={open}
        />
      ))}
    </World>
  );
  const noteMenu = (
    <MapMenu
      isOpen={!!editor && !!note}
      onRequestClose={close}
      left={editor?.left}
      top={editor?.top}
      onModalContent={(node) => {
        const input = node?.querySelector<HTMLTextAreaElement>("textarea");
        input?.focus();
      }}
    >
      <Box p={1} sx={{ width: 180 }}>
        <TextareaAutosize
          aria-label="Note text"
          value={editor?.text || ""}
          maxLength={maxTextLength}
          maxRows={4}
          onChange={(event) =>
            setEditor((prev) => prev && { ...prev, text: event.target.value })
          }
          onKeyPress={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              close();
            }
          }}
        />
        <Flex sx={{ flexWrap: "wrap" }}>
          {colorOptions
            .filter((color) => color !== "primary")
            .map((color) => (
              <Box
                key={color}
                aria-label={`Note color ${color}`}
                onClick={() =>
                  note &&
                  act([{ type: "update", id: note.id, fields: { color } }])
                }
                sx={{
                  width: "16.66%",
                  height: 24,
                  backgroundColor: colors[color],
                  cursor: "pointer",
                  border:
                    note?.color === color
                      ? "2px solid white"
                      : "2px solid transparent",
                }}
              />
            ))}
        </Flex>
        <Flex>
          <Button
            onClick={() =>
              note &&
              act([
                {
                  type: "update",
                  id: note.id,
                  fields: {
                    square: !note.square,
                    layer: note.square ? "text" : "note",
                  },
                },
              ])
            }
          >
            {note?.square ? "Text Mode" : "Note Mode"}
          </Button>
          <Button
            onClick={() => {
              if (note) act([{ type: "delete", id: note.id }]);
              setEditor(null);
            }}
          >
            Delete
          </Button>
        </Flex>
      </Box>
    </MapMenu>
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
