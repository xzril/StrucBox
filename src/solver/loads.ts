import { add, evaluate, integrate, mul, scale, shiftedPow, type Poly } from './poly';
import type { DistLoad, Load } from './types';

/** Intensity w as a polynomial in t = x - x1 (downward positive). */
export function intensity(l: DistLoad): Poly {
  if (!l.poly) return [l.w1, (l.w2 - l.w1) / (l.x2 - l.x1)];
  // x - x0 = t + (x1 - x0)
  return l.poly.reduce<Poly>((w, c, k) => add(w, scale(shiftedPow(l.x1 - (l.x0 ?? 0), k), c)), [0]);
}

/** Resultant of a distributed load: W (downward) and first moment about x = 0. */
export function distResultant(l: DistLoad): { W: number; first: number; xc: number } {
  const len = l.x2 - l.x1;
  const w = intensity(l);
  const W = evaluate(integrate(w), len);
  const first = l.x1 * W + evaluate(integrate(mul([0, 1], w)), len);
  return { W, first, xc: W !== 0 ? first / W : l.x1 + len / 2 };
}

/** Total downward force of all loads. */
export function totalDownward(loads: Load[]): number {
  let F = 0;
  for (const l of loads) {
    if (l.kind === 'point') F += l.P;
    else if (l.kind === 'dist') F += distResultant(l).W;
  }
  return F;
}

/** Total horizontal force of all loads, positive to the right. */
export function totalRight(loads: Load[]): number {
  return loads.reduce((F, l) => F + (l.kind === 'point' ? l.Px ?? 0 : 0), 0);
}

/** Signed moment, counter-clockwise positive, of one load about the point (p, py); y up from the beam axis. */
export function loadMomentAbout(l: Load, p: number, py = 0): number {
  if (l.kind === 'point') return -l.P * (l.x - p) - (l.Px ?? 0) * ((l.y ?? 0) - py);
  if (l.kind === 'moment') return l.dir === 'ccw' ? l.M : -l.M;
  const { W, first } = distResultant(l);
  return -(first - W * p);
}

export function loadsMomentAbout(loads: Load[], p: number, py = 0): number {
  return loads.reduce((s, l) => s + loadMomentAbout(l, p, py), 0);
}
