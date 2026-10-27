// Reading the short labels of a figure ("50 kN", "2 m", "A") from blobs of ink.
import { classify, GLYPHS, glyphFeatures } from './glyphs';
import { bbox, type Box, type Comp, type Shaft, type Word } from './drawing-pixels';

// unit spellings the word decoder may choose between; '·' covers a middle dot or hyphen
// ('k' for kip is left out: it turns stray marks into "4k"-like labels)
export const UNITS = ['kN', 'N', 'lb', 'lbs', 'kip', 'kips', 'm', 'mm', 'ft', 'in', 'kN/m', 'N/m', 'lb/ft', 'kip/ft', 'kN·m', 'N·m', 'lb·ft', 'kip·ft'];
export const LETTERS = 'ABCDEF';

interface Glyph extends Box {
  mask: Uint8Array;
}

/** digits: read bare numbers only (the sides of a slope triangle), for blobs already known to sit by an inclined arrow. */
export function readWords(comps: Comp[], mask: Uint8Array, W: number, textH: number, shafts: Shaft[], digits = false): Word[] {
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
  return groups.flatMap((g) => decodeGroup(g, false, digits));
}

/** Read a group as one label; if that fails, split it at its widest gap and read the parts. */
function decodeGroup(gs: Glyph[], part = false, digits = false): Word[] {
  if (gs.length > 14) return []; // a line of prose, not a label
  const w = decodeWord(gs, digits);
  if (part && w && w.text.length === 1) return []; // a lone letter must stand alone, not be cut from text
  if (w && w.score > Math.log(0.3)) return [w];
  const parts = gs.length > 1 ? splitAtGap(gs, digits) : [];
  const better = parts.length > 1 && parts.every((p) => p.score > (w?.score ?? -Infinity));
  return better ? parts : w ? [w] : parts;
}
function splitAtGap(gs: Glyph[], digits: boolean): Word[] {
  let at = 1;
  for (let i = 1; i < gs.length; i++) if (gs[i].x0 - gs[i - 1].x1 > gs[at].x0 - gs[at - 1].x1) at = i;
  return [...decodeGroup(gs.slice(0, at), true, digits), ...decodeGroup(gs.slice(at), true, digits)];
}

/** Best reading of a group of glyphs as a number with a unit, or as a single support letter. */
function decodeWord(raw: Glyph[], digits: boolean): Word | null {
  const H = Math.max(...raw.map((g) => g.y1 - g.y0 + 1));
  // touching characters ("ki", "ft") may each be one blob: try each blob whole and cut, keep the best reading
  let combos: Glyph[][] = [[]];
  for (const g of raw) {
    const opts = splitTouching(g, H);
    combos = combos.length * opts.length > 64 ? combos.map((c) => [...c, ...opts[0]]) : combos.flatMap((c) => opts.map((o) => [...c, ...o]));
  }
  let best: Word | null = null;
  for (const gs of combos) {
    const w = decodeSeq(gs, H, digits);
    if (w && (!best || w.score > best.score)) best = w;
  }
  return best;
}

const probCache = new WeakMap<Glyph, Float32Array>();
function decodeSeq(gs: Glyph[], H: number, digits: boolean): Word | null {
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
  // a bare number of one or two digits: a side of a slope triangle ("3", "4", "5", "12", "13")
  if (digits) {
    if (n > 2 || probs.some((pr) => typeof pr === 'string')) return null;
    let lp = 0;
    let num = '';
    for (let i = 0; i < n; i++) {
      const d = best(i, i === 0 ? '123456789' : '0123456789');
      num += d.c;
      lp += Math.log(d.p);
    }
    consider(num, lp);
    return top && (top as Word).score > Math.log(0.12) ? top : null;
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
