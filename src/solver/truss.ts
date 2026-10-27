// Plane trusses: pin-jointed two-force members, loads at the joints (Hibbeler ch. 6).
// Internal convention: x right, y up, member force tension positive.
import type { Units } from './types';

export interface Joint {
  label: string;
  x: number;
  y: number;
}
export interface TrussSupport {
  joint: string;
  type: 'pin' | 'roller';
  angle?: number; // roller only: direction of its reaction, degrees counter-clockwise from +x; 90 if omitted
}
export interface JointLoad {
  id: string;
  joint: string;
  Fx: number; // right positive
  Fy: number; // up positive
}
export interface Truss {
  kind: 'truss';
  title: string;
  text: string;
  units: Units;
  joints: Joint[];
  members: [string, string][];
  supports: TrussSupport[];
  loads: JointLoad[];
}

export interface TrussReaction {
  joint: string;
  type: 'pin' | 'roller';
  Rx: number;
  Ry: number;
  R?: number; // roller: size along its angle
}
export interface TrussSolution {
  forces: number[]; // per member, tension positive
  reactions: TrussReaction[];
}

export type TrussOutcome = { ok: true; solution: TrussSolution } | { ok: false; comingSoon: boolean; reason: string };

export const memberName = (m: [string, string]) => m[0] + m[1];
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Unit vector from joint a toward joint b, and the length. */
export function direction(t: Truss, a: string, b: string) {
  const [A, B] = [joint(t, a), joint(t, b)];
  const L = Math.hypot(B.x - A.x, B.y - A.y);
  return { ux: (B.x - A.x) / L, uy: (B.y - A.y) / L, L };
}
export function joint(t: Truss, label: string): Joint {
  const j = t.joints.find((j) => j.label === label);
  if (!j) throw new Error(`No joint ${label}`);
  return j;
}

/** Method of joints for the whole truss at once: 2 equations per joint, solved together. */
export function solveTruss(t: Truss): TrussOutcome {
  const labels = t.joints.map((j) => j.label);
  if (new Set(labels).size !== labels.length) return { ok: false, comingSoon: false, reason: 'Two joints have the same label.' };
  for (const ref of [...t.members.flat(), ...t.supports.map((s) => s.joint), ...t.loads.map((l) => l.joint)])
    if (!labels.includes(ref)) return { ok: false, comingSoon: false, reason: `Joint ${ref} is used but not defined.` };
  for (const [a, b] of t.members) if (a === b || direction(t, a, b).L < 1e-9) return { ok: false, comingSoon: false, reason: `Member ${a}${b} has no length.` };

  // unknowns: member forces, then 2 per pin and 1 per roller
  const cols: { joint: string; ux: number; uy: number }[][] = t.members.map(([a, b]) => {
    const d = direction(t, a, b);
    return [
      { joint: a, ux: d.ux, uy: d.uy }, // tension pulls a toward b
      { joint: b, ux: -d.ux, uy: -d.uy },
    ];
  });
  for (const s of t.supports) {
    if (s.type === 'pin') cols.push([{ joint: s.joint, ux: 1, uy: 0 }], [{ joint: s.joint, ux: 0, uy: 1 }]);
    else cols.push([{ joint: s.joint, ux: Math.cos(rad(s.angle ?? 90)), uy: Math.sin(rad(s.angle ?? 90)) }]);
  }
  const n = 2 * labels.length;
  if (cols.length !== n)
    return cols.length > n
      ? { ok: false, comingSoon: true, reason: `Statically indeterminate trusses (${cols.length} unknowns, ${n} joint equations)` }
      : { ok: false, comingSoon: false, reason: `The truss is unstable: ${cols.length} unknowns but ${n} joint equations. Add a member or a support.` };

  const A = Array.from({ length: n }, () => new Array(n).fill(0));
  const rhs = new Array(n).fill(0);
  cols.forEach((c, k) =>
    c.forEach(({ joint: j, ux, uy }) => {
      const r = 2 * labels.indexOf(j);
      A[r][k] += ux;
      A[r + 1][k] += uy;
    }),
  );
  for (const l of t.loads) {
    const r = 2 * labels.indexOf(l.joint);
    rhs[r] -= l.Fx;
    rhs[r + 1] -= l.Fy;
  }
  const x = gauss(A, rhs);
  if (!x) return { ok: false, comingSoon: false, reason: 'The truss is unstable (it can move or collapse). Check the members and supports.' };
  const clean = (v: number) => (Math.abs(v) < 1e-9 ? 0 : v);
  const forces = x.slice(0, t.members.length).map(clean);
  let k = t.members.length;
  const reactions: TrussReaction[] = t.supports.map((s) => {
    if (s.type === 'pin') return { joint: s.joint, type: 'pin', Rx: clean(x[k++]), Ry: clean(x[k++]) };
    const R = clean(x[k++]);
    const a = rad(s.angle ?? 90);
    return { joint: s.joint, type: 'roller', Rx: clean(R * Math.cos(a)), Ry: clean(R * Math.sin(a)), R };
  });
  return { ok: true, solution: { forces, reactions } };
}

/** Gaussian elimination with partial pivoting; null if singular. */
function gauss(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((r, i) => [...r, b[i]]);
  const scale = Math.max(1, ...A.flat().map(Math.abs));
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-9 * scale) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((r, i) => r[n] / r[i]);
}
