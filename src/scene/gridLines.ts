import { SceneGrid } from "../sceneRules";

import { cellSize } from "./grid";

/** A part of the world, in world units */
export type WorldRect = { x: number; y: number; width: number; height: number };

/**
 * The grid's lines across a part of the world and a little beyond it, each a
 * run of points as x, y, x, y. A side shared by two cells is in one line only,
 * so lines drawn see-through do not darken where cells meet.
 */
export function gridLines(grid: SceneGrid, view: WorldRect): number[][] {
  const size = cellSize(grid);
  const lines: number[][] = [];
  if (grid.type === "square") {
    const left = Math.floor(view.x / size.width);
    const right = Math.ceil((view.x + view.width) / size.width);
    const top = Math.floor(view.y / size.height);
    const bottom = Math.ceil((view.y + view.height) / size.height);
    for (let column = left; column <= right; column++) {
      const x = column * size.width;
      lines.push([x, top * size.height, x, bottom * size.height]);
    }
    for (let row = top; row <= bottom; row++) {
      const y = row * size.height;
      lines.push([left * size.width, y, right * size.width, y]);
    }
    return lines;
  }

  // A horizontal hex grid is a vertical one with x and y changed over, so
  // both are worked out as rows of hexes with a corner straight up
  const vertical = grid.type === "hexVertical";
  const across = vertical
    ? { start: view.x, length: view.width }
    : { start: view.y, length: view.height };
  const down = vertical
    ? { start: view.y, length: view.height }
    : { start: view.x, length: view.width };
  const point = (a: number, b: number) => (vertical ? [a, b] : [b, a]);

  const radius = size.radius;
  // Corners are half a cell apart across, and every other one is a peak
  const step = grid.unitsPerCell / 2;
  const rowHeight = radius * 1.5;
  const first = Math.floor(across.start / step) - 1;
  const last = Math.ceil((across.start + across.length) / step) + 1;
  const firstRow = Math.floor(down.start / rowHeight) - 1;
  const lastRow = Math.ceil((down.start + down.length) / rowHeight);
  for (let row = firstRow; row <= lastRow; row++) {
    const peak = row * rowHeight;
    const shoulder = peak + radius / 2;
    // The two upper sides of every hex in the row, as one zigzag
    const zigzag: number[] = [];
    for (let corner = first; corner <= last; corner++) {
      const isPeak = ((corner + row) & 1) === 1;
      zigzag.push(...point(corner * step, isPeak ? peak : shoulder));
      // The side between this hex and the next one in the row
      if (!isPeak) {
        lines.push([
          ...point(corner * step, shoulder),
          ...point(corner * step, peak + rowHeight),
        ]);
      }
    }
    lines.push(zigzag);
  }
  return lines;
}
