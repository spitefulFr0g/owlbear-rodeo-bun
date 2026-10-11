import { ReactNode } from "react";
import { MapToolId } from "../../types/Map";
import { Settings } from "../../types/Settings";
import { getToolPermissions } from "../../helpers/roomControls";
import shortcuts from "../../shortcuts";
import MoveToolIcon from "../../icons/MoveToolIcon";
import SelectToolIcon from "../../icons/SelectToolIcon";
import FogToolIcon from "../../icons/FogToolIcon";
import BrushToolIcon from "../../icons/BrushToolIcon";
import MeasureToolIcon from "../../icons/MeasureToolIcon";
import PointerToolIcon from "../../icons/PointerToolIcon";
import NoteToolIcon from "../../icons/NoteToolIcon";
import FogToolSettings from "../controls/FogToolSettings";
import DrawingToolSettings from "../controls/DrawingToolSettings";

type ToolEntry = {
  id: MapToolId;
  icon: ReactNode;
  title: string;
  shortcut: (event: KeyboardEvent) => boolean;
  mayUse: boolean;
  settingsPanel?: ReactNode;
};

type ToolEntryContext = {
  permissions: ReturnType<typeof getToolPermissions>;
  readOnly: boolean;
  toolSettings: Settings;
  onToolSettingChange: (change: Partial<Settings>) => void;
  onToolAction: (actionId: string) => void;
  disabledSettings: Partial<Record<keyof Settings, string[]>>;
};

/** The ordered toolbar, including each tool's shortcut, availability and panel. */
export function createToolEntries({
  permissions, readOnly, toolSettings, onToolSettingChange,
  onToolAction, disabledSettings,
}: ToolEntryContext): ToolEntry[] {
  return [
    { id: "move", icon: <MoveToolIcon />, title: "Move Tool (W)",
      shortcut: shortcuts.moveTool, mayUse: true },
    { id: "select", icon: <SelectToolIcon />, title: "Select Tool (S)",
      shortcut: shortcuts.selectTool, mayUse: !readOnly },
    { id: "fog", icon: <FogToolIcon />, title: "Fog Tool (F)",
      shortcut: shortcuts.fogTool, mayUse: !readOnly && permissions.fog,
      settingsPanel: <FogToolSettings settings={toolSettings.fog}
        onSettingChange={change => onToolSettingChange({ fog: { ...toolSettings.fog, ...change } })}
        disabledActions={disabledSettings.fog} /> },
    { id: "drawing", icon: <BrushToolIcon />, title: "Drawing Tool (D)",
      shortcut: shortcuts.drawingTool, mayUse: !readOnly && permissions.drawing,
      settingsPanel: <DrawingToolSettings settings={toolSettings.drawing}
        onSettingChange={change => onToolSettingChange({ drawing: { ...toolSettings.drawing, ...change } })}
        onToolAction={onToolAction} disabledActions={disabledSettings.drawing || []} /> },
    { id: "measure", icon: <MeasureToolIcon />, title: "Measure Tool (M)",
      shortcut: shortcuts.measureTool, mayUse: permissions.measure },
    { id: "pointer", icon: <PointerToolIcon />, title: "Pointer Tool (Q)",
      shortcut: shortcuts.pointerTool, mayUse: permissions.pointer },
    { id: "note", icon: <NoteToolIcon />, title: "Note Tool (N)",
      shortcut: shortcuts.noteTool, mayUse: !readOnly && permissions.notes },
  ];
}
