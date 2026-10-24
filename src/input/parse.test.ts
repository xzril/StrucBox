import { expect, it } from 'vitest';
import { localParse } from './parse';

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
