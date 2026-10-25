import { describe, expect, it } from 'vitest';
import { applyDrawing, readDrawing } from './drawing';
import { readPng } from './fixtures/png';
import { localParse } from './parse';

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
});
