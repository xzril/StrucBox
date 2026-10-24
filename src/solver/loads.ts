import type { DistLoad, Load } from './types';

/** Resultant of a linear distributed load: W (downward) and first moment about x = 0. */
export function distResultant(l: DistLoad): { W: number; first: number; xc: number } {
  const a = l.x1;
  const len = l.x2 - l.x1;
  // split into a uniform part (w1) and a triangle (w2 - w1) rising to x2
  const Wu = l.w1 * len;
  const Wt = ((l.w2 - l.w1) * len) / 2;
  const first = Wu * (a + len / 2) + Wt * (a + (2 * len) / 3);
  const W = Wu + Wt;
  return { W, first, xc: W !== 0 ? first / W : a + len / 2 };
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

/** Signed moment, counter-clockwise positive, of one load about x = p. */
export function loadMomentAbout(l: Load, p: number): number {
  if (l.kind === 'point') return -l.P * (l.x - p);
  if (l.kind === 'moment') return l.dir === 'ccw' ? l.M : -l.M;
  const { W, first } = distResultant(l);
  return -(first - W * p);
}

export function loadsMomentAbout(loads: Load[], p: number): number {
  return loads.reduce((s, l) => s + loadMomentAbout(l, p), 0);
}
