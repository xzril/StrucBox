import type { ForceUnit, LengthUnit, Load, Problem, SupportType } from '../solver/types';
import { classify, GLYPHS, glyphFeatures } from './glyphs';
import { newId } from './parse';

/** Offline reader for the beam drawing itself (D2): finds the beam, the dimension line and its labels,
 * load arrows (position and up/down), and support letters, by looking at the pixels. Only straight,
 * roughly horizontal beams; curved moment arrows and load shapes other than arrows are left to the text. */

export interface RGBA {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}
interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
export interface Word extends Box {
  text: string;
  score: number;
}
interface Band extends Box {}
interface Shaft extends Box {
  x: number;
  head: 'top' | 'bottom' | null;
  used?: boolean;
}

export interface DrawingRead {
  words: Word[];
  length?: number;
  lengthUnit?: LengthUnit;
  forceUnit?: ForceUnit;
  loads: Load[];
  supports: { label: string; x: number; type: SupportType }[];
  points: { label: string; x: number }[]; // other lettered points on the beam, e.g. C
}

const FORCE_UNITS: Record<string, ForceUnit> = { kn: 'kN', n: 'N', lb: 'lb', lbs: 'lb', kip: 'kip', kips: 'kip', k: 'kip' };
const LENGTH_UNITS: Record<string, LengthUnit> = { m: 'm', mm: 'mm', ft: 'ft', in: 'in' };
// unit spellings the word decoder may choose between; '·' covers a middle dot or hyphen
// ('k' for kip is left out: it turns stray marks into "4k"-like labels)
const UNITS = ['kN', 'N', 'lb', 'lbs', 'kip', 'kips', 'm', 'mm', 'ft', 'in', 'kN/m', 'N/m', 'lb/ft', 'kip/ft', 'kN·m', 'N·m', 'lb·ft', 'kip·ft'];
const LETTERS = 'ABCDEF';

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
  const words = readWords(comps, textMask, W, textH, shafts);
  const lenWords0 = words.filter((w) => LENGTH_UNITS[unitOf(w.text)] !== undefined && !w.text.includes('/'));
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
    const ticks = dimensionTicks(ink, hmask, W, dim, textH, words);
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
  const L = out.length;
  const snap = (x: number, tol = 0) => {
    if (L === undefined) return x;
    const t = Math.max(0.035 * L, 0.75 * tol);
    const near = [0, L, ...stops].sort((a, b) => Math.abs(a - x) - Math.abs(b - x))[0];
    return round(Math.abs(near - x) < t ? near : x);
  };

  // point loads: a force label and the arrow next to it
  const forceWords = words.filter((w) => FORCE_UNITS[unitOf(w.text).toLowerCase()] && !w.text.includes('/') && !/[·]/.test(w.text));
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
    const letters = words.filter((w) => w.text.length === 1 && LETTERS.includes(w.text) && !onArc(w) && Math.abs(cy(w) - (beam.y0 + beam.y1) / 2) < 3 * textH);
    // a wall: a long line through the beam end (its pieces above and below the beam count as one)
    const through = shafts.map((s) => {
      const below = shafts.find((t) => t !== s && Math.abs(t.x - s.x) <= 3 && s.y1 <= beam.y0 + 2 && t.y0 >= beam.y1 - 2 && t.y0 - s.y1 < beam.y1 - beam.y0 + 2 * textH);
      return below ? { ...s, y1: below.y1 } : s;
    });
    const walls = through.filter((s) => s.y0 < beam.y0 - textH && s.y1 > beam.y1 + textH && (Math.abs(s.x - beam.x0) < textH || Math.abs(s.x - beam.x1) < textH));
    if (walls.length === 1) {
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
export function applyDrawing(p: Problem, d: DrawingRead): Problem {
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

// ---------- pixels ----------

/** Angle (radians, within ±6°) that levels the drawing: lines and text rows line up best along it. */
function skewAngle(ink: Uint8Array, W: number, H: number): number {
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
function rotate(img: RGBA, a: number): RGBA {
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

function inkMask(img: RGBA): Uint8Array {
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

function horizontalLines(ink: Uint8Array, W: number, H: number) {
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

interface Comp extends Box {
  n: number;
  pixels: number[];
}
function components(mask: Uint8Array, W: number, H: number): Comp[] {
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

function estimateTextHeight(comps: Comp[], W: number, H: number): number {
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

function verticalShafts(mask: Uint8Array, W: number, H: number, min: number, maxGap = 2) {
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
function arrowHead(s: Shaft, mask: Uint8Array, W: number, textH: number): Shaft['head'] {
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

function beamBox(bands: Band[], textH: number): Box | null {
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
function dimensionTicks(ink: Uint8Array, hmask: Uint8Array, W: number, b: Band, textH: number, words: Word[]): number[] {
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
function supportBases(comps: Comp[], mask: Uint8Array, W: number, beam: Box, textH: number): { x: number; roller: boolean }[] {
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

/** x of the thickest spot of a stroke: a filled or closed arrowhead is denser than the line itself. */
function densest(c: Comp, mask: Uint8Array, W: number, textH: number): number {
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
function holes(mask: Uint8Array, W: number, b: Box): number[] {
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

function nearestShaft(w: Word, shafts: Shaft[], textH: number, beam: Box | null): Shaft | undefined {
  const dx = (s: Shaft) => Math.max(0, w.x0 - s.x, s.x - w.x1);
  const dy = (s: Shaft) => Math.max(0, w.y0 - s.y1, s.y0 - w.y1);
  return shafts
    .filter((s) => dx(s) < 3 * textH && dy(s) < 2 * textH && (!beam || s.y1 <= beam.y0 + textH || s.y0 >= beam.y1 - textH))
    .sort((a, b) => dx(a) + dy(a) - dx(b) - dy(b))[0];
}

/** Straight runs of (x, arrow length) points, as [x1, l1, x2, l2]. A run ends where a straight line from its
 * first point stops fitting; each split then moves to where the two neighbouring fitted lines cross. */
function linearPieces(xs: number[], ls: number[], tol: number): [number, number, number, number][] {
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
function extendRow(row: Shaft[], mask: Uint8Array, W: number, textH: number, above: boolean, beam: Box) {
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

function rowsOf(shafts: Shaft[], textH: number): Shaft[][] {
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

// ---------- words ----------

interface Glyph extends Box {
  mask: Uint8Array;
}

function readWords(comps: Comp[], mask: Uint8Array, W: number, textH: number, shafts: Shaft[]): Word[] {
  // an arrowhead straddles its shaft and touches its end; a label above the tail keeps a small gap
  const touch = Math.max(2, 0.12 * textH);
  const nearShaftEnd = (c: Comp) =>
    shafts.some(
      (s) =>
        c.x0 <= s.x1 + 2 && c.x1 >= s.x0 - 2 &&
        ((c.y0 >= s.y0 - touch && c.y1 <= s.y1 + touch) || // halves of a head the shaft runs through
          (s.head !== 'top' && c.y0 <= s.y1 + touch && c.y1 >= s.y1 - 0.8 * textH) ||
          (s.head !== 'bottom' && c.y1 >= s.y0 - touch && c.y0 <= s.y0 + 0.8 * textH)),
    );
  const small = comps.filter((c) => c.y1 - c.y0 + 1 <= 1.8 * textH && c.x1 - c.x0 + 1 <= 3 * textH && !nearShaftEnd(c));
  // join pieces of one character (the dot of an i, broken strokes)
  const parts: Box[][] = small.map((c) => [c]);
  for (let i = 0; i < parts.length; i++)
    for (let j = i + 1; j < parts.length; j++) {
      const a = bbox(parts[i]), b = bbox(parts[j]);
      const ov = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) + 1;
      const gap = Math.max(a.y0 - b.y1, b.y0 - a.y1);
      const inter = Math.max(0, ov) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
      const area = (q: Box) => (q.x1 - q.x0 + 1) * (q.y1 - q.y0 + 1);
      const together = (ov > 0.6 * Math.min(a.x1 - a.x0 + 1, b.x1 - b.x0 + 1) && gap < 0.45 * textH) || inter > 0.3 * Math.min(area(a), area(b));
      if (together && bbox([a, b]).y1 - bbox([a, b]).y0 < 1.6 * textH) {
        parts[i].push(...parts[j]);
        parts.splice(j, 1);
        j = i;
      }
    }
  const glyphs: Glyph[] = parts.map((p) => {
    const b = bbox(p);
    const w = b.x1 - b.x0 + 1, h = b.y1 - b.y0 + 1;
    const m = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) m[y * w + x] = mask[(b.y0 + y) * W + b.x0 + x];
    return { ...b, mask: m };
  });

  // group into words: same line, small gaps
  glyphs.sort((a, b) => a.x0 - b.x0);
  const groups: Glyph[][] = [];
  for (const g of glyphs) {
    const h = g.y1 - g.y0 + 1;
    const grp = groups.find((G) => {
      const last = G[G.length - 1];
      const lh = Math.max(...G.map((q) => q.y1 - q.y0 + 1), h);
      const top = Math.min(...G.map((q) => q.y0)), bot = Math.max(...G.map((q) => q.y1));
      const vo = Math.min(bot, g.y1) - Math.max(top, g.y0);
      return g.x0 - last.x1 < 1.1 * lh && g.x0 - last.x1 > -0.3 * lh && vo > -0.1 * lh && (vo > 0.3 * Math.min(h, bot - top + 1) || h < 0.4 * lh);
    });
    if (grp) grp.push(g);
    else groups.push([g]);
  }
  return groups.flatMap((g) => decodeGroup(g));
}

/** Read a group as one label; if that fails, split it at its widest gap and read the parts. */
function decodeGroup(gs: Glyph[], part = false): Word[] {
  if (gs.length > 14) return []; // a line of prose, not a label
  const w = decodeWord(gs);
  if (part && w && w.text.length === 1) return []; // a lone letter must stand alone, not be cut from text
  if (w && w.score > Math.log(0.3)) return [w];
  const parts = gs.length > 1 ? splitAtGap(gs) : [];
  const better = parts.length > 1 && parts.every((p) => p.score > (w?.score ?? -Infinity));
  return better ? parts : w ? [w] : parts;
}
function splitAtGap(gs: Glyph[]): Word[] {
  let at = 1;
  for (let i = 1; i < gs.length; i++) if (gs[i].x0 - gs[i - 1].x1 > gs[at].x0 - gs[at - 1].x1) at = i;
  return [...decodeGroup(gs.slice(0, at), true), ...decodeGroup(gs.slice(at), true)];
}

/** Best reading of a group of glyphs as a number with a unit, or as a single support letter. */
function decodeWord(raw: Glyph[]): Word | null {
  const H = Math.max(...raw.map((g) => g.y1 - g.y0 + 1));
  // touching characters ("ki", "ft") may each be one blob: try each blob whole and cut, keep the best reading
  let combos: Glyph[][] = [[]];
  for (const g of raw) {
    const opts = splitTouching(g, H);
    combos = combos.length * opts.length > 64 ? combos.map((c) => [...c, ...opts[0]]) : combos.flatMap((c) => opts.map((o) => [...c, ...o]));
  }
  let best: Word | null = null;
  for (const gs of combos) {
    const w = decodeSeq(gs, H);
    if (w && (!best || w.score > best.score)) best = w;
  }
  return best;
}

const probCache = new WeakMap<Glyph, Float32Array>();
function decodeSeq(gs: Glyph[], H: number): Word | null {
  const base = Math.max(...gs.map((g) => g.y1));
  const box = bbox(gs);
  // per glyph: probabilities over GLYPHS, or a punctuation mark judged by size and height
  const probs = gs.map((g) => {
    const w = g.x1 - g.x0 + 1, h = g.y1 - g.y0 + 1;
    if (h < 0.35 * H && w < 0.6 * H) return base - g.y1 < 0.2 * H ? '.' : '·';
    if (h < 0.3 * H && w >= 0.6 * H) return '·'; // a hyphen
    let pr = probCache.get(g);
    if (!pr) probCache.set(g, (pr = classify(glyphFeatures(g.mask, w, h, h / H))));
    return pr;
  });
  const p = (i: number, ch: string): number => {
    const pr = probs[i];
    if (typeof pr === 'string') return pr === ch || (ch === '.' && pr === '.') || (ch === '·' && pr === '·') ? 0.95 : 0.001;
    const alt: Record<string, string> = { k: 'kK', K: 'kK', N: 'Nn', n: 'nN', m: 'mM', l: 'l1i', i: 'il1', '1': '1li', '0': '0', s: 's5', b: 'b6', '/': '/1l' };
    let s = 0;
    for (const c of alt[ch] ?? ch) {
      const k = GLYPHS.indexOf(c);
      if (k >= 0) s += pr[k];
    }
    return Math.max(s, 0.0005);
  };
  const best = (i: number, set: string) => [...set].reduce((a, c) => (p(i, c) > a.p ? { c, p: p(i, c) } : a), { c: '', p: 0 });

  let top: Word | null = null;
  const consider = (text: string, logp: number) => {
    const score = logp / text.length;
    if (!top || score > top.score) top = { text, score, ...box };
  };
  const n = gs.length;
  if (n === 1) {
    const l = best(0, LETTERS + '0');
    const g = gs[0];
    const solid = g.x1 - g.x0 + 1 > 0.35 * (g.y1 - g.y0 + 1); // not a hatch stroke
    if (typeof probs[0] !== 'string' && solid && l.p > 0.45) consider(l.c === '0' ? 'O' : l.c, Math.log(l.p));
  }
  for (const u of UNITS) {
    const nd = n - u.length;
    if (nd < 1) continue;
    let lp = 0;
    for (let k = 0; k < u.length; k++) lp += Math.log(p(nd + k, u[k]));
    let num = '';
    let dot = false;
    lp += Math.max(0, nd - 3) * Math.log(0.05); // labels rarely carry more than three digits
    for (let i = 0; i < nd; i++) {
      const d = best(i, dot || i === 0 || i === nd - 1 ? '0123456789' : '0123456789.');
      if (d.c === '.') dot = true;
      num += d.c;
      lp += Math.log(d.p);
    }
    consider(num + u, lp);
  }
  return top && (top as Word).score > Math.log(0.12) ? top : null;
}

/** Ways to read one blob: whole, or cut at its best thin column into two (each possibly cut again).
 * Hand-written and serif characters often touch ("50" in one stroke, "ki", "ft"). */
function splitTouching(g: Glyph, H: number, depth = 0): Glyph[][] {
  const w = g.x1 - g.x0 + 1, h = g.y1 - g.y0 + 1;
  if (w < 0.7 * H || depth > 1) return [[g]];
  const conf = (q: Glyph) => {
    const qw = q.x1 - q.x0 + 1, qh = q.y1 - q.y0 + 1;
    let pr = probCache.get(q);
    if (!pr) probCache.set(q, (pr = classify(glyphFeatures(q.mask, qw, qh, qh / H))));
    return Math.max(...pr);
  };
  const col = (x: number) => {
    let n = 0;
    for (let y = 0; y < h; y++) n += g.mask[y * w + x];
    return n;
  };
  const part = (a: number, b: number): Glyph | null => {
    let y0 = h, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = a; x < b; x++) if (g.mask[y * w + x]) (y0 = Math.min(y0, y)), (y1 = Math.max(y1, y));
    if (y1 < 0) return null;
    const pw = b - a, ph = y1 - y0 + 1;
    const m = new Uint8Array(pw * ph);
    for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) m[y * pw + x] = g.mask[(y0 + y) * w + a + x];
    return { x0: g.x0 + a, x1: g.x0 + b - 1, y0: g.y0 + y0, y1: g.y0 + y1, mask: m };
  };
  // try every cut through thin columns; keep the one whose weaker half reads best
  const cols = Array.from({ length: w }, (_, x) => col(x));
  const lo = Math.round(0.25 * w), hi = Math.round(0.75 * w);
  const minN = Math.min(...cols.slice(lo, hi + 1));
  let best: { L: Glyph; R: Glyph; c: number } | null = null;
  for (let x = lo; x <= hi; x++) {
    if (cols[x] > minN + Math.max(2, 0.15 * h)) continue;
    const L = part(0, x), R = part(x, w);
    if (!L || !R || L.y1 - L.y0 < 0.4 * H || R.y1 - R.y0 < 0.4 * H) continue;
    const c = Math.min(conf(L), conf(R));
    if (!best || c > best.c) best = { L, R, c };
  }
  if (!best || best.c < 0.3) return [[g]];
  const { L, R } = best;
  const out: Glyph[][] = [[g]];
  for (const l of splitTouching(L, H, depth + 1)) for (const r of splitTouching(R, H, depth + 1)) out.push([...l, ...r]);
  return out;
}

// ---------- helpers ----------

const cx = (b: Box) => (b.x0 + b.x1) / 2;
const cy = (b: Box) => (b.y0 + b.y1) / 2;
const bbox = (bs: Box[]): Box => ({
  x0: Math.min(...bs.map((b) => b.x0)),
  y0: Math.min(...bs.map((b) => b.y0)),
  x1: Math.max(...bs.map((b) => b.x1)),
  y1: Math.max(...bs.map((b) => b.y1)),
});
const unitOf = (t: string) => t.replace(/^[\d.]+/, '');
const valueOf = (t: string) => parseFloat(t);
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const round = (x: number, d = 3) => Math.round(x * 10 ** d) / 10 ** d;
const dist = (w: Word, row: Shaft[]) => Math.abs(cx(w) - (row[0].x + row[row.length - 1].x) / 2) + Math.abs(cy(w) - row[0].y0);
function interp(xs: number[], ys: number[], x: number) {
  if (x <= xs[0]) return ys[0] + ((x - xs[0]) * (ys[1] - ys[0])) / (xs[1] - xs[0]);
  for (let i = 1; i < xs.length; i++)
    if (x <= xs[i] || i === xs.length - 1) return ys[i - 1] + ((x - xs[i - 1]) * (ys[i] - ys[i - 1])) / (xs[i] - xs[i - 1]);
  return ys[ys.length - 1];
}
