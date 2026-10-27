// Worked steps for a plane truss: reactions from the whole truss, then the method of joints (Hibbeler 6.2).
// Every number comes from solveTruss (D24); this only arranges them.
import { direction, memberName, type Truss, type TrussSolution } from '../solver/truss';
import { fmt } from './format';
import { joinTerms, q, type ResultLine, type Step } from './report';

/** |dx| / L or |dy| / L as TeX: 3/5, 1/√5, else the angle's cos or sin. */
export function slopeTex(dx: number, dy: number, part: 'x' | 'y'): string {
  const [a, b] = [Math.abs(dx), Math.abs(dy)];
  if (!a || !b) return '';
  for (const k of [1, 10, 100]) {
    let [m, n] = [a * k, b * k];
    if (Math.abs(m - Math.round(m)) > 1e-6 || Math.abs(n - Math.round(n)) > 1e-6) continue;
    [m, n] = [Math.round(m), Math.round(n)];
    const g = gcd(m, n);
    [m, n] = [m / g, n / g];
    const L2 = m * m + n * n;
    const L = Math.round(Math.sqrt(L2));
    const top = part === 'x' ? m : n;
    if (L2 > 2000) break;
    return `\\left(\\tfrac{${top}}{${L * L === L2 ? L : `\\sqrt{${L2}}`}}\\right)`;
  }
  const deg = (Math.atan2(b, a) * 180) / Math.PI;
  return `${part === 'x' ? '\\cos' : '\\sin'} ${fmt(deg)}^\\circ`;
}
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

export function tcNote(F: number): string | undefined {
  return Math.abs(F) < 1e-9 ? 'zero-force member' : F > 0 ? 'tension (T)' : 'compression (C)';
}

export function buildTrussReport(t: Truss, s: TrussSolution): { lines: ResultLine[]; steps: Step[]; explanation: string } {
  const F = t.units.force;
  const steps: Step[] = [];
  const lines: ResultLine[] = [];
  const pins = t.supports.filter((sp) => sp.type === 'pin');
  const rollers = t.supports.filter((sp) => sp.type === 'roller');

  steps.push({
    title: 'Free-body diagram of the whole truss',
    text: `Each member is a two-force member, so its force acts along it; assume every member is in tension (pulling on the joints). Supports: ${t.supports
      .map((sp) => (sp.type === 'pin' ? `${sp.joint} (pin): ${sp.joint}_x, ${sp.joint}_y` : `${sp.joint} (roller): N_${sp.joint} at ${fmt(sp.angle ?? 90)}°`))
      .join('; ')}.`,
    tex: [],
  });

  // unknowns already found, by name: reactions first when the whole truss gives them
  const known = new Map<string, number>();
  const rName = (j: string, c: 'x' | 'y' | 'N') => (c === 'N' ? `N_{${j}}` : `${j}_${c}`);
  const at = (j: string) => t.joints.find((p) => p.label === j)!;
  if (pins.length === 1 && rollers.length === 1) {
    const [P, R] = [pins[0], rollers[0]];
    const r = s.reactions.find((x) => x.joint === R.joint)!;
    const pr = s.reactions.find((x) => x.joint === P.joint)!;
    const [A, B] = [at(P.joint), at(R.joint)];
    const th = ((R.angle ?? 90) * Math.PI) / 180;
    // moment of each force component about the pin: Fy·dx − Fx·dy
    const terms: { sign: number; tex: string }[] = [];
    const [ux, uy] = [Math.cos(th), Math.sin(th)];
    const acute = fmt((Math.atan2(Math.abs(uy), Math.abs(ux)) * 180) / Math.PI);
    const Rn = R.angle === undefined ? rName(R.joint, 'y') : rName(R.joint, 'N');
    const [dxB, dyB] = [B.x - A.x, B.y - A.y];
    if (Math.abs(uy) > 1e-9 && Math.abs(dxB) > 1e-9)
      terms.push({ sign: Math.sign(uy * dxB), tex: `${Rn}${R.angle === undefined ? '' : `\\sin ${acute}^\\circ`}(${fmt(Math.abs(dxB))})` });
    if (Math.abs(ux) > 1e-9 && Math.abs(dyB) > 1e-9) terms.push({ sign: Math.sign(-ux * dyB), tex: `${Rn}\\cos ${acute}^\\circ(${fmt(Math.abs(dyB))})` });
    for (const l of t.loads) {
      const p = at(l.joint);
      const [dx, dy] = [p.x - A.x, p.y - A.y];
      if (Math.abs(l.Fy) > 1e-9 && Math.abs(dx) > 1e-9) terms.push({ sign: Math.sign(l.Fy * dx), tex: `${fmt(Math.abs(l.Fy))}(${fmt(Math.abs(dx))})` });
      if (Math.abs(l.Fx) > 1e-9 && Math.abs(dy) > 1e-9) terms.push({ sign: Math.sign(-l.Fx * dy), tex: `${fmt(Math.abs(l.Fx))}(${fmt(Math.abs(dy))})` });
    }
    const Rv = R.angle === undefined ? r.Ry : r.R!;
    const loadTerms = (k: 'Fx' | 'Fy') => t.loads.filter((l) => Math.abs(l[k]) > 1e-9).map((l) => ({ sign: Math.sign(l[k]), tex: fmt(Math.abs(l[k])) }));
    steps.push({
      title: 'Support reactions',
      text: `Moments about the pin ${P.joint} remove its two unknowns; then the force sums give them.`,
      tex: [
        `\\circlearrowleft +\\ \\sum M_{${P.joint}} = 0:\\quad ${joinTerms(terms)} = 0`,
        `${R.angle === undefined ? rName(R.joint, 'y') : rName(R.joint, 'N')} = ${q(Rv, F)}`,
        `\\rightarrow +\\ \\sum F_x = 0:\\quad ${joinTerms([{ sign: 1, tex: `${P.joint}_x` }, ...(Math.abs(r.Rx) > 1e-9 ? [{ sign: Math.sign(r.Rx), tex: fmt(Math.abs(r.Rx)) }] : []), ...loadTerms('Fx')])} = 0,\\quad ${P.joint}_x = ${q(pr.Rx, F)}`,
        `\\uparrow +\\ \\sum F_y = 0:\\quad ${joinTerms([{ sign: 1, tex: `${P.joint}_y` }, ...(Math.abs(r.Ry) > 1e-9 ? [{ sign: Math.sign(r.Ry), tex: fmt(Math.abs(r.Ry)) }] : []), ...loadTerms('Fy')])} = 0,\\quad ${P.joint}_y = ${q(pr.Ry, F)}`,
      ],
    });
    known.set(`R${R.joint}`, 1);
    known.set(`R${P.joint}`, 1);
  }

  // asked members: a section through each when one exists (Hibbeler 6.4); the rest by joints
  const askedIdx = (t.asked ?? []).map((a) => t.members.findIndex((m) => sameMember(m, a))).filter((i) => i >= 0);
  const bySection = known.size ? askedIdx.map((i) => ({ i, step: sectionStep(t, s, i) })).filter((x) => x.step) : [];
  steps.push(...bySection.map((x) => x.step!));
  for (const { i } of bySection) known.set(`M${i}`, 1);
  // with members asked, stop the joints once they are all found
  const allAsked = () => askedIdx.length > 0 && askedIdx.every((i) => known.has(`M${i}`));

  // method of joints: repeatedly take a joint with at most two unknowns
  const unknownsAt = (j: string) => [
    ...t.members.map((m, i) => ({ m, i })).filter(({ m, i }) => m.includes(j) && !known.has(`M${i}`)).map(({ i }) => `M${i}`),
    ...(t.supports.some((sp) => sp.joint === j) && !known.has(`R${j}`) ? [`R${j}`] : []),
  ];
  const done = new Set<string>();
  while (!allAsked()) {
    const ready = t.joints.filter((p) => !done.has(p.label) && unknownsAt(p.label).length > 0 && unknownsAt(p.label).length <= 2 && !unknownsAt(p.label).includes(`R${p.label}`));
    // a joint that reaches an asked member first
    const j = ready.find((p) => unknownsAt(p.label).some((u) => askedIdx.includes(Number(u.slice(1))))) ?? ready[0];
    if (!j) break;
    done.add(j.label);
    const here = t.members.map((m, i) => ({ m, i })).filter(({ m }) => m.includes(j.label));
    const eq = (part: 'x' | 'y') => {
      const terms: { sign: number; tex: string }[] = [];
      for (const { m, i } of here) {
        const other = m[0] === j.label ? m[1] : m[0];
        const d = direction(t, j.label, other);
        const u = part === 'x' ? d.ux : d.uy;
        if (Math.abs(u) < 1e-9) continue;
        const o = at(other);
        const f = slopeTex(o.x - j.x, o.y - j.y, part);
        const name = `F_{${memberName(m)}}`;
        terms.push(known.has(`M${i}`) ? { sign: Math.sign(u), tex: `(${fmt(s.forces[i])})${f}` } : { sign: Math.sign(u), tex: `${name}${f}` });
      }
      const r = s.reactions.find((x) => x.joint === j.label);
      if (r) {
        const v = part === 'x' ? r.Rx : r.Ry;
        if (Math.abs(v) > 1e-9) terms.push({ sign: Math.sign(v), tex: fmt(Math.abs(v)) });
      }
      for (const l of t.loads.filter((l) => l.joint === j.label)) {
        const v = part === 'x' ? l.Fx : l.Fy;
        if (Math.abs(v) > 1e-9) terms.push({ sign: Math.sign(v), tex: fmt(Math.abs(v)) });
      }
      return terms.length ? `${part === 'x' ? '\\rightarrow +\\ \\sum F_x' : '\\uparrow +\\ \\sum F_y'} = 0:\\quad ${joinTerms(terms)} = 0` : '';
    };
    const fresh = here.filter(({ i }) => !known.has(`M${i}`));
    const tex = [eq('x'), eq('y'), ...fresh.map(({ m, i }) => `F_{${memberName(m)}} = ${q(s.forces[i], F)}${Math.abs(s.forces[i]) < 1e-9 ? '' : s.forces[i] > 0 ? '\\ (T)' : `\\ \\Rightarrow\\ ${q(-s.forces[i], F)}\\ (C)`}`)].filter(Boolean);
    steps.push({ title: `Joint ${j.label}`, tex });
    for (const { i } of fresh) known.set(`M${i}`, 1);
  }
  const left = t.members.map((m, i) => ({ m, i })).filter(({ i }) => !known.has(`M${i}`));
  if (left.length && !allAsked())
    steps.push({
      title: 'Remaining members',
      text: 'No joint is left with only two unknowns, so these come from the joint equations solved together (or a section cut through them).',
      tex: left.map(({ m, i }) => `F_{${memberName(m)}} = ${q(s.forces[i], F)}`),
    });

  for (const r of s.reactions) {
    if (r.type === 'roller' && t.supports.find((sp) => sp.joint === r.joint)?.angle !== undefined)
      lines.push({ key: `N${r.joint}`, group: 'reactions', label: `N_{${r.joint}}`, value: q(Math.abs(r.R!), F) });
    if (r.type === 'pin' || Math.abs(r.Rx) > 1e-9) lines.push({ key: `Rx${r.joint}`, group: 'reactions', label: `${r.joint}_x`, value: q(r.Rx, F), note: r.Rx > 1e-9 ? 'to the right' : r.Rx < -1e-9 ? 'to the left' : undefined });
    lines.push({ key: `R${r.joint}`, group: 'reactions', label: `${r.joint}_y`, value: q(r.Ry, F), note: r.Ry > 1e-9 ? 'upward' : r.Ry < -1e-9 ? 'downward' : undefined });
  }
  t.members.forEach((m, i) => lines.push({ key: `F${memberName(m)}`, group: !askedIdx.length || askedIdx.includes(i) ? 'internal' : 'notAsked', label: `F_{${memberName(m)}}`, value: q(Math.abs(s.forces[i]), F), note: tcNote(s.forces[i]) }));

  const zero = t.members.filter((_, i) => Math.abs(s.forces[i]) < 1e-9).map(memberName);
  const maxI = s.forces.reduce((b, f, i) => (Math.abs(f) > Math.abs(s.forces[b]) ? i : b), 0);
  const explanation = [
    'In a truss every member is a two-force member, so each joint is a particle in equilibrium: ΣFx = 0 and ΣFy = 0 give two unknowns per joint.',
    'Starting at a joint with no more than two unknown member forces lets the rest follow one joint at a time. A positive result confirms the assumed tension; a negative one means compression.',
    zero.length ? `Members ${zero.join(', ')} carry no force under this loading (zero-force members); they keep the truss stable.` : '',
    t.members.length ? `The most heavily loaded member is ${memberName(t.members[maxI])}, ${fmt(Math.abs(s.forces[maxI]))} ${F} ${s.forces[maxI] > 0 ? 'tension' : 'compression'}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
  return { lines, steps, explanation };
}

/** Members a cut must pass through, chosen so the truss falls into two pieces: the asked members alone, or each asked member with two others. */
export function* sections(t: Truss, target: number): Generator<{ cut: number[]; side: string[] }> {
  const n = t.members.length;
  const tries: number[][] = [];
  const asked = (t.asked ?? []).map((a) => t.members.findIndex((m) => sameMember(m, a))).filter((i) => i >= 0);
  if (asked.includes(target) && asked.length >= 2 && asked.length <= 3) tries.push(asked);
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) if (a !== target && b !== target) tries.push([target, a, b]);
  for (const cut of tries) {
    const side = piece(t, cut, t.members[target][0]);
    if (side.length === t.joints.length || side.includes(t.members[target][1])) continue;
    const other = t.joints.map((j) => j.label).filter((l) => !side.includes(l));
    // every cut member must join the two pieces
    if (!cut.every((i) => side.includes(t.members[i][0]) !== side.includes(t.members[i][1]))) continue;
    yield { cut, side: side.length <= other.length ? side : other };
  }
}
const sameMember = (m: [string, string], name: string) => memberName(m) === name || m[1] + m[0] === name || m.join('-') === name;
function piece(t: Truss, cut: number[], start: string): string[] {
  const seen = new Set([start]);
  const stack = [start];
  while (stack.length) {
    const j = stack.pop()!;
    t.members.forEach((m, i) => {
      if (cut.includes(i) || !m.includes(j)) return;
      const o = m[0] === j ? m[1] : m[0];
      if (!seen.has(o)) seen.add(o), stack.push(o);
    });
  }
  return [...seen];
}

/** Method of sections for one member: moments about where the other two cut members meet (or ΣF across them if parallel). */
export function sectionStep(t: Truss, s: TrussSolution, target: number): Step | null {
  for (const sec of sections(t, target)) {
    const step = sectionWith(t, s, target, sec);
    if (step) return step;
  }
  return null;
}

function sectionWith(t: Truss, s: TrussSolution, target: number, sec: { cut: number[]; side: string[] }): Step | null {
  const F = t.units.force;
  const at = (l: string) => t.joints.find((j) => j.label === l)!;
  const others = sec.cut.filter((i) => i !== target);
  const inSide = (l: string) => sec.side.includes(l);
  // forces on the chosen piece: loads, reactions, and each cut member pulling away from its joint on this piece (tension)
  const known: { name?: string; fx: number; fy: number; x: number; y: number; value?: number }[] = [];
  for (const l of t.loads) if (inSide(l.joint)) known.push({ fx: l.Fx, fy: l.Fy, ...xy(at(l.joint)) });
  for (const r of s.reactions) if (inSide(r.joint)) known.push({ fx: r.Rx, fy: r.Ry, ...xy(at(r.joint)) });
  const pull = (i: number) => {
    const m = t.members[i];
    const [near, far] = inSide(m[0]) ? [m[0], m[1]] : [m[1], m[0]];
    const d = direction(t, near, far);
    return { near: at(near), far: at(far), ux: d.ux, uy: d.uy };
  };
  const name = `F_{${memberName(t.members[target])}}`;
  const tp = pull(target);
  const val = s.forces[target];
  let tex: string[];
  let how: string;
  const O = others.length === 2 ? intersect(pull(others[0]), pull(others[1])) : others.length === 1 ? xy(pull(others[0]).near) : null;
  if (O) {
    // ΣM_O = 0, counter-clockwise positive: each force's Fy·dx − Fx·dy about O
    const terms: { sign: number; tex: string }[] = [];
    const mT = tp.uy * (tp.near.x - O.x) - tp.ux * (tp.near.y - O.y);
    const arm = Math.abs(mT);
    if (arm < 1e-9) return null; // the member passes through the point too: this cut cannot isolate it
    terms.push({ sign: Math.sign(mT), tex: `${name}(${fmt(arm)})` });
    for (const k of known) {
      const [dx, dy] = [k.x - O.x, k.y - O.y];
      if (Math.abs(k.fy) > 1e-9 && Math.abs(dx) > 1e-9) terms.push({ sign: Math.sign(k.fy * dx), tex: `${fmt(Math.abs(k.fy))}(${fmt(Math.abs(dx))})` });
      if (Math.abs(k.fx) > 1e-9 && Math.abs(dy) > 1e-9) terms.push({ sign: Math.sign(-k.fx * dy), tex: `${fmt(Math.abs(k.fx))}(${fmt(Math.abs(dy))})` });
    }
    const pointName = t.joints.find((j) => Math.abs(j.x - O.x) < 1e-9 && Math.abs(j.y - O.y) < 1e-9)?.label;
    how = `The other cut members${others.length ? ` (${others.map((i) => memberName(t.members[i])).join(', ')})` : ''} pass through ${pointName ?? `the point (${fmt(O.x)}, ${fmt(O.y)})`}, so moments about it leave ${name.replace(/[{}_]/g, '')} alone. The arm is its perpendicular distance from that point.`;
    tex = [`\\circlearrowleft +\\ \\sum M_{${pointName ?? 'O'}} = 0:\\quad ${joinTerms(terms)} = 0`];
  } else {
    // the other two are parallel: sum forces perpendicular to them
    const p = pull(others[0]);
    const [nx, ny] = [-p.uy, p.ux];
    const along = (fx: number, fy: number) => fx * nx + fy * ny;
    const vertical = Math.abs(ny) > 0.999;
    const horizontal = Math.abs(nx) > 0.999;
    if (!vertical && !horizontal) return null;
    const part = vertical ? 'y' : 'x';
    const sgn = vertical ? Math.sign(ny) : Math.sign(nx);
    const terms = [{ sign: Math.sign(along(tp.ux, tp.uy) * sgn), tex: `${name}${slopeTex(tp.far.x - tp.near.x, tp.far.y - tp.near.y, part)}` }];
    for (const k of known) {
      const v = vertical ? k.fy : k.fx;
      if (Math.abs(v) > 1e-9) terms.push({ sign: Math.sign(v), tex: fmt(Math.abs(v)) });
    }
    how = `The other cut members are parallel, so the force sum across them leaves ${name.replace(/[{}_]/g, '')} alone.`;
    tex = [`${vertical ? '\\uparrow +\\ \\sum F_y' : '\\rightarrow +\\ \\sum F_x'} = 0:\\quad ${joinTerms(terms)} = 0`];
  }
  tex.push(`${name} = ${q(val, F)}${Math.abs(val) < 1e-9 ? '' : val > 0 ? '\\ (T)' : `\\ \\Rightarrow\\ ${q(-val, F)}\\ (C)`}`);
  return {
    title: `Section through ${sec.cut.map((i) => memberName(t.members[i])).join(', ')}: ${memberName(t.members[target])}`,
    text: `Cut through ${sec.cut.map((i) => memberName(t.members[i])).join(', ')} and keep the piece with joint${sec.side.length > 1 ? 's' : ''} ${sec.side.join(', ')}. ${how}`,
    tex,
  };
}
const xy = (j: { x: number; y: number }) => ({ x: j.x, y: j.y });
function intersect(a: { near: { x: number; y: number }; ux: number; uy: number }, b: { near: { x: number; y: number }; ux: number; uy: number }) {
  const den = a.ux * b.uy - a.uy * b.ux;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((b.near.x - a.near.x) * b.uy - (b.near.y - a.near.y) * b.ux) / den;
  return { x: a.near.x + t * a.ux, y: a.near.y + t * a.uy };
}
