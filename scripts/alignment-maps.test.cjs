const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const jpeg = require("jpeg-js");
const { MAPS, answer, render, writeSet } = require("./alignment-maps.cjs");

const SQRT3 = Math.sqrt(3);
const gridded = MAPS.filter(map => map.grid && map.format !== "jpeg");
const realMaps = JSON.parse(fs.readFileSync(path.join(__dirname, "alignment-maps-real.json"), "utf8")).maps;

// Which pixels the grid changes: the map rendered with its grid against the same map without it.
const changes = new Map();
function changed(map) {
  if (!changes.has(map.name)) {
    const a = render(map).data, b = render(map, { grid: false }).data;
    const out = new Uint8Array(map.width * map.height);
    for (let p = 0; p < out.length; p++) out[p] = a[p * 3] !== b[p * 3] || a[p * 3 + 1] !== b[p * 3 + 1] || a[p * 3 + 2] !== b[p * 3 + 2] ? 1 : 0;
    changes.set(map.name, out);
  }
  return changes.get(map.name);
}

function widest(line) {
  return Math.max(line.width, line.major ? line.major.width : 0);
}

function fromLine(value, origin, cell) {
  const d = (((value - origin) % cell) + cell) % cell;
  return Math.min(d, cell - d);
}

// Hex centres and edges built from an answer alone, by stepping along the lattice.
function hexCentres({ kind, radius: r, origin }, width, height) {
  const [u, v] = kind === "hexVertical" ? [[r * SQRT3, 0], [(r * SQRT3) / 2, 1.5 * r]] : [[1.5 * r, (r * SQRT3) / 2], [0, r * SQRT3]];
  const n = Math.ceil(Math.hypot(width, height) / r) + 2;
  const out = [];
  for (let i = -n; i <= n; i++) {
    for (let j = -n; j <= n; j++) {
      const x = origin.x + i * u[0] + j * v[0], y = origin.y + i * u[1] + j * v[1];
      if (x > -2 * r && x < width + 2 * r && y > -2 * r && y < height + 2 * r) out.push([x, y]);
    }
  }
  return out;
}

function hexEdges(entry, width, height) {
  const start = entry.kind === "hexVertical" ? Math.PI / 6 : 0;
  const corner = ([x, y], i) => [x + entry.radius * Math.cos(start + (i * Math.PI) / 3), y + entry.radius * Math.sin(start + (i * Math.PI) / 3)];
  return hexCentres(entry, width, height).flatMap(centre => [0, 1, 2, 3, 4, 5].map(i => [corner(centre, i), corner(centre, i + 1)]));
}

function toSegment([x, y], [[ax, ay], [bx, by]]) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - ax - t * dx, y - ay - t * dy);
}

function decodePng(bytes) {
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  const chunks = {}, idat = [];
  for (let at = 8; at < bytes.length;) {
    const length = bytes.readUInt32BE(at);
    const type = bytes.toString("ascii", at + 4, at + 8);
    assert.equal(bytes.readUInt32BE(at + 8 + length), zlib.crc32(bytes.subarray(at + 4, at + 8 + length)), `${type} checksum`);
    if (type === "IDAT") idat.push(bytes.subarray(at + 8, at + 8 + length));
    else chunks[type] = bytes.subarray(at + 8, at + 8 + length);
    at += 12 + length;
  }
  assert.ok(chunks.IEND);
  const width = chunks.IHDR.readUInt32BE(0), height = chunks.IHDR.readUInt32BE(4);
  const rows = zlib.inflateSync(Buffer.concat(idat));
  const data = new Uint8ClampedArray(width * height * 3);
  for (let y = 0; y < height; y++) data.set(rows.subarray(y * (width * 3 + 1) + 1, (y + 1) * (width * 3 + 1)), y * width * 3);
  return { width, height, data };
}

test("every pixel a generated grid changes lies on a line or hex edge its answer gives", () => {
  for (const map of gridded) {
    const entry = answer(map);
    const marks = changed(map);
    const reach = widest(map.grid.line) / 2 + 0.5;
    if (entry.kind === "square") {
      for (let y = 0; y < map.height; y++) {
        const nearRow = fromLine(y + 0.5, entry.origin.y, entry.cell.height) < reach;
        for (let x = 0; x < map.width; x++) {
          if (!marks[y * map.width + x] || nearRow) continue;
          assert.ok(fromLine(x + 0.5, entry.origin.x, entry.cell.width) < reach, `${map.name} changed (${x}, ${y}) away from every line`);
        }
      }
      continue;
    }
    const size = 16, across = Math.ceil(map.width / size) + 1;
    const buckets = new Map();
    for (const edge of hexEdges(entry, map.width, map.height)) {
      const [[ax, ay], [bx, by]] = edge;
      for (let j = Math.floor((Math.min(ay, by) - reach) / size); j <= Math.floor((Math.max(ay, by) + reach) / size); j++) {
        for (let i = Math.floor((Math.min(ax, bx) - reach) / size); i <= Math.floor((Math.max(ax, bx) + reach) / size); i++) {
          const key = j * across + i;
          if (!buckets.has(key)) buckets.set(key, []);
          buckets.get(key).push(edge);
        }
      }
    }
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (!marks[y * map.width + x]) continue;
        const near = buckets.get(Math.floor((y + 0.5) / size) * across + Math.floor((x + 0.5) / size)) || [];
        const distance = Math.min(Infinity, ...near.map(edge => toSegment([x + 0.5, y + 0.5], edge)));
        assert.ok(distance < reach, `${map.name} changed (${x}, ${y}) ${distance.toFixed(2)} px from every hex edge`);
      }
    }
  }
});

test("every line and hex edge an answer gives is drawn on its map", () => {
  for (const map of gridded) {
    const entry = answer(map);
    const marks = changed(map);
    const reach = map.grid.line.width / 2 + 0.5;
    if (entry.kind === "square") {
      for (const [axis, length, across] of [["x", map.width, map.height], ["y", map.height, map.width]]) {
        const cell = axis === "x" ? entry.cell.width : entry.cell.height;
        for (let centre = entry.origin[axis]; centre <= length; centre += cell) {
          if (centre < 0) continue;
          let seen = 0;
          for (let t = 0; t < across; t++) {
            for (let s = Math.max(0, Math.floor(centre - reach)); s < Math.min(length, Math.ceil(centre + reach)); s++) {
              if (Math.abs(s + 0.5 - centre) < reach && marks[axis === "x" ? t * map.width + s : s * map.width + t]) {
                seen++;
                break;
              }
            }
          }
          assert.ok(seen >= across / 2, `${map.name}: the line at ${axis} = ${centre} shows on ${seen} of ${across} pixels`);
        }
      }
      for (let y = entry.origin.y; y < map.height && !map.clutter; y += entry.cell.height) {
        for (let x = entry.origin.x; x < map.width; x += entry.cell.width) {
          if (x >= 0 && y >= 0) assert.equal(marks[Math.floor(y) * map.width + Math.floor(x)], 1, `${map.name}: the crossing at (${x}, ${y}) is not drawn`);
        }
      }
      continue;
    }
    for (const [[ax, ay], [bx, by]] of hexEdges(entry, map.width, map.height)) {
      const x = Math.floor((ax + bx) / 2), y = Math.floor((ay + by) / 2);
      if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
      assert.equal(marks[y * map.width + x], 1, `${map.name}: the hex edge through (${x}, ${y}) is not drawn`);
    }
  }
});

test("answers name the printed corner or hex centre nearest the image's top-left corner", () => {
  for (const entry of [...MAPS.map(answer), ...realMaps]) {
    if (entry.kind === "none") continue;
    if (entry.kind === "square") {
      for (const [axis, size, cell] of [["x", "width", entry.cell.width], ["y", "height", entry.cell.height]]) {
        assert.ok(entry.origin[axis] > -cell / 2 && entry.origin[axis] <= cell / 2, `${entry.file} ${axis} origin ${entry.origin[axis]}`);
        assert.ok(Math.abs(entry[axis === "x" ? "columns" : "rows"] - entry[size] / cell) < 0.001, `${entry.file} counts its cells`);
      }
      continue;
    }
    const nearest = Math.min(...hexCentres(entry, entry.width, entry.height).map(([x, y]) => Math.hypot(x, y)));
    assert.ok(Math.hypot(entry.origin.x, entry.origin.y) <= nearest + 1e-9, `${entry.file} names a hex centre that is not the nearest`);
    const across = entry.radius * SQRT3, along = 2 * entry.radius;
    assert.deepEqual(entry.cell, entry.kind === "hexVertical"
      ? { width: Math.round(across * 10000) / 10000, height: along }
      : { width: along, height: Math.round(across * 10000) / 10000 });
  }
  for (const entry of realMaps) {
    assert.match(entry.sha256, /^[0-9a-f]{64}$/);
    if (entry.kind !== "none") assert.ok(entry.tolerance >= 1, `${entry.file} tolerance`);
  }
});

test("the same spec renders the same pixels every time", () => {
  const map = MAPS.find(spec => spec.name === "busy");
  const hash = () => crypto.createHash("sha256").update(render(map).data).digest("hex");
  assert.equal(hash(), hash());
});

test("a written set decodes to the rendered maps, and its JPEG stays close to the map it was made from", t => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "alignment-maps-"));
  t.after(() => fs.rmSync(out, { recursive: true, force: true }));
  const { maps } = writeSet(out, { only: ["control", "busy-jpeg"], realMaps: [] });
  const written = JSON.parse(fs.readFileSync(path.join(out, "answers.json"), "utf8"));
  assert.deepEqual(written.maps, maps);
  assert.deepEqual(maps.map(entry => entry.file), ["control.png", "busy-jpeg.jpg"]);
  assert.match(written.convention, /top-left/);

  const control = render(MAPS.find(spec => spec.name === "control"));
  const png = decodePng(fs.readFileSync(path.join(out, "control.png")));
  assert.deepEqual([png.width, png.height], [control.width, control.height]);
  const first = png.data.findIndex((value, i) => value !== control.data[i]);
  assert.equal(first, -1, `control.png differs from its render at byte ${first}`);

  const busy = render(MAPS.find(spec => spec.name === "busy"));
  const photo = jpeg.decode(fs.readFileSync(path.join(out, "busy-jpeg.jpg")));
  assert.deepEqual([photo.width, photo.height], [busy.width, busy.height]);
  let total = 0;
  for (let p = 0; p < busy.width * busy.height; p++) {
    for (let c = 0; c < 3; c++) total += Math.abs(photo.data[p * 4 + c] - busy.data[p * 3 + c]);
  }
  const mean = total / (busy.width * busy.height * 3);
  assert.ok(mean > 0.5 && mean < 8, `the JPEG differs from the PNG by ${mean.toFixed(2)} levels on average`);
});

test("real maps are copied into the set only when their bytes match the measured map", t => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "alignment-real-"));
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "alignment-out-"));
  t.after(() => {
    fs.rmSync(folder, { recursive: true, force: true });
    fs.rmSync(out, { recursive: true, force: true });
  });
  const sha = text => crypto.createHash("sha256").update(text).digest("hex");
  fs.writeFileSync(path.join(folder, "measured.png"), "the measured map");
  fs.writeFileSync(path.join(folder, "edited.png"), "an edited copy");
  const entries = [
    { file: "measured.png", sha256: sha("the measured map"), kind: "none" },
    { file: "edited.png", sha256: sha("the original"), kind: "none" },
    { file: "absent.png", sha256: sha("never supplied"), kind: "none" },
  ];
  const { maps, skipped } = writeSet(out, { only: [], real: folder, realMaps: entries });
  assert.deepEqual(maps, [entries[0]]);
  assert.equal(fs.readFileSync(path.join(out, "measured.png"), "utf8"), "the measured map");
  assert.deepEqual(fs.readdirSync(out).sort(), ["answers.json", "measured.png"]);
  assert.equal(skipped.length, 2);
  assert.match(skipped[0], /^edited\.png: its bytes differ/);
  assert.match(skipped[1], /^absent\.png: not in /);
});
