// Beam problems from Hibbeler, Engineering Mechanics: Statics (14th ed.), checked against the published
// answers (worked solutions at prepscholar.com/solutions/engineering-mechanics-statics-and-dynamics-14th-edition-chapter-7-problem-<n>P/).
// Only the numbers are kept. Where the published solution has an arithmetic slip, the expected value is the
// statics-correct one and the comment says so.
import { describe, expect, it } from 'vitest';
import { beam, dist, moment, point, sup } from './fixtures';
import { solve, valueAt, type Solution } from './solve';
import type { Problem } from './types';

function ok(p: Problem): Solution {
  const r = solve(p);
  if (!r.ok) throw new Error(r.reason);
  return r.solution;
}
/** Textbook answers are given to 3 significant figures. */
const near = (got: number, want: number) => expect(Math.abs(got - want)).toBeLessThanOrEqual(Math.max(0.005 * Math.abs(want), 0.01));
const M = (s: Solution, x: number, side: 'left' | 'right' = 'right') => valueAt(s.segments, x, 'M', side);
const V = (s: Solution, x: number, side: 'left' | 'right' = 'right') => valueAt(s.segments, x, 'V', side);

describe('Hibbeler Statics, chapter 7 beams', () => {
  it('7-51: overhang, UDL over the whole beam (w = 1, a = 2)', () => {
    const s = ok(beam(4, [sup('pin', 0, 'A'), sup('roller', 2, 'B')], [dist(0, 4, 1)]));
    near(s.reactions[0].Ry, 0);
    near(s.reactions[1].Ry, 4); // 2wa
    near(M(s, 2), -2); // -wa²/2, largest magnitude
    near(V(s, 2, 'left'), -2);
    near(V(s, 2, 'right'), 2);
  });

  it('7-56: pin + roller, 1.5 kN/m on the right half of 4 m', () => {
    const s = ok(beam(4, [sup('pin', 0, 'A'), sup('roller', 4, 'C')], [dist(2, 4, 1.5)]));
    near(s.reactions[0].Ry, 0.75);
    near(s.reactions[1].Ry, 2.25);
    near(M(s, 2), 1.5);
    near(s.max.M.x, 2.5);
    near(s.max.M.value, 1.6875); // book rounds to 1.68
  });

  it('7-59: triangular load 0 → 30 lb/ft over 9 ft, overhang to 13.5 ft, 180 lb·ft couple at the free end', () => {
    const s = ok(beam(13.5, [sup('pin', 0, 'A'), sup('roller', 9, 'B')], [dist(0, 9, 0, 30), moment(13.5, 180, 'cw')]));
    near(s.reactions[0].Ry, 25);
    near(s.reactions[1].Ry, 110);
    near(s.max.M.x, 3.87);
    near(s.max.M.value, 64.5);
    near(M(s, 9), -180);
    near(V(s, 10), 0);
  });

  it('7-65: roller + pin, triangle 0 → 12 kN/m then 12 kN/m uniform', () => {
    const s = ok(beam(6, [sup('roller', 0, 'A'), sup('pin', 6, 'B')], [dist(0, 3, 0, 12), dist(3, 6, 12)]));
    near(s.reactions[0].Ry, 21);
    near(s.reactions[1].Ry, 33);
    near(V(s, 3), 3);
    near(M(s, 3), 45);
    near(s.max.M.x, 3.25);
    near(s.max.M.value, 45.375);
  });

  it('7-78: overhang with 8 kN, a 20 kN·m couple and 15 kN/m on the overhang', () => {
    const s = ok(beam(8, [sup('pin', 0, 'A'), sup('roller', 5, 'B')], [moment(2, 20, 'cw'), point(3, 8), dist(5, 8, 15)]));
    near(s.reactions[0].Ry, -14.3); // acts downward
    near(s.reactions[1].Ry, 67.3);
    near(M(s, 2, 'left'), -28.6);
    near(M(s, 2, 'right'), -8.6);
    near(M(s, 3), -22.9);
    near(M(s, 5), -67.5);
    near(s.min.M.value, -67.5);
    near(V(s, 5, 'right'), 45);
  });

  it('7-84: 3 kN/m uniform plus triangle 0 → 3 kN/m on the right half', () => {
    const s = ok(beam(6, [sup('pin', 0, 'A'), sup('roller', 6, 'C')], [dist(0, 6, 3), dist(3, 6, 0, 3)]));
    near(s.reactions[0].Ry, 9.75);
    near(s.reactions[1].Ry, 12.75);
    near(V(s, 3), 0.75);
    near(M(s, 3), 15.75);
    near(s.max.M.x, 3.24);
    near(s.max.M.value, 15.84);
  });

  it('7-88: cantilever 3 m, triangle peaking 6 kN/m at midspan, 3 kN at the tip', () => {
    const s = ok(beam(3, [sup('fixed', 0, 'A'), sup('free', 3, 'B')], [dist(0, 1.5, 0, 6), dist(1.5, 3, 6, 0), point(3, 3)]));
    near(s.reactions[0].Ry, 12);
    near(s.reactions[0].M!, 22.5); // counter-clockwise
    near(V(s, 1.5), 7.5);
    near(M(s, 1.5), -6.75);
    near(s.min.M.value, -22.5);
  });

  it('7-93: cantilever 15 ft fixed on the right, 1 kip/ft plus triangle 0 → 2 kip/ft', () => {
    // the published solution subtracts the triangular load; both act downward, so they add
    const s = ok(beam(15, [sup('free', 0, 'B'), sup('fixed', 15, 'A')], [dist(0, 15, 1), dist(0, 15, 0, 2)]));
    near(s.reactions[0].Ry, 30);
    near(s.reactions[0].M!, -187.5); // clockwise
    near(V(s, 7.5), -11.25);
    near(M(s, 7.5), -37.5);
    near(s.min.M.value, -187.5);
  });
});
