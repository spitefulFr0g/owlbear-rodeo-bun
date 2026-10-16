import { MapToolId } from "../types/Map";

export type SpacePanState<T> = {
  tool: MapToolId;
  panFrom: MapToolId | null;
  shape: T | null;
};

type SpacePanEvent =
  | { type: "down"; repeat: boolean }
  | { type: "up" }
  | { type: "availability"; active: boolean; editable: boolean };

/** Space temporarily suspends a tool; deliberate switches still cancel its work. */
export function spacePanTransition<T>(
  state: SpacePanState<T>,
  event: SpacePanEvent
): SpacePanState<T> {
  if (event.type === "availability") {
    return {
      ...state,
      shape: event.editable && (event.active || state.panFrom === state.tool)
        ? state.shape : null,
    };
  }
  if (event.type === "down") {
    if (event.repeat || state.panFrom !== null) return state;
    return { ...state, tool: "move", panFrom: state.tool };
  }
  return {
    ...state,
    tool: state.tool === "move" && state.panFrom !== null
      ? state.panFrom : state.tool,
    panFrom: null,
  };
}
