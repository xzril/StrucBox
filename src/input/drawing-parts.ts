// Finding the parts of a beam figure from lines and blobs: the beam, dimension ticks, supports, arrow rows.
import { holes, type Band, type Box, type Comp, type Shaft, type Word } from './drawing-pixels';

export function beamBox(bands: Band[], textH: number): Box | null {
  if (!bands.length) return null;
  const len = (b: Band) => b.x1 - b.x0;
  const max = Math.max(...bands.map(len));
  // a beam drawn as a rectangle: its top and bottom edges (a load's top line sits further away)
  const groupOf = (l: Band) => bands.filter((b) => Math.abs((b.y0 + b.y1) / 2 - (l.y0 + l.y1) / 2) < 1.3 * textH && b.x0 < l.x1 && b.x1 > l.x0);
  // among the longest lines (a full-span load's top line is as long as the beam), prefer one with a partner edge
  const longest = bands
    .filter((b) => len(b) > 0.85 * max)
    .sort((a, b) => Math.min(groupOf(b).length, 2) - Math.min(groupOf(a).length, 2) || len(b) - len(a))[0];
  const group = groupOf(longest);
  return {
    x0: Math.min(...group.map((b) => b.x0)),
    x1: Math.max(...group.map((b) => b.x1)),
    y0: Math.min(...group.map((b) => b.y0)),
    y1: Math.max(...group.map((b) => b.y1)),
  };
}

/** x positions where a mark crosses the dimension line (ticks, slashes, small crosses). */
export function dimensionTicks(ink: Uint8Array, hmask: Uint8Array, W: number, b: Band, textH: number, words: Word[]): number[] {
  const d = Math.max(2, Math.round(0.35 * textH));
  const cols: number[] = [];
  for (let x = b.x0; x <= b.x1; x++) {
    if (words.some((w) => x >= w.x0 - 1 && x <= w.x1 + 1 && (Math.abs(w.y0 - b.y1) < d * 2 || Math.abs(b.y0 - w.y1) < d * 2))) continue;
    let above = 0, below = 0;
    for (let k = 2; k <= d + 2; k++) {
      for (let dx = -1; dx <= 1; dx++) {
        const xx = Math.min(W - 1, Math.max(0, x + dx));
        if (ink[(b.y0 - k) * W + xx] && !hmask[(b.y0 - k) * W + xx]) above++;
        if (ink[(b.y1 + k) * W + xx] && !hmask[(b.y1 + k) * W + xx]) below++;
      }
    }
    if (above && below) cols.push(x);
  }
  const ticks: number[] = [];
  let run: number[] = [];
  for (const x of [...cols, Infinity]) {
    if (run.length && x - run[run.length - 1] > 2) {
      ticks.push((run[0] + run[run.length - 1]) / 2);
      run = [];
    }
    run.push(x);
  }
  // the two arms of a drawn × cross the line at slightly different places
  return ticks.filter((t, i) => i === 0 || t - ticks[i - 1] > 0.6 * textH).map((t, i, a) => {
    const twin = ticks.find((u) => u > t && u - t <= 0.6 * textH);
    return twin === undefined ? t : (t + twin) / 2;
  });
}

/** Large blobs hanging under the beam: support symbols. A roller shows wheels: two or more closed
 * loops, or one round loop (a pin's triangle is one angular loop or solid). */
export function supportBases(comps: Comp[], mask: Uint8Array, W: number, beam: Box, textH: number): { x: number; roller: boolean }[] {
  return comps
    .filter(
      (c) =>
        c.y0 >= beam.y0 - 2 && c.y0 - beam.y1 < textH && c.y1 > beam.y1 + 0.8 * textH && (c.y0 + c.y1) / 2 > beam.y1 && // hangs under the beam
        c.x1 - c.x0 > 0.8 * textH && c.x1 - c.x0 < 6 * textH && (c.x0 + c.x1) / 2 > beam.x0 - textH && (c.x0 + c.x1) / 2 < beam.x1 + textH,
    )
    .map((c) => {
      const loops = holes(mask, W, { x0: c.x0, x1: c.x1, y0: beam.y1 + 1, y1: Math.round(c.y1 + textH) });
      return { x: (c.x0 + c.x1) / 2, roller: loops.length >= 2 || (loops.length === 1 && loops[0] > 0.68) };
    })
    .sort((a, b) => a.x - b.x);
}

export function nearestShaft(w: Word, shafts: Shaft[], textH: number, beam: Box | null): Shaft | undefined {
  const dx = (s: Shaft) => Math.max(0, w.x0 - s.x, s.x - w.x1);
  const dy = (s: Shaft) => Math.max(0, w.y0 - s.y1, s.y0 - w.y1);
  return shafts
    .filter((s) => dx(s) < 3 * textH && dy(s) < 2 * textH && (!beam || s.y1 <= beam.y0 + textH || s.y0 >= beam.y1 - textH))
    .sort((a, b) => dx(a) + dy(a) - dx(b) - dy(b))[0];
}

/** Straight runs of (x, arrow length) points, as [x1, l1, x2, l2]. A run ends where a straight line from its
 * first point stops fitting; each split then moves to where the two neighbouring fitted lines cross. */
export function linearPieces(xs: number[], ls: number[], tol: number): [number, number, number, number][] {
  const n = xs.length;
  const fits = (a: number, j: number) => {
    for (let i = a + 1; i < j; i++) if (Math.abs(ls[a] + ((ls[j] - ls[a]) * (xs[i] - xs[a])) / (xs[j] - xs[a]) - ls[i]) > tol) return false;
    return true;
  };
  let runs: [number, number][] = [];
  let a = 0;
  for (let j = 2; j < n; j++) if (!fits(a, j)) runs.push([a, (a = j - 1)]);
  runs.push([a, n - 1]);
  // a two-point run between two others is just the kink between them
  if (runs.length > 2) runs = runs.filter(([a, b], i) => b - a > 1 || i === 0 || i === runs.length - 1);
  const lines = runs.map(([a, b], i) => {
    // fit without points shared with a neighbour (they may sit on the kink)
    const lo = i > 0 && b - a > 2 ? a + 1 : a, hi = i < runs.length - 1 && b - a > 2 ? b - 1 : b;
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let k = lo; k <= hi; k++) (sx += xs[k]), (sy += ls[k]), (sxx += xs[k] ** 2), (sxy += xs[k] * ls[k]);
    const m = hi > lo ? (sxy * (hi - lo + 1) - sx * sy) / (sxx * (hi - lo + 1) - sx * sx) : 0;
    return { m, c: (sy - m * sx) / (hi - lo + 1) };
  });
  const cuts = runs.slice(1).map(([a], i) => {
    const [p, q] = [lines[i], lines[i + 1]];
    const x = Math.abs(p.m - q.m) > 1e-9 ? (q.c - p.c) / (p.m - q.m) : xs[a];
    return x > xs[runs[i][0]] && x < xs[runs[i + 1][1]] ? x : xs[a];
  });
  const bounds = [xs[0], ...cuts, xs[n - 1]];
  return lines.map(({ m, c }, i) => [bounds[i], m * bounds[i] + c, bounds[i + 1], m * bounds[i + 1] + c]);
}

/** Add the shorter arrows that continue a row at the same spacing, ending on the same line. Short arrows
 * (the low end of a triangle) are mostly head, so they are probed for directly rather than found as shafts. */
export function extendRow(row: Shaft[], mask: Uint8Array, W: number, textH: number, above: boolean, beam: Box) {
  const mid = (v: number[]) => [...v].sort((a, b) => a - b)[v.length >> 1];
  const step = mid(row.slice(1).map((s, i) => s.x - row[i].x));
  const e = mid(row.map((s) => (above ? s.y1 : s.y0)));
  const dir = above ? -1 : 1;
  // ink run from the row's end line outwards in one column (small gaps allowed)
  const run = (x: number) => {
    let n = 0, gap = 0, y = e;
    for (let k = 0; k < 3 * textH && gap <= 2; k++, y += dir) {
      if (mask[y * W + x]) (n = k + 1), (gap = 0);
      else gap++;
    }
    return n;
  };
  for (const side of [-1, 1])
    for (;;) {
      const want = Math.round((side < 0 ? row[0].x : row[row.length - 1].x) + side * step);
      if (want < beam.x0 - 3 || want > beam.x1 + 3) break;
      let bx = want, bn = 0;
      // a wall drawn at a fixed end carries on through the beam; an arrow stops at it
      const far = above ? beam.y1 + 4 : beam.y0 - 4;
      for (let x = Math.round(want - 0.3 * step); x <= want + 0.3 * step; x++) {
        let wall = false;
        for (let k = -2; k <= 2; k++) wall ||= !!(mask[far * W + x + k] || mask[(far - 2 * dir) * W + x + k]);
        const n = wall ? 0 : run(x);
        if (n > bn) (bn = n), (bx = x);
      }
      if (bn < Math.max(4, 0.4 * textH)) break;
      const s: Shaft = { x0: bx, x1: bx, x: bx, y0: above ? e - bn + 1 : e, y1: above ? e : e + bn - 1, head: above ? 'bottom' : 'top' };
      if (side < 0) row.unshift(s);
      else row.push(s);
    }
}

export function rowsOf(shafts: Shaft[], textH: number): Shaft[][] {
  const sorted = [...shafts].sort((a, b) => a.x - b.x);
  const rows: Shaft[][] = [];
  for (const s of sorted) {
    const r = rows.find((r) => {
      const last = r[r.length - 1];
      return Math.abs(last.y1 - s.y1) < textH && s.x - last.x < 6 * textH;
    });
    if (r) r.push(s);
    else rows.push([s]);
  }
  return rows.filter((r) => r.length >= 3);
}

export interface Slant {
  tail: [number, number];
  tip: [number, number];
  comp: Comp;
}

/** Straight arrows drawn at a slant: a long thin blob along one line with a head at one end. The legs of a slope
 * triangle drawn on the shaft may hang off its middle. */
export function slantedArrows(comps: Comp[], W: number, textH: number): Slant[] {
  const out: Slant[] = [];
  for (const c of comps) {
    const w = c.x1 - c.x0 + 1, h = c.y1 - c.y0 + 1;
    if (Math.hypot(w, h) < 3 * textH || w < 0.5 * textH || h < 0.5 * textH) continue;
    const xs = c.pixels.map((i) => i % W), ys = c.pixels.map((i) => (i - (i % W)) / W);
    const n = xs.length;
    const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
    let sxx = 0, syy = 0, sxy = 0;
    for (let k = 0; k < n; k++) (sxx += (xs[k] - mx) ** 2), (syy += (ys[k] - my) ** 2), (sxy += (xs[k] - mx) * (ys[k] - my));
    const a = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    const deg = Math.abs((a * 180) / Math.PI);
    if (deg < 10 || deg > 80) continue;
    const [ux, uy] = [Math.cos(a), Math.sin(a)];
    const t = xs.map((x, k) => (x - mx) * ux + (ys[k] - my) * uy);
    const sd = xs.map((x, k) => -(x - mx) * uy + (ys[k] - my) * ux);
    const d = sd.map(Math.abs);
    const thin = Math.max(2, 0.15 * textH);
    const on = t.filter((_, k) => d[k] <= thin);
    if (on.length < 0.5 * n) continue; // a blob, not a line
    const [t0, t1] = [Math.min(...on), Math.max(...on)];
    if (t1 - t0 < 3 * textH) continue;
    // the head is the solid part: it survives eroding the blob, while the shaft, a slope triangle's legs and the
    // stubs of lines crossing it (all thin strokes) do not
    const own = new Set(c.pixels);
    const r = Math.max(2, Math.round(0.15 * textH));
    const solid = (i: number) => {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (!own.has(i + dy * W + dx)) return false;
      return true;
    };
    const near = (lo: number, hi: number) => c.pixels.filter((i, k) => t[k] >= lo && t[k] <= hi && solid(i)).length;
    const [h0, h1] = [near(t0 - 1, t0 + 1.2 * textH), near(t1 - 1.2 * textH, t1 + 1)];
    if (Math.max(h0, h1) < 1 || Math.min(h0, h1) > 0.5 * Math.max(h0, h1)) continue;
    const end = (tk: number): [number, number] => [mx + tk * ux, my + tk * uy];
    out.push(h1 > h0 ? { tail: end(t0), tip: end(t1), comp: c } : { tail: end(t1), tip: end(t0), comp: c });
  }
  return out;
}

/** Distance from a point to the segment a–b. */
export function segDist(p: [number, number], a: [number, number], b: [number, number]): number {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const k = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p[0] - a[0] - k * dx, p[1] - a[1] - k * dy);
}

/** Direction of a slanted arrow as (right, up), from the sides of its slope triangle when one is printed by it
 * (three numbers with a² + b² = c²), else the nearest usual angle to the drawn one: a multiple of 5° or a 3-4-5 / 5-12-13 slope. */
export function slopeOf(s: Slant, nums: { v: number; at: [number, number] }[]): [number, number] {
  const dx = s.tip[0] - s.tail[0], dy = s.tail[1] - s.tip[1]; // image y runs down
  let best: [number, number] | null = null, bestD = Infinity;
  for (const c of nums)
    for (const p of nums)
      for (const q of nums) {
        if (p === q || c === p || c === q || p.v * p.v + q.v * q.v !== c.v * c.v) continue;
        const dist = [c, p, q].reduce((t, m) => t + segDist(m.at, s.tail, s.tip), 0);
        // p is the horizontal side when that matches the drawn slope better
        const fit = Math.abs(Math.log(Math.abs(dy / dx) / (q.v / p.v)));
        if (fit < Math.log(1.6) && dist < bestD) (bestD = dist), (best = [Math.sign(dx) * p.v, Math.sign(dy) * q.v]);
      }
  if (best) return best;
  const drawn = Math.atan2(Math.abs(dy), Math.abs(dx));
  const usual: [number, number][] = [[3, 4], [4, 3], [5, 12], [12, 5], ...Array.from({ length: 17 }, (_, i): [number, number] => [Math.cos(((i + 1) * Math.PI) / 36), Math.sin(((i + 1) * Math.PI) / 36)])];
  const [h, v] = usual.reduce((a, b) => (Math.abs(Math.atan2(b[1], b[0]) - drawn) < Math.abs(Math.atan2(a[1], a[0]) - drawn) ? b : a));
  return [Math.sign(dx) * h, Math.sign(dy) * v];
}

/** Carry a slanted arrow's tail on along its line through the ink: lines it crosses (a dimension line, the legs of its
 * slope triangle) split it into pieces. Stops at a gap or at the beam's face. */
export function extendTail(sl: Slant, ink: Uint8Array, W: number, H: number, textH: number, beam: Box | null): void {
  const len = Math.hypot(sl.tip[0] - sl.tail[0], sl.tip[1] - sl.tail[1]);
  const [ux, uy] = [(sl.tail[0] - sl.tip[0]) / len, (sl.tail[1] - sl.tip[1]) / len];
  const inBeam = (x: number, y: number) => !!beam && x >= beam.x0 && x <= beam.x1 && y >= beam.y0 && y <= beam.y1;
  // follow the line a pixel at a time, re-centring on its ink so a slightly-off direction does not lose it
  let [x, y] = sl.tail;
  let [lx, ly] = sl.tail;
  for (let k = 1, gap = 0; gap <= Math.max(3, 0.5 * textH); k++, gap++) {
    (x += ux), (y += uy);
    if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2 || inBeam(x, y)) break;
    const e = [0, -1, 1, -2, 2].find((e) => ink[Math.round(y + e * ux) * W + Math.round(x - e * uy)]);
    if (e === undefined) continue;
    if (gap < 2) (x -= 0.5 * e * uy), (y += 0.5 * e * ux);
    [lx, ly, gap] = [x, y, -1];
  }
  sl.tail = [lx, ly];
}

/** A blob beside the middle of a slanted arrow's shaft (where its slope triangle and numbers are drawn), not off its ends
 * (where its force label sits). */
export function alongside(c: Box, sl: Slant, textH: number): boolean {
  const [dx, dy] = [sl.tip[0] - sl.tail[0], sl.tip[1] - sl.tail[1]];
  const len2 = dx * dx + dy * dy;
  const [px, py] = [(c.x0 + c.x1) / 2 - sl.tail[0], (c.y0 + c.y1) / 2 - sl.tail[1]];
  const k = (px * dx + py * dy) / len2;
  return k > 0.08 && k < 0.92 && Math.abs(px * dy - py * dx) / Math.sqrt(len2) < 2 * textH;
}
