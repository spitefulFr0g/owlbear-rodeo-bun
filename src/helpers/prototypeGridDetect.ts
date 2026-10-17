// PROTOTYPE for "Which way of measuring a printed grid the alignment tool uses" (#178).
// Throwaway: a whole-map lattice fit, one axis at a time. Not production code.

export type Axis = { cell: number; origin: number; strength: number; shown: number; lines: number };
export type Fit = { width: number; height: number; x: number; y: number; strength: number; shown: number; grid: boolean };

// Neighbour distances, so thin and thick lines both peak at their centre.
const SPANS = [2, 4, 7];
const D = 7;

/** Line evidence along each axis: how much each column (or row) stands out from its neighbours. */
export function profiles(gray: Float32Array, w: number, h: number) {
  const px = new Float32Array(w);
  const py = new Float32Array(h);
  for (const d of SPANS) {
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = d; x < w - d; x++) {
        px[x] += gray[row + x] - (gray[row + x - d] + gray[row + x + d]) / 2;
      }
    }
    for (let y = d; y < h - d; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        py[y] += gray[row + x] - (gray[row - d * w + x] + gray[row + d * w + x]) / 2;
      }
    }
  }
  return { x: normalise(smooth(px), h), y: normalise(smooth(py), w) };
}

// A triangle over five samples, so a thick line's flat top peaks at its centre.
function smooth(p: Float32Array) {
  const out = new Float32Array(p.length);
  const k = [1, 2, 3, 2, 1];
  for (let i = 2; i < p.length - 2; i++) {
    let s = 0;
    for (let j = 0; j < 5; j++) s += Math.abs(p[i + j - 2]) * k[j];
    out[i] = s / 9;
  }
  return out;
}

// Absolute evidence, as a z-score against the whole profile.
function normalise(p: Float32Array, n: number) {
  const a = new Float32Array(p.length);
  for (let i = 0; i < p.length; i++) a[i] = Math.abs(p[i] / n);
  let mu = 0;
  for (let i = D; i < a.length - D; i++) mu += a[i];
  mu /= a.length - 2 * D;
  let v = 0;
  for (let i = D; i < a.length - D; i++) v += (a[i] - mu) ** 2;
  const sigma = Math.sqrt(v / (a.length - 2 * D)) || 1;
  for (let i = 0; i < a.length; i++) a[i] = i < D || i >= a.length - D ? 0 : (a[i] - mu) / sigma;
  return a;
}

function at(a: Float32Array, t: number) {
  const i = Math.floor(t);
  const f = t - i;
  return a[i] * (1 - f) + (a[i + 1] ?? 0) * f;
}

/** Mean evidence on the lattice origin + k * cell, or with `z` its sum over the root of the count. */
function score(a: Float32Array, cell: number, origin: number, z = false) {
  let sum = 0;
  let n = 0;
  const start = origin - Math.floor(origin / cell) * cell;
  for (let k = 0, t = start; t < a.length - D - 1; k++, t = start + k * cell) {
    if (t < D) continue;
    sum += at(a, t);
    n++;
  }
  return n ? sum / (z ? Math.sqrt(n) : n) : 0;
}

function bestPhase(a: Float32Array, cell: number, step: number) {
  let best = -Infinity;
  let origin = 0;
  for (let o = 0; o < cell; o += step) {
    const s = score(a, cell, o, true);
    if (s > best) { best = s; origin = o; }
  }
  return { best, origin };
}

/**
 * Fit one axis between min and max cells. Ranking by the evidence's sum over
 * the root of the line count makes a lattice beat its multiples (more lines)
 * and its halves (half the lines empty).
 */
export function fitAxis(a: Float32Array, min = 8, max = a.length / 3): Axis {
  let best = -Infinity, cell = min, origin = 0;
  for (let c = min; c <= max; c *= 1.003) {
    const r = bestPhase(a, c, 0.5);
    if (r.best > best) { best = r.best; cell = c; origin = r.origin; }
  }
  // A lattice whose in-between positions all show lines too is a coarse
  // multiple of the real one, as with a heavy line every fifth cell.
  const mean = score(a, cell, origin);
  for (let k = 8; k >= 2; k--) {
    const c = cell / k;
    if (c < min) continue;
    let ok = true;
    for (let j = 1; j < k && ok; j++) ok = score(a, cell, origin + j * c) >= Math.max(1, 0.1 * mean);
    if (ok) { cell = c; origin %= c; break; }
  }
  return refine(a, cell, origin);
}

function refine(a: Float32Array, cell: number, origin: number): Axis {
  let best = score(a, cell, origin);
  for (const [span, step, ospan, ostep] of [[0.01, 0.0005, 1, 0.1], [0.001, 0.00005, 0.15, 0.02]]) {
    const c0 = cell, o0 = origin;
    for (let f = -span; f <= span; f += step) {
      const c = c0 * (1 + f);
      for (let o = o0 - ospan; o <= o0 + ospan; o += ostep) {
        const s = score(a, c, o);
        if (s > best) { best = s; cell = c; origin = o; }
      }
    }
  }
  // Locate each line by the centroid of its evidence and fit position = origin + n * cell.
  const half = Math.max(2, Math.min(6, cell / 6));
  const start = origin - Math.floor(origin / cell) * cell;
  const pts: [number, number, number][] = [];
  let shown = 0, total = 0;
  for (let k = 0, t = start; t < a.length - D - 1; k++, t = start + k * cell) {
    if (t < D) continue;
    total++;
    let sw = 0, sx = 0;
    for (let i = Math.ceil(t - half); i <= Math.floor(t + half); i++) {
      const v = Math.max(0, a[i] ?? 0);
      sw += v; sx += v * i;
    }
    if (at(a, t) < 1 || sw === 0) continue;
    shown++;
    pts.push([k, sx / sw, sw]);
  }
  if (pts.length >= 3) {
    let w = 0, mk = 0, mx = 0;
    for (const [k, x, v] of pts) { w += v; mk += v * k; mx += v * x; }
    mk /= w; mx /= w;
    let skk = 0, skx = 0;
    for (const [k, x, v] of pts) { skk += v * (k - mk) ** 2; skx += v * (k - mk) * (x - mx); }
    if (skk > 0) {
      cell = skx / skk;
      origin = mx - cell * mk;
    }
  }
  return { cell, origin: ((origin % cell) + cell) % cell, strength: best, shown: total ? shown / total : 0, lines: total };
}

/** Fit both axes of a grayscale image scaled by `scale` from the original, in original pixels. */
export function detect(gray: Float32Array, w: number, h: number, scale: number, near?: { width: number; height: number }) {
  const p = profiles(gray, w, h);
  const ax = near ? fitAxis(p.x, near.width * scale * 0.8, near.width * scale * 1.25) : fitAxis(p.x);
  const ay = near ? fitAxis(p.y, near.height * scale * 0.8, near.height * scale * 1.25) : fitAxis(p.y);
  // Index i is the pixel covering [i, i + 1), so its centre is i + 0.5.
  const fit: Fit = {
    width: ax.cell / scale,
    height: ay.cell / scale,
    x: (ax.origin + 0.5) / scale,
    y: (ay.origin + 0.5) / scale,
    strength: Math.min(ax.strength, ay.strength),
    shown: Math.min(ax.shown, ay.shown),
    grid: Math.min(ax.shown, ay.shown) >= SHOWN_AT_LEAST && Math.min(ax.lines, ay.lines) >= 5,
  };
  return fit;
}

/** A grid is reported only when this share of its lines show on both axes. Tuned on the test maps. */
export const SHOWN_AT_LEAST = 0.7;
