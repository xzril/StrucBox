import { distResultant } from '../solver/loads';
import type { Solution } from '../solver/solve';
import type { Problem } from '../solver/types';
import { eiInProblemUnits, FORCE_TO_N, LENGTH_TO_M } from './units';

/** Factor from EI·y (problem units) to drawn world units, for a beam drawn S world units per length unit (D14).
 * It depends on the sizes of the loads and the span, never on where the loads sit, so the bend grows and
 * shrinks smoothly while a load is dragged (no jump to straight when it reaches a support). */
export function bendScale(p: Problem, s: Solution, S: number): { k: number; trueScale: boolean } {
  const L = p.length;
  const F = p.loads.reduce(
    (f, l) => f + Math.abs(l.kind === 'point' ? l.P : l.kind === 'dist' ? distResultant(l).W : l.M / L),
    0,
  );
  // largest EI·y this much load gives on this kind of beam (load at midspan, or at the tip of a cantilever)
  const ref = (F * L ** 3) / (p.supports.some((x) => x.type === 'fixed') ? 3 : 48);
  if (ref < 1e-12) return { k: 0, trueScale: false };
  const ei = p.stiffness ? eiInProblemUnits(p.stiffness, p.units) : undefined;
  if (ei && (ref / ei) * S >= 0.3) return { k: S / ei, trueScale: true }; // visible at true scale
  // exaggerated: drawn size grows with load and span (F·L³), levelling off so big loads stay on screen
  const q = F * FORCE_TO_N[p.units.force] * (L * LENGTH_TO_M[p.units.length]) ** 3;
  const amp = (1.2 * q) / (q + 128000); // 2 kN on 4 m draws half the maximum
  const maxEIy = Math.max(Math.abs(s.min.EIy.value), Math.abs(s.max.EIy.value));
  return { k: Math.min(amp / ref, maxEIy > 0 ? 1.5 / maxEIy : Infinity), trueScale: false };
}
