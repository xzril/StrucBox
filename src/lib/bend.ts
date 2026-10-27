import { distResultant } from '../solver/loads';
import type { Solution } from '../solver/solve';
import type { Problem } from '../solver/types';
import { eiInProblemUnits, FORCE_TO_N, LENGTH_TO_M } from './units';

const totalLoad = (p: Problem) =>
  p.loads.reduce((f, l) => f + Math.abs(l.kind === 'point' ? l.P : l.kind === 'dist' ? distResultant(l).W : l.M / p.length), 0);

/** Size of the loads times span³ (F·L³, N·m³): how much this problem bends. */
export const loadSize = (p: Problem) => totalLoad(p) * FORCE_TO_N[p.units.force] * (p.length * LENGTH_TO_M[p.units.length]) ** 3;

/** Factor from EI·y (problem units) to drawn world units, for a beam drawn S world units per length unit (D14).
 * It depends on the sizes of the loads and the span, never on where the loads sit, so the bend grows and
 * shrinks smoothly while a load is dragged (no jump to straight when it reaches a support).
 * q0: the loadSize the view opened with; when loads are edited the exaggerated bend changes in proportion. */
export function bendScale(p: Problem, s: Solution, S: number, q0 = loadSize(p)): { k: number; trueScale: boolean } {
  const L = p.length;
  const F = totalLoad(p);
  // largest EI·y this much load gives on this kind of beam (load at midspan, or at the tip of a cantilever)
  const ref = (F * L ** 3) / (p.supports.some((x) => x.type === 'fixed') ? 3 : 48);
  if (ref < 1e-12) return { k: 0, trueScale: false };
  const ei = p.stiffness ? eiInProblemUnits(p.stiffness, p.units) : undefined;
  if (ei && (ref / ei) * S >= 0.3) return { k: S / ei, trueScale: true }; // visible at true scale
  // exaggerated: the opening size grows with the log of F·L³ (a few N still bend, big loads stay on screen),
  // then scales in proportion to the load (twice the load, twice the bend)
  const q = loadSize(p);
  const base = (x: number) => Math.min(1.5, Math.max(0.2, 0.25 * Math.log10(Math.max(x, 1)) - 0.6)); // 2 kN on 4 m: 0.68
  const amp = q0 > 0 ? Math.min(1.5, (base(q0) * q) / q0) : base(q);
  const maxEIy = Math.max(Math.abs(s.min.EIy.value), Math.abs(s.max.EIy.value));
  return { k: Math.min(amp / ref, maxEIy > 0 ? 1.5 / maxEIy : Infinity), trueScale: false };
}
