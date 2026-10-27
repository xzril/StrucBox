import { describe, expect, it } from 'vitest';
import { beam, dist, point, sup, workedExample } from '../solver/fixtures';
import { solve, valueAt } from '../solver/solve';
import type { Problem } from '../solver/types';
import { bendScale, loadSize } from './bend';

const peak = (p: Problem) => {
  const o = solve(p);
  if (!o.ok) throw new Error(o.reason);
  const { k } = bendScale(p, o.solution, 10 / p.length);
  return Math.max(...Array.from({ length: 201 }, (_, i) => Math.abs(valueAt(o.solution.segments, (i / 200) * p.length, 'EIy') * k)));
};
const at = (x: number, P = 600) => beam(4, [sup('pin', 0, 'O'), sup('roller', 4, 'B')], [point(x, P)]);

describe('bendScale', () => {
  it('shrinks smoothly to straight as the load reaches a support', () => {
    expect(peak(at(0.4))).toBeLessThan(peak(at(1)));
    expect(peak(at(0.04))).toBeLessThan(0.02);
    expect(peak(at(0))).toBe(0);
  });
  it('bends more under a bigger load', () => expect(peak(at(2, 1200))).toBeGreaterThan(peak(at(2, 600)) * 1.1));
  it('bends in proportion when a load is edited', () => {
    const p = at(2, 600);
    const o = solve({ ...p, loads: [point(2, 1200)] });
    if (!o.ok) throw new Error(o.reason);
    const k2 = bendScale({ ...p, loads: [point(2, 1200)] }, o.solution, 2.5, loadSize(p)).k;
    expect(k2).toBeCloseTo(bendScale(p, o.solution, 2.5).k, 9); // same k: drawn bend doubles with EIy
  });
  it('bends under a UDL, more under a bigger one', () => {
    const udl = (w: number) => beam(3, [sup('pin', 0, 'A'), sup('roller', 3, 'B')], [dist(0, 3, w)]);
    expect(peak(udl(10))).toBeGreaterThan(0.1); // 10 N/m: tiny load, still visibly bent
    expect(peak(udl(400))).toBeGreaterThan(peak(udl(40)) * 1.2);
    expect(peak(udl(4000))).toBeGreaterThan(peak(udl(400)) * 1.2);
  });
  it('bends under a UDL, more under a bigger one', () => {
    const udl = (w: number) => beam(3, [sup('pin', 0, 'A'), sup('roller', 3, 'B')], [dist(0, 3, w)]);
    expect(peak(udl(10))).toBeGreaterThan(0.1); // 10 N/m: tiny load, still visibly bent
    expect(peak(udl(4000))).toBeGreaterThan(peak(udl(400)) * 1.2);
  });
  it('keeps the worked example visibly bent', () => expect(peak(workedExample())).toBeGreaterThan(0.15));
});
