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
import {
  AddStatesAction,
  CutFogAction,
  EditStatesAction,
  RemoveStatesAction,
} from "../../actions";

import Session from "../../network/Session";

import { DrawingState } from "../../types/Drawing";
import { Fog, FogState } from "../../types/Fog";
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
import useMapNotes from "../../hooks/useMapNotes";
import { MapActions } from "../../hooks/useMapActions";
import useMapSelection from "../../hooks/useMapSelection";
import useSceneImages from "../../hooks/useSceneImages";

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
  mapActions,
  onMapTokenStateChange,
  onMapTokenStateRemove,
  onMapTokensStateCreate,
  onSelectionItemsChange,
  onSelectionItemsRemove,
  onSelectionItemsCreate,
  onMapChange,
  onMapReset,
  onFogDraw,
  onMapNoteCreate,
  onMapNoteChange,
  onMapNoteRemove,
  allowMapChange,
  session,
  onUndo,
  onRedo,
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

  const fogShapes = Object.values(mapState?.fogs || {});

  const { scene, act, readOnly } = useScene();
  function handleToolAction(action: string) {
    if (action === "eraseAll" && scene && permissions.drawing && !readOnly) {
      deleteDrawings(drawingsInOrder(scene).map((item) => item.id), act);
    }
  }

  function handleFogShapesAdd(shapes: Fog[]) {
    onFogDraw(new AddStatesAction(shapes));
  }

  function handleFogShapesCut(shapes: Fog[]) {
    onFogDraw(new CutFogAction(shapes));
  }

  function handleFogShapesRemove(shapeIds: string[]) {
    onFogDraw(new RemoveStatesAction(shapeIds));
  }

  function handleFogShapesEdit(shapes: Partial<Fog>[]) {
    onFogDraw(new EditStatesAction(shapes));
  }

  const { tokens, propTokens, tokenMenu, tokenDragOverlay } = useMapTokens(
    map,
    mapState,
    onMapTokenStateChange,
    onMapTokenStateRemove,
    onMapTokensStateCreate,
    selectedToolId
  );

  const { notes, noteMenu, noteDragOverlay } = useMapNotes(
    map,
    mapState,
    onMapNoteCreate,
    onMapNoteChange,
    onMapNoteRemove,
    selectedToolId
  );

  const { selectionTool, selectionMenu, selectionDragOverlay } =
    useMapSelection(
      map,
      mapState,
      onSelectionItemsChange,
      onSelectionItemsRemove,
      onSelectionItemsCreate,
      selectedToolId,
      settings.select
    );

  const { sceneImages, sceneMapImages, sceneFogImages, sceneDragOverlay } = useSceneImages(
    selectedToolId === "move"
  );

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
              mapActions={mapActions}
              allowMapChange={allowMapChange}
              onSelectedToolChange={setSelectedToolId}
              selectedToolId={selectedToolId}
              toolSettings={settings}
              onToolSettingChange={handleToolSettingChange}
              onToolAction={handleToolAction}
              onUndo={onUndo}
              onRedo={onRedo}
            />
            <DisplayControls session={session} />
            {tokenMenu}
            {noteMenu}
            {selectionMenu}
            {tokenDragOverlay}
            {noteDragOverlay}
            {selectionDragOverlay}
            {sceneDragOverlay}
          </>
        }
        selectedToolId={selectedToolId}
        onSelectedToolChange={setSelectedToolId}
      >
        {sceneMapImages}
        {sceneGrid}
        {propTokens}
        <DrawingTool
          active={selectedToolId === "drawing" && permissions.drawing}
          toolSettings={settings.drawing}
        />
        {notes}
        {tokens}
        {sceneImages}
        <MeasureTool active={selectedToolId === "measure"} />
        {sceneFogImages}
        <FogTool
          map={map}
          shapes={fogShapes}
          onShapesAdd={handleFogShapesAdd}
          onShapesCut={handleFogShapesCut}
          onShapesRemove={handleFogShapesRemove}
          onShapesEdit={handleFogShapesEdit}
          onShapeError={addToast}
          active={selectedToolId === "fog"}
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
        {selectionTool}
      </MapInteraction>
    </Box>
  );
}

export default Map;
