import { describe, expect, it } from 'vitest';
import { beam, point, sup, workedExample } from '../solver/fixtures';
import { solve, valueAt } from '../solver/solve';
import type { Problem } from '../solver/types';
import { bendScale } from './bend';

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
  it('bends more under a bigger load', () => expect(peak(at(2, 1200))).toBeGreaterThan(peak(at(2, 600)) * 1.4));
  it('keeps the worked example visibly bent', () => expect(peak(workedExample())).toBeGreaterThan(0.15));
});
