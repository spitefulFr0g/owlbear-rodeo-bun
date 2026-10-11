import { defaultSceneGrid, SceneGrid } from "../sceneRules";
import { cellSize, snapPosition } from "./grid";
import { gridLines } from "./gridLines";

const square = defaultSceneGrid;
const hexVertical: SceneGrid = { ...square, type: "hexVertical" };
const hexHorizontal: SceneGrid = { ...square, type: "hexHorizontal" };

/** Every stretch between two neighbouring points of the lines, once each */
function edges(lines: number[][]) {
  const found = new Set<string>();
  const name = (x: number, y: number) => `${x.toFixed(2)},${y.toFixed(2)}`;
  for (const line of lines) {
    for (let i = 2; i < line.length; i += 2) {
      const ends = [name(line[i - 2], line[i - 1]), name(line[i], line[i + 1])];
      found.add(ends.sort().join(" "));
    }
  }
  return found;
}

function edgeLengths(lines: number[][]) {
  const lengths: number[] = [];
  for (const line of lines) {
    for (let i = 2; i < line.length; i += 2) {
      lengths.push(Math.hypot(line[i] - line[i - 2], line[i + 1] - line[i - 1]));
    }
  }
  return lengths;
}

describe("the lines of a square grid", () => {
  test("run along every cell edge across the view", () => {
    const lines = gridLines(square, { x: 10, y: 20, width: 300, height: 150 });
    const upright = lines.filter((line) => line[0] === line[2]);
    const level = lines.filter((line) => line[1] === line[3]);
    expect(upright.length + level.length).toBe(lines.length);
    expect(upright.map((line) => line[0])).toEqual(
      expect.arrayContaining([150, 300])
    );
    expect(level.map((line) => line[1])).toEqual(expect.arrayContaining([150]));
    for (const line of upright) {
      expect(line[0] % 150).toBe(0);
      expect(Math.min(line[1], line[3])).toBeLessThanOrEqual(20);
      expect(Math.max(line[1], line[3])).toBeGreaterThanOrEqual(170);
    }
    for (const line of level) {
      expect(line[1] % 150).toBe(0);
      expect(Math.min(line[0], line[2])).toBeLessThanOrEqual(10);
      expect(Math.max(line[0], line[2])).toBeGreaterThanOrEqual(310);
    }
  });

  test("are also drawn left of and above the origin", () => {
    const lines = gridLines(square, { x: -400, y: -400, width: 200, height: 200 });
    expect(lines.some((line) => line[0] === -300 && line[2] === -300)).toBe(true);
    expect(lines.some((line) => line[1] === -300 && line[3] === -300)).toBe(true);
  });
});

for (const grid of [hexVertical, hexHorizontal]) {
  describe(`the lines of a ${grid.type} grid`, () => {
    const view = { x: -700, y: -500, width: 1500, height: 1300 };
    const lines = gridLines(grid, view);

    test("join only cell corners, one cell side apart", () => {
      for (const line of lines) {
        for (let i = 0; i < line.length; i += 2) {
          const point = { x: line[i], y: line[i + 1] };
          const snapped = snapPosition(grid, point, 0.01);
          // A point that is no corner is not moved, and the middle is far off
          expect(Math.hypot(snapped.x - point.x, snapped.y - point.y)).toBeLessThan(0.001);
          expect(snapPosition(grid, point, 0.01, false)).toEqual(point);
        }
      }
      for (const length of edgeLengths(lines)) {
        expect(length).toBeCloseTo(cellSize(grid).radius, 5);
      }
    });

    test("draw no side twice", () => {
      expect(edges(lines).size).toBe(edgeLengths(lines).length);
    });

    test("draw all six sides of every cell in the view", () => {
      const drawn = edges(lines);
      const size = cellSize(grid);
      const name = (point: { x: number; y: number }) =>
        `${point.x.toFixed(2)},${point.y.toFixed(2)}`;
      const first = grid.type === "hexVertical" ? -90 : 0;
      let cells = 0;
      for (let x = view.x; x <= view.x + view.width; x += 40) {
        for (let y = view.y; y <= view.y + view.height; y += 40) {
          // The middle of whichever cell this point is in
          const middle = snapPosition(grid, { x, y }, 1, false);
          const corners = [0, 60, 120, 180, 240, 300].map((turn) => {
            const angle = ((first + turn) * Math.PI) / 180;
            return {
              x: middle.x + size.radius * Math.cos(angle),
              y: middle.y + size.radius * Math.sin(angle),
            };
          });
          corners.forEach((corner, index) => {
            const next = corners[(index + 1) % 6];
            // toFixed writes a zero that was reached from below as -0.00
            const side = [name(corner), name(next)]
              .map((end) => end.replace(/-0\.00/g, "0.00"))
              .sort()
              .join(" ");
            expect(drawn.has(side)).toBe(true);
          });
          cells++;
        }
      }
      expect(cells).toBeGreaterThan(100);
    });
  });
}
