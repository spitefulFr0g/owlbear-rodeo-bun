import { Change, Scene, Item, layers } from "./types";
import { maxItems, maxPoints, maxTextLength, maxMetadataBytes } from "./caps";
type Rule = (value: unknown) => boolean;
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" &&
  value !== null &&
  (Object.getPrototypeOf(value) === Object.prototype ||
    Object.getPrototypeOf(value) === null);
const number: Rule = (value) =>
  typeof value === "number" && Number.isFinite(value);
const string: Rule = (value) => typeof value === "string";
const boolean: Rule = (value) => typeof value === "boolean";
function shape(
  value: unknown,
  required: Record<string, Rule>,
  optional: Record<string, Rule> = {}
): boolean {
  return (
    object(value) &&
    Object.keys(required).every((key) =>
      Object.prototype.hasOwnProperty.call(value, key)
    ) &&
    Object.keys(value).every((key) =>
      Object.prototype.hasOwnProperty.call(required, key)
        ? required[key](value[key])
        : Object.prototype.hasOwnProperty.call(optional, key) &&
          optional[key](value[key])
    )
  );
}
const vector: Rule = (value) => shape(value, { x: number, y: number });
const points: Rule = (value) => Array.isArray(value) && value.every(vector);
const color: Rule = (value) => typeof value === "string" && value.length <= 32;
function json(value: unknown, seen: unknown[] = []): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (!object(value) && !Array.isArray(value)) return false;
  if (seen.includes(value)) return false;
  return Object.values(value).every((child) => json(child, [...seen, value]));
}
const metadata: Rule = (value) => object(value) && json(value);
const image: Rule = (value) =>
  object(value) &&
  (value.type === "default"
    ? shape(value, { type: (v) => v === "default", key: string })
    : shape(
        value,
        { type: (v) => v === "file", file: string },
        {
          thumbnail: string,
          resolutions: (v) =>
            shape(
              v,
              {},
              { low: string, medium: string, high: string, ultra: string }
            ),
        }
      ));
const outline: Rule = (value) =>
  object(value) &&
  (value.type === "circle"
    ? shape(value, {
        type: (v) => v === "circle",
        x: number,
        y: number,
        radius: number,
      })
    : value.type === "rect"
    ? shape(value, {
        type: (v) => v === "rect",
        x: number,
        y: number,
        width: number,
        height: number,
      })
    : shape(value, {
        type: (v) => v === "path",
        points: (v) =>
          Array.isArray(v) && v.length % 2 === 0 && v.every(number),
      }));
const geometry: Rule = (value) => {
  if (!object(value)) return false;
  const type =
    (name: string): Rule =>
    (v) =>
      v === name;
  switch (value.type) {
    case "rectangle":
      return shape(value, {
        type: type("rectangle"),
        width: number,
        height: number,
      });
    case "circle":
      return shape(value, { type: type("circle"), radius: number });
    case "triangle":
      return shape(value, {
        type: type("triangle"),
        points: (v) => points(v) && (v as unknown[]).length === 3,
      });
    case "polygon":
      return shape(value, {
        type: type("polygon"),
        points,
        holes: (v) => Array.isArray(v) && v.every(points),
      });
    default:
      return false;
  }
};
const base: Record<string, Rule> = {
  id: (v) => typeof v === "string" && v.length >= 1 && v.length <= 64,
  layer: (v) =>
    layers.some((layer) => layer === v) && v !== "grid" && v !== "ruler",
  position: vector,
  rotation: number,
  scale: vector,
  order: number,
  owner: string,
  locked: boolean,
  hidden: boolean,
  metadata,
};
const paint = { color, strokeWidth: number, blend: boolean };
const kinds: Record<string, Record<string, Rule>> = {
  image: { image, width: number, height: number, label: string, outline },
  shape: { geometry, ...paint, fill: boolean, cut: boolean },
  curve: { points, closed: boolean, ...paint, fill: boolean, cut: boolean },
  line: { points: (v) => points(v) && (v as unknown[]).length === 2, ...paint },
  text: { text: string, color, size: number, square: boolean },
};
function itemRules(kind: unknown): Record<string, Rule> | undefined {
  if (
    typeof kind !== "string" ||
    !Object.prototype.hasOwnProperty.call(kinds, kind)
  )
    return;
  return { ...base, kind: (v) => v === kind, ...kinds[kind] };
}
function pointCount(item: Item): number {
  if (item.kind === "curve" || item.kind === "line") return item.points.length;
  if (item.kind === "image")
    return item.outline.type === "path" ? item.outline.points.length / 2 : 0;
  if (item.kind !== "shape") return 0;
  const geometry = item.geometry;
  if (geometry.type === "triangle") return geometry.points.length;
  if (geometry.type === "polygon")
    return (
      geometry.points.length +
      geometry.holes.reduce((sum, hole) => sum + hole.length, 0)
    );
  return 0;
}
/** Validates shape first, then caps on the resulting item; missing items are left to applyChange. */
export function checkChange(
  scene: Scene,
  change: Change
): "invalid" | "cap" | undefined {
  if (!object(change)) return "invalid";
  let item: Item | undefined;
  if (change.type === "add") {
    const rules = itemRules(change.item && change.item.kind);
    if (
      !shape(change, {
        type: (v) => v === "add",
        item: (v) => !!rules && shape(v, rules),
      })
    )
      return "invalid";
    item = change.item;
  } else if (change.type === "update" || change.type === "delete") {
    if (!base.id(change.id)) return "invalid";
    if (change.type === "delete")
      return shape(change, { type: (v) => v === "delete", id: base.id })
        ? undefined
        : "invalid";
    const before = Object.prototype.hasOwnProperty.call(scene.items, change.id)
      ? scene.items[change.id]
      : undefined;
    const candidates = before ? [before.kind] : Object.keys(kinds);
    const validFields: Rule = (value) =>
      candidates.some((kind) => {
        const rules = itemRules(kind)!;
        delete rules.id;
        delete rules.kind;
        delete rules.order;
        return shape(value, {}, rules);
      });
    if (
      !shape(change, {
        type: (v) => v === "update",
        id: base.id,
        fields: validFields,
      })
    )
      return "invalid";
    if (!before) {
      const fields = change.fields;
      const geometry = fields.geometry;
      const count = fields.points
        ? fields.points.length
        : geometry && geometry.type === "polygon"
        ? geometry.points.length +
          geometry.holes.reduce((sum, hole) => sum + hole.length, 0)
        : fields.outline && fields.outline.type === "path"
        ? fields.outline.points.length / 2
        : 0;
      if (
        count > maxPoints ||
        (fields.text && fields.text.length > maxTextLength) ||
        (fields.label && fields.label.length > maxTextLength) ||
        (fields.metadata &&
          new TextEncoder().encode(JSON.stringify(fields.metadata)).length >
            maxMetadataBytes)
      )
        return "cap";
    }
    if (before) {
      const mergedMetadata = { ...before.metadata, ...change.fields.metadata };
      for (const key of Object.keys(mergedMetadata))
        if (
          mergedMetadata[key] === null &&
          change.fields.metadata &&
          Object.prototype.hasOwnProperty.call(change.fields.metadata, key)
        )
          delete mergedMetadata[key];
      item = { ...before, ...change.fields, metadata: mergedMetadata } as Item;
    }
  } else return "invalid";
  if (
    change.type === "add" &&
    !Object.prototype.hasOwnProperty.call(scene.items, change.item.id) &&
    Object.keys(scene.items).length >= maxItems
  )
    return "cap";
  if (
    item &&
    (pointCount(item) > maxPoints ||
      (item.kind === "text" && item.text.length > maxTextLength) ||
      (item.kind === "image" && item.label.length > maxTextLength) ||
      new TextEncoder().encode(JSON.stringify(item.metadata)).length >
        maxMetadataBytes)
  )
    return "cap";
  return;
}
