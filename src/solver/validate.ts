import type { BeamKind, Problem, Support } from './types';

export type Validation =
  | { ok: true; kind: BeamKind; primary: Support; secondary?: Support }
  | { ok: false; comingSoon: boolean; reason: string };

const tol = 1e-9;

/** Decide whether the prototype can solve this beam (D26, D29). */
export function validate(p: Problem): Validation {
  const L = p.length;
  if (!(L > 0)) return { ok: false, comingSoon: false, reason: 'Beam length must be greater than zero.' };

  for (const s of p.supports) {
    if (s.x < -tol || s.x > L + tol) return { ok: false, comingSoon: false, reason: `Support ${s.label} is off the beam.` };
    if (s.type === 'free' && s.x > tol && s.x < L - tol)
      return { ok: false, comingSoon: false, reason: 'A free end must be at an end of the beam.' };
  }
  for (const l of p.loads) {
    const xs = l.kind === 'dist' ? [l.x1, l.x2] : [l.x];
    if (xs.some((x) => x < -tol || x > L + tol))
      return { ok: false, comingSoon: false, reason: `A load (${l.label ?? l.kind}) is off the beam.` };
    if (l.kind === 'dist' && l.x2 - l.x1 <= tol)
      return { ok: false, comingSoon: false, reason: 'A distributed load must have its end after its start.' };
  }

  const real = p.supports.filter((s) => s.type !== 'free');
  const pins = real.filter((s) => s.type === 'pin');
  const rollers = real.filter((s) => s.type === 'roller');
  const fixed = real.filter((s) => s.type === 'fixed');

  if (real.length === 2 && pins.length === 1 && rollers.length === 1) {
    if (Math.abs(pins[0].x - rollers[0].x) < tol)
      return { ok: false, comingSoon: false, reason: 'The pin and roller cannot be at the same point.' };
    const r = rollers[0];
    const th = ((r.angle ?? 90) * Math.PI) / 180;
    if (Math.abs(Math.sin(th) * (r.x - pins[0].x) - Math.cos(th) * ((r.y ?? 0) - (pins[0].y ?? 0))) < tol)
      return { ok: false, comingSoon: false, reason: `The reaction at ${r.label} points straight at the pin, so the beam can turn (it is unstable).` };
    return { ok: true, kind: 'simple', primary: pins[0], secondary: rollers[0] };
  }
  if (real.length === 1 && fixed.length === 1) {
    const f = fixed[0];
    if (Math.abs(f.x) > tol && Math.abs(f.x - L) > tol)
      return { ok: false, comingSoon: true, reason: 'A fixed support away from the beam ends' };
    return { ok: true, kind: 'cantilever', primary: f };
  }
  if (real.length === 0) return { ok: false, comingSoon: false, reason: 'The beam needs supports.' };
  if (real.length === 2 && rollers.length === 2)
    return { ok: false, comingSoon: false, reason: 'Two rollers cannot hold the beam (it is unstable).' };
  if (real.length === 1)
    return { ok: false, comingSoon: false, reason: 'One pin or roller alone cannot hold the beam (it is unstable).' };
  return { ok: false, comingSoon: true, reason: 'Statically indeterminate beams' };
}
