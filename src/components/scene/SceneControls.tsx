import { useEffect, useRef, useState } from "react";
import { Box, IconButton, Label, Checkbox, Select, Input, Slider } from "theme-ui";

import MapMenu from "../map/MapMenu";

import GridOnIcon from "../../icons/GridOnIcon";

import { useScene } from "../../scene/SceneContext";
import {
  GridType,
  maxGridLineWidth,
  minGridLineWidth,
  SceneGrid,
} from "../../sceneRules";
import { measurementShown, measurementsOffered, withGridType } from "../../helpers/gridMeasurement";

type SettledInputProps = {
  id: string;
  type: "range" | "color";
  value: string;
  disabled: boolean;
  /** Called once with what was picked, when the picking ends */
  onSettle: (value: string) => void;
  min?: number;
  max?: number;
  step?: number;
};

/**
 * A slider or colour picker that follows the hand while it is dragged and
 * reports only where it is let go, so one pick is one change to the scene
 */
function SettledInput({ type, value, onSettle, ...props }: SettledInputProps) {
  const ref = useRef<HTMLInputElement>(null);
  const [picking, setPicking] = useState(value);
  useEffect(() => setPicking(value), [value]);
  const settle = useRef(onSettle);
  settle.current = onSettle;
  // React's onChange fires on every step; the browser's own change event does not
  useEffect(() => {
    const input = ref.current;
    if (!input) return;
    const handleChange = () => settle.current(input.value);
    input.addEventListener("change", handleChange);
    return () => input.removeEventListener("change", handleChange);
  }, []);
  const Component = type === "range" ? Slider : Input;
  return (
    <Component
      ref={ref}
      type={type}
      value={picking}
      onChange={(event) => setPicking(event.target.value)}
      sx={type === "color" ? { p: 0, height: 32 } : undefined}
      {...props}
    />
  );
}

const measurementLabels: Record<SceneGrid["measurement"]["type"], string> = {
  chebyshev: "Chebyshev",
  alternating: "Alternating",
  euclidean: "Euclidean",
  manhattan: "Manhattan",
};

/** The GM changes the settings of the scene they are viewing, open or not */
function SceneControls() {
  const { scene, person, readOnly, setSettings } = useScene();
  const [expanded, setExpanded] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [scale, setScale] = useState(scene?.grid.measurement.scale || "");
  useEffect(() => { setScale(scene?.grid.measurement.scale || ""); }, [scene?.grid.measurement.scale]);
  if (!scene || person.role !== "gm") return null;
  const grid = scene.grid;
  function change(fields: Partial<SceneGrid>) {
    setSettings({ grid: { ...grid, ...fields } });
  }
  return (
    <Box>
      <IconButton ref={buttonRef} aria-expanded={expanded} aria-haspopup="dialog" aria-label="Scene Controls" title="Scene Controls" onClick={() => setExpanded(!expanded)}><GridOnIcon /></IconButton>
      <MapMenu
        contentLabel="Scene Controls"
        isOpen={expanded}
        onRequestClose={() => setExpanded(false)}
        excludeNode={buttonRef.current}
        top={16}
        right={76}
        style={{ width: "min(272px, calc(100vw - 92px))", maxHeight: "calc(100vh - 32px)", overflowY: "auto" }}
      >
        <Box p={3} onKeyDown={(event) => { if (event.key !== "Escape" && event.key !== "Tab") event.stopPropagation(); }} onKeyUp={(event) => event.stopPropagation()}>
          <Label htmlFor="scene-grid-type">Grid type</Label>
          <Select id="scene-grid-type" value={grid.type} disabled={readOnly} onChange={(event) => change(withGridType(grid, event.target.value as GridType))}>
            <option value="square">Square</option>
            <option value="hexVertical">Vertical Hex</option>
            <option value="hexHorizontal">Horizontal Hex</option>
          </Select>
          <Label><Checkbox checked={grid.shown} disabled={readOnly} onChange={(event) => change({ shown: event.target.checked })} />Show grid</Label>
          <Label><Checkbox checked={grid.snap} disabled={readOnly} onChange={(event) => change({ snap: event.target.checked })} />Snap to grid</Label>
          <Label htmlFor="scene-measurement">Measurement</Label>
          <Select id="scene-measurement" value={measurementShown(grid)} disabled={readOnly} onChange={(event) => change({ measurement: { ...grid.measurement, type: event.target.value as SceneGrid["measurement"]["type"] } })}>
            {measurementsOffered(grid.type).map((type) => <option key={type} value={type}>{measurementLabels[type]}</option>)}
          </Select>
          <Label htmlFor="scene-scale">Measurement scale</Label>
          <Input id="scene-scale" value={scale} disabled={readOnly} onChange={(event) => setScale(event.target.value)} onBlur={() => change({ measurement: { ...grid.measurement, scale } })} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />
          <Label htmlFor="scene-grid-opacity">Grid opacity</Label>
          <SettledInput id="scene-grid-opacity" type="range" min={0} max={1} step={0.05} value={String(grid.opacity)} disabled={readOnly} onSettle={(value) => change({ opacity: parseFloat(value) })} />
          <Label htmlFor="scene-grid-line-width">Grid line width</Label>
          <SettledInput id="scene-grid-line-width" type="range" min={minGridLineWidth} max={maxGridLineWidth} step={0.1} value={String(grid.lineWidth)} disabled={readOnly} onSettle={(value) => change({ lineWidth: parseFloat(value) })} />
          <Label htmlFor="scene-grid-color">Grid colour</Label>
          <SettledInput id="scene-grid-color" type="color" value={grid.color.toLowerCase()} disabled={readOnly} onSettle={(value) => change({ color: value })} />
          <Label><Checkbox checked={scene.fogFill} disabled={readOnly} onChange={(event) => setSettings({ fogFill: event.target.checked })} />Fog Fill</Label>
          <Label title="Show the distance moved while dragging a token."><Checkbox checked={scene.movementMode} disabled={readOnly} onChange={(event) => setSettings({ movementMode: event.target.checked })} />Movement mode</Label>
          <Label title="Only the GM can change a view-only scene. Players can still pan, zoom, point and measure."><Checkbox checked={scene.viewOnly} disabled={readOnly} onChange={(event) => setSettings({ viewOnly: event.target.checked })} />View-only</Label>
        </Box>
      </MapMenu>
    </Box>
  );
}

export default SceneControls;
