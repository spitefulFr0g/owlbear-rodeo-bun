import { Box } from "theme-ui";

import MapInteraction from "../map/MapInteraction";
import MapGrid from "../map/MapGrid";

import DrawingTool from "../tools/DrawingTool";
import FogTool from "../tools/FogTool";
import NetworkedMapPointer from "../../network/NetworkedMapPointer";

import { useSettings } from "../../contexts/SettingsContext";

import Session from "../../network/Session";

import { MapRect } from "../../helpers/displayView";

import { Map as MapType } from "../../types/Map";
import { MapState } from "../../types/MapState";

import useMapTokens from "../../hooks/useMapTokens";
import useMapNotes from "../../hooks/useMapNotes";

type DisplayMapProps = {
  map: MapType | null;
  mapState: MapState | null;
  // The part of the map to show
  view: MapRect;
  session: Session;
};

function ignore() {}

/** The map as a player sees it with nothing to press, for a cast display */
function DisplayMap({ map, mapState, view, session }: DisplayMapProps) {
  const { settings } = useSettings();

  const drawShapes = Object.values(mapState?.drawings || {});
  const fogShapes = Object.values(mapState?.fogs || {});

  // The pointer tool leaves tokens and notes with nothing to drag or select
  const { tokens, propTokens } = useMapTokens(
    map,
    mapState,
    ignore,
    ignore,
    ignore,
    "pointer"
  );

  const { notes } = useMapNotes(
    map,
    mapState,
    ignore,
    ignore,
    ignore,
    "pointer"
  );

  return (
    <Box sx={{ flexGrow: 1, height: "100%" }}>
      <MapInteraction
        map={map}
        mapState={mapState}
        controls={null}
        selectedToolId="pointer"
        onSelectedToolChange={ignore}
        followRect={view}
      >
        {map && map.showGrid && <MapGrid map={map} />}
        {propTokens}
        <DrawingTool
          map={map}
          drawings={drawShapes}
          onDrawingAdd={ignore}
          onDrawingsRemove={ignore}
          active={false}
          toolSettings={settings.drawing}
        />
        {notes}
        {tokens}
        <FogTool
          map={map}
          shapes={fogShapes}
          onShapesAdd={ignore}
          onShapesCut={ignore}
          onShapesRemove={ignore}
          onShapesEdit={ignore}
          onShapeError={ignore}
          active={false}
          toolSettings={settings.fog}
          editable={false}
        />
        <NetworkedMapPointer active={false} session={session} />
      </MapInteraction>
    </Box>
  );
}

export default DisplayMap;
