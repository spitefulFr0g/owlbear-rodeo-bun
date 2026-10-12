import { useRef, useState } from "react";
import { Box } from "theme-ui";

import MapInteraction from "../map/MapInteraction";
import SceneGrid from "../scene/SceneGrid";

import { SceneItems } from "../scene/SceneSelection";
import ScenePointers from "../scene/ScenePointers";
import SceneRulers from "../scene/SceneRulers";
import MeasureTool from "../tools/MeasureTool";

import { useKeyboard } from "../../contexts/KeyboardContext";

import shortcuts from "../../shortcuts";

import { MapRect } from "../../helpers/displayView";

type DisplayMapProps = {
  // The part of the map to show
  view: MapRect;
  /**
   * Waiting players may pan, zoom, point and measure, with no interface: the
   * measure and pointer tools' own keys choose what the left button does
   */
  interactive?: boolean;
};

function ignore() {}

/** The map as a player sees it with nothing to press, for a cast display */
function DisplayMap({ view, interactive = false }: DisplayMapProps) {
  const [tool, setTool] = useState<"pointer" | "measure">("pointer");
  useKeyboard((event: KeyboardEvent) => {
    if (!interactive) return;
    if (shortcuts.measureTool(event)) setTool("measure");
    if (shortcuts.pointerTool(event)) setTool("pointer");
  });

  const initialRect = useRef(view).current;
  return (
    <Box sx={{ flexGrow: 1, height: "100%" }}>
      <MapInteraction
        controls={null}
        selectedToolId={tool}
        onSelectedToolChange={ignore}
        followRect={interactive ? undefined : view}
        initialRect={interactive ? initialRect : undefined}
      >
        <SceneItems placement="belowGrid" />
        <SceneGrid />
        <SceneItems placement="aboveGrid" />
        <SceneRulers />
        <MeasureTool active={interactive && tool === "measure"} />
        <SceneItems placement="aboveRuler" />
        <ScenePointers active={interactive && tool === "pointer"} />
      </MapInteraction>
    </Box>
  );
}

export default DisplayMap;
