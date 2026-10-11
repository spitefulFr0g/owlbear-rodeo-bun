import { useEffect, useState } from "react";
import { Box, IconButton, Label, Checkbox, Select, Input } from "theme-ui";

import GridOnIcon from "../../icons/GridOnIcon";

import { useScene } from "../../scene/SceneContext";
import { GridType, SceneGrid } from "../../sceneRules";

/** The GM changes the scene's grid, including on a table with no map */
function SceneGridControls() {
  const { scene, person, readOnly, setGrid } = useScene();
  const [expanded, setExpanded] = useState(false);
  const [scale, setScale] = useState(scene?.grid.measurement.scale || "");
  useEffect(() => { setScale(scene?.grid.measurement.scale || ""); }, [scene?.grid.measurement.scale]);
  if (!scene || person.role !== "gm") return null;
  const grid = scene.grid;
  function change(fields: Partial<SceneGrid>) {
    setGrid({ ...grid, ...fields });
  }
  return (
    <Box>
      <IconButton aria-label="Scene Grid" title="Scene Grid" onClick={() => setExpanded(!expanded)}><GridOnIcon /></IconButton>
      {expanded && (
        <Box sx={{ position: "absolute", right: "100%", top: 0, width: 240, backgroundColor: "overlay", borderRadius: 4 }} p={3}>
          <Label htmlFor="scene-grid-type">Grid type</Label>
          <Select id="scene-grid-type" value={grid.type} disabled={readOnly} onChange={(event) => change({ type: event.target.value as GridType })}>
            <option value="square">Square</option>
            <option value="hexVertical">Vertical Hex</option>
            <option value="hexHorizontal">Horizontal Hex</option>
          </Select>
          <Label><Checkbox checked={grid.shown} disabled={readOnly} onChange={(event) => change({ shown: event.target.checked })} />Show grid</Label>
          <Label><Checkbox checked={grid.snap} disabled={readOnly} onChange={(event) => change({ snap: event.target.checked })} />Snap to grid</Label>
          <Label htmlFor="scene-measurement">Measurement</Label>
          <Select id="scene-measurement" value={grid.measurement.type} disabled={readOnly} onChange={(event) => change({ measurement: { ...grid.measurement, type: event.target.value as SceneGrid["measurement"]["type"] } })}>
            <option value="chebyshev">Chebyshev</option>
            <option value="alternating">Alternating</option>
            <option value="euclidean">Euclidean</option>
            <option value="manhattan">Manhattan</option>
          </Select>
          <Label htmlFor="scene-scale">Measurement scale</Label>
          <Input id="scene-scale" value={scale} disabled={readOnly} onChange={(event) => setScale(event.target.value)} onBlur={() => change({ measurement: { ...grid.measurement, scale } })} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />
        </Box>
      )}
    </Box>
  );
}

export default SceneGridControls;
