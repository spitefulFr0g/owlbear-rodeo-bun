import { useCallback } from "react";
import Konva from "konva";
import { TextSettings } from "../../types/Settings";
import { textLineHeight } from "../../helpers/textItem";
import NoteTool from "./NoteTool";

/** The Note tool's placement for text with no square, on the Text layer. */
function TextTool({
  active,
  onEdit,
  settings,
}: {
  active: boolean;
  onEdit: (id: string, node: Konva.Node) => void;
  settings: TextSettings;
}) {
  const { color, size } = settings;
  const style = useCallback(
    (unitsPerCell: number) => ({
      layer: "text" as const,
      color,
      size: textLineHeight(size, unitsPerCell),
      square: false,
    }),
    [color, size]
  );
  return <NoteTool active={active} onEdit={onEdit} style={style} />;
}
export default TextTool;
