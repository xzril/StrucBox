import type { ForceUnit, LengthUnit, Load, Problem, SupportType } from '../solver/types';
import { LETTERS, readWords } from './drawing-labels';
import { beamBox, dimensionTicks, extendRow, linearPieces, nearestShaft, extendTail, rowsOf, segDist, slantedArrows, slopeOf, supportBases, alongside } from './drawing-parts';
import {
  arrowHead, clamp, components, cx, cy, densest, estimateTextHeight, horizontalLines, inkMask, interp, rotate, round, skewAngle, unitOf, valueOf, verticalShafts,
  type Band, type Comp, type RGBA, type Shaft, type Word,
} from './drawing-pixels';
import { newId } from './parse';

/** Offline reader for the beam drawing itself (D2): straightens the photo, finds the beam, the dimension line
 * and its labels, point and distributed loads from arrows (position, up/down, shape), couples from curved
 * arrows, and supports from their symbols. The steps live in drawing-pixels, drawing-parts and drawing-labels. */

export type { RGBA, Word };

export interface DrawingRead {
  words: Word[];
  length?: number;
  lengthUnit?: LengthUnit;
  forceUnit?: ForceUnit;
  loads: Load[];
  supports: { label: string; x: number; type: SupportType; y?: number }[];
  points: { label: string; x: number }[]; // other lettered points on the beam, e.g. C
  relative?: boolean; // no dimension line: x is a fraction of the beam (0 to 1), scaled by the text's length
  arrows?: { x: number; len: number }[]; // every arrow standing on the beam (x as above, length in px)
}

const FORCE_UNITS: Record<string, ForceUnit> = { kn: 'kN', n: 'N', lb: 'lb', lbs: 'lb', kip: 'kip', kips: 'kip', k: 'kip' };
const LENGTH_UNITS: Record<string, LengthUnit> = { m: 'm', mm: 'mm', ft: 'ft', in: 'in' };

export function readDrawing(img: RGBA): DrawingRead {
  // photos are rarely square to the page: straighten first, everything below expects level lines
  const tilt = skewAngle(inkMask(img), img.width, img.height);
  if (Math.abs(tilt) > 0.002) img = rotate(img, tilt);
  const { width: W, height: H } = img;
  const ink = inkMask(img);
  const { bands, hmask } = horizontalLines(ink, W, H);
  const noH = ink.map((v, i) => v & (hmask[i] ^ 1));
  const comps0 = components(noH, W, H);
  const textH = estimateTextHeight(comps0, W, H);
  const { shafts, vmask } = verticalShafts(noH, W, H, Math.max(1.5 * textH, 0.06 * H), Math.max(2, Math.round(0.2 * textH)));
  const textMask = noH.map((v, i) => v & (vmask[i] ^ 1));
  const comps = components(textMask, W, H);
  for (const s of shafts) s.head = arrowHead(s, noH, W, textH); // first guess, before labels are known
  const slants = slantedArrows(comps, W, textH);
  // blobs by a slanted arrow's shaft are its slope triangle's numbers, read on their own below, not labels
  // (a first reach along each arrow; the beam it stops at is not known yet)
  const reach = slants.map((sl) => ({ ...sl }));
  reach.forEach((sl) => extendTail(sl, ink, W, H, textH, null));
  const byShaft = comps.filter((c) => !slants.some((s) => s.comp === c) && reach.some((sl) => alongside(c, sl, textH)));
  const words = readWords(comps.filter((c) => !slants.some((s) => s.comp === c) && !byShaft.includes(c)), textMask, W, textH, shafts);
  const lenWords0 = words.filter((w) => LENGTH_UNITS[unitOf(w.text)] !== undefined && !w.text.includes('/'));
  // dimension lines broken by their labels ("|— 2 m —|— 3 m —|"): join the pieces across each label
  const pieces = horizontalLines(ink, W, H, 2 * textH).bands.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  for (const [i, a] of pieces.entries()) {
    if (!a) continue;
    for (let j = i + 1; j < pieces.length; j++) {
      const b = pieces[j];
      if (!b || Math.abs(cy(b) - cy(a)) > 2 || b.x0 <= a.x1) continue;
      const label = lenWords0.some((w) => cx(w) > a.x1 && cx(w) < b.x0 && Math.abs(cy(w) - cy(a)) < textH && w.x0 - a.x1 < 2 * textH && b.x0 - w.x1 < 2 * textH);
      if (!label) continue;
      Object.assign(a, { x1: b.x1, y0: Math.min(a.y0, b.y0), y1: Math.max(a.y1, b.y1), joined: true });
      pieces[j] = undefined as never;
    }
    if ((a as { joined?: boolean }).joined) {
      // it replaces any piece long enough to have been found as a line on its own
      bands.splice(0, bands.length, ...bands.filter((o) => !(Math.abs(cy(o) - cy(a)) <= 2 && o.x0 >= a.x0 - 2 && o.x1 <= a.x1 + 2)), a);
      for (let y = a.y0; y <= a.y1; y++) for (let x = a.x0; x <= a.x1; x++) if (noH[y * W + x]) hmask[y * W + x] = 1;
    }
  }
  // a beam drawn as a rectangle has a partner edge close by; a dimension line stands alone
  const partnered = (b: Band) => bands.some((o) => o !== b && Math.abs(cy(o) - cy(b)) < 1.3 * textH && Math.min(o.x1, b.x1) - Math.max(o.x0, b.x0) > 0.8 * (b.x1 - b.x0));
  const isDimLike = (b: Band) =>
    b.y1 - b.y0 < 0.6 * textH + 2 &&
    !partnered(b) &&
    lenWords0.some((w) => cx(w) >= b.x0 - textH && cx(w) <= b.x1 + textH && Math.min(Math.abs(w.y0 - b.y1), Math.abs(b.y0 - w.y1)) < 1.6 * textH) &&
    !shafts.some((s) => s.x >= b.x0 - 2 && s.x <= b.x1 + 2 && (Math.abs(s.y0 - b.y1) < 5 || Math.abs(s.y1 - b.y0) < 5));
  const headMask = noH.slice();
  for (const w of words) for (let y = w.y0; y <= w.y1; y++) headMask.fill(0, y * W + w.x0, y * W + w.x1 + 1);
  // beam: the longest horizontal line (with its partner edge if drawn as a rectangle), not a dimension line
  const beam = beamBox(bands.filter((b) => !isDimLike(b)), textH);
  for (const sl of slants) extendTail(sl, ink, W, H, textH, beam);
  // an arrow touching the beam end runs into the beam's end edge; stop it at the beam face
  const trim = (ss: Shaft[]) => {
    if (beam)
      for (const s of ss) {
        if (s.y0 < beam.y0 - 2 && s.y1 > beam.y0 && s.y1 <= beam.y1 + 0.8 * textH) s.y1 = beam.y0 - 1;
        if (s.y1 > beam.y1 + 2 && s.y0 < beam.y1 && s.y0 >= beam.y0 - 0.8 * textH) s.y0 = beam.y1 + 1;
      }
    return ss;
  };
  trim(shafts);
  for (const s of shafts) s.head = arrowHead(s, headMask, W, textH);
  const out: DrawingRead = { words, loads: [], supports: [], points: [] };

  // dimension lines: thin bands with length labels right next to them
  const isLen = (w: Word) => LENGTH_UNITS[unitOf(w.text)] !== undefined && !w.text.includes('/');
  const lenWords = words.filter(isLen);
  const near = (w: Word, b: Band) => cx(w) >= b.x0 - textH && cx(w) <= b.x1 + textH && Math.min(Math.abs(w.y0 - b.y1), Math.abs(b.y0 - w.y1)) < 1.6 * textH;
  // a load's top line has arrows hanging from it; a dimension line only has short ticks
  const hasArrows = (b: Band) => shafts.some((s) => s.x >= b.x0 - 2 && s.x <= b.x1 + 2 && (Math.abs(s.y0 - b.y1) < 5 || Math.abs(s.y1 - b.y0) < 5));
  const dimBands = bands.filter((b) => b.y1 - b.y0 < 0.6 * textH + 2 && !partnered(b) && lenWords.some((w) => near(w, b)) && !hasArrows(b));
  const dim = dimBands.sort((a, b) => lenWords.filter((w) => near(w, b)).length - lenWords.filter((w) => near(w, a)).length)[0];

  let toX: ((px: number) => number) | null = null;
  let stops: number[] = [];
  if (dim) {
    const labels = lenWords.filter((w) => near(w, dim)).sort((a, b) => cx(a) - cx(b));
    const unit = LENGTH_UNITS[unitOf(labels[0].text)];
    // a slanted arrow crossing the line is not a tick
    const crossings = slants
      .filter((sl) => (sl.tail[1] - cy(dim)) * (sl.tip[1] - cy(dim)) < 0)
      .map((sl) => sl.tail[0] + ((cy(dim) - sl.tail[1]) * (sl.tip[0] - sl.tail[0])) / (sl.tip[1] - sl.tail[1]));
    const ticks = dimensionTicks(ink, hmask, W, dim, textH, words).filter((t) => !crossings.some((c) => Math.abs(c - t) < 0.4 * textH));
    const bounds = [dim.x0, ...ticks.filter((t) => t > dim.x0 + textH && t < dim.x1 - textH), dim.x1];
    const segs = bounds.slice(1).map((b, i) => ({ a: bounds[i], b, w: labels.filter((l) => cx(l) >= bounds[i] && cx(l) < b) }));
    let px: number[];
    let at: number[];
    if (segs.every((s) => s.w.length === 1)) {
      px = bounds;
      at = [0];
      segs.forEach((s) => at.push(at[at.length - 1] + valueOf(s.w[0].text)));
    } else {
      // ticks unclear: assume the labels split the line in order, proportionally
      const total = labels.reduce((t, l) => t + valueOf(l.text), 0);
      px = [dim.x0, dim.x1];
      at = [0, total];
    }
    stops = at;
    toX = (p) => interp(px, at, p);
    out.lengthUnit = unit;
    out.length = at[at.length - 1];
  }

  if (beam && toX) {
    // the dimension line usually starts at the beam's left end; measure everything from there
    const x0 = toX(beam.x0);
    const x1 = toX(beam.x1);
    const ends = Math.abs(x0) < 0.04 * out.length! && Math.abs(x1 - out.length!) < 0.04 * out.length!;
    if (!ends && x1 - x0 > 0) {
      const off = x0;
      const f = toX;
      toX = (p) => f(p) - off;
      stops = stops.map((s) => s - off);
      out.length = round(x1 - x0);
    }
  }
  if (beam && !toX) {
    // no dimension line: measure along the beam itself as 0..1; applyDrawing scales by the text's length
    toX = (p) => (p - beam.x0) / (beam.x1 - beam.x0);
    out.relative = true;
  }
  const L = out.length ?? (out.relative ? 1 : undefined);
  const snap = (x: number, tol = 0) => {
    if (L === undefined) return x;
    const t = Math.max(0.035 * L, 0.75 * tol);
    const near = [0, L, ...stops].sort((a, b) => Math.abs(a - x) - Math.abs(b - x))[0];
    return round(Math.abs(near - x) < t ? near : x);
  };

  // every arrow standing on the beam, to judge a load's shape when the text gives its place and size
  if (beam && toX)
    out.arrows = shafts
      .filter((s) => Math.abs(s.y1 - beam.y0) < textH / 2 || Math.abs(s.y0 - beam.y1) < textH / 2)
      .map((s) => ({ x: toX!(s.x), len: s.y1 - s.y0 }));

  // point loads: a force label and the arrow next to it
  const forceWords = words.filter((w) => FORCE_UNITS[unitOf(w.text).toLowerCase()] && !w.text.includes('/') && !/[·]/.test(w.text));

  // inclined forces: a slanted arrow ending at the beam, its force label, and the slope triangle printed by it
  if (beam && toX && L !== undefined)
    for (const sl of slants) {
      const toBeam = (p: [number, number]) => Math.max(0, beam.x0 - p[0], p[0] - beam.x1) + Math.max(0, beam.y0 - p[1], p[1] - beam.y1);
      const at = toBeam(sl.tip) <= toBeam(sl.tail) ? sl.tip : sl.tail;
      if (toBeam(at) > 1.5 * textH) continue;
      const mid = (w: Word): [number, number] => [cx(w), cy(w)];
      const w = forceWords.filter((w) => segDist(mid(w), sl.tail, sl.tip) < 5 * textH).sort((a, b) => segDist(mid(a), sl.tail, sl.tip) - segDist(mid(b), sl.tail, sl.tip))[0];
      if (!w) continue;
      forceWords.splice(forceWords.indexOf(w), 1);
      // the triangle's numbers: small blobs by the shaft that are not part of a label with a unit
      const near = byShaft.filter((c) => reach[slants.indexOf(sl)] && alongside(c, reach[slants.indexOf(sl)], textH));
      const nums = readWords(near, textMask, W, textH, [], true).map((v) => ({ v: valueOf(v.text), at: mid(v) }));
      const [dx, dy] = slopeOf(sl, nums);
      const F = valueOf(w.text) / Math.hypot(dx, dy);
      out.forceUnit ??= FORCE_UNITS[unitOf(w.text).toLowerCase()];
      out.loads.push({ id: newId(), kind: 'point', x: snap(clamp(toX(at[0]), 0, L)), P: round(-F * dy) || 0, Px: round(F * dx) || undefined });
    }
  // the most confident labels claim their arrows first; a label whose nearest arrow is taken is noise
  for (const w of forceWords.sort((a, b) => b.score - a.score)) {
    const s = nearestShaft(w, shafts, textH, beam);
    if (!s || s.used || !toX) continue;
    s.used = true;
    const down = s.head ? s.head === 'bottom' : beam ? (s.y0 + s.y1) / 2 < (beam.y0 + beam.y1) / 2 : true;
    const P = valueOf(w.text);
    out.forceUnit ??= FORCE_UNITS[unitOf(w.text).toLowerCase()];
    out.loads.push({ id: newId(), kind: 'point', x: snap(clamp(toX(s.x), 0, L!)), P: down ? P : -P });
  }

  // couples: a moment label next to a curved arrow; where its arrowhead sits gives the turning sense
  const arcs: Comp[] = [];
  if (beam && toX && L !== undefined)
    for (const w of words.filter((w) => unitOf(w.text).includes('·'))) {
      const inWord = (c: Comp) => words.some((v) => cx(c) >= v.x0 && cx(c) <= v.x1 && cy(c) >= v.y0 && cy(c) <= v.y1);
      const gap = (c: Comp) => Math.max(0, w.x0 - c.x1, c.x0 - w.x1) + Math.max(0, w.y0 - c.y1, c.y0 - w.y1);
      const arc = comps0
        .filter((c) => {
          const [cw, ch] = [c.x1 - c.x0, c.y1 - c.y0];
          return cw > 1.2 * textH && cw < 8 * textH && ch > 0.5 * textH && ch < 6 * textH && c.y1 > beam.y0 - 3 * textH && c.y0 < beam.y1 + 3 * textH && gap(c) < 3 * textH && !inWord(c) && !arcs.includes(c);
        })
        .sort((a, b) => gap(a) - gap(b))[0];
      if (!arc) continue;
      arcs.push(arc);
      const over = cy(arc) < (beam.y0 + beam.y1) / 2;
      const headRight = densest(arc, noH, W, textH) > cx(arc);
      out.loads.push({ id: newId(), kind: 'moment', x: snap(clamp(toX(cx(arc)), 0, L)), M: valueOf(w.text), dir: headRight === over ? 'cw' : 'ccw' });
      out.forceUnit ??= FORCE_UNITS[unitOf(w.text).split('·')[0].toLowerCase()];
    }
  // the arc and its arrowhead are not letters, nor are bits of the beam's own outline
  const onArc = (w: Word) =>
    (!!beam && cy(w) > beam.y0 && cy(w) < beam.y1 && cx(w) > beam.x0 - textH / 2 && cx(w) < beam.x1 + textH / 2) ||
    arcs.some((c) => w.x1 >= c.x0 - textH / 2 && w.x0 <= c.x1 + textH / 2 && w.y1 >= c.y0 - textH / 2 && w.y0 <= c.y1 + textH / 2);

  // distributed loads: a row of three or more arrows on the same side of the beam. Arrow lengths show
  // the intensity; where their trend changes (uniform part, triangular part) a new load starts.
  const distWords = words.filter((w) => w.text.includes('/'));
  if (beam && toX && L !== undefined) {
    const free = shafts.filter((s) => !s.used && (s.y1 <= beam.y0 + 2 || s.y0 >= beam.y1 - 2));
    for (const row of rowsOf(free, textH)) {
      const above = row[0].y1 <= beam.y0 + 2;
      extendRow(row, noH, W, textH, above, beam);
      // labels sit by the outer end of the arrows (the load outline)
      const outer = (w: Word) => {
        const s = row.reduce((a, b) => (Math.abs(b.x - cx(w)) < Math.abs(a.x - cx(w)) ? b : a));
        return Math.abs(cy(w) - (above ? s.y0 : s.y1));
      };
      const labels = distWords.filter((w) => cx(w) > row[0].x - 4 * textH && cx(w) < row[row.length - 1].x + 4 * textH && outer(w) < 4 * textH);
      if (!labels.length) continue;
      const xs = row.map((s) => toX!(s.x));
      const ls = row.map((s) => s.y1 - s.y0);
      const tall = Math.max(...ls);
      const step = (xs[xs.length - 1] - xs[0]) / (xs.length - 1);
      const pieces = linearPieces(xs, ls, Math.max(3, 0.08 * tall));
      // arrows too short to draw: extend an end triangle to where its intensity reaches zero
      const [f, e] = [pieces[0], pieces[pieces.length - 1]];
      const zf = f[0] - (f[1] * (f[2] - f[0])) / (f[3] - f[1] || 1e-9);
      if (f[3] > f[1] && zf < f[0] && zf > Math.max(-step, f[0] - 4 * step)) [f[0], f[1]] = [Math.max(0, zf), 0];
      const ze = e[2] + (e[3] * (e[2] - e[0])) / (e[1] - e[3] || 1e-9);
      if (e[1] > e[3] && ze > e[2] && ze < Math.min(L + step, e[2] + 4 * step)) [e[2], e[3]] = [Math.min(L, ze), 0];
      // an end arrow hidden behind a wall or the beam's end: carry the outline on to a stop just past it
      const stopNear = (x: number, dir: number) => [0, L, ...stops].find((q) => dir * (q - x) > 0.05 * step && dir * (q - x) < 1.25 * step);
      const sf = f[1] > 0 ? stopNear(f[0], -1) : undefined;
      if (sf !== undefined) [f[0], f[1]] = [sf, f[1] + ((f[3] - f[1]) * (sf - f[0])) / (f[2] - f[0])];
      const se = e[3] > 0 ? stopNear(e[2], 1) : undefined;
      if (se !== undefined) [e[2], e[3]] = [se, e[3] + ((e[3] - e[1]) * (se - e[2])) / (e[2] - e[0])];
      // intensity per pixel of arrow length: each label names the value at the nearest end or kink of the outline
      const anchors = pieces.flatMap(([x1, l1, x2, l2]) => [[x1, l1], [x2, l2]]).filter(([, l]) => l > 0.12 * tall);
      const named = new Map<number, number>(); // anchor x → the value its label states
      const ks = labels.map((w) => {
        const ux = toX!(cx(w));
        const [ax, l] = anchors.reduce((a, b) => (Math.abs(b[0] - ux) < Math.abs(a[0] - ux) ? b : a));
        named.set(ax, valueOf(w.text));
        return valueOf(w.text) / l;
      });
      const k = ks.sort((a, b) => a - b)[ks.length >> 1];
      const nice = (v: number) => labels.map((w) => valueOf(w.text)).find((lv) => Math.abs(lv - v) < 0.06 * lv) ?? round(v, 2);
      const value = (x: number, l: number) => named.get(x) ?? (l < 0.12 * tall ? 0 : nice(k * l));
      for (const [x1, l1, x2, l2] of pieces)
        out.loads.push({ id: newId(), kind: 'dist', x1: snap(clamp(x1, 0, L), step), x2: snap(clamp(x2, 0, L), step), w1: value(x1, l1), w2: value(x2, l2) });
      out.forceUnit ??= FORCE_UNITS[unitOf(labels[0].text).split('/')[0].toLowerCase()];
      labels.forEach((w) => distWords.splice(distWords.indexOf(w), 1));
    }
  }

  // supports: letters at beam level, and walls (fixed ends)
  if (beam && toX && L !== undefined) {
    const letters = words.filter((w) => w.text.length === 1 && (LETTERS + 'O').includes(w.text) && !onArc(w) && Math.abs(cy(w) - (beam.y0 + beam.y1) / 2) < 3 * textH);
    // a wall: a long line through the beam end (its pieces above and below the beam count as one)
    const through = shafts.map((s) => {
      const below = shafts.find((t) => t !== s && Math.abs(t.x - s.x) <= 3 && s.y1 <= beam.y0 + 2 && t.y0 >= beam.y1 - 2 && t.y0 - s.y1 < beam.y1 - beam.y0 + 2 * textH);
      return below ? { ...s, y1: below.y1 } : s;
    });
    const walls = through.filter((s) => s.y0 < beam.y0 - textH && s.y1 > beam.y1 + textH && (Math.abs(s.x - beam.x0) < textH || Math.abs(s.x - beam.x1) < textH));
    // an L-shaped member: an arm (its edge lines or a filled bar, not a labelled arrow or dimension line) standing on a beam end,
    // held at its far end; its height comes from the dimension line beside it, else from the drawing's scale
    const depth = beam.y1 - beam.y0;
    const labelled = (s: Shaft) => lenWords.find((w) => cy(w) > s.y0 && cy(w) < s.y1 && Math.abs(cx(w) - s.x) < 5 * textH && !(w.x0 < s.x && w.x1 > s.x && w.y1 < s.y0));
    const arms = shafts.filter(
      (s) =>
        !s.used && !labelled(s) && Math.min(Math.abs(s.x - beam.x0), Math.abs(s.x - beam.x1)) < Math.max(textH, 1.5 * depth) &&
        ((s.y1 > beam.y0 - textH / 2 && s.y1 < beam.y1 + 2 && s.y0 < beam.y0 - 2 * textH) || (s.y0 > beam.y0 - 2 && s.y0 < beam.y1 + textH / 2 && s.y1 > beam.y1 + 2 * textH)),
    );
    // a member is as wide as the beam: a filled bar, or two edges about a beam depth apart (a wall is one line)
    const wide = (s: Shaft) => s.x1 - s.x0 >= 0.4 * depth || arms.some((o) => Math.abs(o.x - s.x) >= 0.4 * depth && Math.abs(o.x - s.x) <= 2 * depth);
    const arm = arms.filter(wide).sort((a, b) => b.y1 - b.y0 - (a.y1 - a.y0))[0];
    if (arm && !walls.length) {
      const up = arm.y0 < beam.y0;
      const far = up ? arm.y0 : arm.y1;
      const dim = shafts.filter((s) => s !== arm && labelled(s) && Math.min(s.y1, arm.y1) - Math.max(s.y0, arm.y0) > 0.5 * (arm.y1 - arm.y0)).sort((a, b) => Math.abs(a.x - arm.x) - Math.abs(b.x - arm.x))[0];
      const drawn = round(((up ? beam.y1 - far : far - beam.y0) * (toX(beam.x1) - toX(beam.x0))) / (beam.x1 - beam.x0), 2);
      const said = dim ? valueOf(labelled(dim)!.text) : NaN;
      const h = said / drawn > 1 / 3 && said / drawn < 3 ? said : drawn; // a label far off the drawing's scale is misread
      const atRight = Math.abs(arm.x - beam.x1) < Math.abs(arm.x - beam.x0);
      const name = (x: number, y: number, r: number) =>
        words.find((w) => w.text.length === 1 && (LETTERS + 'O').includes(w.text) && Math.abs(cx(w) - x) < r && Math.abs(cy(w) - y) < r)?.text;
      const label = name(arm.x, far, 3 * textH) ?? 'O';
      const other = name(atRight ? beam.x0 : beam.x1, (beam.y0 + beam.y1) / 2, 3 * textH) ?? (label === 'A' ? 'B' : 'A');
      out.supports = [
        { label: other, x: atRight ? 0 : L, type: 'free' },
        { label, x: atRight ? L : 0, type: 'fixed', y: up ? h : -h },
      ];
    } else if (walls.length === 1) {
      const fixedAtLeft = Math.abs(walls[0].x - beam.x0) < Math.abs(walls[0].x - beam.x1);
      const [lf, lr] = [letters.find((l) => cx(l) < (beam.x0 + beam.x1) / 2)?.text ?? 'A', letters.find((l) => cx(l) > (beam.x0 + beam.x1) / 2)?.text ?? 'B'];
      out.supports = fixedAtLeft
        ? [{ label: lf, x: 0, type: 'fixed' }, { label: lr, x: L, type: 'free' }]
        : [{ label: lf, x: 0, type: 'free' }, { label: lr, x: L, type: 'fixed' }];
    } else {
      const inWord = (c: Comp) => words.some((v) => cx(c) >= v.x0 && cx(c) <= v.x1 && cy(c) >= v.y0 && cy(c) <= v.y1);
      const bases = supportBases(comps.filter((c) => !inWord(c)), textMask, W, beam, textH);
      // support symbols first; a letter at a beam end stands in for a symbol that was not found
      const endLetters = letters.map(cx).filter((p) => Math.min(Math.abs(toX!(p)), Math.abs(toX!(p) - L)) < 0.06 * L);
      const cands = bases.length >= 2 ? bases : [...bases, ...endLetters.map((x) => ({ x, roller: undefined }))];
      const xs = cands.map((c) => ({ ...c, x: snap(clamp(toX!(c.x), 0, L)) })).sort((a, b) => a.x - b.x);
      const uniq = xs.filter((c, i) => i === 0 || c.x - xs[i - 1].x > 0.02 * L).slice(0, 2);
      if (uniq.length === 2) {
        // a roller symbol has wheels; when the symbols do not tell, the left support is the pin
        const r = uniq.map((c) => c.roller);
        const rollerAt = r[0] === true && r[1] !== true ? 0 : r[1] === false && r[0] !== false ? 0 : 1;
        const free = letters.slice();
        out.supports = uniq.map(({ x }, i) => {
          const l = free.sort((a, b) => Math.abs(toX!(cx(a)) - x) - Math.abs(toX!(cx(b)) - x))[0];
          const near = l && Math.abs(toX!(cx(l)) - x) < 0.15 * L;
          if (near) free.splice(free.indexOf(l), 1);
          return { label: near ? l.text : 'AB'[i], x, type: i === rollerAt ? 'roller' : 'pin' };
        });
      }
    }
  }
  // other letters along the beam name points (C at midspan, ...)
  if (beam && toX && L !== undefined)
    for (const w of words)
      if (w.text.length === 1 && LETTERS.includes(w.text) && !onArc(w) && !out.supports.some((s) => s.label === w.text) && Math.abs(cy(w) - (beam.y0 + beam.y1) / 2) < 3 * textH)
        out.points.push({ label: w.text, x: snap(clamp(toX(cx(w)), 0, L)) });
  out.loads.sort((a, b) => (a.kind === 'dist' ? a.x1 : a.x) - (b.kind === 'dist' ? b.x1 : b.x));
  return out;
}

/** Put what the drawing shows into a problem read from the text. The drawing wins on geometry. */
export function applyDrawing(p: Problem, d: DrawingRead, exact = false): Problem {
  // the text placed every load ("x=[1.5, 2.5]"): keep its geometry, take only each load's shape from the arrows
  if (exact) return { ...p, loads: p.loads.map((l) => (l.kind === 'dist' && l.w1 === l.w2 ? shapeOf(l, d, p.length) : l)) };
  if (d.relative) d = scaled(d, p.length);
  const q: Problem = { ...p, loads: [...p.loads], supports: [...p.supports] };
  if (d.length) {
    q.length = d.length;
    if (d.lengthUnit) q.units = { ...q.units, length: d.lengthUnit };
  }
  if (d.forceUnit) q.units = { ...q.units, force: d.forceUnit, system: d.forceUnit === 'N' || d.forceUnit === 'kN' ? 'SI' : 'US' };
  if (d.supports.length) q.supports = d.supports.map((s) => ({ id: newId(), ...s }));
  else if (d.length) q.supports = q.supports.map((s, i) => ({ ...s, x: i === 0 ? 0 : q.length }));
  for (const pt of d.points) q.points = [...q.points.filter((x) => x.label !== pt.label), pt];
  const fromDrawing = new Set(d.loads.map((l) => l.kind));
  if (d.loads.length) q.loads = [...d.loads, ...q.loads.filter((l) => !fromDrawing.has(l.kind) && !(l.kind === 'point'))];
  q.loads = q.loads.map((l) => (l.kind === 'dist' ? { ...l, x2: Math.min(l.x2, q.length), x1: Math.min(l.x1, q.length) } : { ...l, x: Math.min(l.x, q.length) }));
  return q;
}

/** A drawing measured along the beam (0..1) put in the text's length units. */
function scaled(d: DrawingRead, L: number): DrawingRead {
  const r = (x: number) => round(x * L);
  return {
    ...d,
    supports: d.supports.map((s) => ({ ...s, x: r(s.x), ...(s.y ? { y: r(s.y) } : {}) })),
    points: d.points.map((q) => ({ ...q, x: r(q.x) })),
    loads: d.loads.map((l) => (l.kind === 'dist' ? { ...l, x1: r(l.x1), x2: r(l.x2) } : { ...l, x: r(l.x) })),
  };
}

/** A uniform load becomes triangular when the arrows over its span shrink to nothing at one end. */
function shapeOf(l: Extract<Load, { kind: 'dist' }>, d: DrawingRead, length: number): Load {
  const k = d.relative ? length : 1;
  const span = l.x2 - l.x1;
  const pts = (d.arrows ?? []).map((a) => ({ x: a.x * k, len: a.len })).filter((a) => a.x > l.x1 - 0.05 * span && a.x < l.x2 + 0.05 * span);
  if (pts.length < 3) return l;
  const n = pts.length;
  const [sx, sy] = [pts.reduce((t, a) => t + a.x, 0), pts.reduce((t, a) => t + a.len, 0)];
  const m = (n * pts.reduce((t, a) => t + a.x * a.len, 0) - sx * sy) / (n * pts.reduce((t, a) => t + a.x * a.x, 0) - sx * sx);
  const c = (sy - m * sx) / n;
  if (Math.abs(m * span) < 0.25 * Math.max(...pts.map((a) => a.len))) return l;
  const zero = -c / m;
  if (Math.abs(zero - l.x1) < 0.25 * span) return { ...l, w1: 0 };
  if (Math.abs(zero - l.x2) < 0.25 * span) return { ...l, w2: 0 };
  return l;
}
