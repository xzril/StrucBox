// Inclined forces, forces off the beam axis and L-shaped members, in the style of Hibbeler, Statics ch. 4 (moment of a
// force) and ch. 5/7 (reactions, internal forces). Expected values are worked by hand in the comments.
import { describe, expect, it } from 'vitest';
import { buildReport } from '../lib/report';
import { defaultConvention } from '../lib/format';
import { beam, inclined, point, sup } from './fixtures';
import { momentAboutPoint, solve, valueAt, type Solution } from './solve';
import type { Problem } from './types';

function ok(p: Problem): Solution {
  const r = solve(p);
  if (!r.ok) throw new Error(r.reason);
  return r.solution;
}
const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);
const asked = (momentAbout: string[], internalAt: string[] = []) => ({
  asked: { reactions: true, momentAbout, internalAt, shear: false, moment: false, maxValues: false, deflection: false },
});

describe('moment of an inclined force about a point', () => {
  it('L-shaped member: 500 N on a 3-4-5 slope at the free end, O 1 m above the 2 m arm', () => {
    // r = (-2, -1) from O, F = (400, 300): M_O = (-2)(300) - (-1)(400) = -200, so 200 N·m clockwise
    const p = beam(2, [sup('free', 0, 'A'), sup('fixed', 2, 'O', 1)], [inclined(0, 500, 4, 3)], asked(['O']));
    close(momentAboutPoint(p, 2, 1), -200);
    const s = ok(p);
    const O = s.reactions[0];
    close(O.Rx, -400);
    close(O.Ry, -300);
    close(O.M!, 200);
    const r = buildReport(p, s, defaultConvention);
    expect(r.lines.find((l) => l.key === 'MOO')).toMatchObject({ value: '-200\\ \\text{N}\\cdot \\text{m}', note: 'clockwise' });
    expect(r.steps[0].tex[0]).toContain('\\tfrac{4}{5}'); // resolved with the slope triangle
    expect(r.steps.find((st) => st.title === 'Moment about O')!.tex[1]).toBe('(M_R)_{O} = -300(2) + 400(1)') // O is also the wall's reaction moment;
  });

  it('cantilever into a wall at O: 400 N pulling down and right (3-4-5), 3 m from O', () => {
    // the 240 N horizontal part passes through O; M_O = 320(3) = 960 N·m counter-clockwise
    const p = beam(5, [sup('free', 0, 'A'), sup('fixed', 5, 'O')], [inclined(2, 400, 3, -4)], asked(['O']));
    close(momentAboutPoint(p, 5), 960);
    const s = ok(p);
    close(s.reactions[0].Rx, -240);
    close(s.reactions[0].Ry, 320);
    close(s.reactions[0].M!, -960);
    close(valueAt(s.segments, 3, 'N'), -240); // between the load and the wall the beam is pushed into the wall: compression
  });

  it('several forces about O, two of them off the axis', () => {
    // 50 N at 30° up-right at (3, 0): +75; 80 N ← at (3, 2): +160; 100 N ↓ at (1.5, 0): -150. Sum 85 N·m ccw
    const p = beam(3, [sup('pin', 0, 'O'), sup('roller', 3, 'B')], [inclined(3, 50, Math.cos(Math.PI / 6), 0.5), point(3, 0, -80, 2), point(1.5, 100)]);
    close(momentAboutPoint(p, 0), 85);
    // equilibrium about any point once the reactions are in
    const s = ok(p);
    close(momentAboutPoint(p, 1.2, 0.7, s.reactions), 0);
  });
});

describe('beams with inclined loads', () => {
  it('simply supported, 10 kN at 60° below horizontal pointing left, 2 m into a 6 m span', () => {
    // F = (-5, -8.660). ΣM_A: 6 B_y - 8.660(2) = 0 → B_y = 2.887; A_y = 5.774; ΣF_x: A_x - 5 = 0 → A_x = 5
    const F = inclined(2, 10, -Math.cos(Math.PI / 3), -Math.sin(Math.PI / 3));
    const p = beam(6, [sup('pin', 0, 'A'), sup('roller', 6, 'B')], [F], { ...asked([], ['C']), points: [{ label: 'C', x: 1 }] });
    const s = ok(p);
    const [A, B] = s.reactions;
    close(A.Rx, 5);
    close(A.Ry, (10 * Math.sin(Math.PI / 3) * 4) / 6);
    close(B.Ry, (10 * Math.sin(Math.PI / 3) * 2) / 6);
    // between A and the load the member is pushed toward the pin: 5 kN compression; none beyond the load
    close(valueAt(s.segments, 1, 'N'), -5);
    close(valueAt(s.segments, 4, 'N'), 0);
    close(valueAt(s.segments, 1, 'M'), A.Ry);
    const r = buildReport(p, s, defaultConvention);
    expect(r.lines.find((l) => l.key === 'NC')).toMatchObject({ value: '-5\\ \\text{N}', note: 'compression' });
    expect(r.lines.find((l) => l.key === 'RxA')).toMatchObject({ note: 'to the right' });
    expect(r.steps.find((st) => st.title === 'Horizontal equilibrium')!.tex[1]).toBe('A_x - 5 = 0');
    expect(r.steps[0].tex[0]).toContain('\\cos 60^\\circ');
  });

  it('cantilever with a 0.5 m post at the tip: 2 kN → at the top of the post, 4 kN ↓ at the tip', () => {
    // A_x = -2, A_y = 4, M_A = 4(3) + 2(0.5) = 13 ccw. M(x) = 4x - 13, so -1 at the tip (the couple 2 × 0.5); N = 2 tension
    const p = beam(3, [sup('fixed', 0, 'A'), sup('free', 3, 'B')], [point(3, 0, 2, 0.5), point(3, 4)]);
    const s = ok(p);
    const A = s.reactions[0];
    close(A.Rx, -2);
    close(A.Ry, 4);
    close(A.M!, 13);
    close(valueAt(s.segments, 1, 'M'), -9);
    close(valueAt(s.segments, 3, 'M', 'left'), -1);
    close(valueAt(s.segments, 1, 'N'), 2);
    const r = buildReport(p, s, defaultConvention);
    expect(r.steps[0].tex).toEqual([]); // a horizontal force needs no resolving
    expect(r.steps.find((st) => st.title === 'Moments about A')!.tex[1]).toBe('M_{A} - 2(0.5) - 4(3) = 0');
  });
});
