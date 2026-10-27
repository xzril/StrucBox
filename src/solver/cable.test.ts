// Cables from Hibbeler, Engineering Mechanics: Statics (12th ed.), section 7.4. The manual's cable solutions online are
// images, so every expected value here was solved by hand independently (vertex form of the parabola / catenary, or
// joint-by-joint equilibrium), and agrees with the book's printed answers where they are known (7-104, 7-107, 7-112).
import { describe, expect, it } from 'vitest';
import { fromAi, localParse } from '../input/parse';
import { solveCable, type Cable, type CableGiven, type CableSolution } from './cable';

function cable(A: [number, number], B: [number, number], given: CableGiven, more: Partial<Cable> = {}): Cable {
  return {
    kind: 'cable',
    title: '',
    text: '',
    units: { system: 'SI', force: 'N', length: 'm' },
    A: { label: 'A', x: A[0], y: A[1] },
    B: { label: 'B', x: B[0], y: B[1] },
    points: [],
    w1: 0,
    w2: 0,
    w0: 0,
    given,
    ...more,
  };
}
function ok(c: Cable): CableSolution {
  const r = solveCable(c);
  if (!r.ok) throw new Error(r.reason);
  return r.solution;
}
const near = (v: number, want: number) => expect(Math.abs(v - want)).toBeLessThanOrEqual(Math.max(Math.abs(want) * 1e-4, 1e-9));

describe('Hibbeler 7.4: load distributed along the horizontal', () => {
  it('7-100: 600 lb/ft over 25 ft, lowest point 10 ft below A and 15 ft below B', () => {
    const s = ok(cable([0, 10], [25, 15], { kind: 'sag', h: 10 }, { w1: 600, w2: 600 }));
    near(s.H, 3788.27);
    near(s.TA, 7733.71);
    near(s.TB, 9085.14);
    near(s.low!.y, 0);
  });

  it('7-104: bridge deck 80 kN/m, span 1000 m, towers 150 m and 75 m above the lowest point', () => {
    const s = ok(cable([0, 150], [1000, 75], { kind: 'sag', h: 150 }, { w1: 80, w2: 80 }));
    near(s.TA, 102807.6); // book: 103 MN
    near(s.TB, 97320.8); // book: 97.3 MN
  });
});

describe('Hibbeler 7.4: own weight (catenary)', () => {
  it('7-107: chain 8 kg/m, span 50 m, sag 5 m', () => {
    const s = ok(cable([0, 0], [50, 0], { kind: 'sag', h: 5 }, { w0: 8 * 9.81 }));
    near(s.Tmax, 5361.46); // book: 5.36 kN
    near(s.length, 51.3093); // book: 51.3 m
    near(s.low!.x, 25);
  });

  it('7-109: 45 m cable, 5 kg/m, supports 40 m apart', () => {
    const s = ok(cable([0, 0], [40, 0], { kind: 'length', s: 45 }, { w0: 5 * 9.81 }));
    near(s.H, 1153.415);
    near(s.Tmax, 1596.356);
    near(-s.low!.y, 9.03041);
  });

  it('7-112: 15 lb/ft, towers 180 ft and 120 ft high, 300 ft apart, lowest point 90 ft up', () => {
    const s = ok(cable([0, 180], [300, 120], { kind: 'sag', h: 90 }, { w0: 15 }));
    near(s.Tmax, 4519.58); // book: 4.52 kip
    near(s.length, 331.317); // book: 331 ft
  });

  it('7-113: chain 15 kg/m towed with 20 kN horizontally over 40 m', () => {
    const s = ok(cable([0, 0], [40, 0], { kind: 'H', H: 20000 }, { w0: 15 * 9.81 }));
    near(-s.low!.y, 1.474157);
  });

  it('7-119: chain 0.5 lb/ft, 60 ft apart, sag 3 ft', () => {
    near(ok(cable([0, 0], [60, 0], { kind: 'sag', h: 3 }, { w0: 0.5 })).Tmax, 76.7487);
  });

  it('the same cable read three ways gives one shape', () => {
    const base = ok(cable([0, 0], [60, 0], { kind: 'sag', h: 3 }, { w0: 0.5 }));
    near(ok(cable([0, 0], [60, 0], { kind: 'Tmax', T: base.Tmax }, { w0: 0.5 })).H, base.H);
    near(ok(cable([0, 0], [60, 0], { kind: 'length', s: base.length }, { w0: 0.5 })).H, base.H);
  });
});

describe('Hibbeler 7.4: concentrated loads', () => {
  // 7-95 layout as printed beside its figure: loads 250, 400, 250 lb at 12, 32, 47 ft; E at 59 ft, 4 ft above A; C 14 ft below A
  const c = cable([0, 0], [59, 4], { kind: 'y', x: 32, y: -14 }, {
    units: { system: 'US', force: 'lb', length: 'ft' },
    B: { label: 'E', x: 59, y: 4 },
    points: [
      { id: 'b', label: 'B', x: 12, P: 250 },
      { id: 'c', label: 'C', x: 32, P: 400 },
      { id: 'd', label: 'D', x: 47, P: 250 },
    ],
  });

  it('7-95: sags at B and D, and the tension in each segment (joint-by-joint by hand)', () => {
    const s = ok(c);
    near(s.H, 547.7987);
    near(-s.pointY[0], 8.67279);
    near(-s.pointY[2], 7.04248);
    [675.892, 566.898, 603.858, 744.438].forEach((T, i) => near(s.segments[i].T, T));
    near(s.Tmax, 744.438);
    near(s.length, 68.3459);
  });

  it('given the tension in the steepest segment instead, the shape is the same', () => {
    near(ok({ ...c, given: { kind: 'Tmax', T: 744.438 } }).pointY[0], -8.67279);
  });

  it('refuses a load outside the span and a cable shorter than the gap', () => {
    expect(solveCable({ ...c, points: [{ id: 'x', label: 'X', x: 70, P: 1 }] })).toMatchObject({ ok: false });
    expect(solveCable({ ...c, given: { kind: 'length', s: 50 } })).toMatchObject({ ok: false });
  });
});

describe('reading a cable problem', () => {
  it('offline: chain, mass per length, span and sag from the words', () => {
    const r = localParse('If h = 5 m, determine the maximum tension developed in the chain and its length. The chain has a mass per unit length of 8 kg/m. The supports are 50 m apart.');
    if (r.ok || r.truss?.kind !== 'cable') throw new Error('expected a cable');
    expect(r.truss).toMatchObject({ units: { force: 'N', length: 'm' }, B: { x: 50 }, given: { kind: 'sag', h: 5 }, w1: 0 });
    near(r.truss.w0, 78.48);
    near(ok(r.truss).Tmax, 5361.46);
  });

  it('offline: a 45-m-long cable and the US load per length on a deck', () => {
    const a = localParse('The 45-m-long cable has a mass per unit length of 5 kg/m. Determine the maximum tension. The supports are 40 m apart.');
    expect(a).toMatchObject({ truss: { given: { kind: 'length', s: 45 }, B: { x: 40 } } });
    const b = localParse('The cable supports a uniform distributed load of 600 lb/ft along the horizontal. The sag is 10 ft. Determine the tension in the cable at each support.');
    expect(b).toMatchObject({ truss: { units: { system: 'US', force: 'lb', length: 'ft' }, w1: 600, w2: 600, w0: 0, given: { kind: 'sag', h: 10 } } });
  });

  it('a cable that holds a beam is still a beam problem', () => {
    expect(localParse('The beam is held by a cable at B; 10 kN acts at the middle of the 6 m beam.')).toMatchObject({ ok: true });
  });

  it('AI: the figure read into a cable the solver takes', () => {
    const r = fromAi(
      {
        structure: 'cable',
        title: '7-95',
        units: { system: 'US', force: 'lb', length: 'ft' },
        cable: {
          labelA: 'A',
          labelB: 'E',
          span: 59,
          rise: 4,
          loads: [{ label: 'B', x: 12, P: 250 }, { label: 'C', x: 32, P: 400 }, { label: 'D', x: 47, P: 250 }],
          w1: 0,
          w2: 0,
          w0: 0,
          w0IsMass: false,
          given: { kind: 'y', x: 32, y: -14, value: 0 },
        },
      },
      '',
    );
    if (r.ok || r.truss?.kind !== 'cable') throw new Error('expected a cable');
    near(-ok(r.truss).pointY[0], 8.67279);
  });
});
