import { distResultant, loadsMomentAbout, totalDownward, totalRight } from './loads';
import { add, evaluate, derivative, integrate, rootsIn, scale, shiftedPow, type Poly } from './poly';
import type { BeamKind, Problem } from './types';
import { validate } from './validate';

export interface Reaction {
  supportId: string;
  label: string;
  x: number;
  y: number; // height of the support above the beam axis (0 unless it sits on an arm)
  type: 'pin' | 'roller' | 'fixed';
  Ry: number; // up positive
  Rx: number; // right positive; a roller's is 0 unless it is inclined
  M?: number; // fixed-end moment, counter-clockwise positive
  angle?: number; // inclined roller: its reaction acts along this direction (degrees from +x), size R
  R?: number;
}

/** One segment between breakpoints. Polys are in t = x - a. */
export interface Segment {
  a: number;
  b: number;
  V: Poly; // shear: sum of upward forces left of the cut
  N: Poly; // normal force, tension positive (constant: only point loads act along the beam)
  M: Poly; // bending moment, sagging positive
  EIslope: Poly; // EI * dy/dx
  EIy: Poly; // EI * y (y up positive)
}

export interface Extreme {
  value: number;
  x: number;
}

export interface Solution {
  kind: BeamKind;
  reactions: Reaction[];
  segments: Segment[];
  breakpoints: number[];
  max: { V: Extreme; M: Extreme; EIy: Extreme };
  min: { V: Extreme; M: Extreme; EIy: Extreme };
}

const tol = 1e-9;

export type SolveOutcome = { ok: true; solution: Solution } | { ok: false; comingSoon: boolean; reason: string };

export function solve(p: Problem): SolveOutcome {
  const v = validate(p);
  if (!v.ok) return v;
  const L = p.length;
  const reactions: Reaction[] = [];

  if (v.kind === 'simple') {
    const A = v.primary;
    const B = v.secondary!;
    // ΣM_A = 0: R_B along (cos θ, sin θ) at B, moment R_B (sin θ Δx - cos θ Δy), plus ΣM_loads,A = 0
    const th = ((B.angle ?? 90) * Math.PI) / 180;
    const [c, sn] = B.angle === undefined ? [0, 1] : [Math.cos(th), Math.sin(th)];
    const R = -loadsMomentAbout(p.loads, A.x, A.y) / (sn * (B.x - A.x) - c * ((B.y ?? 0) - (A.y ?? 0)));
    const [RBx, RBy] = [R * c, R * sn];
    reactions.push({ supportId: A.id, label: A.label, x: A.x, y: A.y ?? 0, type: 'pin', Ry: totalDownward(p.loads) - RBy, Rx: -totalRight(p.loads) - RBx });
    reactions.push({ supportId: B.id, label: B.label, x: B.x, y: B.y ?? 0, type: 'roller', Ry: RBy, Rx: RBx, ...(B.angle === undefined ? {} : { angle: B.angle, R }) });
    reactions.sort((r1, r2) => r1.x - r2.x);
  } else {
    const F = v.primary;
    const Ry = totalDownward(p.loads);
    const M = -loadsMomentAbout(p.loads, F.x, F.y); // ΣM_F = 0
    reactions.push({ supportId: F.id, label: F.label, x: F.x, y: F.y ?? 0, type: 'fixed', Ry, Rx: -totalRight(p.loads), M });
  }

  // breakpoints
  const xs = [0, L, ...reactions.map((r) => r.x)];
  for (const l of p.loads) {
    if (l.kind === 'dist') xs.push(l.x1, l.x2);
    else xs.push(l.x);
  }
  const breakpoints = uniqueSorted(xs.filter((x) => x >= -tol && x <= L + tol).map((x) => clamp(x, 0, L)));

  // shear and moment per segment, exact
  const segments: Segment[] = [];
  for (let i = 0; i < breakpoints.length - 1; i++) {
    const a = breakpoints[i];
    const b = breakpoints[i + 1];
    let V: Poly = [0];
    let M: Poly = [0];
    let N = 0;
    // a force left of the cut, (Fx right, Fy up) acting yi above the axis
    const force = (Fx: number, Fy: number, xi: number, yi: number) => {
      V = add(V, [Fy]);
      M = add(M, [Fy * (a - xi) + Fx * yi, Fy]);
      N -= Fx;
    };
    for (const r of reactions) {
      if (r.x <= a + tol) {
        force(r.Rx, r.Ry, r.x, r.y);
        if (r.M) M = add(M, [-r.M]);
      }
    }
    for (const l of p.loads) {
      if (l.kind === 'point' && l.x <= a + tol) force(l.Px ?? 0, -l.P, l.x, l.y ?? 0);
      else if (l.kind === 'moment' && l.x <= a + tol) M = add(M, [l.dir === 'ccw' ? -l.M : l.M]);
      else if (l.kind === 'dist') {
        if (l.x2 <= a + tol) {
          const { W, first } = distResultant(l);
          V = add(V, [-W]);
          M = add(M, [-(W * a - first), -W]);
        } else if (l.x1 <= a + tol && b <= l.x2 + tol) {
          const k = (l.w2 - l.w1) / (l.x2 - l.x1);
          const s0 = a - l.x1;
          V = add(V, scale(add(scale(shiftedPow(s0, 1), l.w1), scale(shiftedPow(s0, 2), k / 2)), -1));
          M = add(M, scale(add(scale(shiftedPow(s0, 2), l.w1 / 2), scale(shiftedPow(s0, 3), k / 6)), -1));
        }
      }
    }
    segments.push({ a, b, V: trim(V), N: trim([N]), M: trim(M), EIslope: [], EIy: [] });
  }

  // deflection: EI y'' = M, integrate twice from x = 0, then apply support conditions
  let th0 = 0;
  let y0 = 0;
  for (const s of segments) {
    s.EIslope = integrate(s.M, th0);
    s.EIy = integrate(s.EIslope, y0);
    th0 = evaluate(s.EIslope, s.b - s.a);
    y0 = evaluate(s.EIy, s.b - s.a);
  }
  const raw = (x: number, which: 'EIslope' | 'EIy') => valueAt(segments, x, which, 'left');
  let C1: number;
  let C2: number;
  if (v.kind === 'simple') {
    const xa = v.primary.x;
    const xb = v.secondary!.x;
    C1 = -(raw(xb, 'EIy') - raw(xa, 'EIy')) / (xb - xa);
    C2 = -raw(xa, 'EIy') - C1 * xa;
  } else {
    const xf = v.primary.x;
    C1 = -raw(xf, 'EIslope');
    C2 = -raw(xf, 'EIy') - C1 * xf;
  }
  for (const s of segments) {
    s.EIslope = trim(add(s.EIslope, [C1]));
    s.EIy = trim(add(s.EIy, [C1 * s.a + C2, C1]));
  }

  const ext = (which: 'V' | 'M' | 'EIy') => extremes(segments, which);
  const eV = ext('V');
  const eM = ext('M');
  const eY = ext('EIy');
  return {
    ok: true,
    solution: {
      kind: v.kind,
      reactions,
      segments,
      breakpoints,
      max: { V: eV.max, M: eM.max, EIy: eY.max },
      min: { V: eV.min, M: eM.min, EIy: eY.min },
    },
  };
}

type Field = 'V' | 'N' | 'M' | 'EIslope' | 'EIy';

/** Value at x. At a breakpoint, 'left' takes the limit from the left, 'right' from the right. */
export function valueAt(segments: Segment[], x: number, f: Field, side: 'left' | 'right' = 'right'): number {
  if (!segments.length) return 0;
  let seg = segments[segments.length - 1];
  for (const s of segments) {
    if (side === 'right' ? x < s.b - tol : x <= s.b + tol) {
      seg = s;
      break;
    }
  }
  if (side === 'left' && x <= segments[0].a + tol) seg = segments[0];
  return evaluate(seg[f], clamp(x, seg.a, seg.b) - seg.a);
}

function extremes(segments: Segment[], f: 'V' | 'M' | 'EIy') {
  let max: Extreme = { value: -Infinity, x: 0 };
  let min: Extreme = { value: Infinity, x: 0 };
  const consider = (value: number, x: number) => {
    if (value > max.value + 1e-12) max = { value, x };
    if (value < min.value - 1e-12) min = { value, x };
  };
  for (const s of segments) {
    const h = s.b - s.a;
    const p = s[f];
    consider(evaluate(p, 0), s.a);
    consider(evaluate(p, h), s.b);
    for (const t of rootsIn(derivative(p), h)) consider(evaluate(p, t), s.a + t);
  }
  return { max: clean(max), min: clean(min) };
}

/** Moment of the applied loads about the point (x, y), counter-clockwise positive. */
export function momentAboutPoint(p: Problem, x: number, y = 0, withReactions?: Reaction[]): number {
  let M = loadsMomentAbout(p.loads, x, y);
  for (const r of withReactions ?? []) M += r.Ry * (r.x - x) - r.Rx * (r.y - y) + (r.M ?? 0);
  return M;
}

/** Where a support or named point sits: x along the beam, y above its axis. */
export function pointAt(p: Problem, label: string): { x: number; y: number } | undefined {
  const s = p.supports.find((s) => s.label === label) ?? p.points.find((q) => q.label === label);
  return s && { x: s.x, y: s.y ?? 0 };
}

function trim(p: Poly): Poly {
  const out = p.map((c) => (Math.abs(c) < 1e-12 ? 0 : c));
  while (out.length > 1 && out[out.length - 1] === 0) out.pop();
  return out;
}
function clean(e: Extreme): Extreme {
  return { value: Math.abs(e.value) < 1e-9 ? 0 : e.value, x: e.x };
}
function clamp(x: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, x));
}
function uniqueSorted(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  return s.filter((x, i) => i === 0 || x - s[i - 1] > 1e-9);
}
