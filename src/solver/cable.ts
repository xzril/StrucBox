// Flexible cables (Hibbeler 7.4): concentrated loads, a load distributed along the horizontal (parabola-like),
// or the cable's own weight (catenary). Internal convention: x right, y up, loads act downward.
import type { Units } from './types';

export interface CablePoint {
  id: string;
  label: string;
  x: number;
  P: number; // downward
}
/** The one extra fact that fixes the cable's sag. */
export type CableGiven =
  | { kind: 'y'; x: number; y: number } // a point of the cable, e.g. the sag at a load
  | { kind: 'sag'; h: number } // lowest point h below A
  | { kind: 'Tmax'; T: number }
  | { kind: 'H'; H: number } // horizontal component of the tension
  | { kind: 'length'; s: number };
export interface Cable {
  kind: 'cable';
  title: string;
  text: string;
  units: Units;
  A: { label: string; x: number; y: number };
  B: { label: string; x: number; y: number };
  points: CablePoint[];
  w1: number; // load per horizontal length at A and at B (linear between); 0 if none
  w2: number;
  w0: number; // own weight per length of cable; 0 if none
  given: CableGiven;
  answerKey?: string;
}

export interface CableSolution {
  H: number;
  y: (x: number) => number;
  slope: (x: number) => number;
  TA: number;
  TB: number;
  Tmax: number;
  length: number;
  low?: { x: number; y: number }; // lowest point, when it lies between the supports
  pointY: number[]; // y at each concentrated load
  segments: { from: string; to: string; T: number; slope: number }[]; // straight pieces between concentrated loads
  c?: number; // catenary: x of the vertex
  yv?: number; // catenary: y of the vertex
}
export type CableOutcome = { ok: true; solution: CableSolution } | { ok: false; comingSoon: boolean; reason: string };

/** Moment and shear of the loads as on a simply supported beam of the same span (the cable theorem). */
function beam(c: Cable) {
  const L = c.B.x - c.A.x;
  const pts = c.points.map((p) => ({ t: p.x - c.A.x, P: p.P }));
  const [w1, k] = [c.w1, (c.w2 - c.w1) / L];
  const W = (w1 + c.w2) * L / 2;
  // R_A from ΣM_B: loads' moment about B / L. Distributed part: ∫ w(t)(L−t) dt = w1 L²/2 + k L³/6
  const RA = (pts.reduce((m, p) => m + p.P * (L - p.t), 0) + (w1 * L * L) / 2 + (k * L ** 3) / 6) / L;
  const M = (t: number) => RA * t - pts.reduce((m, p) => m + (p.t < t ? p.P * (t - p.t) : 0), 0) - (w1 * t * t) / 2 - (k * t ** 3) / 6;
  const V = (t: number) => RA - pts.reduce((m, p) => m + (p.t < t ? p.P : 0), 0) - w1 * t - (k * t * t) / 2;
  return { L, RA: RA, RB: W + pts.reduce((m, p) => m + p.P, 0) - RA, M, V, W: W + pts.reduce((m, p) => m + p.P, 0) };
}

/** Shape for a trial horizontal tension H. */
function shape(c: Cable, H: number) {
  const L = c.B.x - c.A.x;
  const m = (c.B.y - c.A.y) / L;
  if (c.w0) {
    // y = yv + (H/w0)(cosh(k(x−c)) − 1), k = w0/H, through A and B
    const k = c.w0 / H;
    const mid = (c.A.x + c.B.x) / 2;
    const cx = mid - Math.asinh((k * (c.B.y - c.A.y)) / (2 * Math.sinh((k * L) / 2))) / k;
    const yv = c.A.y - (Math.cosh(k * (c.A.x - cx)) - 1) / k;
    return {
      y: (x: number) => yv + (Math.cosh(k * (x - cx)) - 1) / k,
      slope: (x: number) => Math.sinh(k * (x - cx)),
      length: (Math.sinh(k * (c.B.x - cx)) - Math.sinh(k * (c.A.x - cx))) / k,
      cx,
      yv,
    };
  }
  const b = beam(c);
  const y = (x: number) => c.A.y + m * (x - c.A.x) - b.M(x - c.A.x) / H;
  const slope = (x: number) => m - b.V(x - c.A.x) / H;
  // length: Simpson on each piece between concentrated loads, where the slope is smooth
  const cuts = [c.A.x, ...c.points.map((p) => p.x).sort((a, b) => a - b), c.B.x];
  let length = 0;
  for (let i = 0; i + 1 < cuts.length; i++) {
    const [a, e] = [cuts[i], cuts[i + 1]];
    const n = 64;
    const h = (e - a) / n;
    const f = (x: number) => Math.hypot(1, slope(x));
    // evaluate just inside the piece so a kink's jump does not leak in
    const g = (j: number) => f(Math.min(e - 1e-12 * L, Math.max(a + 1e-12 * L, a + j * h)));
    let sum = g(0) + g(n);
    for (let j = 1; j < n; j++) sum += (j % 2 ? 4 : 2) * g(j);
    length += (sum * h) / 3;
  }
  return { y, slope, length, cx: undefined, yv: undefined };
}

const tension = (H: number, slope: number) => H * Math.hypot(1, slope);
const ends = (c: Cable, s: ReturnType<typeof shape>, H: number) => {
  const L = c.B.x - c.A.x;
  return { TA: tension(H, s.slope(c.A.x + 1e-12 * L)), TB: tension(H, s.slope(c.B.x - 1e-12 * L)) };
};
function lowest(c: Cable, s: ReturnType<typeof shape>): { x: number; y: number } {
  if (s.cx !== undefined && s.cx > c.A.x && s.cx < c.B.x) return { x: s.cx, y: s.yv! };
  // slope rises along the cable (loads act down): find where it changes sign, or a kink where it jumps across 0
  let [lo, hi] = [c.A.x, c.B.x];
  if (s.slope(lo + 1e-9) >= 0) return { x: lo, y: c.A.y };
  if (s.slope(hi - 1e-9) <= 0) return { x: hi, y: c.B.y };
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (s.slope(mid) < 0) lo = mid;
    else hi = mid;
  }
  return { x: lo, y: s.y(lo) };
}

export function solveCable(c: Cable): CableOutcome {
  const L = c.B.x - c.A.x;
  if (!(L > 0)) return { ok: false, comingSoon: false, reason: 'Support B must be to the right of support A.' };
  if (c.points.some((p) => !(p.x > c.A.x && p.x < c.B.x))) return { ok: false, comingSoon: false, reason: 'Each concentrated load must lie between the supports.' };
  if (c.w0 && (c.points.length || c.w1 || c.w2))
    return { ok: false, comingSoon: true, reason: 'A cable under its own weight and other loads together' };
  const W = c.w0 ? c.w0 * Math.hypot(L, c.B.y - c.A.y) : beam(c).W;
  if (!(W > 0)) return { ok: false, comingSoon: false, reason: 'Enter the loads on the cable.' };
  if ([...c.points.map((p) => p.P), c.w1, c.w2, c.w0].some((v) => v < 0))
    return { ok: false, comingSoon: true, reason: 'Upward loads on a cable' };

  const g = c.given;
  // residual of the given fact for a trial H; it changes sign at the answer
  const residual = (H: number): number => {
    const s = shape(c, H);
    switch (g.kind) {
      case 'H':
        return H - g.H;
      case 'y':
        return s.y(g.x) - g.y;
      case 'sag':
        return lowest(c, s).y - (c.A.y - g.h);
      case 'Tmax': {
        const e = ends(c, s, H);
        return Math.max(e.TA, e.TB) - g.T;
      }
      case 'length':
        return g.s - s.length;
    }
  };
  if (g.kind === 'y' && !(g.x > c.A.x && g.x < c.B.x)) return { ok: false, comingSoon: false, reason: 'The given point of the cable must lie between the supports.' };
  if (g.kind === 'length' && g.s <= Math.hypot(L, c.B.y - c.A.y))
    return { ok: false, comingSoon: false, reason: 'The cable is shorter than the distance between its supports.' };

  // scan H from very slack to very taut and take the tautest answer (a deep, slack cable is the other root of T_max)
  let H = g.kind === 'H' ? g.H : NaN;
  if (g.kind !== 'H') {
    const N = 600;
    const at = (i: number) => W * 10 ** (-4 + (9 * i) / N);
    const sign = (v: number) => (Number.isFinite(v) ? Math.sign(v) : NaN);
    for (let i = N; i > 0 && Number.isNaN(H); i--) {
      const [a, b] = [sign(residual(at(i - 1))), sign(residual(at(i)))];
      if (a && b && a !== b) {
        let [lo, hi] = [at(i - 1), at(i)];
        for (let k = 0; k < 200; k++) {
          const mid = Math.sqrt(lo * hi);
          if (sign(residual(mid)) === a) lo = mid;
          else hi = mid;
        }
        H = Math.sqrt(lo * hi);
      }
    }
    if (Number.isNaN(H)) return { ok: false, comingSoon: false, reason: 'No cable shape fits the given value. Check it against the figure.' };
  }
  if (!(H > 0)) return { ok: false, comingSoon: false, reason: 'The horizontal tension must be positive.' };

  const s = shape(c, H);
  const { TA, TB } = ends(c, s, H);
  const sorted = [...c.points].sort((a, b) => a.x - b.x);
  const corners = [{ label: c.A.label, x: c.A.x, y: c.A.y }, ...sorted.map((p) => ({ label: p.label, x: p.x, y: s.y(p.x) })), { label: c.B.label, x: c.B.x, y: c.B.y }];
  const segments =
    c.w0 || c.w1 || c.w2
      ? []
      : corners.slice(1).map((q, i) => {
          const p = corners[i];
          const sl = (q.y - p.y) / (q.x - p.x);
          return { from: p.label, to: q.label, T: tension(H, sl), slope: sl };
        });
  const low = lowest(c, s);
  return {
    ok: true,
    solution: {
      H,
      y: s.y,
      slope: s.slope,
      TA,
      TB,
      Tmax: Math.max(TA, TB),
      length: s.length,
      low: low.x > c.A.x && low.x < c.B.x ? low : undefined,
      pointY: c.points.map((p) => s.y(p.x)),
      segments,
      c: s.cx,
      yv: s.yv,
    },
  };
}
