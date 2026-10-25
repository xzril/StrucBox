// Turns a Solution into display-ready results, worked steps (TeX), and a short
// template explanation. All numbers come from the solver (D24).

import { distResultant } from '../solver/loads';
import { add, scale, shiftedPow, type Poly } from '../solver/poly';
import { momentAboutPoint, pointX, valueAt, type Solution } from '../solver/solve';
import type { Problem } from '../solver/types';
import { fmt, rotWord, showForce, showInternal, showMoment, type SignConvention } from './format';
import { deflectionUnit, eiInProblemUnits, toDeflectionUnit, unitStr } from './units';

export interface Step {
  title: string;
  text?: string;
  tex: string[];
}

export interface ResultLine {
  key: string;
  group: 'reactions' | 'momentAbout' | 'internal' | 'maxValues' | 'deflection';
  label: string; // TeX
  value: string; // TeX
  note?: string;
}

export interface Report {
  lines: ResultLine[];
  steps: Step[];
  explanation: string;
  deflection: { EIymin: number; x: number; y?: number; unit: string; ei?: number };
}

export function unitTex(u: string): string {
  return u
    .split('·')
    .map((part) => {
      const m = part.match(/^(.*?)([²³⁴])?$/)!;
      const pow = m[2] ? `^{${'²³⁴'.indexOf(m[2]) + 2}}` : '';
      return `\\text{${m[1]}}${pow}`;
    })
    .join('\\cdot ');
}
const q = (n: number, u: string) => `${fmt(n)}\\ ${unitTex(u)}`;

/** p(t) with t = x - a, rewritten as a polynomial in x. */
export function toGlobal(p: Poly, a: number): Poly {
  let out: Poly = [0];
  p.forEach((c, k) => (out = add(out, scale(shiftedPow(-a, k), c))));
  return out;
}

export function texPoly(p: Poly, v = 'x'): string {
  const parts: string[] = [];
  for (let k = p.length - 1; k >= 0; k--) {
    const c = p[k];
    if (Math.abs(c) < 1e-9) continue;
    const absC = fmt(Math.abs(c));
    const coef = k > 0 && absC === '1' ? '' : absC;
    const pow = k === 0 ? '' : k === 1 ? v : `${v}^{${k}}`;
    parts.push(`${c < 0 ? '-' : '+'} ${coef}${pow}`);
  }
  if (!parts.length) return '0';
  const s = parts.join(' ');
  return s.startsWith('+ ') ? s.slice(2) : s.replace(/^- /, '-');
}

function joinTerms(terms: { sign: number; tex: string }[]): string {
  return terms
    .map((t, i) => (i === 0 ? (t.sign < 0 ? '-' : '') + t.tex : (t.sign < 0 ? ' - ' : ' + ') + t.tex))
    .join('');
}

export function buildReport(p: Problem, s: Solution, c: SignConvention): Report {
  const u = p.units;
  const F = unitStr.force(u);
  const FL = unitStr.moment(u);
  const lines: ResultLine[] = [];
  const steps: Step[] = [];
  const expl: string[] = [];
  const mSign = c.momentPositive === 'ccw' ? 1 : -1;
  const fSign = c.forcePositive === 'up' ? 1 : -1;
  const mDirTex = c.momentPositive === 'ccw' ? '\\circlearrowleft +' : '\\circlearrowright +';
  const fDirTex = c.forcePositive === 'up' ? '\\uparrow +' : '\\downarrow +';

  // ---- free-body diagram
  const dists = p.loads.filter((l) => l.kind === 'dist');
  const fbd: string[] = [];
  for (const l of dists) {
    if (l.kind !== 'dist') continue;
    const { W, xc } = distResultant(l);
    const len = l.x2 - l.x1;
    fbd.push(
      l.w1 === l.w2
        ? `W = w L = ${fmt(l.w1)}(${fmt(len)}) = ${q(W, F)},\\quad \\bar{x} = ${q(xc, u.length)}`
        : `W = \\tfrac{1}{2}(w_1 + w_2) L = \\tfrac{1}{2}(${fmt(l.w1)} + ${fmt(l.w2)})(${fmt(len)}) = ${q(W, F)},\\quad \\bar{x} = ${q(xc, u.length)}`,
    );
  }
  const supText = s.reactions
    .map((r) =>
      r.type === 'fixed'
        ? `${r.label} (fixed): ${r.label}_x, ${r.label}_y and M_${r.label}`
        : r.type === 'pin'
          ? `${r.label} (pin): ${r.label}_x and ${r.label}_y`
          : `${r.label} (roller): ${r.label}_y`,
    )
    .join('; ');
  steps.push({
    title: 'Free-body diagram',
    text: `Replace the supports with reactions: ${supText}. With no horizontal loads, ΣFx = 0 gives every horizontal reaction as zero.${
      dists.length ? ' Replace each distributed load with its resultant acting at its centroid.' : ''
    }`,
    tex: fbd,
  });

  // ---- equilibrium
  const loadTerms = (about: number) =>
    p.loads.map((l) => {
      if (l.kind === 'moment') return { sign: (l.dir === 'ccw' ? 1 : -1) * mSign, tex: fmt(l.M) };
      const { P, x } = l.kind === 'point' ? { P: l.P, x: l.x } : { P: distResultant(l).W, x: distResultant(l).xc };
      const m = -P * (x - about);
      return { sign: Math.sign(m || 1) * mSign, tex: `${fmt(Math.abs(P))}(${fmt(Math.abs(x - about))})` };
    });
  const downTerms = p.loads
    .filter((l) => l.kind !== 'moment')
    .map((l) => {
      const P = l.kind === 'point' ? l.P : l.kind === 'dist' ? distResultant(l).W : 0;
      return { sign: -fSign * Math.sign(P || 1), tex: fmt(Math.abs(P)) };
    });

  if (s.kind === 'simple') {
    const [r1, r2] = s.reactions;
    const A = r1.type === 'pin' ? r1 : r2;
    const B = A === r1 ? r2 : r1;
    const dB = B.x - A.x;
    const mTerms = [{ sign: Math.sign(dB) * mSign, tex: `${B.label}_y(${fmt(Math.abs(dB))})` }, ...loadTerms(A.x)];
    steps.push({
      title: `Moments about ${A.label}`,
      tex: [
        `${mDirTex}\\ \\sum M_{${A.label}} = 0:`,
        `${joinTerms(mTerms)} = 0`,
        `${B.label}_y = ${q(B.Ry, F)}`,
      ],
    });
    steps.push({
      title: 'Vertical equilibrium',
      tex: [
        `${fDirTex}\\ \\sum F_y = 0:`,
        `${joinTerms([
          { sign: fSign, tex: `${A.label}_y` },
          { sign: fSign, tex: `${B.label}_y` },
          ...downTerms,
        ])} = 0`,
        `${A.label}_y = ${q(A.Ry, F)}`,
      ],
    });
  } else {
    const R = s.reactions[0];
    steps.push({
      title: 'Vertical equilibrium',
      tex: [`${fDirTex}\\ \\sum F_y = 0:`, `${joinTerms([{ sign: fSign, tex: `${R.label}_y` }, ...downTerms])} = 0`, `${R.label}_y = ${q(R.Ry, F)}`],
    });
    steps.push({
      title: `Moments about ${R.label}`,
      tex: [
        `${mDirTex}\\ \\sum M_{${R.label}} = 0:`,
        `${joinTerms([{ sign: 1, tex: `M_{${R.label}}` }, ...loadTerms(R.x)])} = 0`,
        `M_{${R.label}} = ${q(showMoment(R.M!, c), FL)}\\ (\\text{${rotWord(R.M!) || 'zero'}})`,
      ],
    });
  }

  for (const r of s.reactions) {
    const v = showForce(r.Ry, c);
    lines.push({
      key: `R${r.label}`,
      group: 'reactions',
      label: `${r.label}_y`,
      value: q(v, F),
      note: Math.abs(r.Ry) < 1e-9 ? undefined : r.Ry > 0 ? 'upward' : 'downward',
    });
    if (r.type !== 'roller') lines.push({ key: `Rx${r.label}`, group: 'reactions', label: `${r.label}_x`, value: q(0, F) });
    if (r.type === 'fixed')
      lines.push({ key: `M${r.label}`, group: 'reactions', label: `M_{${r.label}}`, value: q(showMoment(r.M!, c), FL), note: rotWord(r.M!) });
  }
  if (p.asked.reactions) {
    const [r1, r2] = s.reactions;
    expl.push(
      s.kind === 'simple'
        ? `The reactions keep the beam in equilibrium: together they carry the total load (ΣFy = 0), and their moments balance those of the loads (ΣM = 0). The support nearer the resultant load carries the larger share, here ${r1.label}y = ${fmt(r1.Ry)} ${F} and ${r2.label}y = ${fmt(r2.Ry)} ${F}.`
        : `A fixed support resists both translation and rotation. Its vertical reaction equals the total load, ${fmt(r1.Ry)} ${F}, and its moment, ${fmt(Math.abs(r1.M!))} ${FL} ${rotWord(r1.M!)}, balances the turning effect of the loads about the wall.`,
    );
  }

  // ---- moments about named points
  for (const label of p.asked.momentAbout) {
    const x = pointX(p, label);
    if (x === undefined) continue;
    const M = momentAboutPoint(p, x);
    const single = p.loads.length === 1 && p.loads[0].kind === 'point';
    const tex = single
      ? [
          `M_{${label}} = F \\times d:`,
          `M_{${label}} = ${q(Math.abs((p.loads[0] as { P: number }).P), F)} \\times ${q(Math.abs((p.loads[0] as { x: number }).x - x), u.length)}`,
          `M_{${label}} = ${q(Math.abs(M), FL)}\\ (\\text{${rotWord(M) || 'zero'}})`,
        ]
      : [`${mDirTex}\\ M_{${label}} = \\sum F d:`, `M_{${label}} = ${joinTerms(loadTerms(x))}`, `M_{${label}} = ${q(showMoment(M, c), FL)}`];
    steps.push({ title: `Moment about ${label}`, text: 'Moment of the applied loads about the point (force × perpendicular distance).', tex });
    lines.push({ key: `MO${label}`, group: 'momentAbout', label: `M_{${label}}`, value: q(showMoment(M, c), FL), note: rotWord(M) });
    expl.push(
      `The moment of a force about a point is the force times its perpendicular distance from the point, the moment arm d. ${
        single
          ? `The ${fmt((p.loads[0] as { P: number }).P)} ${F} load acts ${fmt(Math.abs((p.loads[0] as { x: number }).x - x))} ${u.length} from ${label}, so`
          : `Summing each load's force times arm gives`
      } the moment about ${label} is ${fmt(Math.abs(M))} ${FL}${rotWord(M) ? ' ' + rotWord(M) : ''}. A longer arm gives a proportionally larger turning effect for the same force.`,
    );
  }

  // ---- shear and moment equations
  const eqTex = s.segments.map((seg) => {
    const V = toGlobal(seg.V, seg.a).map((k) => showInternal(k, c));
    const M = toGlobal(seg.M, seg.a).map((k) => showInternal(k, c));
    return [`${fmt(seg.a)} < x < ${fmt(seg.b)}:\\quad V = ${texPoly(V)}`, `\\phantom{${fmt(seg.a)} < x < ${fmt(seg.b)}:}\\quad M = ${texPoly(M)}`];
  }).flat();
  const internalAt = p.asked.internalAt ?? [];
  if (p.asked.shear || p.asked.moment || p.asked.maxValues || internalAt.length)
    steps.push({ title: 'Shear and moment equations (method of sections)', text: `x in ${u.length}, V in ${F}, M in ${FL}.`, tex: eqTex });

  // ---- internal shear and moment at named points
  for (const label of internalAt) {
    const x = pointX(p, label);
    if (x === undefined) continue;
    const at = (f: 'V' | 'M', side: 'left' | 'right') => showInternal(valueAt(s.segments, x, f, side), c);
    const [Vl, Vr, M] = [at('V', 'left'), at('V', 'right'), at('M', 'right')];
    const jump = Math.abs(Vl - Vr) > 1e-9 && x > 1e-9 && x < p.length - 1e-9;
    const tex = jump
      ? [`V_{${label}}^{-} = V(${fmt(x)}^{-}) = ${q(Vl, F)},\quad V_{${label}}^{+} = V(${fmt(x)}^{+}) = ${q(Vr, F)}`]
      : [`V_{${label}} = V(${fmt(x)}) = ${q(x >= p.length - 1e-9 ? Vl : Vr, F)}`];
    tex.push(`M_{${label}} = M(${fmt(x)}) = ${q(M, FL)}`);
    steps.push({ title: `Shear and moment at ${label}`, text: `Cut the beam at ${label} (x = ${fmt(x)} ${u.length}) and use the equations above for the segment containing the cut.`, tex });
    if (jump) {
      lines.push({ key: `Vl${label}`, group: 'internal', label: `V_{${label}}^{-}`, value: q(Vl, F), note: 'just left' });
      lines.push({ key: `Vr${label}`, group: 'internal', label: `V_{${label}}^{+}`, value: q(Vr, F), note: 'just right' });
    } else lines.push({ key: `V${label}`, group: 'internal', label: `V_{${label}}`, value: q(x >= p.length - 1e-9 ? Vl : Vr, F) });
    lines.push({ key: `Mi${label}`, group: 'internal', label: `M_{${label}}`, value: q(M, FL), note: M > 1e-9 ? 'sagging' : M < -1e-9 ? 'hogging' : undefined });
  }

  // ---- maxima
  const Vabs = Math.abs(s.max.V.value) >= Math.abs(s.min.V.value) ? s.max.V : s.min.V;
  const Mpos = s.max.M;
  const Mneg = s.min.M;
  const maxTex = [`|V|_{max} = ${q(Math.abs(Vabs.value), F)}\\ \\text{at } x = ${q(Vabs.x, u.length)}`];
  if (Mpos.value > 1e-9) maxTex.push(`M_{max}^{+} = ${q(showInternal(Mpos.value, c), FL)}\\ \\text{at } x = ${q(Mpos.x, u.length)}`);
  if (Mneg.value < -1e-9) maxTex.push(`M_{max}^{-} = ${q(showInternal(Mneg.value, c), FL)}\\ \\text{at } x = ${q(Mneg.x, u.length)}`);
  if (p.asked.maxValues || p.asked.shear || p.asked.moment)
    steps.push({ title: 'Maximum shear and moment', text: 'Bending moment is extreme where the shear is zero or changes sign, or at a concentrated moment or support.', tex: maxTex });
  lines.push({ key: 'Vmax', group: 'maxValues', label: '|V|_{max}', value: q(Math.abs(Vabs.value), F), note: `at x = ${fmt(Vabs.x)} ${u.length}` });
  const Mabs = Math.abs(Mpos.value) >= Math.abs(Mneg.value) ? Mpos : Mneg;
  lines.push({ key: 'Mmax', group: 'maxValues', label: '|M|_{max}', value: q(Math.abs(Mabs.value), FL), note: `at x = ${fmt(Mabs.x)} ${u.length}` });
  if (p.asked.shear || p.asked.moment || p.asked.maxValues)
    expl.push(
      `Shear is the running sum of the vertical forces to the left of a section, and the bending moment is the area under the shear diagram. The moment therefore peaks where the shear crosses zero: |M|max = ${fmt(Math.abs(Mabs.value))} ${FL} at x = ${fmt(Mabs.x)} ${u.length}.`,
    );

  // ---- deflection (D25)
  const EIymin = Math.abs(s.min.EIy.value) >= Math.abs(s.max.EIy.value) ? s.min.EIy : s.max.EIy;
  const ei = p.stiffness ? eiInProblemUnits(p.stiffness, u) : undefined;
  const dUnit = deflectionUnit(u);
  const y = ei ? toDeflectionUnit(EIymin.value / ei, u) : undefined;
  const coefUnit = `${u.force}·${u.length}³`;
  if (p.asked.deflection) {
    const bc =
      s.kind === 'simple'
        ? `y = 0 at ${s.reactions.map((r) => `${r.label} (x = ${fmt(r.x)} ${u.length})`).join(' and ')}`
        : `y = 0 and dy/dx = 0 at the fixed support ${s.reactions[0].label}`;
    const yTex = s.segments.map((seg) => `${fmt(seg.a)} < x < ${fmt(seg.b)}:\\quad EI\\,y = ${texPoly(toGlobal(seg.EIy, seg.a))}`);
    steps.push({
      title: 'Deflection (double integration)',
      text: `Integrate the moment equation twice. Boundary conditions: ${bc}. Upward y is positive.`,
      tex: [
        `EI\\,\\dfrac{d^2y}{dx^2} = M(x)`,
        ...yTex,
        `y_{max} = \\dfrac{${q(EIymin.value, coefUnit)}}{EI}\\ \\text{at } x = ${q(EIymin.x, u.length)}` +
          (y !== undefined ? ` = ${q(y, dUnit)}` : ''),
      ],
    });
    expl.push(
      `Curvature is proportional to bending moment (EI y″ = M), so the beam bends most sharply where the moment is largest. Integrating twice and applying the support conditions gives the largest deflection at x = ${fmt(EIymin.x)} ${u.length}${
        y !== undefined ? `, ${fmt(Math.abs(y))} ${dUnit} ${y < 0 ? 'downward' : 'upward'}` : `, ${fmt(Math.abs(EIymin.value))} ${coefUnit}/EI`
      }.`,
    );
  }
  lines.push({
    key: 'ymax',
    group: 'deflection',
    label: 'y_{max}',
    value: y !== undefined ? q(y, dUnit) : `\\dfrac{${q(EIymin.value, coefUnit)}}{EI}`,
    note: `at x = ${fmt(EIymin.x)} ${u.length}${EIymin.value < 0 ? ', downward' : EIymin.value > 0 ? ', upward' : ''}`,
  });

  if (!expl.length)
    expl.push(
      'The beam is in static equilibrium: the support reactions balance the applied loads in both force (ΣFy = 0) and moment (ΣM = 0).',
    );

  return { lines, steps, explanation: expl.join('\n\n'), deflection: { EIymin: EIymin.value, x: EIymin.x, y, unit: dUnit, ei } };
}

/** Sampled diagram data for drawing, in display sign convention. */
export function sampleDiagram(s: Solution, field: 'V' | 'M' | 'EIy', c: SignConvention, perSeg = 40): [number, number][] {
  const pts: [number, number][] = [];
  // include the extrema so the diagram can label their exact values
  const extrema = [s.min[field].x, s.max[field].x];
  for (const seg of s.segments) {
    const xs = Array.from({ length: perSeg + 1 }, (_, i) => seg.a + ((seg.b - seg.a) * i) / perSeg);
    xs.push(...extrema.filter((x) => x > seg.a && x < seg.b && !xs.includes(x)));
    for (const x of xs.sort((p, q) => p - q)) {
      const v = valueAt([seg], x, field);
      pts.push([x, field === 'EIy' ? v : showInternal(v, c)]);
    }
  }
  return pts;
}
