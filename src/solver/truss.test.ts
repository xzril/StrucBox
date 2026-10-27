// Trusses from Hibbeler, Engineering Mechanics: Statics (14th ed.), ch. 6, checked against the worked solutions at
// prepscholar.com/solutions/engineering-mechanics-statics-and-dynamics-14th-edition-chapter-6-problem-<n>P/ and by hand.
// Where the published T/C label contradicts its own joint equations, the expected value is the statics-correct one.
import { describe, expect, it } from 'vitest';
import { truss } from './fixtures';
import { parseMembers } from '../components/TrussScreen';
import { buildTrussReport } from '../lib/trussReport';
import { memberName, solveTruss, type Truss, type TrussSolution } from './truss';

function ok(t: Truss): TrussSolution {
  const r = solveTruss(t);
  if (!r.ok) throw new Error(r.reason);
  return r.solution;
}
/** Expected member forces, tension positive, to the book's 3 significant figures. */
function expectForces(t: Truss, s: TrussSolution, want: Record<string, number>) {
  for (const [name, F] of Object.entries(want)) {
    const i = t.members.findIndex((m) => memberName(m) === name || memberName(m) === name[1] + name[0]);
    expect(Math.abs(s.forces[i] - F), name).toBeLessThanOrEqual(Math.max(0.005 * Math.abs(F), 0.01));
  }
}

describe('Hibbeler Statics, chapter 6 trusses', () => {
  it('6-6: 4 kN down at B, 3 kN → at D, rocker at C at 30° from vertical', () => {
    // the published solution labels AB, BC and BD compression; joint B (BD alone holds the 4 kN up) shows they are tension
    const t = truss(
      [['A', 0, 0], ['B', 2, 0], ['C', 4, 0], ['D', 2, 1.5]],
      ['AB', 'BC', 'BD', 'AD', 'CD'],
      [{ joint: 'A', type: 'pin' }, { joint: 'C', type: 'roller', angle: 120 }],
      [['B', 0, -4], ['D', 3, 0]],
    );
    const s = ok(t);
    expect(s.reactions[1].R!).toBeCloseTo(3.608, 3);
    expectForces(t, s, { AB: 2.36, BC: 2.36, BD: 4, AD: -1.46, CD: -5.21 });
  });

  it('6-9: 3 kN at B and 6 kN at C on a 12 m span, apex E 6 m up', () => {
    // the published solution labels AE and DE tension; at A the 4 kN reaction is balanced by AE pushing down: compression
    const t = truss(
      [['A', 0, 0], ['B', 4, 0], ['C', 8, 0], ['D', 12, 0], ['E', 6, 6]],
      ['AB', 'BC', 'CD', 'AE', 'BE', 'CE', 'DE'],
      [{ joint: 'A', type: 'pin' }, { joint: 'D', type: 'roller' }],
      [['B', 0, -3], ['C', 0, -6]],
    );
    const s = ok(t);
    expect(s.reactions[0].Ry).toBeCloseTo(4, 9);
    expect(s.reactions[1].Ry).toBeCloseTo(5, 9);
    expectForces(t, s, { AB: 4, BC: 3, CD: 5, AE: -5.66, DE: -7.07, BE: 3.16, CE: 6.32 });
  });

  it('6-11: Pratt truss, 6 panels of 2 m, top joints 2, 4, 6 m up; 10, 20, 10 kN at C, D, E', () => {
    const t = truss(
      [['A', 0, 0], ['B', 2, 0], ['C', 4, 0], ['D', 6, 0], ['E', 8, 0], ['F', 10, 0], ['G', 12, 0], ['L', 2, 2], ['K', 4, 4], ['J', 6, 6], ['I', 8, 4], ['H', 10, 2]],
      ['AB', 'BC', 'CD', 'DE', 'EF', 'FG', 'AL', 'LK', 'KJ', 'JI', 'IH', 'HG', 'BL', 'CK', 'DJ', 'EI', 'FH', 'LC', 'KD', 'ID', 'HE'],
      [{ joint: 'A', type: 'pin' }, { joint: 'G', type: 'roller' }],
      [['C', 0, -10], ['D', 0, -20], ['E', 0, -10]],
    );
    expectForces(t, ok(t), { AL: -28.28, AB: 20, BL: 0, BC: 20, LC: 0, CK: 10, CD: 20, LK: -28.28, KD: -7.45, KJ: -23.57, DJ: 33.33, HG: -28.28, FH: 0 });
  });

  it('6-18: cantilever truss pinned to a wall at A and G (2 m apart), 10 kN at B, 8 kN at the tip D', () => {
    const t = truss(
      [['A', 0, 0], ['B', 1, 0], ['C', 3, 0], ['D', 4, 0], ['G', 0, 2], ['F', 1, 2], ['E', 3, 2]],
      ['AB', 'BC', 'CD', 'DE', 'CE', 'BE', 'EF', 'BF', 'AF', 'FG'],
      [{ joint: 'A', type: 'pin' }, { joint: 'G', type: 'pin' }],
      [['B', 0, -10], ['D', 0, -8]],
    );
    expectForces(t, ok(t), { DE: 8.94, CD: -4, BC: -4, CE: 0, BE: -11.3, EF: 12, AB: -12, BF: 18, AF: -20.1, FG: 21 });
  });

  it('refuses indeterminate and unstable trusses', () => {
    const sq = (members: string[]) =>
      solveTruss(truss([['A', 0, 0], ['B', 1, 0], ['C', 1, 1], ['D', 0, 1]], members, [{ joint: 'A', type: 'pin' }, { joint: 'B', type: 'roller' }], [['C', 1, 0]]));
    expect(sq(['AB', 'BC', 'CD', 'DA', 'AC'])).toMatchObject({ ok: true });
    expect(sq(['AB', 'BC', 'CD', 'DA', 'AC', 'BD'])).toMatchObject({ ok: false, comingSoon: true });
    expect(sq(['AB', 'BC', 'CD', 'DA'])).toMatchObject({ ok: false, comingSoon: false });
  });
});

describe('truss worked steps', () => {
  it('6-9: reactions about A, then joints with slope fractions and T/C', () => {
    const t = truss(
      [['A', 0, 0], ['B', 4, 0], ['C', 8, 0], ['D', 12, 0], ['E', 6, 6]],
      ['AB', 'BC', 'CD', 'AE', 'BE', 'CE', 'DE'],
      [{ joint: 'A', type: 'pin' }, { joint: 'D', type: 'roller' }],
      [['B', 0, -3], ['C', 0, -6]],
    );
    const r = buildTrussReport(t, ok(t));
    expect(r.steps[1].tex[0]).toBe('\\circlearrowleft +\\ \\sum M_{A} = 0:\\quad D_y(12) - 3(4) - 6(8) = 0');
    const A = r.steps.find((s) => s.title === 'Joint A')!;
    expect(A.tex[1]).toBe('\\uparrow +\\ \\sum F_y = 0:\\quad F_{AE}\\left(\\tfrac{1}{\\sqrt{2}}\\right) + 4 = 0');
    expect(A.tex.join(' ')).toContain('F_{AE} = -5.657\\ \\text{kN}\\ \\Rightarrow\\ 5.657\\ \\text{kN}\\ (C)');
    expect(r.steps.some((s) => s.title === 'Remaining members')).toBe(false);
    expect(r.lines.find((l) => l.key === 'FBE')).toMatchObject({ value: '3.162\\ \\text{kN}', note: 'tension (T)' });
  });
});

describe('member list', () => {
  it('reads "AB, BC; A1-B1"', () => {
    expect(parseMembers('AB, BC; A1-B1')).toEqual([['A', 'B'], ['B', 'C'], ['A1', 'B1']]);
  });
});
