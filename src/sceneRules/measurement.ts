import { SceneGrid, Vector2 } from "./types";

const sqrt3 = Math.sqrt(3);

/** A cell's width and height in world units, and the radius of the circle around it */
export type CellSize = { width: number; height: number; radius: number };

/**
 * The size of one cell. The grid's units are the distance between the middles
 * of two neighbouring cells, so a hex is that wide across its flat sides.
 */
export function cellSize(grid: SceneGrid): CellSize {
  const units = grid.unitsPerCell;
  const radius = units / sqrt3;
  switch (grid.type) {
    case "hexVertical":
      return { width: units, height: radius * 2, radius };
    case "hexHorizontal":
      return { width: radius * 2, height: units, radius };
    default:
      return { width: units, height: units, radius: units / 2 };
  }
}

// Cells are named by column and row. Square cell 0, 0 has its top left corner
// on the origin. Hex cell 0, 0 fits in that same corner, and every other row
// (vertical) or column (horizontal) sits half a cell back.

function cellMiddle(grid: SceneGrid, cell: Vector2): Vector2 {
  const size = cellSize(grid);
  const half = { x: size.width / 2, y: size.height / 2 };
  switch (grid.type) {
    case "hexVertical":
      return {
        x: half.x + size.width * (cell.x - 0.5 * (cell.y & 1)),
        y: half.y + size.radius * 1.5 * cell.y,
      };
    case "hexHorizontal":
      return {
        x: half.x + size.radius * 1.5 * cell.x,
        y: half.y + size.height * (cell.y - 0.5 * (cell.x & 1)),
      };
    default:
      return {
        x: half.x + size.width * cell.x,
        y: half.y + size.height * cell.y,
      };
  }
}

type Cube = { x: number; y: number; z: number };

function roundCube(cube: Cube): Cube {
  let x = Math.round(cube.x);
  let y = Math.round(cube.y);
  let z = Math.round(cube.z);
  const xDiff = Math.abs(x - cube.x);
  const yDiff = Math.abs(y - cube.y);
  const zDiff = Math.abs(z - cube.z);
  if (xDiff > yDiff && xDiff > zDiff) x = -y - z;
  else if (yDiff > zDiff) y = -x - z;
  else z = -x - y;
  return { x, y, z };
}

function cellToCube(grid: SceneGrid, cell: Vector2): Cube {
  if (grid.type === "hexVertical") {
    const x = cell.x - (cell.y + (cell.y & 1)) / 2;
    return { x, y: -x - cell.y, z: cell.y };
  }
  const z = cell.y - (cell.x + (cell.x & 1)) / 2;
  return { x: cell.x, y: -cell.x - z, z };
}

/** The cell a point is in */
function cellAt(grid: SceneGrid, point: Vector2): Vector2 {
  const size = cellSize(grid);
  if (grid.type === "square") {
    return {
      x: Math.floor(point.x / size.width),
      y: Math.floor(point.y / size.height),
    };
  }
  // From the middle of hex 0, 0, through cube coordinates
  const x = point.x - size.width / 2;
  const y = point.y - size.height / 2;
  if (grid.type === "hexVertical") {
    const cubeX = ((sqrt3 / 3) * x - y / 3) / size.radius;
    const cubeZ = ((2 / 3) * y) / size.radius;
    const cube = roundCube({ x: cubeX, y: -cubeX - cubeZ, z: cubeZ });
    return { x: cube.x + (cube.z + (cube.z & 1)) / 2, y: cube.z };
  }
  const cubeX = ((2 / 3) * x) / size.radius;
  const cubeZ = (-x / 3 + (sqrt3 / 3) * y) / size.radius;
  const cube = roundCube({ x: cubeX, y: -cubeX - cubeZ, z: cubeZ });
  return { x: cube.x, y: cube.z + (cube.x + (cube.x & 1)) / 2 };
}

function cellCorners(grid: SceneGrid, middle: Vector2): Vector2[] {
  const size = cellSize(grid);
  if (grid.type === "square") {
    const x = size.width / 2;
    const y = size.height / 2;
    return [
      { x: middle.x - x, y: middle.y - y },
      { x: middle.x + x, y: middle.y - y },
      { x: middle.x + x, y: middle.y + y },
      { x: middle.x - x, y: middle.y + y },
    ];
  }
  // A vertical hex has a corner straight up, a horizontal one straight right
  const first = grid.type === "hexVertical" ? -90 : 0;
  return [0, 60, 120, 180, 240, 300].map((turn) => {
    const angle = ((first + turn) * Math.PI) / 180;
    return {
      x: middle.x + size.radius * Math.cos(angle),
      y: middle.y + size.radius * Math.sin(angle),
    };
  });
}

/**
 * A point moved onto the grid when it is close enough: to the middle of the
 * cell it is in, or to one of that cell's corners.
 *
 * @param sensitivity How close is close enough, as a part of a cell: 0 never
 * snaps, 1 snaps from a whole cell away
 */
export function snapPosition(
  grid: SceneGrid,
  position: Vector2,
  sensitivity: number,
  corners = true
): Vector2 {
  const size = cellSize(grid);
  const middle = cellMiddle(grid, cellAt(grid, position));
  const snapPoints = corners ? [middle, ...cellCorners(grid, middle)] : [middle];
  const reach = Math.min(size.width, size.height) * sensitivity;
  for (const point of snapPoints) {
    if (Math.hypot(position.x - point.x, position.y - point.y) < reach) {
      return point;
    }
  }
  return position;
}

/**
 * How far apart two points are in cells, by the grid's measurement. A hex
 * grid has no diagonals, so every measurement on it but the straight line
 * counts the hexes stepped through.
 */
export function gridDistance(grid: SceneGrid, a: Vector2, b: Vector2): number {
  const type = grid.measurement.type;
  if (type === "euclidean") {
    return Math.hypot(a.x - b.x, a.y - b.y) / grid.unitsPerCell;
  }
  const aCell = cellAt(grid, a);
  const bCell = cellAt(grid, b);
  if (grid.type !== "square") {
    const aCube = cellToCube(grid, aCell);
    const bCube = cellToCube(grid, bCell);
    return (
      (Math.abs(aCube.x - bCube.x) +
        Math.abs(aCube.y - bCube.y) +
        Math.abs(aCube.z - bCube.z)) /
      2
    );
  }
  const x = Math.abs(aCell.x - bCell.x);
  const y = Math.abs(aCell.y - bCell.y);
  if (type === "manhattan") return x + y;
  if (type === "alternating") {
    // Every second diagonal counts twice, as in D&D 3.5 and Pathfinder
    return Math.max(x, y) + Math.floor(0.5 * Math.min(x, y));
  }
  return Math.max(x, y);
}
