import { describe, expect, it } from 'vitest';
import { beam, dist, moment, point, sup, workedExample } from './fixtures';
import { momentAboutPoint, solve, valueAt, type Solution } from './solve';
import type { Problem } from './types';

function ok(p: Problem): Solution {
  const r = solve(p);
  if (!r.ok) throw new Error(r.reason);
  return r.solution;
}
const close = (a: number, b: number, d = 6) => expect(a).toBeCloseTo(b, d);

describe('PRD worked example', () => {
  it('600 N at 1 m on a 4 m simply supported beam', () => {
    const p = workedExample();
    const s = ok(p);
    close(s.reactions[0].Ry, 450);
    close(s.reactions[1].Ry, 150);
    close(momentAboutPoint(p, 0), -600); // 600 N·m clockwise
    close(momentAboutPoint(p, 0, s.reactions), 0); // equilibrium
  });
  it('dragging the load to x = 3 m', () => {
    const p = workedExample();
    (p.loads[0] as { x: number }).x = 3;
    const s = ok(p);
    close(momentAboutPoint(p, 0), -1800);
    close(s.reactions[0].Ry, 150);
    close(s.reactions[1].Ry, 450);
  });
});

describe('simply supported closed forms', () => {
  it('point load at midspan: PL/4 and PL³/48EI', () => {
    const s = ok(beam(4, [sup('pin', 0, 'A'), sup('roller', 4, 'B')], [point(2, 10)]));
    close(s.max.M.value, 10);
    close(s.max.M.x, 2);
    close(s.min.EIy.value, -(10 * 64) / 48);
    close(valueAt(s.segments, 2, 'V', 'left'), 5);
    close(valueAt(s.segments, 2, 'V', 'right'), -5);
  });
  it('UDL: wL²/8 and 5wL⁴/384EI', () => {
    const s = ok(beam(6, [sup('pin', 0, 'A'), sup('roller', 6, 'B')], [dist(0, 6, 2)]));
    close(s.reactions[0].Ry, 6);
    close(s.max.M.value, 9);
    close(s.max.M.x, 3);
    close(s.min.EIy.value, -(5 * 2 * 6 ** 4) / 384);
  });
  it('triangular 0 → w0: reactions w0L/6, w0L/3, Mmax = w0L²/(9√3)', () => {
    const s = ok(beam(3, [sup('pin', 0, 'A'), sup('roller', 3, 'B')], [dist(0, 3, 0, 6)]));
    close(s.reactions[0].Ry, 3);
    close(s.reactions[1].Ry, 6);
    close(s.max.M.value, (6 * 9) / (9 * Math.sqrt(3)));
    close(s.max.M.x, 3 / Math.sqrt(3), 5);
    close(s.min.EIy.value, -0.00652 * 6 * 81, 2);
  });
  it('applied clockwise moment at midspan', () => {
    const s = ok(beam(4, [sup('pin', 0, 'A'), sup('roller', 4, 'B')], [moment(2, 8, 'cw')]));
    close(s.reactions[0].Ry, -2);
    close(s.reactions[1].Ry, 2);
    close(valueAt(s.segments, 2, 'M', 'left'), -4);
    close(valueAt(s.segments, 2, 'M', 'right'), 4);
  });
  it('overhang with tip load', () => {
    const s = ok(beam(6, [sup('pin', 0, 'A'), sup('roller', 4, 'B')], [point(6, 10)]));
    close(s.reactions[0].Ry, -5);
    close(s.reactions[1].Ry, 15);
    close(valueAt(s.segments, 4, 'M'), -20);
    close(s.min.M.value, -20);
    // tip deflection: P a² (L + a) / 3EI with span 4, overhang 2
    close(valueAt(s.segments, 6, 'EIy'), -(10 * 4 * 6) / 3);
  });
});

describe('cantilever closed forms', () => {
  it('fixed at left, tip load: PL³/3EI', () => {
    const s = ok(beam(3, [sup('fixed', 0, 'A'), sup('free', 3, 'B')], [point(3, 10)]));
    close(s.reactions[0].Ry, 10);
    close(s.reactions[0].M!, 30);
    close(valueAt(s.segments, 0, 'M'), -30);
    close(valueAt(s.segments, 3, 'EIy'), -90);
    close(valueAt(s.segments, 3, 'EIslope'), -45);
  });
  it('fixed at right, UDL: wL⁴/8EI', () => {
    const s = ok(beam(3, [sup('free', 0, 'A'), sup('fixed', 3, 'B')], [dist(0, 3, 2)]));
    close(s.reactions[0].Ry, 6);
    close(s.reactions[0].M!, -9);
    close(valueAt(s.segments, 3, 'M', 'left'), -9);
    close(valueAt(s.segments, 0, 'EIy'), -(2 * 81) / 8);
  });
});

describe('unsupported problems', () => {
  it('two pins is coming soon', () => {
    const r = solve(beam(4, [sup('pin', 0, 'A'), sup('pin', 4, 'B')], [point(2, 1)]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.comingSoon).toBe(true);
  });
  it('propped cantilever is coming soon', () => {
    const r = solve(beam(4, [sup('fixed', 0, 'A'), sup('roller', 4, 'B')], [point(2, 1)]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.comingSoon).toBe(true);
  });
  it('two rollers is unstable, not coming soon', () => {
    const r = solve(beam(4, [sup('roller', 0, 'A'), sup('roller', 4, 'B')], [point(2, 1)]));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.comingSoon).toBe(false);
  });
});

describe('cantilever triangular load deflection (tables)', () => {
  const tip = (w1: number, w2: number) => {
    const s = ok(beam(15, [sup('fixed', 0, 'A'), sup('free', 15, 'B')], [dist(0, 15, w1, w2)]));
    return valueAt(s.segments, 15, 'EIy');
  };
  it('peak at the fixed end: w0L⁴/30EI', () => close(tip(2, 0), -(2 * 15 ** 4) / 30));
  it('peak at the free end: 11w0L⁴/120EI', () => close(tip(0, 2), -(11 * 2 * 15 ** 4) / 120));
});
