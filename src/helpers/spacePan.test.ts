import { spacePanTransition, SpacePanState } from "./spacePan";
import { MapToolId } from "../types/Map";

for (const tool of ["drawing", "fog"] as MapToolId[]) {
  test(`Space keeps an unfinished ${tool} and returns to its tool`, () => {
    const shape = { points: [{ x: 10, y: 20 }, { x: 30, y: 40 }] };
    const initial: SpacePanState<typeof shape> = { tool, panFrom: null, shape };
    const panning = spacePanTransition(initial, { type: "down", repeat: false });
    expect(panning).toEqual({ tool: "move", panFrom: tool, shape });
    expect(spacePanTransition(panning, { type: "down", repeat: true })).toEqual(panning);
    expect(spacePanTransition({ ...panning, tool }, {
      type: "availability", active: false, editable: true,
    }).shape).toBe(shape);
    expect(spacePanTransition(panning, { type: "up" })).toEqual(initial);
  });

  test(`a deliberate switch cancels an unfinished ${tool}`, () => {
    expect(spacePanTransition({ tool, panFrom: null, shape: { points: [1, 2] } }, {
      type: "availability", active: false, editable: true,
    }).shape).toBeNull();
  });

  test(`losing permission during Space cancels an unfinished ${tool}`, () => {
    expect(spacePanTransition({ tool, panFrom: tool, shape: { points: [1, 2] } }, {
      type: "availability", active: false, editable: false,
    }).shape).toBeNull();
  });
}

for (const tool of ["drawing", "fog", "select", "move"] as MapToolId[]) {
  test(`Space with no shape returns to ${tool}`, () => {
    const initial = { tool, panFrom: null, shape: null };
    const panning = spacePanTransition(initial, { type: "down", repeat: false });
    expect(panning.tool).toBe("move");
    expect(panning.shape).toBeNull();
    expect(spacePanTransition(panning, { type: "up" })).toEqual(initial);
  });
}

test("Space release leaves a deliberately chosen tool active", () => {
  expect(spacePanTransition({ tool: "note", panFrom: "drawing", shape: null }, {
    type: "up",
  })).toEqual({ tool: "note", panFrom: null, shape: null });
});
