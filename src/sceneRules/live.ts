import { maxChanges } from "./caps";
import { Vector2 as Point, Item, Person, RoomRules } from "./types";
import { mayChange } from "./permissions";
import { visibleTo } from "./visibility";

export type LiveKind = "pointer" | "ruler" | "drag";
export type LiveTransform = { id: string; position: Point; rotation: number; scale: Point };
export type LiveState = {
  pointer: { position: Point; visible: boolean };
  ruler: { start: Point; end: Point };
  drag: { items: LiveTransform[] };
};
export type LiveMessage = { [K in LiveKind]: { sceneId: string; kind: K; state: LiveState[K] | null } }[LiveKind];
export type ReceivedLiveMessage = LiveMessage & { connectionId: string };
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const id = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 64;
function point(value: unknown): Point | undefined {
  if (!object(value) || !finite(value.x) || !finite(value.y)) return;
  return { x: value.x, y: value.y };
}

/** Reads only the live wire fields; browser identity and metadata never escape. */
export function readLive(value: unknown): LiveMessage | undefined {
  if (!object(value) || !id(value.sceneId) || !["pointer", "ruler", "drag"].includes(value.kind as string)) return;
  const { sceneId, state } = value;
  const kind = value.kind as LiveKind;
  if (state === null) return { sceneId, kind, state: null };
  if (!object(state)) return;
  if (kind === "pointer") {
    const position = point(state.position);
    if (position && typeof state.visible === "boolean") return { sceneId, kind, state: { position, visible: state.visible } };
  } else if (kind === "ruler") {
    const start = point(state.start), end = point(state.end);
    if (start && end) return { sceneId, kind, state: { start, end } };
  } else if (Array.isArray(state.items) && state.items.length <= maxChanges) {
    const items: LiveTransform[] = [];
    for (const item of state.items) {
      if (!object(item) || !id(item.id) || !finite(item.rotation)) return;
      const position = point(item.position), scale = point(item.scale);
      if (!position || !scale) return;
      items.push({ id: item.id, position, rotation: item.rotation, scale });
    }
    return { sceneId, kind, state: { items } };
  }
}

/** Filter against authoritative items, never metadata supplied in a live packet. */
export function dragFrom(person: Person, rules: RoomRules, items: Record<string, Item>, drag: LiveTransform[]): LiveTransform[] {
  return drag.filter(transform => {
    const item = Object.prototype.hasOwnProperty.call(items, transform.id) ? items[transform.id] : undefined;
    return !!item && mayChange(person, rules, item, { type: "update", id: transform.id,
      fields: { position: transform.position, rotation: transform.rotation, scale: transform.scale } });
  });
}

/** Keep the same order while showing only items this receiver can see. */
export function dragFor(person: Person, items: Record<string, Item>, drag: LiveTransform[]): LiveTransform[] {
  return drag.filter(transform => Object.prototype.hasOwnProperty.call(items, transform.id) && visibleTo(person, items[transform.id]));
}
