// Hibbeler Statics ch. 4: "replace the distributed loading by an equivalent resultant force and specify its location".
import { describe, expect, it } from 'vitest';
import { beam, curved, dist, sup } from '../solver/fixtures';
import { solve, valueAt } from '../solver/solve';
import { localParse } from '../input/parse';
import { buildReport } from './report';
import { defaultConvention } from './format';

describe('equivalent resultant force', () => {
  it('4-146: 6 → 3 → 6 kN/m over 6 m: F_R = 27 kN down, (M_R)_A = 81 kN·m, x̄ = 3 m', () => {
    const p = beam(6, [sup('pin', 0, 'A'), sup('roller', 6, 'B')], [dist(0, 3, 6, 3), dist(3, 6, 3, 6)], {
      units: { system: 'SI', force: 'kN', length: 'm' },
      asked: { reactions: false, resultant: true, momentAbout: ['A'], shear: false, moment: false, maxValues: false, deflection: false },
    });
    const r = solve(p);
    if (!r.ok) throw new Error(r.reason);
    const lines = buildReport(p, r.solution, defaultConvention).lines;
    expect(lines.find((l) => l.key === 'FR')).toMatchObject({ value: '27\\ \\text{kN}', note: 'downward' });
    expect(lines.find((l) => l.key === 'xbar')).toMatchObject({ value: '3\\ \\text{m}', note: 'from A' });
    expect(lines.find((l) => l.key === 'MOA')).toMatchObject({ value: '-81\\ \\text{kN}\\cdot \\text{m}', note: 'clockwise' });
  });

  it('reads "resultant force and couple moment at A" as asked', () => {
    const r = localParse('Replace the distributed loading by an equivalent resultant force and couple moment acting at point A.');
    if (!r.ok) throw new Error(r.reason);
    const a = r.problem.asked;
    expect(a.resultant).toBe(true);
    expect(a.momentAbout).toEqual(['A']);
    expect(a.internalAt).toEqual([]);
  });
});

describe('curved distributed loads', () => {
  it('4-159: w = 2x² − 8x + 18 lb/ft from x = −1 to 4 ft: F_R = 73.3 lb, 2.22 ft from A', () => {
    // A is at the formula's x = −1, so the formula's origin is 1 ft into the beam
    const p = beam(5, [sup('pin', 0, 'A'), sup('roller', 5, 'B')], [curved(0, 5, [18, -8, 2], 1)], {
      units: { system: 'US', force: 'lb', length: 'ft' },
      asked: { reactions: true, resultant: true, momentAbout: [], shear: false, moment: false, maxValues: false, deflection: false },
    });
    const r = solve(p);
    if (!r.ok) throw new Error(r.reason);
    const lines = buildReport(p, r.solution, defaultConvention).lines;
    expect(lines.find((l) => l.key === 'FR')!.value).toBe('73.33\\ \\text{lb}');
    expect(lines.find((l) => l.key === 'xbar')!.value).toBe('2.216\\ \\text{ft}');
    // reactions balance the resultant: B carries F_R x̄ / 5
    expect(r.solution.reactions[1].Ry).toBeCloseTo((73.3333 * 2.2159) / 5, 2);
  });

  it('cantilever, w = 3x² kN/m growing toward the wall at x = 2 m', () => {
    // w = 3x² kN/m over 2 m, fixed at x = 2: W = 8 kN at x̄ = 1.5 m; M_fixed = 8(0.5) = 4 kN·m; M(1) = −∫0^1 3s²(1 − s) ds = −0.25
    const p = beam(2, [sup('free', 0, 'A'), sup('fixed', 2, 'B')], [curved(0, 2, [0, 0, 3])]);
    const r = solve(p);
    if (!r.ok) throw new Error(r.reason);
    const B = r.solution.reactions[0];
    expect(B.Ry).toBeCloseTo(8, 9);
    expect(B.M!).toBeCloseTo(-4, 9); // clockwise
    expect(valueAt(r.solution.segments, 1, 'M')).toBeCloseTo(-0.25, 9);
    expect(valueAt(r.solution.segments, 1, 'V')).toBeCloseTo(-1, 9);
  });

  it('reads "w = (2x^2 - 8x + 18) lb/ft" from the text', () => {
    const r = localParse('The distributed load w = (2x^2 - 8x + 18) lb/ft acts on the shaft. Determine the resultant force.');
    if (!r.ok) throw new Error(r.reason);
    const d = r.problem.loads.filter((l) => l.kind === 'dist');
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ poly: [18, -8, 2] });
  });
});
