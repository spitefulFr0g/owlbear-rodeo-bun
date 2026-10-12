import { useState } from "react";
import { Box } from "theme-ui";
import { useToasts } from "react-toast-notifications";

import MapControls from "./MapControls";
import MapInteraction from "./MapInteraction";
import SceneGrid from "../scene/SceneGrid";

import { useScene, useToolPermissions } from "../../scene/SceneContext";
import { drawingsInOrder, deleteDrawings } from "../../scene/drawingItem";

import DrawingTool from "../tools/DrawingTool";
import FogTool from "../tools/FogTool";
import MeasureTool from "../tools/MeasureTool";
import NetworkedDisplayView from "../../network/NetworkedDisplayView";

import DisplayControls from "../display/DisplayControls";

import { useSettings } from "../../contexts/SettingsContext";
import { useRole } from "../../contexts/RoomContext";
import { getRoleControls } from "../../helpers/roomControls";

import Session from "../../network/Session";

import { MapToolId } from "../../types/Map";
import { Settings } from "../../types/Settings";
import NoteTool from "../tools/NoteTool";
import SceneItemMenu from "../scene/SceneItemMenu";
import SceneNotice from "../scene/SceneNotice";
import ScenePointers from "../scene/ScenePointers";
import SceneSelection, { SceneItems } from "../scene/SceneSelection";

type MapProps = {
  session: Session;
};

function Map({ session }: MapProps) {
  const { addToast } = useToasts();

  const permissions = useToolPermissions();
  const roleControls = getRoleControls(useRole());

  const [selectedToolId, setSelectedToolId] = useState<MapToolId>("move");
  const { settings, setSettings } = useSettings();

  function handleToolSettingChange(change: Partial<Settings>) {
    setSettings((prevSettings) => ({
      ...prevSettings,
      ...change,
    }));
  }

  const [itemMenu, setItemMenu] = useState<{ x: number; y: number } | null>(
    null
  );
  const { scene, act, readOnly, setSelection } = useScene();
  function handleToolAction(action: string) {
    if (action === "eraseAll" && scene && permissions.drawing && !readOnly) {
      deleteDrawings(
        drawingsInOrder(scene).map((item) => item.id),
        act
      );
    }
  }

  const grabbing =
    (selectedToolId === "drawing" && settings.drawing.type === "grab") ||
    (selectedToolId === "fog" &&
      settings.fog.type === "grab" &&
      !settings.fog.preview);
  const selecting =
    grabbing || selectedToolId === "move" || selectedToolId === "select";

  return (
    <Box sx={{ flexGrow: 1 }}>
      <MapInteraction
        controls={
          <>
            <MapControls
              onSelectedToolChange={setSelectedToolId}
              selectedToolId={selectedToolId}
              toolSettings={settings}
              onToolSettingChange={handleToolSettingChange}
              onToolAction={handleToolAction}
            />
            <DisplayControls session={session} />
            <SceneNotice />
            <SceneItemMenu
              position={itemMenu}
              close={() => setItemMenu(null)}
            />
          </>
        }
        selectedToolId={selectedToolId}
        onSelectedToolChange={setSelectedToolId}
      >
        <SceneItems placement="belowGrid" />
        <SceneGrid />
        <DrawingTool
          visible={!selecting}
          renderItems={
            selectedToolId === "drawing" && settings.drawing.type === "erase"
          }
          active={
            !grabbing && selectedToolId === "drawing" && permissions.drawing
          }
          toolSettings={settings.drawing}
        />
        <SceneItems placement="aboveGrid" />
        <NoteTool
          active={selectedToolId === "note" && permissions.notes}
          onEdit={(id, node) => {
            setSelection([id]);
            const rect = node.getClientRect();
            const mapRect = document
              .querySelector(".map")
              ?.getBoundingClientRect();
            if (mapRect)
              setItemMenu({
                x: mapRect.left + rect.x,
                y: mapRect.top + rect.y + rect.height,
              });
          }}
        />
        <MeasureTool active={selectedToolId === "measure"} />
        <SceneItems placement="aboveRuler" fogShapes={selecting} />
        <FogTool
          visible={!selecting}
          onShapeError={addToast}
          active={!grabbing && selectedToolId === "fog"}
          toolSettings={settings.fog}
          editable={permissions.fog && !settings.fog.preview}
        />
        <ScenePointers active={selectedToolId === "pointer"} />
        {scene && roleControls.room && (
          <NetworkedDisplayView session={session} sceneId={scene.id} />
        )}
        <SceneSelection
          onMenuOpen={setItemMenu}
          active={selecting}
          layer={
            grabbing
              ? selectedToolId === "fog"
                ? "fog"
                : "drawing"
              : undefined
          }
          boxSelect={selectedToolId === "select"}
        />
      </MapInteraction>
    </Box>
  );
}

export default Map;
