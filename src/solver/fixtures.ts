import type { Load, Problem, Support } from './types';

let n = 0;
const id = () => `id${++n}`;

export function sup(type: Support['type'], x: number, label: string, y?: number): Support {
  return { id: id(), type, x, label, ...(y ? { y } : {}) };
}
export function point(x: number, P: number, Px?: number, y?: number): Load {
  return { id: id(), kind: 'point', x, P, ...(Px ? { Px } : {}), ...(y ? { y } : {}) };
}
/** A force of size F pointing along (dx, dy), e.g. a slope triangle's legs; y up. */
export function inclined(x: number, F: number, dx: number, dy: number, y?: number): Load {
  const k = F / Math.hypot(dx, dy);
  return point(x, -k * dy, k * dx, y);
}
export function dist(x1: number, x2: number, w1: number, w2 = w1): Load {
  return { id: id(), kind: 'dist', x1, x2, w1, w2 };
}
export function moment(x: number, M: number, dir: 'cw' | 'ccw'): Load {
  return { id: id(), kind: 'moment', x, M, dir };
}

export function beam(length: number, supports: Support[], loads: Load[], extra: Partial<Problem> = {}): Problem {
  return {
    title: '',
    text: '',
    length,
    supports,
    loads,
    points: [],
    units: { system: 'SI', force: 'N', length: 'm' },
    asked: { reactions: true, momentAbout: [], shear: false, moment: false, maxValues: false, deflection: false },
    ...extra,
  };
}

/** PRD worked example (image 2). */
export function workedExample(): Problem {
  return beam(4, [sup('pin', 0, 'O'), sup('roller', 4, 'B')], [point(1, 600)], {
    title: 'Moment about O',
    text: 'Simply supported beam: pin at O, roller at the right end, span 4 m. A 600 N load acts 1 m from O. Find the moment about O.',
    asked: { reactions: false, momentAbout: ['O'], shear: false, moment: false, maxValues: false, deflection: false },
  });
}
