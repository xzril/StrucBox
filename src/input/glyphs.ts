import model from './glyph-model.json';

/** Small built-in character reader for drawing labels (numbers, units, support letters).
 * Tesseract handles printed paragraphs; this handles the short, often hand-drawn labels in figures.
 * Trained by scripts/train_glyphs.py on printed and handwriting fonts. */

export const GLYPHS: string = model.classes;
const S: number = model.side;

function dequant(q: { scale: number; shape: number[]; data: string }) {
  const bin = typeof atob === 'function' ? atob(q.data) : Buffer.from(q.data, 'base64').toString('binary');
  const out = new Float32Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    const v = bin.charCodeAt(i);
    out[i] = (v > 127 ? v - 256 : v) * q.scale;
  }
  return { w: out, rows: q.shape[0], cols: q.shape[1] };
}
let layers: { w: Float32Array; rows: number; cols: number; b: number[] }[] | null = null;
const net = () => (layers ??= model.W.map((q, i) => ({ ...dequant(q), b: model.b[i] })));

/** Resample a 0/1 mask to nw×nh like Pillow's BILINEAR resize (triangle filter widened when shrinking). */
function resize(src: Uint8Array, w: number, h: number, nw: number, nh: number): Float32Array {
  const pass = (n: number, out: number, at: (o: number, i: number) => number, len: number, stride: number) => {
    const res = new Float32Array(out * stride);
    const scale = n / out;
    const sup = Math.max(scale, 1);
    for (let o = 0; o < out; o++) {
      const c = (o + 0.5) * scale;
      const lo = Math.max(0, Math.floor(c - sup));
      const hi = Math.min(n, Math.ceil(c + sup));
      let tw = 0;
      const ws: number[] = [];
      for (let i = lo; i < hi; i++) {
        const t = Math.max(0, 1 - Math.abs((i + 0.5 - c) / sup));
        ws.push(t);
        tw += t;
      }
      for (let k = 0; k < len; k++) {
        let acc = 0;
        for (let i = lo; i < hi; i++) acc += ws[i - lo] * at(k, i);
        res[o * stride + k] = tw ? acc / tw : 0;
      }
    }
    return res;
  };
  // horizontal pass: rows of length nw; res[x * h + y]
  const hp = pass(w, nw, (y, x) => src[y * w + x] * 255, h, h);
  // vertical pass on hp
  const vp = pass(h, nh, (x, y) => hp[x * h + y], nw, nw);
  return vp; // vp[y * nw + x]
}

/** Features as in scripts/train_glyphs.py: mask fitted into S×S keeping aspect, then aspect and height relative to the word. */
export function glyphFeatures(mask: Uint8Array, w: number, h: number, relH: number): Float32Array {
  const k = (S - 2) / Math.max(w, h);
  const nw = Math.max(1, Math.round(w * k));
  const nh = Math.max(1, Math.round(h * k));
  const r = resize(mask, w, h, nw, nh);
  const f = new Float32Array(S * S + 2);
  const ox = (S - nw) >> 1;
  const oy = (S - nh) >> 1;
  for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) f[(oy + y) * S + ox + x] = Math.round(Math.min(255, r[y * nw + x])) / 255;
  f[S * S] = Math.min(w / h, 3) / 3;
  f[S * S + 1] = Math.min(relH, 1.5) / 1.5;
  return f;
}

/** Probability of each class in GLYPHS. */
export function classify(f: Float32Array): Float32Array {
  let x: ArrayLike<number> = f;
  const L = net();
  L.forEach((l, li) => {
    const out = new Float32Array(l.cols);
    for (let j = 0; j < l.cols; j++) out[j] = l.b[j];
    for (let i = 0; i < l.rows; i++) {
      const xi = x[i];
      if (!xi) continue;
      const row = i * l.cols;
      for (let j = 0; j < l.cols; j++) out[j] += xi * l.w[row + j];
    }
    if (li < L.length - 1) for (let j = 0; j < l.cols; j++) out[j] = Math.max(0, out[j]);
    x = out;
  });
  const z = x as Float32Array;
  const m = Math.max(...z);
  let s = 0;
  for (let j = 0; j < z.length; j++) s += z[j] = Math.exp(z[j] - m);
  for (let j = 0; j < z.length; j++) z[j] /= s;
  return z;
}
