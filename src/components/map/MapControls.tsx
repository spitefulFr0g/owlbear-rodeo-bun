import { createToolEntries } from "./toolEntries";
import { useState, Fragment, useEffect, useMemo } from "react";
import { IconButton, Flex, Box } from "theme-ui";

import RadioIconButton from "../RadioIconButton";
import Divider from "../Divider";
import SceneControls from "../scene/SceneControls";

import ScenesButton from "../scene/ScenesButton";

import ExpandMoreIcon from "../../icons/ExpandMoreIcon";
import FullScreenIcon from "../../icons/FullScreenIcon";
import FullScreenExitIcon from "../../icons/FullScreenExitIcon";

import UndoButton from "../controls/shared/UndoButton";
import RedoButton from "../controls/shared/RedoButton";

import useSetting from "../../hooks/useSetting";

import { MapToolId } from "../../types/Map";
import { Settings } from "../../types/Settings";

import { useKeyboard } from "../../contexts/KeyboardContext";

import shortcuts from "../../shortcuts";
import { useRole } from "../../contexts/RoomContext";
import { getRoleControls } from "../../helpers/roomControls";
import { useScene, useToolPermissions } from "../../scene/SceneContext";
import { fogItems } from "../../scene/fogItem";
import { drawingsInOrder } from "../../scene/drawingItem";

type MapControlsProps = {
  selectedToolId: MapToolId;
  onSelectedToolChange: (toolId: MapToolId) => void;
  toolSettings: Settings;
  onToolSettingChange: (change: Partial<Settings>) => void;
  onToolAction: (actionId: string) => void;
};

function MapContols({
  selectedToolId,
  onSelectedToolChange,
  toolSettings,
  onToolSettingChange,
  onToolAction,
}: MapControlsProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [fullScreen, setFullScreen] = useSetting("map.fullScreen");

  const permissions = useToolPermissions();
  const { scene, readOnly, canChange, undo: onUndo, redo: onRedo, canUndo, canRedo } = useScene();
  const isGM = getRoleControls(useRole()).hidden;

  const disabledSettings = useMemo(() => {
    const disabled: Partial<Record<keyof Settings, string[]>> = {
      drawing: [],
      fog: [],
    };
    if (!scene || !drawingsInOrder(scene).some(item => canChange({ type: "delete", id: item.id }))) {
      disabled.drawing?.push("erase");
    }
    const fog = scene ? fogItems(scene) : [];
    if (!fog.some(item => canChange({ type: "delete", id: item.id })))
      disabled.fog?.push("remove");
    if (!fog.some(item => canChange({ type: "update", id: item.id, fields: { hidden: !item.hidden } })))
      disabled.fog?.push("toggle");
    return disabled;
  }, [scene, canChange]);

  const tools = createToolEntries({
    permissions, readOnly, toolSettings, onToolSettingChange,
    onToolAction, disabledSettings,
  });
  const disabledControls: MapToolId[] = tools
    .filter(tool => !tool.mayUse).map(tool => tool.id);
  if (!canUndo) disabledControls.push("undo");
  if (!canRedo) disabledControls.push("redo");

  // Change back to move when the selected tool becomes unavailable.
  useEffect(() => {
    if (disabledControls.includes(selectedToolId)) onSelectedToolChange("move");
  }, [selectedToolId, disabledControls, onSelectedToolChange]);

  const sections = [
    {
      id: "map",
      component: <ScenesButton />,
    },
    { id: "scene", component: <SceneControls /> },
    {
      id: "tools",
      component: tools.map((tool) => (
        <RadioIconButton
          key={tool.id}
          title={tool.title}
          onClick={() => onSelectedToolChange(tool.id)}
          isSelected={selectedToolId === tool.id}
          disabled={!tool.mayUse}
        >
          {tool.icon}
        </RadioIconButton>
      )),
    },
    {
      id: "history",
      component: (
        <>
          <UndoButton
            onClick={onUndo}
            disabled={disabledControls.includes("undo")}
          />
          <RedoButton
            onClick={onRedo}
            disabled={disabledControls.includes("redo")}
          />
        </>
      ),
    },
  ].filter((section) => section.id !== "map" || isGM);

  let controls = null;
  if (sections.length === 1 && sections[0].id === "map") {
    controls = (
      <Box
        sx={{
          display: "block",
          backgroundColor: "overlay",
          borderRadius: "4px",
        }}
        m={2}
      >
        {sections[0].component}
      </Box>
    );
  } else if (sections.length > 0) {
    controls = (
      <>
        <IconButton
          aria-label={isExpanded ? "Hide Scene Controls" : "Show Scene Controls"}
          title={isExpanded ? "Hide Scene Controls" : "Show Scene Controls"}
          onClick={() => setIsExpanded(!isExpanded)}
          sx={{
            transform: `rotate(${isExpanded ? "0" : "180deg"})`,
            display: "block",
            backgroundColor: "overlay",
            borderRadius: "50%",
          }}
          m={2}
        >
          <ExpandMoreIcon />
        </IconButton>
        <Box
          sx={{
            flexDirection: "column",
            alignItems: "center",
            display: isExpanded ? "flex" : "none",
            backgroundColor: "overlay",
            borderRadius: "4px",
          }}
          p={2}
        >
          {sections.map((section, index) => (
            <Fragment key={section.id}>
              {section.component}
              {index !== sections.length - 1 && <Divider />}
            </Fragment>
          ))}
        </Box>
      </>
    );
  }

  function getToolSettings() {
    const settings = tools.find(tool => tool.id === selectedToolId)?.settingsPanel;
    if (!settings) return null;
    return (
      <Box
        sx={{
          position: "absolute",
          top: "4px",
          left: "50%",
          transform: "translateX(-50%)",
          backgroundColor: "overlay",
          borderRadius: "4px",
        }}
        p={1}
      >
        {settings}
      </Box>
    );
  }

  function handleKeyDown(event: KeyboardEvent) {
    for (const tool of tools) {
      if (tool.shortcut(event) && tool.mayUse) onSelectedToolChange(tool.id);
    }
    if (shortcuts.redo(event) && !disabledControls.includes("redo")) {
      onRedo();
    }
    if (shortcuts.undo(event) && !disabledControls.includes("undo")) {
      onUndo();
    }
  }

  useKeyboard(handleKeyDown);

  return (
    <>
      <Flex
        sx={{
          position: "absolute",
          top: 0,
          right: 0,
          flexDirection: "column",
          alignItems: "center",
        }}
        mx={1}
      >
        {controls}
      </Flex>
      {getToolSettings()}
      <Box
        sx={{
          position: "absolute",
          right: "4px",
          bottom: 0,
          backgroundColor: "overlay",
          borderRadius: "50%",
        }}
        m={2}
      >
        <IconButton
          onClick={() => setFullScreen(!fullScreen)}
          aria-label={fullScreen ? "Exit Full Screen" : "Enter Full Screen"}
          title={fullScreen ? "Exit Full Screen" : "Enter Full Screen"}
        >
          {fullScreen ? <FullScreenExitIcon /> : <FullScreenIcon />}
        </IconButton>
      </Box>
    </>
  );
}

export default MapContols;
