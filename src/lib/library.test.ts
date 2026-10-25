import { describe, expect, it } from 'vitest';
import { blankProblem } from '../input/parse';
import { addEntry, beamKind, emptyLibrary, findEntry, mapEntry, removeEntry, sortItems, type Entry, type Library } from './library';

const entry = (id: string, title: string, created: string, modified: string): Entry => ({
  id,
  problem: { ...blankProblem(), title },
  created,
  modified,
});

describe('library', () => {
  const a = entry('a', 'Beta', '2026-10-01', '2026-10-05');
  const b = entry('b', 'Alpha', '2026-10-03', '2026-10-04');

  it('sorts newest first by date, A to Z by name', () => {
    expect(sortItems([a, b], 'modified').map((e) => e.id)).toEqual(['a', 'b']);
    expect(sortItems([a, b], 'created').map((e) => e.id)).toEqual(['b', 'a']);
    expect(sortItems([a, b], 'name').map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('adds, edits and removes entries across folders', () => {
    let lib: Library = { ...emptyLibrary, folders: [{ id: 'f', name: 'F', open: false, items: [] }] };
    lib = addEntry(lib, 'f', a);
    expect(lib.folders[0].open).toBe(true);
    lib = mapEntry(lib, 'a', (e) => ({ ...e, modified: '2026-11-01' }));
    expect(findEntry(lib, 'a')?.modified).toBe('2026-11-01');
    expect(findEntry(removeEntry(lib, 'a'), 'a')).toBeUndefined();
  });

  it('names the beam kind', () => {
    const p = blankProblem();
    expect(beamKind(p)).toBe('Simply supported');
    expect(beamKind({ ...p, supports: [p.supports[0], { ...p.supports[1], x: 4 }] })).toBe('Overhang');
    expect(beamKind({ ...p, supports: [{ ...p.supports[0], type: 'fixed' }] })).toBe('Cantilever');
  });
});
