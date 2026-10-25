import { describe, expect, it } from 'vitest';
import { fromAi, localParse } from './parse';

it('reads the PRD worked example offline', () => {
  const r = localParse('Simply supported beam: pin at O, roller at the right end, span 4 m. A 600 N load acts 1 m from O. Find the moment about O.');
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  const p = r.problem;
  expect(p.length).toBe(4);
  expect(p.units).toEqual({ system: 'SI', force: 'N', length: 'm' });
  expect(p.loads).toMatchObject([{ kind: 'point', x: 1, P: 600 }]);
  expect(p.supports[0]).toMatchObject({ type: 'pin', label: 'O', x: 0 });
  expect(p.asked.momentAbout).toEqual(['O']);
});

it('flags trusses as coming soon', () => {
  expect(localParse('Determine the force in each member of the truss.').ok).toBe(false);
});

it('reads a US cantilever with UDL', () => {
  const r = localParse('A cantilever beam 10 ft long carries a uniform load of 2 kip/ft. Find the reactions and draw the shear and bending moment diagrams.');
  if (!r.ok) throw new Error();
  expect(r.problem.units).toEqual({ system: 'US', force: 'kip', length: 'ft' });
  expect(r.problem.loads).toMatchObject([{ kind: 'dist', w1: 2, x2: 10 }]);
  expect(r.problem.supports[0].type).toBe('fixed');
  expect(r.problem.asked).toMatchObject({ reactions: true, shear: true, moment: true });
});

describe('position labels written on the sheet', () => {
  it('pairs each load with its "x=" label, keeps minus as downward, and puts the supports at the leftover labels', () => {
    const r = localParse('-400 N\nX=0 5 -150 N/m\nx=[1.0, 3.0]\nX=0.0 x=3.0\nL=3m');
    if (!r.ok) throw new Error();
    expect(r.exact).toBe(true);
    expect(r.problem.length).toBe(3);
    expect(r.problem.loads.map(({ id, ...l }) => l)).toEqual([
      { kind: 'point', x: 0.5, P: 400 },
      { kind: 'dist', x1: 1, x2: 3, w1: 150, w2: 150 },
    ]);
    expect(r.problem.supports.map((s) => s.x)).toEqual([0, 3]);
  });
});

it("resolves the AI's copied slope (dirX, dirY) into components itself, and keeps plain loads vertical", () => {
  const base = { structure: 'beam', units: { system: 'SI', force: 'N', length: 'm' }, length: 2, asked: {}, supports: [] };
  const load = (l: object) => ({ kind: 'point', x: 0, P: 500, x1: 0, x2: 0, w1: 0, w2: 0, M: 0, dir: 'cw', label: '', y: 0, ...l });
  const r = fromAi({ ...base, loads: [load({ dirX: 4, dirY: 3 }), load({ dirX: 0, dirY: -1 }), load({ dirX: 0, dirY: 0 })] }, '');
  if (!r.ok) throw new Error();
  expect(r.problem.loads).toMatchObject([{ P: -300, Px: 400 }, { P: 500, Px: undefined }, { P: 500, Px: undefined }]);
});

it('an inclined force is not an incline (friction) problem', () => {
  expect(localParse('Determine the moment of the inclined 400 N force about point O.').ok).toBe(true);
  expect(localParse('A block rests on an inclined plane.').ok).toBe(false);
});
