// Persisted grid coordinates are plain values, shared with the server.
type GridPoint = { x: number; y: number };

export type GridInset = {
  /** Top left position of the inset */
  topLeft: GridPoint;
  /** Bottom right position of the inset */
  bottomRight: GridPoint;
};

export type GridMeasurementType =
  | "chebyshev"
  | "alternating"
  | "euclidean"
  | "manhattan";

export type GridMeasurement = {
  type: GridMeasurementType;
  scale: string;
};

export type GridType = "square" | "hexVertical" | "hexHorizontal";

export type Grid = {
  /** The inset of the grid from the map */
  inset: GridInset;
  /** The number of columns and rows of the grid as `x` and `y` */
  size: GridPoint;
  type: GridType;
  measurement: GridMeasurement;
};

export type GridScale = {
  /** The number multiplier of the scale */
  multiplier: number;
  /** The unit of the scale */
  unit: string;
  /** The precision of the scale */
  digits: number;
};
