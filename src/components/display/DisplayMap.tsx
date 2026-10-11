import { Box } from "theme-ui";

import MapInteraction from "../map/MapInteraction";
import useSceneGrid from "../../hooks/useSceneGrid";

import DrawingTool from "../tools/DrawingTool";
import FogTool from "../tools/FogTool";
import useMapNotes from "../../hooks/useMapNotes";
import SceneImages from "../scene/SceneImages";
import NetworkedMapPointer from "../../network/NetworkedMapPointer";

import { useSettings } from "../../contexts/SettingsContext";

import Session from "../../network/Session";

import { MapRect } from "../../helpers/displayView";

type DisplayMapProps = {
  // The part of the map to show
  view: MapRect;
  session: Session;
};

function ignore() {}

/** The map as a player sees it with nothing to press, for a cast display */
function DisplayMap({ view, session }: DisplayMapProps) {
  const { settings } = useSettings();


  const { notes } = useMapNotes("pointer");

  const sceneGrid = useSceneGrid();

  return (
    <Box sx={{ flexGrow: 1, height: "100%" }}>
      <MapInteraction
        controls={null}
        selectedToolId="pointer"
        onSelectedToolChange={ignore}
        followRect={view}
      >
        <SceneImages placement="belowGrid" />
        {sceneGrid}
        <DrawingTool
          active={false}
          toolSettings={settings.drawing}
        />
        <SceneImages />
        {notes}
        <SceneImages placement="aboveRuler" />
        <FogTool
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
