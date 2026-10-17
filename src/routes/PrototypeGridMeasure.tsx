// PROTOTYPE for "Which way of measuring a printed grid the alignment tool uses" (#178).
// Throwaway. Five ways of measuring a map's printed grid, switchable via ?variant=,
// on the test maps from `node scripts/alignment-maps.cjs --out public/prototype-alignment-maps`.
// Each variant reports an estimate (cell width and height, origin) in image pixels;
// the shared frame draws that grid across the whole map and scores it against answers.json.
import React, { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useHistory, useLocation } from "react-router-dom";
import { Box, Button, Flex, Text } from "theme-ui";

import { detect, Fit } from "../helpers/prototypeGridDetect";

const DIR = "/prototype-alignment-maps";

type Answer = {
  file: string;
  kind: "square" | "hexVertical" | "hexHorizontal" | "none";
  width: number;
  height: number;
  cell?: { width: number; height: number };
  origin?: { x: number; y: number };
  tolerance?: number;
  about?: string;
};
type Est = { w: number; h: number; x: number; y: number };
type P = { x: number; y: number };
type Ctx = { k: number; toImage: (e: { clientX: number; clientY: number }) => P };
type LogEntry = { map: string; variant: string; secs: number; err: number | null; pass: boolean | null };

// ---------- scoring ----------

function lines(cell: number, origin: number, from: number, to: number) {
  const out: number[] = [];
  if (!(cell > 1)) return out;
  for (let t = origin - Math.ceil((origin - from) / cell) * cell; t <= to; t += cell) out.push(t);
  return out;
}

// The furthest any printed line lies from the nearest estimated line, or the reverse, across the map.
function axisError(cell: number, origin: number, trueCell: number, trueOrigin: number, length: number) {
  const ours = lines(cell, origin, 0, length);
  const truth = lines(trueCell, trueOrigin, 0, length);
  const oursPad = lines(cell, origin, -cell, length + cell);
  const truthPad = lines(trueCell, trueOrigin, -trueCell, length + trueCell);
  let worst = 0;
  for (const a of truth) worst = Math.max(worst, Math.min(...oursPad.map((b) => Math.abs(a - b))));
  for (const a of ours) worst = Math.max(worst, Math.min(...truthPad.map((b) => Math.abs(a - b))));
  return worst;
}

function scoreOf(est: Est | null, ans: Answer) {
  if (ans.kind !== "square" || !ans.cell || !ans.origin) return null;
  if (!est) return null;
  const err = Math.max(
    axisError(est.w, est.x, ans.cell.width, ans.origin.x, ans.width),
    axisError(est.h, est.y, ans.cell.height, ans.origin.y, ans.height)
  );
  const tol = Math.max(1, ans.tolerance ?? 1);
  return { err, tol, pass: err <= tol, cellErr: err / ans.cell.width };
}

// ---------- detection ----------

const grayCache = new Map<string, { gray: Float32Array; w: number; h: number; scale: number }>();
function grayOf(img: HTMLImageElement) {
  const hit = grayCache.get(img.src);
  if (hit) return hit;
  const W = img.naturalWidth, H = img.naturalHeight;
  const scale = Math.min(1, 2400 / Math.max(W, H));
  const w = Math.round(W * scale), h = Math.round(H * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext("2d")!;
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = "high";
  c.drawImage(img, 0, 0, w, h);
  const data = c.getImageData(0, 0, w, h).data;
  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) gray[i] = (0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]) / 255;
  const out = { gray, w, h, scale };
  grayCache.set(img.src, out);
  return out;
}

function runDetect(img: HTMLImageElement, near?: { width: number; height: number }) {
  const t0 = performance.now();
  const g = grayOf(img);
  const fit = detect(g.gray, g.w, g.h, g.scale, near);
  return { fit, ms: performance.now() - t0 };
}

const fitToEst = (f: Fit): Est => ({ w: f.width, h: f.height, x: f.x, y: f.y });

// ---------- drag helper ----------

function drag(e: React.PointerEvent, ctx: Ctx, onMove: (p: P, start: P) => void, onUp?: () => void) {
  if (e.button !== 0) return;
  e.stopPropagation();
  e.preventDefault();
  const start = ctx.toImage(e);
  const move = (ev: PointerEvent) => onMove(ctx.toImage(ev), start);
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    onUp?.();
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

// ---------- shared frame: viewport, grid overlay, readout ----------

type FrameProps = {
  answer: Answer;
  img: HTMLImageElement;
  est: Est | null;
  /** Variant-owned overlay, in image pixels */
  overlay?: (ctx: Ctx) => ReactNode;
  /** Variant-owned controls */
  panel?: ReactNode;
  instructions: ReactNode;
  /** Left-button press on the map outside any variant handle */
  onMapPointerDown?: (e: React.PointerEvent, ctx: Ctx) => void;
  cursor?: string;
  variant: string;
  onDone: (entry: LogEntry) => void;
  log: LogEntry[];
};

function Frame({ answer, img, est, overlay, panel, instructions, onMapPointerDown, cursor, variant, onDone, log }: FrameProps) {
  const W = img.naturalWidth, H = img.naturalHeight;
  const box = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [showGrid, setShowGrid] = useState(true);
  const [space, setSpace] = useState(false);
  const [startedAt] = useState(() => performance.now());
  const [doneAt, setDoneAt] = useState<number | null>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    const el = box.current!;
    const r = el.getBoundingClientRect();
    const k = Math.min(r.width / W, r.height / H) * 0.96;
    setView({ k, x: (r.width - W * k) / 2, y: (r.height - H * k) / 2 });
  }, [W, H]);

  useEffect(() => {
    if (doneAt) return;
    const id = setInterval(() => tick((n) => n + 1), 100);
    return () => clearInterval(id);
  }, [doneAt]);

  useEffect(() => {
    const el = box.current!;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      setView((v) => {
        const k = Math.min(40, Math.max(0.02, v.k * Math.exp(-e.deltaY * 0.0015)));
        return { k, x: mx - ((mx - v.x) * k) / v.k, y: my - ((my - v.y) * k) / v.k };
      });
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, []);

  useEffect(() => {
    const typing = (e: KeyboardEvent) => e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement;
    const down = (e: KeyboardEvent) => {
      if (typing(e)) return;
      if (e.code === "Space") { setSpace(true); e.preventDefault(); }
      if (e.key === "g") setShowGrid((s) => !s);
    };
    const up = (e: KeyboardEvent) => { if (e.code === "Space") setSpace(false); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);

  const viewRef = useRef(view);
  viewRef.current = view;
  const ctx: Ctx = useMemo(() => ({
    k: view.k,
    toImage: (e) => {
      const r = box.current!.getBoundingClientRect();
      const v = viewRef.current;
      return { x: (e.clientX - r.left - v.x) / v.k, y: (e.clientY - r.top - v.y) / v.k };
    },
  }), [view.k]);

  function pan(e: React.PointerEvent) {
    const sx = e.clientX, sy = e.clientY, v0 = viewRef.current;
    const move = (ev: PointerEvent) => setView({ ...v0, x: v0.x + ev.clientX - sx, y: v0.y + ev.clientY - sy });
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function handleDown(e: React.PointerEvent) {
    if (e.button === 1 || e.button === 2 || (e.button === 0 && space)) {
      e.preventDefault();
      pan(e);
    }
  }

  const score = scoreOf(est, answer);
  const secs = ((doneAt ?? performance.now()) - startedAt) / 1000;
  const vx = est ? lines(est.w, est.x, 0, W) : [];
  const hy = est ? lines(est.h, est.y, 0, H) : [];
  const sw = 1;

  function done() {
    if (doneAt) return;
    const now = performance.now();
    setDoneAt(now);
    onDone({ map: answer.file, variant, secs: (now - startedAt) / 1000, err: score ? score.err : null, pass: score ? score.pass : null });
  }

  return (
    <Flex sx={{ flex: 1, minHeight: 0 }}>
      <Box
        ref={box}
        onPointerDownCapture={handleDown}
        onContextMenu={(e) => e.preventDefault()}
        sx={{ flex: 1, position: "relative", overflow: "hidden", bg: "#111", cursor: space ? "grab" : cursor || "crosshair", touchAction: "none" }}
      >
        <div style={{ position: "absolute", left: 0, top: 0, transformOrigin: "0 0", transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
          <img src={img.src} width={W} height={H} alt="" draggable={false} style={{ display: "block", imageRendering: view.k > 2 ? "pixelated" : "auto", userSelect: "none" }} />
          <svg width={W} height={H} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
            <rect x={0} y={0} width={W} height={H} fill="transparent" onPointerDown={(e) => !space && onMapPointerDown?.(e, ctx)} />
            {showGrid && est && (
              <g pointerEvents="none">
                {vx.map((x) => <line key={`a${x}`} x1={x} x2={x} y1={0} y2={H} stroke="black" strokeOpacity={0.5} strokeWidth={3 * sw} vectorEffect="non-scaling-stroke" />)}
                {hy.map((y) => <line key={`b${y}`} y1={y} y2={y} x1={0} x2={W} stroke="black" strokeOpacity={0.5} strokeWidth={3 * sw} vectorEffect="non-scaling-stroke" />)}
                {vx.map((x) => <line key={`c${x}`} x1={x} x2={x} y1={0} y2={H} stroke="#00e5ff" strokeWidth={sw} vectorEffect="non-scaling-stroke" />)}
                {hy.map((y) => <line key={`d${y}`} y1={y} y2={y} x1={0} x2={W} stroke="#00e5ff" strokeWidth={sw} vectorEffect="non-scaling-stroke" />)}
              </g>
            )}
            {overlay?.(ctx)}
          </svg>
        </div>
      </Box>
      <Flex sx={{ width: 330, flexDirection: "column", p: 3, gap: 2, overflowY: "auto", fontFamily: "body2", fontSize: 1, borderLeft: "1px solid", borderColor: "border" }}>
        <Text sx={{ fontFamily: "body2" }}>{instructions}</Text>
        <Text sx={{ fontFamily: "body2", color: "gray", fontSize: 0 }}>Wheel zooms. Right-drag, middle-drag or Space-drag pans. G hides the grid.</Text>
        {panel}
        <Box sx={{ borderTop: "1px solid", borderColor: "border", pt: 2 }}>
          <Text as="div" sx={{ fontFamily: "body2", fontSize: 4 }}>{secs.toFixed(1)} s {secs <= 30 ? "" : "⚠ over 30"}</Text>
          <Text as="div" sx={{ fontFamily: "monospace", fontSize: 0, whiteSpace: "pre" }}>
            {est
              ? `cell   ${est.w.toFixed(2)} × ${est.h.toFixed(2)} px\norigin ${est.x.toFixed(2)}, ${est.y.toFixed(2)}\nacross ${(W / est.w).toFixed(2)} × ${(H / est.h).toFixed(2)} cells`
              : "no estimate yet"}
            {"\n"}
            {answer.kind === "square" && answer.cell && answer.origin
              ? `answer ${answer.cell.width} × ${answer.cell.height}, ${answer.origin.x}, ${answer.origin.y}`
              : `answer: ${answer.kind} (no square answer)`}
          </Text>
          {score && (
            <Text as="div" sx={{ fontFamily: "body2", fontSize: 2, color: score.pass ? "#7dff9a" : "error" }}>
              {score.pass ? "On the lines" : "Off"}: worst line {score.err.toFixed(2)} px ({(score.cellErr * 100).toFixed(1)}% of a cell), tolerance {score.tol} px
            </Text>
          )}
          <Button mt={2} onClick={done} disabled={!!doneAt} sx={{ width: "100%" }}>{doneAt ? "Logged" : "Done"}</Button>
        </Box>
        <Box sx={{ borderTop: "1px solid", borderColor: "border", pt: 2 }}>
          <Text sx={{ fontFamily: "body2", fontWeight: "bold" }}>This session</Text>
          <Summary log={log} />
        </Box>
      </Flex>
    </Flex>
  );
}

function Summary({ log }: { log: LogEntry[] }) {
  const byVariant = new Map<string, LogEntry[]>();
  for (const e of log) byVariant.set(e.variant, [...(byVariant.get(e.variant) || []), e]);
  const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  return (
    <Box sx={{ fontFamily: "monospace", fontSize: 0, whiteSpace: "pre" }}>
      {[...byVariant].map(([v, es]) => {
        const scored = es.filter((e) => e.pass !== null);
        return `${v}: ${es.length} maps, median ${median(es.map((e) => e.secs)).toFixed(1)} s, on the lines ${scored.filter((e) => e.pass).length}/${scored.length}\n`;
      })}
      {log.slice(-8).reverse().map((e) => `${e.variant} ${e.map.slice(0, 18).padEnd(18)} ${e.secs.toFixed(1).padStart(5)}s ${e.err === null ? "  –" : e.err.toFixed(1).padStart(5) + "px"}\n`).join("")}
    </Box>
  );
}

type VariantProps = { answer: Answer; img: HTMLImageElement; frame: Omit<FrameProps, "est" | "overlay" | "panel" | "instructions" | "onMapPointerDown" | "cursor" | "answer" | "img"> };

// ---------- box editing shared by A, B, E ----------

type Rect = { l: number; t: number; r: number; b: number };
const norm = (q: Rect): Rect => ({ l: Math.min(q.l, q.r), r: Math.max(q.l, q.r), t: Math.min(q.t, q.b), b: Math.max(q.t, q.b) });

function useBox(onRelease?: (r: Rect) => void) {
  const [rect, setRect] = useState<Rect | null>(null);
  const rectRef = useRef(rect);
  rectRef.current = rect;
  const release = () => { if (rectRef.current) onRelease?.(norm(rectRef.current)); };

  function onMapPointerDown(e: React.PointerEvent, ctx: Ctx) {
    drag(e, ctx, (p, s) => setRect(norm({ l: s.x, t: s.y, r: p.x, b: p.y })), release);
  }

  function overlay(ctx: Ctx, dashed = false) {
    if (!rect) return null;
    const hit = 10 / ctx.k;
    const edge = (sides: (keyof Rect)[], _cursor: string) => (e: React.PointerEvent) => {
      const r0 = rect;
      drag(e, ctx, (p, s) => {
        const n = { ...r0 };
        for (const side of sides) n[side] = r0[side] + (side === "l" || side === "r" ? p.x - s.x : p.y - s.y);
        setRect(norm(n));
      }, release);
    };
    const { l, t, r, b } = rect;
    const hz = (y: number, side: keyof Rect) => <line x1={l} x2={r} y1={y} y2={y} stroke="transparent" strokeWidth={hit} style={{ cursor: "ns-resize" }} onPointerDown={edge([side], "ns")} />;
    const vt = (x: number, side: keyof Rect) => <line y1={t} y2={b} x1={x} x2={x} stroke="transparent" strokeWidth={hit} style={{ cursor: "ew-resize" }} onPointerDown={edge([side], "ew")} />;
    const corner = (x: number, y: number, sides: (keyof Rect)[], c: string) => (
      <rect x={x - hit / 2} y={y - hit / 2} width={hit} height={hit} fill="white" stroke="black" strokeWidth={1} vectorEffect="non-scaling-stroke" style={{ cursor: c }} onPointerDown={edge(sides, c)} />
    );
    return (
      <g>
        <rect x={l} y={t} width={r - l} height={b - t} fill="rgba(255,200,0,0.12)" stroke="#ffc800" strokeWidth={2} strokeDasharray={dashed ? "6 4" : undefined} vectorEffect="non-scaling-stroke" style={{ cursor: "move" }} onPointerDown={edge(["l", "r", "t", "b"], "move")} />
        {hz(t, "t")}{hz(b, "b")}{vt(l, "l")}{vt(r, "r")}
        {corner(l, t, ["l", "t"], "nwse-resize")}{corner(r, b, ["r", "b"], "nwse-resize")}
        {corner(r, t, ["r", "t"], "nesw-resize")}{corner(l, b, ["l", "b"], "nesw-resize")}
      </g>
    );
  }
  return { rect, setRect, onMapPointerDown, overlay };
}

// ---------- A: one cell ----------

function VariantA({ answer, img, frame }: VariantProps) {
  const box = useBox();
  const r = box.rect;
  const est = r && r.r - r.l > 2 && r.b - r.t > 2 ? { w: r.r - r.l, h: r.b - r.t, x: r.l, y: r.t } : null;
  return (
    <Frame {...frame} answer={answer} img={img} est={est} onMapPointerDown={box.onMapPointerDown} overlay={(c) => box.overlay(c)}
      instructions={<><b>One cell.</b> Drag a box over one printed cell. Drag its edges or corners onto the lines; drag inside to move it. The grid is carried across the whole map from that one cell.</>}
      panel={<Button variant="secondary" onClick={() => box.setRect(null)}>Clear</Button>}
    />
  );
}

// ---------- B: several cells, with their count ----------

function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <Flex sx={{ alignItems: "center", gap: 2 }}>
      <Text sx={{ fontFamily: "body2", width: 70 }}>{label}</Text>
      <Button variant="secondary" onClick={() => onChange(Math.max(1, value - 1))}>−</Button>
      <input type="number" min={1} value={value} onChange={(e) => onChange(Math.max(1, Number(e.target.value) || 1))} style={{ width: 60, fontSize: 16 }} />
      <Button variant="secondary" onClick={() => onChange(value + 1)}>+</Button>
    </Flex>
  );
}

function VariantB({ answer, img, frame }: VariantProps) {
  const box = useBox();
  const [cols, setCols] = useState(3);
  const [rows, setRows] = useState(3);
  const r = box.rect;
  const est = r && r.r - r.l > 2 && r.b - r.t > 2 ? { w: (r.r - r.l) / cols, h: (r.b - r.t) / rows, x: r.l, y: r.t } : null;
  return (
    <Frame {...frame} answer={answer} img={img} est={est} onMapPointerDown={box.onMapPointerDown} overlay={(c) => box.overlay(c)}
      instructions={<><b>Several cells, with their count.</b> Drag a box from one printed crossing to another several cells away (the further, the steadier), fit its edges, then say how many cells it spans across and down.</>}
      panel={<>
        <Stepper label="Across" value={cols} onChange={setCols} />
        <Stepper label="Down" value={rows} onChange={setRows} />
        <Button variant="secondary" onClick={() => box.setRect(null)}>Clear</Button>
      </>}
    />
  );
}

// ---------- C: three crossings ----------

function Marker({ p, label, ctx, onDown }: { p: P; label: string; ctx: Ctx; onDown: (e: React.PointerEvent) => void }) {
  const r = 7 / ctx.k, arm = 16 / ctx.k;
  return (
    <g style={{ cursor: "move" }} onPointerDown={onDown}>
      <circle cx={p.x} cy={p.y} r={arm} fill="transparent" />
      <line x1={p.x - arm} x2={p.x + arm} y1={p.y} y2={p.y} stroke="#ff3d7f" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      <line y1={p.y - arm} y2={p.y + arm} x1={p.x} x2={p.x} stroke="#ff3d7f" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      <circle cx={p.x} cy={p.y} r={r} fill="none" stroke="white" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      <text x={p.x + r * 1.4} y={p.y - r * 1.4} fontSize={14 / ctx.k} fill="white" stroke="black" strokeWidth={3 / ctx.k} paintOrder="stroke">{label}</text>
    </g>
  );
}

function VariantC({ answer, img, frame }: VariantProps) {
  const [pts, setPts] = useState<P[]>([]);
  const [fix, setFix] = useState({ n: 0, m: 0 });
  const [a, b, c] = pts;
  let est: Est | null = null;
  let counts: { n: number; m: number } | null = null;
  if (a && b) {
    let rw = Math.abs(b.x - a.x), rh = Math.abs(b.y - a.y);
    if (rw < 3) rw = rh;
    if (rh < 3) rh = rw;
    est = { w: rw, h: rh, x: a.x, y: a.y };
    if (c) {
      const dx = Math.abs(c.x - a.x), dy = Math.abs(c.y - a.y);
      const n = Math.max(0, Math.round(dx / rw) + fix.n), m = Math.max(0, Math.round(dy / rh) + fix.m);
      counts = { n, m };
      est = { w: n > 0 ? dx / n : rw, h: m > 0 ? dy / m : rh, x: a.x, y: a.y };
    }
  }
  const prompt = pts.length === 0 ? "Click a crossing of printed lines." : pts.length === 1 ? "Click the crossing diagonally next to it, one cell away." : pts.length === 2 ? "Click any crossing far away, near the opposite corner of the map." : "Drag any point to adjust.";
  return (
    <Frame {...frame} answer={answer} img={img} est={est}
      overlay={(ctx) => (
        <>
          <rect x={0} y={0} width={img.naturalWidth} height={img.naturalHeight} fill="transparent" pointerEvents={pts.length < 3 ? "all" : "none"}
            onPointerDown={(e) => { if (e.button !== 0 || pts.length >= 3) return; e.stopPropagation(); setPts([...pts, ctx.toImage(e)]); }} />
          {pts.map((p, i) => (
            <Marker key={i} p={p} label={String(i + 1)} ctx={ctx}
              onDown={(e) => drag(e, ctx, (q, s) => setPts((cur) => cur.map((o, j) => (j === i ? { x: p.x + q.x - s.x, y: p.y + q.y - s.y } : o))))} />
          ))}
        </>
      )}
      instructions={<><b>Three crossings.</b> {prompt} The tool works out how many cells lie between the first and last points from the first two, so nothing needs counting.</>}
      panel={<>
        {counts && <>
          <Text sx={{ fontFamily: "body2" }}>Between points 1 and 3: {counts.n} across, {counts.m} down. If the grid is a cell off, fix the count:</Text>
          <Stepper label="Across" value={counts.n} onChange={(v) => setFix({ ...fix, n: fix.n + v - counts!.n })} />
          <Stepper label="Down" value={counts.m} onChange={(v) => setFix({ ...fix, m: fix.m + v - counts!.m })} />
        </>}
        <Button variant="secondary" onClick={() => { setPts([]); setFix({ n: 0, m: 0 }); }}>Start again</Button>
      </>}
    />
  );
}

// ---------- D: detect, then correct ----------

function VariantD({ answer, img, frame }: VariantProps) {
  const [est, setEst] = useState<Est | null>(null);
  const [info, setInfo] = useState<string>("Looking for a printed grid…");
  const [noGrid, setNoGrid] = useState<Est | null>(null);
  const [square, setSquare] = useState(true);
  useEffect(() => {
    const id = setTimeout(() => {
      const { fit, ms } = runDetect(img);
      setSquare(Math.abs(fit.width - fit.height) / fit.width < 0.01);
      if (fit.grid) { setEst(fitToEst(fit)); setInfo(`Found a grid in ${ms.toFixed(0)} ms (${Math.round(fit.shown * 100)}% of its lines show).`); }
      else { setNoGrid(fitToEst(fit)); setInfo(`No printed grid found (${ms.toFixed(0)} ms).`); }
    }, 30);
    return () => clearTimeout(id);
  }, [img]);
  const size = (dw: number, dh: number, mul = 1) => setEst((e) => e && ({ ...e, w: e.w * mul + dw, h: square ? e.w * mul + dw : e.h * mul + dh }));
  const again = () => {
    if (!est) return;
    const { fit, ms } = runDetect(img, { width: est.w, height: est.h });
    setEst(fitToEst(fit));
    setInfo(`Looked again near ${est.w.toFixed(1)} px in ${ms.toFixed(0)} ms.`);
  };
  return (
    <Frame {...frame} answer={answer} img={img} est={est} cursor={est ? "move" : "default"}
      onMapPointerDown={(e, ctx) => { if (!est) return; const e0 = est; drag(e, ctx, (p, s) => setEst({ ...e0, x: e0.x + p.x - s.x, y: e0.y + p.y - s.y })); }}
      instructions={<><b>Detect, then correct.</b> The tool looks for the printed grid as the map opens. If the blue grid is off, drag the map to slide it, or change its size below.</>}
      panel={<>
        <Text sx={{ fontFamily: "body2" }}>{info}</Text>
        {!est && noGrid && <Button variant="secondary" onClick={() => setEst(noGrid)}>Show its best guess anyway</Button>}
        {est && <>
          <label style={{ fontFamily: "sans-serif" }}><input type="checkbox" checked={square} onChange={(e) => setSquare(e.target.checked)} /> Square cells</label>
          <Flex sx={{ gap: 1, flexWrap: "wrap" }}>
            <Text sx={{ fontFamily: "body2", width: "100%" }}>Width{square ? " and height" : ""}</Text>
            {[-1, -0.1, 0.1, 1].map((d) => <Button key={d} variant="secondary" onClick={() => size(d, 0)}>{d > 0 ? "+" : ""}{d}</Button>)}
          </Flex>
          {!square && <Flex sx={{ gap: 1, flexWrap: "wrap" }}>
            <Text sx={{ fontFamily: "body2", width: "100%" }}>Height</Text>
            {[-1, -0.1, 0.1, 1].map((d) => <Button key={d} variant="secondary" onClick={() => size(0, d)}>{d > 0 ? "+" : ""}{d}</Button>)}
          </Flex>}
          <Flex sx={{ gap: 1 }}>
            <Button variant="secondary" onClick={() => size(0, 0, 0.5)}>Half</Button>
            <Button variant="secondary" onClick={() => size(0, 0, 2)}>Double</Button>
            <Button variant="secondary" onClick={again}>Look again near this size</Button>
          </Flex>
        </>}
      </>}
    />
  );
}

// ---------- E: rough cell, then fit ----------

function VariantE({ answer, img, frame }: VariantProps) {
  const [fit, setFit] = useState<{ est: Est; ms: number } | null>(null);
  const [raw, setRaw] = useState(false);
  const box = useBox((r) => {
    if (r.r - r.l < 4 || r.b - r.t < 4) return;
    const { fit: f, ms } = runDetect(img, { width: r.r - r.l, height: r.b - r.t });
    // Keep the fitted lattice's phase, but name the crossing nearest the box's corner as its origin.
    const x = f.x + Math.round((r.l - f.x) / f.width) * f.width;
    const y = f.y + Math.round((r.t - f.y) / f.height) * f.height;
    setFit({ est: { w: f.width, h: f.height, x, y }, ms });
  });
  const r = box.rect;
  const drawn = r && r.r - r.l > 2 && r.b - r.t > 2 ? { w: r.r - r.l, h: r.b - r.t, x: r.l, y: r.t } : null;
  const est = raw ? drawn : fit?.est ?? null;
  return (
    <Frame {...frame} answer={answer} img={img} est={est} onMapPointerDown={(e, c) => { setFit(null); box.onMapPointerDown(e, c); }} overlay={(c) => box.overlay(c, true)}
      instructions={<><b>Rough cell, then fit.</b> Drag a box roughly over one printed cell. When you let go, the tool fits the grid to the printed lines across the whole map, starting from your box.</>}
      panel={<>
        <Text sx={{ fontFamily: "body2" }}>{fit ? `Fitted across the map in ${fit.ms.toFixed(0)} ms.` : r ? "…" : "No box yet."}</Text>
        <label style={{ fontFamily: "sans-serif" }}><input type="checkbox" checked={raw} onChange={(e) => setRaw(e.target.checked)} /> Use my box exactly as drawn</label>
        <Button variant="secondary" onClick={() => { box.setRect(null); setFit(null); }}>Clear</Button>
      </>}
    />
  );
}

// ---------- switcher and route ----------

const VARIANTS: { key: string; name: string; C: (p: VariantProps) => JSX.Element }[] = [
  { key: "A", name: "One cell", C: VariantA },
  { key: "B", name: "Several cells, with count", C: VariantB },
  { key: "C", name: "Three crossings", C: VariantC },
  { key: "D", name: "Detect, then correct", C: VariantD },
  { key: "E", name: "Rough cell, then fit", C: VariantE },
];

function PrototypeSwitcher({ current, onChange }: { current: number; onChange: (i: number) => void }) {
  const n = VARIANTS.length;
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || t.isContentEditable) return;
      if (e.key === "ArrowLeft") onChange((current + n - 1) % n);
      if (e.key === "ArrowRight") onChange((current + 1) % n);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [current, n, onChange]);
  const v = VARIANTS[current];
  const btn = { background: "none", border: "none", color: "black", fontSize: 18, cursor: "pointer", padding: "0 10px" };
  return (
    <div style={{ position: "fixed", bottom: 16, left: "50%", transform: "translateX(-50%)", background: "#fff", color: "#000", borderRadius: 999, padding: "6px 8px", boxShadow: "0 4px 16px rgba(0,0,0,0.5)", display: "flex", alignItems: "center", fontFamily: "sans-serif", fontSize: 14, zIndex: 1000 }}>
      <button style={btn} onClick={() => onChange((current + n - 1) % n)}>←</button>
      <span>{v.key} ({v.name})</span>
      <button style={btn} onClick={() => onChange((current + 1) % n)}>→</button>
    </div>
  );
}

function PrototypeGridMeasure() {
  const history = useHistory();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const vIndex = Math.max(0, VARIANTS.findIndex((v) => v.key === (params.get("variant") || "A")));
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [failed, setFailed] = useState<string>();

  useEffect(() => {
    fetch(`${DIR}/answers.json`).then((r) => r.json()).then((j) => setAnswers(j.maps)).catch(() => setFailed("No test maps. Run: node scripts/alignment-maps.cjs --out public/prototype-alignment-maps [--real <folder>]"));
  }, []);

  const mapName = params.get("map") || answers[0]?.file;
  const answer = answers.find((a) => a.file === mapName);

  const set = useCallback((changes: Record<string, string>) => {
    const p = new URLSearchParams(history.location.search);
    for (const [k, v] of Object.entries(changes)) p.set(k, v);
    history.replace({ search: p.toString() });
  }, [history]);

  useEffect(() => {
    if (!answer) return;
    setImg(null);
    const i = new Image();
    i.onload = () => setImg(i);
    i.src = `${DIR}/${encodeURIComponent(answer.file)}`;
  }, [answer]);

  const step = (d: number) => {
    const i = answers.findIndex((a) => a.file === mapName);
    set({ map: answers[(i + d + answers.length) % answers.length].file });
  };
  const V = VARIANTS[vIndex];

  return (
    <Flex sx={{ flexDirection: "column", height: "100vh", bg: "background", color: "text" }}>
      <Flex sx={{ alignItems: "center", gap: 2, p: 2, borderBottom: "1px solid", borderColor: "border", fontFamily: "body2" }}>
        <Text sx={{ fontFamily: "body2", color: "secondary" }}>PROTOTYPE · grid measuring (#178)</Text>
        <Button variant="secondary" onClick={() => step(-1)}>‹</Button>
        <select value={mapName} onChange={(e) => set({ map: e.target.value })} style={{ fontSize: 14 }}>
          {answers.map((a) => <option key={a.file} value={a.file}>{a.file} ({a.kind}, {a.width}×{a.height})</option>)}
        </select>
        <Button variant="secondary" onClick={() => step(1)}>›</Button>
        <Text sx={{ fontFamily: "body2", color: "gray", fontSize: 0 }}>{answer?.about}</Text>
      </Flex>
      {failed && <Text p={3}>{failed}</Text>}
      {answer && img && img.src.endsWith(encodeURIComponent(answer.file)) ? (
        <V.C key={`${V.key}:${answer.file}`} answer={answer} img={img}
          frame={{ variant: V.key, log, onDone: (e) => setLog((l) => [...l, e]) }} />
      ) : !failed && <Text p={3}>Loading…</Text>}
      <PrototypeSwitcher current={vIndex} onChange={(i) => set({ variant: VARIANTS[i].key })} />
    </Flex>
  );
}

export default PrototypeGridMeasure;
