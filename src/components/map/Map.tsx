import { useState } from "react";
import { Box } from "theme-ui";
import { useToasts } from "react-toast-notifications";

import MapControls from "./MapControls";
import MapInteraction from "./MapInteraction";
import useSceneGrid from "../../hooks/useSceneGrid";

import { useScene } from "../../scene/SceneContext";
import { drawingsInOrder, deleteDrawings } from "../../scene/drawingItem";

import DrawingTool from "../tools/DrawingTool";
import FogTool from "../tools/FogTool";
import MeasureTool from "../tools/MeasureTool";
import NetworkedMapPointer from "../../network/NetworkedMapPointer";
import NetworkedDisplayView from "../../network/NetworkedDisplayView";

import DisplayControls from "../display/DisplayControls";

import { useSettings } from "../../contexts/SettingsContext";
import { useToolPermissions, useRole } from "../../contexts/RoomContext";
import { getRoleControls } from "../../helpers/roomControls";

import Action from "../../actions/Action";

import Session from "../../network/Session";

import { DrawingState } from "../../types/Drawing";
import { FogState } from "../../types/Fog";
import { Map as MapType, MapToolId } from "../../types/Map";
import { MapState } from "../../types/MapState";
import { Settings } from "../../types/Settings";
import {
  MapChangeEventHandler,
  MapResetEventHandler,
  TokenStateRemoveHandler,
  NoteChangeEventHandler,
  NoteRemoveEventHander,
  TokenStateChangeEventHandler,
  NoteCreateEventHander,
  SelectionItemsChangeEventHandler,
  SelectionItemsRemoveEventHandler,
  SelectionItemsCreateEventHandler,
  TokensStateCreateHandler,
} from "../../types/Events";

import useMapTokens from "../../hooks/useMapTokens";
import NoteTool from "../tools/NoteTool";
import SceneItemMenu from "../scene/SceneItemMenu";
import { MapActions } from "../../hooks/useMapActions";
import SceneSelection, { SceneItems } from "../scene/SceneSelection";

type MapProps = {
  map: MapType | null;
  mapState: MapState | null;
  mapActions: MapActions;
  onMapTokenStateChange: TokenStateChangeEventHandler;
  onMapTokenStateRemove: TokenStateRemoveHandler;
  onMapTokensStateCreate: TokensStateCreateHandler;
  onSelectionItemsChange: SelectionItemsChangeEventHandler;
  onSelectionItemsRemove: SelectionItemsRemoveEventHandler;
  onSelectionItemsCreate: SelectionItemsCreateEventHandler;
  onMapChange: MapChangeEventHandler;
  onMapReset: MapResetEventHandler;
  onMapDraw: (action: Action<DrawingState>) => void;
  onFogDraw: (action: Action<FogState>) => void;
  onMapNoteCreate: NoteCreateEventHander;
  onMapNoteChange: NoteChangeEventHandler;
  onMapNoteRemove: NoteRemoveEventHander;
  allowMapChange: boolean;
  session: Session;
  onUndo: () => void;
  onRedo: () => void;
};

function Map({
  map,
  mapState,
  onMapTokenStateChange,
  onMapTokenStateRemove,
  onMapTokensStateCreate,
  onMapChange,
  onMapReset,
  allowMapChange,
  session,
}: MapProps) {
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

  const { tokens, propTokens, tokenDragOverlay } = useMapTokens(
    map,
    mapState,
    onMapTokenStateChange,
    onMapTokenStateRemove,
    onMapTokensStateCreate,
    selectedToolId
  );

  const grabbing =
    (selectedToolId === "drawing" && settings.drawing.type === "grab") ||
    (selectedToolId === "fog" &&
      settings.fog.type === "grab" &&
      !settings.fog.preview);
  const selecting =
    grabbing || selectedToolId === "move" || selectedToolId === "select";
  const sceneGrid = useSceneGrid(map);

  return (
    <Box sx={{ flexGrow: 1 }}>
      <MapInteraction
        map={map}
        mapState={mapState}
        controls={
          <>
            <MapControls
              onMapChange={onMapChange}
              onMapReset={onMapReset}
              map={map}
              mapState={mapState}
              allowMapChange={allowMapChange}
              onSelectedToolChange={setSelectedToolId}
              selectedToolId={selectedToolId}
              toolSettings={settings}
              onToolSettingChange={handleToolSettingChange}
              onToolAction={handleToolAction}
            />
            <DisplayControls session={session} />
            <SceneItemMenu
              position={itemMenu}
              close={() => setItemMenu(null)}
            />
            {tokenDragOverlay}
          </>
        }
        selectedToolId={selectedToolId}
        onSelectedToolChange={setSelectedToolId}
      >
        <SceneItems placement="belowGrid" />
        {sceneGrid}
        {propTokens}
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
        {tokens}
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
        <NetworkedMapPointer
          active={selectedToolId === "pointer"}
          session={session}
        />
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
