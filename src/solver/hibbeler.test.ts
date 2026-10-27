// Beam problems from Hibbeler, Engineering Mechanics: Statics (14th ed.), checked against the published
// answers (worked solutions at prepscholar.com/solutions/engineering-mechanics-statics-and-dynamics-14th-edition-chapter-<c>-problem-<n>P/).
// Only the numbers are kept. Where the published solution has an arithmetic slip, the expected value is the
// statics-correct one and the comment says so.
import { describe, expect, it } from 'vitest';
import { beam, dist, inclined, moment, point, sup } from './fixtures';
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
  it('7-7: pin A, roller B at 12 ft, triangle 0 → 4 kip/ft over AC (6 ft); V and M at C', () => {
    const s = ok(beam(12, [sup('pin', 0, 'A'), sup('roller', 12, 'B')], [dist(0, 6, 0, 4)]));
    near(s.reactions[1].Ry, 4);
    near(V(s, 6), -4);
    near(M(s, 6), 24);
  });

  it('7-23: 400 N pulled horizontally by a pulley cable 1.2 m above the axis at 3 m, pin A, roller B at 5 m; N, V, M at C (1.5 m)', () => {
    const s = ok(beam(5, [sup('pin', 0, 'A'), sup('roller', 5, 'B')], [point(3, 0, 400, 1.2)]));
    near(s.reactions[0].Ry, -96);
    near(s.reactions[0].Rx, -400);
    near(valueAt(s.segments, 1.5, 'N'), 400);
    near(V(s, 1.5), -96);
    near(M(s, 1.5), -144);
  });

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

describe('Hibbeler Statics, chapter 5 reactions', () => {
  const roller = (x: number, label: string, angle: number) => ({ ...sup('roller', x, label), angle });

  it('5-11: triangle peaking 400 N/m at midspan of 6 m, smooth incline (3-4-5) at A, pin at B', () => {
    // N_A acts up and to the left, normal to the 3-4-5 incline: 180° - 53.13°
    const s = ok(beam(6, [roller(0, 'A', 180 - (Math.atan2(4, 3) * 180) / Math.PI), sup('pin', 6, 'B')], [dist(0, 3, 0, 400), dist(3, 6, 400, 0)]));
    const [A, B] = s.reactions;
    near(A.R!, 750);
    near(B.Rx, 450);
    near(B.Ry, 600);
  });

  it('5-12: 4 kN at 6 m, pin A, rocker at B (8 m) pushing at 60° up and to the left', () => {
    const s = ok(beam(8, [sup('pin', 0, 'A'), roller(8, 'B', 120)], [point(6, 4)]));
    const [A, B] = s.reactions;
    near(B.R!, 3.46);
    near(A.Rx, 1.73);
    near(A.Ry, 1.0);
  });

  it('5-4RP: lever, roller B 18 in left of pin A, 50 lb at 30° from vertical, 20 in right of A and 14 in below the axis', () => {
    const s = ok(beam(38, [sup('roller', 0, 'B'), sup('pin', 18, 'A')], [inclined(38, 50, -Math.sin(Math.PI / 6), -Math.cos(Math.PI / 6), -14)]));
    const [B, A] = s.reactions;
    near(A.Rx, 25);
    near(A.Ry, 110.86);
    near(B.Ry, -67.56); // the roller pushes down on the lever
  });

  it('5-47: pin A, cord BC at B (3-4-5, up and right), 26 kN on a 5-12-13 slope at 2 m, 40 kN at B (6 m)', () => {
    const s = ok(beam(6, [sup('pin', 0, 'A'), roller(6, 'B', (Math.atan2(3, 4) * 180) / Math.PI)], [inclined(2, 26, -5, -12), point(6, 40)]));
    const [A, B] = s.reactions;
    near(B.R!, 80); // cord tension
    near(A.Rx, -54); // 54 kN to the left
    near(A.Ry, 16);
  });
});
