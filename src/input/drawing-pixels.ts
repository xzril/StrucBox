// Pixel-level steps of the drawing reader: straightening, ink, lines, blobs, arrow shafts, loops.
// Shared shapes and small geometry helpers live here too.

export interface RGBA {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
export interface Word extends Box {
  text: string;
  score: number;
}
export interface Band extends Box {}
export interface Shaft extends Box {
  x: number;
  head: 'top' | 'bottom' | null;
  used?: boolean;
}

/** Angle (radians, within ±6°) that levels the drawing: lines and text rows line up best along it. */
export function skewAngle(ink: Uint8Array, W: number, H: number): number {
  const pts: number[] = [];
  const every = Math.max(1, Math.round(ink.reduce((n, v) => n + v, 0) / 60000));
  for (let i = 0, k = 0; i < W * H; i++) if (ink[i] && k++ % every === 0) pts.push(i);
  const pad = Math.ceil(W * Math.tan(0.11));
  const bins = new Float64Array(H + 2 * pad);
  let best = 0, bestScore = -1;
  for (let deg = -6; deg <= 6.001; deg += 0.2) {
    const t = Math.tan((deg * Math.PI) / 180);
    bins.fill(0);
    for (const i of pts) {
      const x = i % W, y = (i - x) / W;
      bins[Math.round(y - x * t) + pad]++;
    }
    let sc = 0;
    for (const c of bins) sc += c * c;
    if (sc > bestScore * 1.0001) (bestScore = sc), (best = (deg * Math.PI) / 180);
  }
  return best;
}

/** The image turned by angle a about its centre (bilinear; corners repeat the edge so no false border appears). */
export function rotate(img: RGBA, a: number): RGBA {
  const { width: W, height: H, data } = img;
  const out = new Uint8ClampedArray(W * H * 4);
  const [c, s] = [Math.cos(a), Math.sin(a)];
  const [cx0, cy0] = [(W - 1) / 2, (H - 1) / 2];
  for (let v = 0; v < H; v++)
    for (let u = 0; u < W; u++) {
      const x = cx0 + c * (u - cx0) - s * (v - cy0);
      const y = cy0 + s * (u - cx0) + c * (v - cy0);
      const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
      const o = (v * W + u) * 4;
      for (let ch = 0; ch < 4; ch++) {
        const at = (xx: number, yy: number) => data[(clamp(yy, 0, H - 1) * W + clamp(xx, 0, W - 1)) * 4 + ch];
        out[o + ch] = (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy;
      }
    }
  return { width: W, height: H, data: out };
}

export function inkMask(img: RGBA): Uint8Array {
  const { width: W, height: H, data } = img;
  const lum = new Float32Array(W * H);
  const sat = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const r = data[4 * i], g = data[4 * i + 1], b = data[4 * i + 2];
    const a = data[4 * i + 3] / 255;
    // transparent pixels count as white paper
    const [R, G, B] = [r * a + 255 * (1 - a), g * a + 255 * (1 - a), b * a + 255 * (1 - a)];
    lum[i] = 0.299 * R + 0.587 * G + 0.114 * B;
    sat[i] = Math.max(R, G, B) - Math.min(R, G, B);
  }
  // paper brightness per block (photos are unevenly lit)
  const B = Math.max(16, Math.round(Math.min(W, H) / 12));
  const bw = Math.ceil(W / B), bh = Math.ceil(H / B);
  const bg = new Float32Array(bw * bh);
  for (let by = 0; by < bh; by++)
    for (let bx = 0; bx < bw; bx++) {
      const vals: number[] = [];
      for (let y = by * B; y < Math.min(H, (by + 1) * B); y += 2) for (let x = bx * B; x < Math.min(W, (bx + 1) * B); x += 2) vals.push(lum[y * W + x]);
      vals.sort((a, b) => a - b);
      bg[by * bw + bx] = vals[Math.floor(vals.length * 0.9)];
    }
  const d = new Float32Array(W * H);
  const hist = new Uint32Array(256);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      d[i] = bg[Math.floor(y / B) * bw + Math.floor(x / B)] - lum[i];
      hist[clamp(Math.round(d[i]), 0, 255)]++;
    }
  // faint pencil or a blurry photo: lower the bar with the darkest ink found, staying above paper grain
  let k = 255;
  for (let n = 0; k > 0 && (n += hist[k]) < 0.005 * W * H; k--);
  const t = clamp(0.3 * k, 35, 60);
  const ink = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) ink[i] = d[i] > t || (sat[i] > 70 && d[i] > 20) ? 1 : 0;
  return ink;
}

export function horizontalLines(ink: Uint8Array, W: number, H: number) {
  const hmask = new Uint8Array(W * H);
  const rows: { y: number; x0: number; x1: number }[] = [];
  const min = 0.3 * W;
  for (let y = 0; y < H; y++) {
    let start = -1, gap = 0;
    for (let x = 0; x <= W; x++) {
      const on = x < W && ink[y * W + x];
      if (on) {
        if (start < 0) start = x;
        gap = 0;
      } else if (start >= 0 && ++gap > 3) {
        const end = x - gap;
        if (end - start >= min) {
          rows.push({ y, x0: start, x1: end });
          for (let k = start; k <= end; k++) hmask[y * W + k] = 1;
        }
        start = -1;
        gap = 0;
      }
    }
  }
  const bands: Band[] = [];
  for (const r of rows) {
    const b = bands.find((b) => r.y - b.y1 <= 2 && r.x0 < b.x1 && r.x1 > b.x0);
    if (b) Object.assign(b, { y1: r.y, x0: Math.min(b.x0, r.x0), x1: Math.max(b.x1, r.x1) });
    else bands.push({ x0: r.x0, x1: r.x1, y0: r.y, y1: r.y });
  }
  // a line drawn slightly off level leaves short horizontal pieces in the rows next to it; clear those
  // too (strokes crossing the line are only a few pixels wide and stay)
  for (const b of bands)
    for (let y = Math.max(0, b.y0 - 2); y <= Math.min(H - 1, b.y1 + 2); y++)
      for (let x = b.x0, start = -1; x <= b.x1 + 1; x++) {
        const on = x <= b.x1 && ink[y * W + x];
        if (on && start < 0) start = x;
        if (!on && start >= 0) {
          if (x - start >= 12) hmask.fill(1, y * W + start, y * W + x);
          start = -1;
        }
      }
  return { bands, hmask };
}

export interface Comp extends Box {
  n: number;
  pixels: number[];
}
export function components(mask: Uint8Array, W: number, H: number): Comp[] {
  const seen = new Uint8Array(W * H);
  const out: Comp[] = [];
  const stack: number[] = [];
  for (let s = 0; s < W * H; s++) {
    if (!mask[s] || seen[s]) continue;
    const c: Comp = { x0: W, y0: H, x1: 0, y1: 0, n: 0, pixels: [] };
    stack.push(s);
    seen[s] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % W, y = (i - x) / W;
      c.pixels.push(i);
      c.n++;
      if (x < c.x0) c.x0 = x;
      if (x > c.x1) c.x1 = x;
      if (y < c.y0) c.y0 = y;
      if (y > c.y1) c.y1 = y;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const j = ny * W + nx;
          if (mask[j] && !seen[j]) {
            seen[j] = 1;
            stack.push(j);
          }
        }
    }
    if (c.n >= 3) out.push(c);
  }
  return out;
}

export function estimateTextHeight(comps: Comp[], W: number, H: number): number {
  // glyph-like blobs only: arrows and lines are thin and tall, hatching is tiny
  const hs = comps
    .filter((c) => {
      const h = c.y1 - c.y0 + 1, w = c.x1 - c.x0 + 1;
      return h >= 6 && h < 0.2 * H && w < 0.15 * W && w > 0.25 * h && w < 2 * h && c.n >= 12;
    })
    .map((c) => c.y1 - c.y0 + 1)
    .sort((a, b) => a - b);
  return hs.length ? hs[Math.floor(hs.length * 0.6)] : Math.max(8, H / 20);
}

export function verticalShafts(mask: Uint8Array, W: number, H: number, min: number, maxGap = 2) {
  const vmask = new Uint8Array(W * H);
  const runs: { x: number; y0: number; y1: number }[] = [];
  for (let x = 0; x < W; x++) {
    let start = -1, gap = 0;
    for (let y = 0; y <= H; y++) {
      const on = y < H && mask[y * W + x];
      if (on) {
        if (start < 0) start = y;
        gap = 0;
      } else if (start >= 0 && ++gap > maxGap) {
        const end = y - gap;
        if (end - start >= min) runs.push({ x, y0: start, y1: end });
        start = -1;
        gap = 0;
      }
    }
  }
  const shafts: Shaft[] = [];
  for (const r of runs) {
    const s = shafts.find((s) => r.x - s.x1 <= 2 && r.y0 < s.y1 && r.y1 > s.y0);
    if (s) Object.assign(s, { x1: r.x, y0: Math.min(s.y0, r.y0), y1: Math.max(s.y1, r.y1) });
    else shafts.push({ x0: r.x, x1: r.x, y0: r.y0, y1: r.y1, x: r.x, head: null });
    for (let y = r.y0; y <= r.y1; y++) vmask[y * W + r.x] = 1;
  }
  // a shaft is a thin stroke; wide vertical blobs are filled shapes, not arrows
  const thin = shafts.filter((s) => s.x1 - s.x0 < 0.25 * (s.y1 - s.y0));
  for (const s of shafts)
    if (!thin.includes(s)) for (let y = s.y0; y <= s.y1; y++) for (let x = s.x0; x <= s.x1; x++) vmask[y * W + x] = 0;
  thin.forEach((s) => (s.x = (s.x0 + s.x1) / 2));
  return { shafts: thin, vmask };
}

/** Which end of a shaft has the arrowhead: the end with more ink spread out sideways. */
export function arrowHead(s: Shaft, mask: Uint8Array, W: number, textH: number): Shaft['head'] {
  const r = Math.max(4, Math.round(0.9 * textH));
  const reach = Math.max(3, Math.round(0.5 * textH));
  const spread = (ya: number, yb: number) => {
    let n = 0;
    for (let y = Math.max(0, ya); y <= yb; y++)
      for (let x = Math.max(0, Math.round(s.x0 - r)); x <= Math.min(W - 1, Math.round(s.x1 + r)); x++)
        if (mask[y * W + x] && (x < s.x0 - 1 || x > s.x1 + 1)) n++;
    return n;
  };
  const top = spread(s.y0 - 1, s.y0 + reach);
  const bot = spread(s.y1 - reach, s.y1 + 1);
  if (top > 1.5 * bot && top > 3) return 'top';
  if (bot > 1.5 * top && bot > 3) return 'bottom';
  return null;
}

/** x of the thickest spot of a stroke: a filled or closed arrowhead is denser than the line itself. */
export function densest(c: Comp, mask: Uint8Array, W: number, textH: number): number {
  const r = Math.max(2, Math.round(0.15 * textH));
  let best = -1, bx = (c.x0 + c.x1) / 2;
  for (const i of c.pixels) {
    const x = i % W, y = (i - x) / W;
    let n = 0;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) n += mask[(y + dy) * W + x + dx] ?? 0;
    if (n > best) (best = n), (bx = x);
  }
  return bx;
}

/** Closed loops of ink inside a box, as each hole's area over its bounding box (about 0.79 round, 0.5 triangle). */
export function holes(mask: Uint8Array, W: number, b: Box): number[] {
  const w = b.x1 - b.x0 + 3, h = b.y1 - b.y0 + 3;
  const ink = (x: number, y: number) => x > 0 && y > 0 && x < w - 1 && y < h - 1 && mask[(b.y0 + y - 1) * W + b.x0 + x - 1] === 1;
  const seen = new Uint8Array(w * h);
  const out: number[] = [];
  for (let s = 0; s < w * h; s++) {
    if (seen[s] || ink(s % w, (s / w) | 0)) continue;
    let n = 0, edge = false, x0 = w, x1 = 0, y0 = h, y1 = 0;
    const stack = [s];
    seen[s] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % w, y = (i / w) | 0;
      n++;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) edge = true;
      (x0 = Math.min(x0, x)), (x1 = Math.max(x1, x)), (y0 = Math.min(y0, y)), (y1 = Math.max(y1, y));
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (!seen[j] && !ink(nx, ny)) (seen[j] = 1), stack.push(j);
      }
    }
    if (!edge && n >= 6) out.push(n / ((x1 - x0 + 1) * (y1 - y0 + 1)));
  }
  return out;
}

// ---------- helpers ----------

export const cx = (b: Box) => (b.x0 + b.x1) / 2;
export const cy = (b: Box) => (b.y0 + b.y1) / 2;
export const bbox = (bs: Box[]): Box => ({
  x0: Math.min(...bs.map((b) => b.x0)),
  y0: Math.min(...bs.map((b) => b.y0)),
  x1: Math.max(...bs.map((b) => b.x1)),
  y1: Math.max(...bs.map((b) => b.y1)),
});
export const unitOf = (t: string) => t.replace(/^[\d.]+/, '');
export const valueOf = (t: string) => parseFloat(t);
export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
export const round = (x: number, d = 3) => Math.round(x * 10 ** d) / 10 ** d;
export function interp(xs: number[], ys: number[], x: number) {
  if (x <= xs[0]) return ys[0] + ((x - xs[0]) * (ys[1] - ys[0])) / (xs[1] - xs[0]);
  for (let i = 1; i < xs.length; i++)
    if (x <= xs[i] || i === xs.length - 1) return ys[i - 1] + ((x - xs[i - 1]) * (ys[i] - ys[i - 1])) / (xs[i] - xs[i - 1]);
  return ys[ys.length - 1];
}
