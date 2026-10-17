const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const jpeg = require("jpeg-js");

const root = path.resolve(__dirname, "..");
const SQRT3 = Math.sqrt(3);

// Test maps for map alignment (#175). Each generated map's printed grid is drawn
// from its spec, so its answer is exact. Real maps are measured by hand and kept
// out of the repository; alignment-maps-real.json holds their answers.
const CONVENTION = "Positions are image pixels; pixel column x covers [x, x + 1). "
  + "A square grid's origin is the crossing of a vertical and a horizontal printed line nearest the image's top-left corner, "
  + "and columns and rows count the cells across the image. "
  + "A hex grid's origin is the centre of the hex nearest that corner, and radius runs from a centre to a corner; "
  + "hexVertical hexes have a point at the top, hexHorizontal hexes a flat side. "
  + "kind none means the map has no printed grid. "
  + "A real map's tolerance is how far, in pixels, its printed lines may lie from the lines its answer gives.";

const INK = [36, 30, 24];
const CHALK = [236, 234, 222];

const MAPS = [
  {
    name: "control", width: 1400, height: 1050, art: "parchment", seed: 1,
    grid: { kind: "square", cell: { width: 70, height: 70 }, origin: { x: 0, y: 0 }, line: { width: 2, alpha: 0.85 } },
    about: "Clean dark lines on plain parchment, starting at the top-left corner.",
  },
  {
    name: "cut-edges", width: 1330, height: 910, art: "parchment", seed: 2,
    grid: { kind: "square", cell: { width: 70, height: 70 }, origin: { x: 23, y: -31 }, line: { width: 2, alpha: 0.85 } },
    about: "Every edge of the image cuts through a cell.",
  },
  {
    name: "off-square", width: 1440, height: 1035, art: "parchment", seed: 3,
    grid: { kind: "square", cell: { width: 72, height: 69 }, origin: { x: 10, y: -5 }, line: { width: 2, alpha: 0.85 } },
    about: "Cells 72 px wide and 69 px tall, like a stretched export.",
  },
  {
    name: "fractional", width: 1270, height: 889, art: "parchment", seed: 4,
    grid: { kind: "square", cell: { width: 63.5, height: 63.5 }, origin: { x: 21.25, y: -9.75 }, line: { width: 2, alpha: 0.85 } },
    about: "A cell of 63.5 px, so the lines fall between pixels.",
  },
  {
    name: "faint", width: 1200, height: 900, art: "parchment", seed: 5,
    grid: { kind: "square", cell: { width: 60, height: 60 }, origin: { x: -17, y: 12 }, line: { width: 1, alpha: 0.1 } },
    about: "One-pixel lines at a tenth of full strength.",
  },
  {
    name: "heavy", width: 1500, height: 1000, art: "parchment", seed: 6,
    grid: { kind: "square", cell: { width: 100, height: 100 }, origin: { x: 40, y: 40 }, line: { width: 6, alpha: 1, colour: [12, 10, 8] } },
    about: "Six-pixel black lines.",
  },
  {
    name: "major-every-5th", width: 1500, height: 1000, art: "parchment", seed: 7,
    grid: {
      kind: "square", cell: { width: 50, height: 50 }, origin: { x: 15, y: -20 },
      line: { width: 1, alpha: 0.45, major: { every: 5, width: 3, alpha: 0.9 } },
    },
    about: "Thin lines with a heavy line every fifth cell, counted from the origin; the cell is the thin spacing.",
  },
  {
    name: "dashed", width: 1280, height: 960, art: "parchment", seed: 8,
    grid: {
      kind: "square", cell: { width: 64, height: 64 }, origin: { x: -8, y: 28 },
      line: { width: 2, alpha: 0.8, dash: { on: 10, off: 6 } },
    },
    about: "Dashed lines, 10 px on and 6 px off, with a dash centred on each crossing.",
  },
  {
    name: "busy", width: 1600, height: 1200, art: "busy", seed: 9, clutter: true,
    grid: { kind: "square", cell: { width: 80, height: 80 }, origin: { x: -25, y: 33 }, line: { width: 1.5, alpha: 0.6, colour: [20, 20, 20] } },
    about: "Thin lines over terrain, walls at any angle, and rocks drawn over the lines.",
  },
  {
    name: "light-lines", width: 1500, height: 1125, art: "cave", seed: 10,
    grid: { kind: "square", cell: { width: 75, height: 75 }, origin: { x: 0, y: 30.5 }, line: { width: 2, alpha: 0.4, colour: CHALK } },
    about: "Pale lines on a dark cave floor.",
  },
  {
    name: "large", width: 4410, height: 3010, art: "busy", seed: 11, clutter: true,
    grid: { kind: "square", cell: { width: 140, height: 140 }, origin: { x: 35, y: 60 }, line: { width: 3, alpha: 0.55, colour: [20, 20, 20] } },
    about: "A large export: 140 px cells, over 4000 px across, on busy art.",
  },
  {
    name: "hex-pointy", width: 1400, height: 1000, art: "parchment", seed: 12,
    grid: { kind: "hexVertical", radius: 40, origin: { x: 31, y: 17 }, line: { width: 2, alpha: 0.85 } },
    about: "Hexes with a point at the top (hexVertical).",
  },
  {
    name: "hex-flat", width: 1400, height: 1000, art: "busy", seed: 13,
    grid: { kind: "hexHorizontal", radius: 45, origin: { x: -12, y: 20 }, line: { width: 2, alpha: 0.7, colour: [20, 20, 20] } },
    about: "Hexes with a flat side at the top (hexHorizontal), over terrain.",
  },
  {
    name: "no-grid-busy", width: 1600, height: 1200, art: "busy", seed: 14, clutter: true,
    about: "Terrain, walls and rocks with no printed grid.",
  },
  {
    name: "no-grid-blank", width: 1000, height: 800, art: "parchment", seed: 15,
    about: "Plain parchment with no printed grid.",
  },
];
const busy = MAPS.find(map => map.name === "busy");
MAPS.push({ ...busy, name: "busy-jpeg", format: "jpeg", quality: 70, about: "The busy map saved as a JPEG at quality 70." });

const ART = {
  parchment: { noise: [[160, 0.7], [23, 0.3]], palette: [[0, [210, 192, 154]], [1, [240, 228, 198]]], grain: 8 },
  busy: {
    noise: [[180, 0.55], [45, 0.3], [9, 0.15]],
    palette: [[0, [46, 88, 118]], [0.4, [72, 122, 142]], [0.45, [196, 178, 128]], [0.53, [92, 130, 66]], [1, [54, 70, 50]]],
    grain: 26, walls: true,
  },
  cave: { noise: [[140, 0.7], [20, 0.3]], palette: [[0, [20, 22, 30]], [1, [64, 68, 80]]], grain: 10 },
};
const WALL = [38, 32, 28];
const ROCK = [120, 116, 108];

function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function blend(rgb, i, colour, alpha) {
  rgb[i] += (colour[0] - rgb[i]) * alpha;
  rgb[i + 1] += (colour[1] - rgb[i + 1]) * alpha;
  rgb[i + 2] += (colour[2] - rgb[i + 2]) * alpha;
}

// Smooth noise: random values on a lattice `step` px apart, eased between, added at `amount`.
// The lattice is turned to a random angle so it adds no rows or columns of its own to the art.
function addNoise(field, width, height, step, amount, rand) {
  const reach = Math.hypot(width, height);
  const cols = Math.ceil((2 * reach) / step) + 2;
  const lattice = Float64Array.from({ length: cols * cols }, rand);
  const angle = rand() * Math.PI * 2, cos = Math.cos(angle), sin = Math.sin(angle);
  const ease = t => t * t * (3 - 2 * t);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u = (x * cos + y * sin + reach) / step, v = (y * cos - x * sin + reach) / step;
      const i = Math.floor(u), tx = ease(u - i);
      const j = Math.floor(v), ty = ease(v - j);
      const top = lattice[j * cols + i] + (lattice[j * cols + i + 1] - lattice[j * cols + i]) * tx;
      const bottom = lattice[(j + 1) * cols + i] + (lattice[(j + 1) * cols + i + 1] - lattice[(j + 1) * cols + i]) * tx;
      field[y * width + x] += (top + (bottom - top) * ty) * amount;
    }
  }
}

function stroke(rgb, width, height, from, to, thickness, colour, alpha) {
  const pad = thickness / 2 + 1;
  const dx = to[0] - from[0], dy = to[1] - from[1], length2 = dx * dx + dy * dy || 1;
  for (let y = Math.max(0, Math.floor(Math.min(from[1], to[1]) - pad)); y < Math.min(height, Math.ceil(Math.max(from[1], to[1]) + pad)); y++) {
    for (let x = Math.max(0, Math.floor(Math.min(from[0], to[0]) - pad)); x < Math.min(width, Math.ceil(Math.max(from[0], to[0]) + pad)); x++) {
      const t = Math.min(1, Math.max(0, ((x + 0.5 - from[0]) * dx + (y + 0.5 - from[1]) * dy) / length2));
      const d = Math.hypot(x + 0.5 - from[0] - t * dx, y + 0.5 - from[1] - t * dy);
      const cover = Math.min(1, Math.max(0, thickness / 2 + 0.5 - d));
      if (cover > 0) blend(rgb, (y * width + x) * 3, colour, cover * alpha);
    }
  }
}

function rock(rgb, width, height, cx, cy, r) {
  for (let y = Math.max(0, Math.floor(cy - r - 3)); y < Math.min(height, Math.ceil(cy + r + 3)); y++) {
    for (let x = Math.max(0, Math.floor(cx - r - 3)); x < Math.min(width, Math.ceil(cx + r + 3)); x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const i = (y * width + x) * 3;
      const inside = Math.min(1, Math.max(0, r + 0.5 - d));
      if (inside > 0) blend(rgb, i, ROCK, inside);
      const edge = Math.min(1, Math.max(0, 2 - Math.abs(d - r)));
      if (edge > 0) blend(rgb, i, WALL, edge);
    }
  }
}

function paintArt(map) {
  const { width, height } = map;
  const style = ART[map.art];
  const rand = random(map.seed);
  const field = new Float64Array(width * height);
  for (const [step, amount] of style.noise) addNoise(field, width, height, step, amount, rand);
  const rgb = new Uint8ClampedArray(width * height * 3);
  const stops = style.palette;
  for (let p = 0; p < width * height; p++) {
    const t = field[p];
    let s = 1;
    while (s < stops.length - 1 && t > stops[s][0]) s++;
    const [t0, a] = stops[s - 1], [t1, b] = stops[s];
    const f = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
    const grain = (rand() - 0.5) * style.grain;
    for (let c = 0; c < 3; c++) rgb[p * 3 + c] = a[c] + (b[c] - a[c]) * f + grain;
  }
  if (style.walls) {
    // Walls anywhere and at any angle; a quarter of them run square to the image.
    for (let n = Math.round((width * height) / 60000); n > 0; n--) {
      const from = [rand() * width, rand() * height];
      const angle = rand() < 0.25 ? Math.floor(rand() * 4) * (Math.PI / 2) : rand() * Math.PI * 2;
      const length = 80 + rand() * 500;
      stroke(rgb, width, height, from, [from[0] + Math.cos(angle) * length, from[1] + Math.sin(angle) * length], 3 + rand() * 7, WALL, 0.9);
    }
  }
  return rgb;
}

// Rocks drawn after the grid, hiding parts of its lines.
function paintClutter(rgb, map) {
  const rand = random(map.seed + 1000);
  for (let n = Math.round((map.width * map.height) / 90000); n > 0; n--) {
    rock(rgb, map.width, map.height, rand() * map.width, rand() * map.height, 6 + rand() * 24);
  }
}

// How strongly the nearest printed line covers each pixel column (or row).
function lineCover(length, cell, origin, line) {
  const out = new Float64Array(length);
  for (let i = 0; i < length; i++) {
    const k = Math.round((i + 0.5 - origin) / cell);
    const { width, alpha } = line.major && k % line.major.every === 0 ? line.major : line;
    const centre = origin + k * cell;
    const overlap = Math.min(i + 1, centre + width / 2) - Math.max(i, centre - width / 2);
    out[i] = Math.min(1, Math.max(0, overlap)) * alpha;
  }
  return out;
}

// How much of each pixel along a line the dashes cover; a dash is centred on each crossing.
function dashCover(length, origin, dash) {
  const out = new Float64Array(length).fill(1);
  if (!dash) return out;
  const period = dash.on + dash.off;
  for (let i = 0; i < length; i++) {
    const s = (((i - origin + dash.on / 2) % period) + period) % period;
    out[i] = Math.max(0, Math.min(s + 1, dash.on) - s) + Math.max(0, s + 1 - period);
  }
  return out;
}

// The centre of the hex holding a point, both relative to a hex centre at (0, 0).
function hexCentre(kind, r, x, y) {
  const q = kind === "hexVertical" ? ((SQRT3 / 3) * x - y / 3) / r : ((2 / 3) * x) / r;
  const s = kind === "hexVertical" ? ((2 / 3) * y) / r : (-x / 3 + (SQRT3 / 3) * y) / r;
  let rq = Math.round(q), rs = Math.round(s);
  const rt = Math.round(-q - s);
  const dq = Math.abs(rq - q), ds = Math.abs(rs - s), dt = Math.abs(rt + q + s);
  if (dq > dt && dq > ds) rq = -rt - rs;
  else if (dt <= ds) rs = -rq - rt;
  return kind === "hexVertical" ? [r * SQRT3 * (rq + rs / 2), 1.5 * r * rs] : [1.5 * r * rq, r * SQRT3 * (rs + rq / 2)];
}

function paintGrid(rgb, map) {
  const { width, height, grid } = map;
  const { line } = grid;
  const colour = line.colour || INK;
  if (grid.kind === "square") {
    const columns = lineCover(width, grid.cell.width, grid.origin.x, line);
    const rows = lineCover(height, grid.cell.height, grid.origin.y, line);
    const dashesDown = dashCover(height, grid.origin.y, line.dash);
    const dashesAcross = dashCover(width, grid.origin.x, line.dash);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const alpha = 1 - (1 - columns[x] * dashesDown[y]) * (1 - rows[y] * dashesAcross[x]);
        if (alpha > 0) blend(rgb, (y * width + x) * 3, colour, alpha);
      }
    }
    return;
  }
  // A pixel's distance to its hex's nearest edge is the inradius less its furthest reach along an edge normal.
  const inradius = (grid.radius * SQRT3) / 2;
  const normals = grid.kind === "hexVertical"
    ? [[1, 0], [0.5, SQRT3 / 2], [-0.5, SQRT3 / 2]]
    : [[0, 1], [SQRT3 / 2, 0.5], [SQRT3 / 2, -0.5]];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const px = x + 0.5 - grid.origin.x, py = y + 0.5 - grid.origin.y;
      const [cx, cy] = hexCentre(grid.kind, grid.radius, px, py);
      const reach = Math.max(...normals.map(([nx, ny]) => Math.abs((px - cx) * nx + (py - cy) * ny)));
      const cover = Math.min(1, Math.max(0, line.width / 2 + 0.5 - (inradius - reach)));
      if (cover > 0) blend(rgb, (y * width + x) * 3, colour, cover * line.alpha);
    }
  }
}

function render(map, { grid = true } = {}) {
  const rgb = paintArt(map);
  if (grid && map.grid) paintGrid(rgb, map);
  if (map.clutter) paintClutter(rgb, map);
  return { width: map.width, height: map.height, data: rgb };
}

const round = value => Math.round(value * 10000) / 10000;

function nearCorner(value, cell) {
  const wrapped = ((value % cell) + cell) % cell;
  return round(wrapped > cell / 2 ? wrapped - cell : wrapped);
}

function fileName(map) {
  return `${map.name}.${map.format === "jpeg" ? "jpg" : "png"}`;
}

function answer(map) {
  const { grid } = map;
  const entry = { file: fileName(map), kind: grid ? grid.kind : "none", width: map.width, height: map.height };
  if (grid && grid.kind === "square") {
    entry.cell = grid.cell;
    entry.origin = { x: nearCorner(grid.origin.x, grid.cell.width), y: nearCorner(grid.origin.y, grid.cell.height) };
    entry.columns = round(map.width / grid.cell.width);
    entry.rows = round(map.height / grid.cell.height);
  } else if (grid) {
    const r = grid.radius;
    const [x, y] = hexCentre(grid.kind, r, -grid.origin.x, -grid.origin.y);
    entry.radius = r;
    entry.cell = grid.kind === "hexVertical" ? { width: round(r * SQRT3), height: 2 * r } : { width: 2 * r, height: round(r * SQRT3) };
    entry.origin = { x: round(grid.origin.x + x), y: round(grid.origin.y + y) };
  }
  if (grid) entry.lines = (grid.line.colour || INK)[0] > 128 ? "light" : "dark";
  entry.about = map.about;
  return entry;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typed = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
}

// An 8-bit RGB PNG with no row filters.
function encodePng({ width, height, data }) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const rows = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) rows.set(data.subarray(y * width * 3, (y + 1) * width * 3), y * (width * 3 + 1) + 1);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", zlib.deflateSync(rows)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function encodeJpeg({ width, height, data }, quality) {
  const rgba = Buffer.alloc(width * height * 4, 255);
  for (let p = 0; p < width * height; p++) rgba.set(data.subarray(p * 3, p * 3 + 3), p * 4);
  return jpeg.encode({ width, height, data: rgba }, quality).data;
}

function readRealMaps() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, "alignment-maps-real.json"), "utf8")).maps;
}

// Write the generated maps, any real maps found in `real` whose bytes match, and answers.json.
function writeSet(out, { only, real, realMaps = readRealMaps() } = {}) {
  fs.mkdirSync(out, { recursive: true });
  const maps = [];
  for (const map of MAPS) {
    if (only && !only.includes(map.name)) continue;
    const image = render(map);
    fs.writeFileSync(path.join(out, fileName(map)), map.format === "jpeg" ? encodeJpeg(image, map.quality) : encodePng(image));
    maps.push(answer(map));
  }
  const skipped = [];
  for (const entry of real ? realMaps : []) {
    const source = path.join(real, entry.file);
    if (!fs.existsSync(source)) {
      skipped.push(`${entry.file}: not in ${real}`);
      continue;
    }
    const bytes = fs.readFileSync(source);
    if (crypto.createHash("sha256").update(bytes).digest("hex") !== entry.sha256) {
      skipped.push(`${entry.file}: its bytes differ from the map that was measured`);
      continue;
    }
    fs.writeFileSync(path.join(out, entry.file), bytes);
    maps.push(entry);
  }
  fs.writeFileSync(path.join(out, "answers.json"), `${JSON.stringify({ convention: CONVENTION, maps }, null, 2)}\n`);
  return { maps, skipped };
}

function describe(entry) {
  if (entry.kind === "none") return "no printed grid";
  const where = `${entry.origin.x}, ${entry.origin.y}`;
  if (entry.kind === "square") return `square, cell ${entry.cell.width} x ${entry.cell.height} px, origin ${where}`;
  return `${entry.kind}, radius ${entry.radius} px, centre ${where}`;
}

module.exports = { MAPS, CONVENTION, answer, render, writeSet };

if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!["--out", "--real"].includes(args[i]) || !args[i + 1]) {
      console.error("usage: node scripts/alignment-maps.cjs [--out <folder>] [--real <folder of real maps>]");
      process.exit(2);
    }
    options[args[i].slice(2)] = path.resolve(args[i + 1]);
  }
  const out = options.out || path.join(root, "alignment-maps");
  const { maps, skipped } = writeSet(out, { real: options.real });
  for (const entry of maps) console.log(`${entry.file}: ${describe(entry)}`);
  for (const line of skipped) console.error(`skipped ${line}`);
  console.log(`wrote ${maps.length} maps and answers.json to ${out}`);
}
