import { describe, expect, it } from 'vitest';
import { applyDrawing, readDrawing } from './drawing';
import { readPng } from './fixtures/png';
import { localParse } from './parse';
import { momentAboutPoint, solve } from '../solver/solve';

describe('reading the beam drawing', () => {
  it("owner's hand-lettered beam: 4 × 2 m, 50 kN ↓ at 2, 100 kN ↓ at 4, 20 kN ↑ at 6", () => {
    const d = readDrawing(readPng('src/input/fixtures/owner-beam-1.png'));
    expect(d.length).toBe(8);
    expect(d.lengthUnit).toBe('m');
    expect(d.forceUnit).toBe('kN');
    expect(d.loads.map((l) => l.kind === 'point' && [l.x, l.P])).toEqual([
      [2, 50],
      [4, 100],
      [6, -20],
    ]);
    expect(d.supports.map((s) => [s.type, s.x])).toEqual([
      ['pin', 0],
      ['roller', 8],
    ]);
    // the drawing overrides the text's guesses (OCR read "2m" as the span)
    const r = localParse('2m 2m 2m 2m 10kN');
    if (!r.ok) throw new Error();
    const p = applyDrawing(r.problem, d);
    expect(p.length).toBe(8);
    expect(p.supports.map((s) => s.x)).toEqual([0, 8]);
    expect(p.loads).toHaveLength(3);
  });

  it('tilted phone photo of a cantilever: UDL, counter-clockwise couple, upward end load', () => {
    const d = readDrawing(readPng('src/input/fixtures/cantilever-photo.png'));
    expect([d.length, d.lengthUnit, d.forceUnit]).toEqual([10, 'ft', 'lb']);
    expect(d.supports.map((s) => [s.type, s.x, s.label])).toEqual([
      ['fixed', 0, 'A'],
      ['free', 10, 'B'],
    ]);
    expect(d.loads.map(({ id, ...l }) => l)).toEqual([
      { kind: 'dist', x1: 0, x2: 6, w1: 40, w2: 40 },
      { kind: 'moment', x: 8, M: 300, dir: 'ccw' },
      { kind: 'point', x: 10, P: -200 },
    ]);
  });

  it('overhang: pin and roller inside the span, decreasing triangle, end loads', () => {
    const d = readDrawing(readPng('src/input/fixtures/overhang.png'));
    expect(d.length).toBe(10);
    expect(d.supports.map((s) => [s.type, s.x])).toEqual([
      ['pin', 2],
      ['roller', 8],
    ]);
    expect(d.loads.map(({ id, ...l }) => l)).toEqual([
      { kind: 'point', x: 0, P: 12 },
      { kind: 'dist', x1: 2, x2: 8, w1: 9, w2: 0 },
      { kind: 'point', x: 10, P: 6 },
    ]);
  });

  // sheets that write each load's place as "x=1.0" or "x=[1.5, 2.5]": the text places the loads, the arrows give the shape
  const offline = (img: string, ocr: string) => {
    const r = localParse(ocr);
    if (!r.ok) throw new Error();
    expect(r.exact).toBe(true);
    const p = applyDrawing(r.problem, readDrawing(readPng(img)), r.exact);
    return { L: p.length, sup: p.supports.map((s) => [s.type, s.x]), loads: p.loads.map(({ id, ...l }) => l) };
  };
  it("owner's Q3: x= labels place the point loads and a partial UDL", () => {
    const ocr = 'Q3. A simply supported beam is loaded by two point loads and a uniformly\ndistributed load (UDL), as shown in the below schematic.\n-300 N -200 N\nx=0.0 x=1.0 -100 N/m\nx=[1.5, 2.5]\nx=0.0 x=2.5\nL =2.5m\n';
    expect(offline('src/input/fixtures/q3-udl.png', ocr)).toEqual({
      L: 2.5,
      sup: [['pin', 0], ['roller', 2.5]],
      loads: [
        { kind: 'point', x: 0, P: 300 },
        { kind: 'point', x: 1, P: 200 },
        { kind: 'dist', x1: 1.5, x2: 2.5, w1: 100, w2: 100 },
      ],
    });
  });

  it('same style with a triangular load: the arrows show it grows from zero', () => {
    const ocr = 'Q5. A simply supported beam carries a point load and a distributed load.\n-400 N\nX=0.5 -150 N/m\nx=[1.0, 3.0]\n9) Oo\nX=0.0 x=3.0\nL=3m\n';
    expect(offline('src/input/fixtures/q-triangle.png', ocr)).toEqual({
      L: 3,
      sup: [['pin', 0], ['roller', 3]],
      loads: [
        { kind: 'point', x: 0.5, P: 400 },
        { kind: 'dist', x1: 1, x2: 3, w1: 0, w2: 150 },
      ],
    });
  });
});

describe('inclined forces and L-shaped members in the drawing', () => {
  // from the photo alone (the text only says what is asked), the way the app reads a textbook figure offline
  const solveFrom = (img: string, text: string) => {
    const r = localParse(text);
    if (!r.ok) throw new Error();
    const p = applyDrawing(r.problem, readDrawing(readPng(img)));
    const s = solve(p);
    if (!s.ok) throw new Error(s.reason);
    return { p, s: s.solution };
  };

  it('slanted arrow with a 3-4-5 triangle into a wall (tilted photo): 250 N, 2 m from the free end of 6 m', () => {
    const { p } = solveFrom('src/input/fixtures/slanted-wall-photo.png', 'Determine the moment of the force about point O.');
    expect(p.supports.map((s) => [s.label, s.type, s.x])).toEqual([['A', 'free', 0], ['O', 'fixed', 6]]);
    expect(p.loads.map(({ id, ...l }) => l)).toEqual([{ kind: 'point', x: 2, P: 200, Px: 150 }]);
    expect(p.asked.momentAbout).toEqual(['O']);
    expect(momentAboutPoint(p, 6)).toBeCloseTo(800); // 200 N × 4 m, counter-clockwise; the 150 N passes through O
  });

  it('L-shaped member hung at O: 300 N pushing up the slope at the free end, arm 1.5 m', () => {
    const { p } = solveFrom('src/input/fixtures/l-member.png', 'Determine the moment of the force about point O.');
    expect(p.length).toBe(3);
    expect(p.supports.map((s) => [s.label, s.type, s.x, s.y])).toEqual([['A', 'free', 0, undefined], ['O', 'fixed', 3, 1.5]]);
    expect(p.loads.map(({ id, ...l }) => l)).toEqual([{ kind: 'point', x: 0, P: -180, Px: 240 }]);
    expect(momentAboutPoint(p, 3, 1.5)).toBeCloseTo(-180); // -180(3) + 240(1.5): 180 N·m clockwise
  });

  it('pin and roller with a 5 kN force pushing down and left on a 3-4-5 slope', () => {
    const { s } = solveFrom('src/input/fixtures/slanted-simple.png', 'Determine the reactions at the supports.');
    const [A, B] = s.reactions;
    expect([A.Rx, A.Ry, B.Ry].map((v) => +v.toFixed(3))).toEqual([3, 2.667, 1.333]); // ΣM_A: 6 B_y = 4(2)
  });
});
