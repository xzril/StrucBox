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
