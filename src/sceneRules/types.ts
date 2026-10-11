export type Vector2 = { x: number; y: number };

export const layers = [
  "map",
  "grid",
  "drawing",
  "prop",
  "mount",
  "character",
  "attachment",
  "note",
  "text",
  "ruler",
  "fog",
] as const; // bottom to top
export type Layer = (typeof layers)[number];
export type ItemKind = "image" | "shape" | "curve" | "line" | "text";

/** The owner value that means "the GM". Any other owner is a browser id. */
export const gmOwner = "gm";
/** The metadata name that holds a token's status rings: an array of colour names. */
export const statusRingsKey = "statusRings";

type BaseItem = {
  id: string; // made by the adding browser, 1 to 64 characters
  layer: Layer; // never "grid" or "ruler": those hold no items
  position: Vector2; // world units
  rotation: number; // degrees, about position
  scale: Vector2;
  order: number; // set by the server only
  owner: string; // gmOwner or a browser id; set by the server on add
  locked: boolean;
  hidden: boolean;
  metadata: Record<string, unknown>;
};

export type ImageSource =
  | { type: "default"; key: string } // built-in
  | {
      type: "file";
      file: string;
      thumbnail?: string; // stored file ids
      resolutions?: {
        low?: string;
        medium?: string;
        high?: string;
        ultra?: string;
      };
    };

// Image outlines use the same local pixel geometry as src/types/Outline.ts.
export type Outline =
  | { type: "circle"; x: number; y: number; radius: number }
  | { type: "rect"; x: number; y: number; width: number; height: number }
  | { type: "path"; points: number[] };

export type ImageItem = BaseItem & {
  kind: "image";
  image: ImageSource;
  width: number;
  height: number; // the image's natural size in pixels
  label: string;
  outline: Outline; // in the image's own pixels
};

export type ShapeGeometry =
  | { type: "rectangle"; width: number; height: number }
  | { type: "circle"; radius: number }
  | { type: "triangle"; points: Vector2[] } // exactly 3
  | { type: "polygon"; points: Vector2[]; holes: Vector2[][] };

export type ShapeItem = BaseItem & {
  kind: "shape";
  geometry: ShapeGeometry; // one field: replaced whole
  color: string;
  strokeWidth: number;
  fill: boolean;
  blend: boolean;
  cut: boolean; // means something on the Fog layer only
};

export type CurveItem = BaseItem & {
  kind: "curve";
  points: Vector2[];
  closed: boolean;
  color: string;
  strokeWidth: number;
  fill: boolean;
  blend: boolean;
  cut: boolean;
};

export type LineItem = BaseItem & {
  kind: "line";
  points: Vector2[]; // exactly 2
  color: string;
  strokeWidth: number;
  blend: boolean;
};

export type TextItem = BaseItem & {
  kind: "text";
  text: string;
  color: string; // the square's colour, or the text's when there is no square
  size: number; // side of the square, in world units at scale 1
  square: boolean; // true: a note (Note layer). false: text only (Text layer)
};

export type Item = ImageItem | ShapeItem | CurveItem | LineItem | TextItem;

export type GridType = "square" | "hexVertical" | "hexHorizontal";
export type SceneGrid = {
  type: GridType;
  unitsPerCell: number; // 150
  measurement: {
    type: "chebyshev" | "alternating" | "euclidean" | "manhattan";
    scale: string;
  };
  shown: boolean;
  snap: boolean;
};
export const defaultSceneGrid: SceneGrid = {
  type: "square",
  unitsPerCell: 150,
  measurement: { type: "chebyshev", scale: "5ft" },
  shown: true,
  snap: true,
};

export type Scene = {
  id: string;
  grid: SceneGrid;
  items: Record<string, Item>;
};

export type Change =
  | { type: "add"; item: Item }
  | { type: "update"; id: string; fields: ItemFields }
  | { type: "delete"; id: string };
export type Batch = { id: string; sceneId: string; changes: Change[] };

export type ItemFields = Partial<
  Omit<BaseItem, "id" | "order"> &
    Omit<ImageItem, keyof BaseItem | "kind"> &
    Omit<ShapeItem, keyof BaseItem | "kind"> &
    Omit<CurveItem, keyof BaseItem | "kind"> &
    Omit<LineItem, keyof BaseItem | "kind"> &
    Omit<TextItem, keyof BaseItem | "kind">
>;
