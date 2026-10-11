import { Box } from "theme-ui";

import MapInteraction from "../map/MapInteraction";
import SceneGrid from "../scene/SceneGrid";

import { SceneItems } from "../scene/SceneSelection";
import NetworkedMapPointer from "../../network/NetworkedMapPointer";

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

  return (
    <Box sx={{ flexGrow: 1, height: "100%" }}>
      <MapInteraction
        controls={null}
        selectedToolId="pointer"
        onSelectedToolChange={ignore}
        followRect={view}
      >
        <SceneItems placement="belowGrid" />
        <SceneGrid />
        <SceneItems placement="aboveGrid" />
        <SceneItems placement="aboveRuler" />
        <NetworkedMapPointer active={false} session={session} />
      </MapInteraction>
    </Box>
  );
}

export default DisplayMap;
