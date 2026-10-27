// Hibbeler Statics ch. 4: "replace the distributed loading by an equivalent resultant force and specify its location".
import { describe, expect, it } from 'vitest';
import { beam, dist, sup } from '../solver/fixtures';
import { solve } from '../solver/solve';
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
