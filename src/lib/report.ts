// Turns a Solution into display-ready results, worked steps (TeX), and a short
// template explanation. All numbers come from the solver (D24).

import { distResultant, loadsMomentAbout, totalDownward, totalRight } from '../solver/loads';
import { add, scale, shiftedPow, type Poly } from '../solver/poly';
import { momentAboutPoint, pointAt, valueAt, type Reaction, type Solution } from '../solver/solve';
import type { PointLoad, Problem } from '../solver/types';
import { fmt, rotWord, showForce, showInternal, showMoment, type SignConvention } from './format';
import { deflectionUnit, eiInProblemUnits, toDeflectionUnit, unitStr } from './units';

export interface Step {
  title: string;
  text?: string;
  tex: string[];
}

export interface ResultLine {
  key: string;
  group: 'reactions' | 'resultant' | 'momentAbout' | 'internal' | 'maxValues' | 'deflection';
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

/** cos or sin of an inclined force as TeX: a slope-triangle fraction (4/5) when its sides are small whole numbers, else the angle. */
function dirFactor(part: number, l: PointLoad, trig: 'cos' | 'sin'): string {
  const F = Math.hypot(l.P, l.Px ?? 0);
  return trigTex(Math.abs(l.Px ?? 0) / F, Math.abs(l.P) / F, Math.abs(part) / F, trig);
}
/** a = |cos|, b = |sin| of the direction, r = the one wanted. */
function trigTex(a: number, b: number, r: number, trig: 'cos' | 'sin'): string {
  // 1e-4: an angle typed as 36.87° still reads as the 3-4-5 triangle
  for (let c = 2; c <= 25; c++)
    if ([a, b].every((v) => Math.abs(v * c - Math.round(v * c)) < 1e-4)) return `\\left(\\tfrac{${Math.round(r * c)}}{${c}}\\right)`;
  return `\\${trig} ${fmt((Math.atan2(b, a) * 180) / Math.PI)}^\\circ`;
}
/** cos (x part) or sin (y part) of an inclined roller's reaction. */
function rollerFactor(r: Reaction, trig: 'cos' | 'sin'): string {
  const th = (r.angle! * Math.PI) / 180;
  const [a, b] = [Math.abs(Math.cos(th)), Math.abs(Math.sin(th))];
  return trigTex(a, b, trig === 'cos' ? a : b, trig);
}

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
  const inclined = p.loads.filter((l): l is PointLoad => l.kind === 'point' && !!l.Px);
  const dists = p.loads.filter((l) => l.kind === 'dist');
  const fbd: string[] = [];
  for (const l of dists) {
    if (l.kind !== 'dist') continue;
    const { W, xc } = distResultant(l);
    const len = l.x2 - l.x1;
    fbd.push(
      l.poly
        ? `W = \\int_{${fmt(l.x1)}}^{${fmt(l.x2)}} w\\,dx = ${q(W, F)},\\quad \\bar{x} = \\dfrac{\\int x\\,w\\,dx}{W} = ${q(xc, u.length)}\\quad (w = ${texPoly(l.poly, (l.x0 ?? 0) ? `(x - ${fmt(l.x0!)})` : 'x')})`
        : l.w1 === l.w2
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
          : r.angle !== undefined
            ? `${r.label} (inclined roller): N_${r.label}, acting at ${fmt(r.angle)}° from the x axis`
            : `${r.label} (roller): ${r.label}_y`,
    )
    .join('; ');
  steps.push({
    title: 'Free-body diagram',
    text: `Replace the supports with reactions: ${supText}. ${
      inclined.length
        ? 'Resolve each inclined force into its x and y components.'
        : s.reactions.some((r) => r.angle !== undefined)
          ? "The inclined roller's reaction has x and y components, so the pin takes a horizontal reaction too."
          : 'With no horizontal loads, ΣFx = 0 gives every horizontal reaction as zero.'
    }${
      dists.length ? ' Replace each distributed load with its resultant acting at its centroid.' : ''
    }`,
    tex: [
      ...inclined.filter((l) => l.P).flatMap((l) => {
        const mag = Math.hypot(l.P, l.Px!);
        return [
          `F_x = ${fmt(mag)}${dirFactor(l.Px!, l, 'cos')} = ${q(Math.abs(l.Px!), F)}\\ ${l.Px! > 0 ? '\\rightarrow' : '\\leftarrow'}`,
          `F_y = ${fmt(mag)}${dirFactor(l.P, l, 'sin')} = ${q(Math.abs(l.P), F)}\\ ${l.P > 0 ? '\\downarrow' : '\\uparrow'}`,
        ];
      }),
      ...fbd,
    ],
  });

  // ---- equilibrium
  // each force component times its own arm (Varignon); a component through the point adds nothing
  const loadTerms = (about: number, aboutY = 0) =>
    p.loads.flatMap((l) => {
      if (l.kind === 'moment') return [{ sign: (l.dir === 'ccw' ? 1 : -1) * mSign, tex: fmt(l.M) }];
      const { P, x } = l.kind === 'point' ? { P: l.P, x: l.x } : { P: distResultant(l).W, x: distResultant(l).xc };
      const [Px, dy] = l.kind === 'point' ? [l.Px ?? 0, (l.y ?? 0) - aboutY] : [0, 0];
      const terms = [];
      if (!Px || (P && Math.abs(x - about) > 1e-9)) terms.push({ sign: Math.sign(-P * (x - about) || 1) * mSign, tex: `${fmt(Math.abs(P))}(${fmt(Math.abs(x - about))})` });
      if (Px && Math.abs(dy) > 1e-9) terms.push({ sign: Math.sign(-Px * dy) * mSign, tex: `${fmt(Math.abs(Px))}(${fmt(Math.abs(dy))})` });
      return terms.length ? terms : [{ sign: 1, tex: '0' }];
    });
  const downTerms = p.loads
    .filter((l) => l.kind !== 'moment')
    .map((l) => {
      const P = l.kind === 'point' ? l.P : l.kind === 'dist' ? distResultant(l).W : 0;
      return { sign: -fSign * Math.sign(P || 1), tex: fmt(Math.abs(P)) };
    });

  const eqFrom = steps.length;
  if (s.kind === 'simple') {
    const [r1, r2] = s.reactions;
    const A = r1.type === 'pin' ? r1 : r2;
    const B = A === r1 ? r2 : r1;
    const dB = B.x - A.x;
    const dBy = B.y - A.y;
    const tilted = B.angle !== undefined;
    // an inclined roller: its y part times the horizontal arm, its x part times the vertical arm
    const bTerms = tilted
      ? [
          ...(Math.abs(B.Ry) > 1e-9 ? [{ sign: Math.sign(B.Ry / B.R! * dB) * mSign, tex: `N_{${B.label}}${rollerFactor(B, 'sin')}(${fmt(Math.abs(dB))})` }] : []),
          ...(Math.abs(B.Rx) > 1e-9 && Math.abs(dBy) > 1e-9 ? [{ sign: Math.sign(-B.Rx / B.R! * dBy) * mSign, tex: `N_{${B.label}}${rollerFactor(B, 'cos')}(${fmt(Math.abs(dBy))})` }] : []),
        ]
      : [{ sign: Math.sign(dB) * mSign, tex: `${B.label}_y(${fmt(Math.abs(dB))})` }];
    const mTerms = [...bTerms, ...loadTerms(A.x, A.y)];
    steps.push({
      title: `Moments about ${A.label}`,
      tex: [
        `${mDirTex}\\ \\sum M_{${A.label}} = 0:`,
        `${joinTerms(mTerms)} = 0`,
        ...(tilted
          ? [
              `N_{${B.label}} = ${q(B.R!, F)}`,
              `${B.label}_x = ${q(B.Rx, F)},\\quad ${B.label}_y = ${q(B.Ry, F)}`,
            ]
          : [`${B.label}_y = ${q(B.Ry, F)}`]),
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
        `${joinTerms([{ sign: 1, tex: `M_{${R.label}}` }, ...loadTerms(R.x, R.y)])} = 0`,
        `M_{${R.label}} = ${q(showMoment(R.M!, c), FL)}\\ (\\text{${rotWord(R.M!) || 'zero'}})`,
      ],
    });
  }

  const held = s.reactions.find((r) => r.type !== 'roller');
  const tilted = s.reactions.find((r) => r.angle !== undefined);
  if ((inclined.length || tilted) && held)
    steps.push({
      title: 'Horizontal equilibrium',
      tex: [
        `\\rightarrow +\\ \\sum F_x = 0:`,
        `${joinTerms([
          { sign: 1, tex: `${held.label}_x` },
          ...(tilted && Math.abs(tilted.Rx) > 1e-9 ? [{ sign: Math.sign(tilted.Rx), tex: fmt(Math.abs(tilted.Rx)) }] : []),
          ...inclined.map((l) => ({ sign: Math.sign(l.Px!), tex: fmt(Math.abs(l.Px!)) })),
        ])} = 0`,
        `${held.label}_x = ${q(held.Rx, F)}`,
      ],
    });

  const a = p.asked;
  // only a moment about a point asked: the reactions are not part of the answer, so their steps would only distract
  if (!(a.reactions || a.shear || a.moment || a.maxValues || a.deflection || (a.internalAt ?? []).length)) steps.splice(eqFrom);

  for (const r of s.reactions) {
    if (r.angle !== undefined)
      lines.push({ key: `N${r.label}`, group: 'reactions', label: `N_{${r.label}}`, value: q(Math.abs(r.R!), F), note: `${r.R! >= 0 ? 'along' : 'against'} ${fmt(r.angle)}°` });
    const v = showForce(r.Ry, c);
    lines.push({
      key: `R${r.label}`,
      group: 'reactions',
      label: `${r.label}_y`,
      value: q(v, F),
      note: Math.abs(r.Ry) < 1e-9 ? undefined : r.Ry > 0 ? 'upward' : 'downward',
    });
    if (r.type !== 'roller' || r.angle !== undefined)
      lines.push({ key: `Rx${r.label}`, group: 'reactions', label: `${r.label}_x`, value: q(r.Rx, F), note: Math.abs(r.Rx) < 1e-9 ? undefined : r.Rx > 0 ? 'to the right' : 'to the left' });
    if (r.type === 'fixed')
      lines.push({ key: `M${r.label}`, group: 'reactions', label: `M_{${r.label}}`, value: q(showMoment(r.M!, c), FL), note: rotWord(r.M!) });
  }
  if (p.asked.reactions && held && inclined.length)
    expl.push(`The horizontal components of the inclined loads are taken by ${held.label}, the only support that resists sideways movement: ${held.label}x = ${fmt(held.Rx)} ${F}.`);
  if (p.asked.reactions) {
    const [r1, r2] = s.reactions;
    expl.push(
      s.kind === 'simple'
        ? `The reactions keep the beam in equilibrium: together they carry the total load (ΣFy = 0), and their moments balance those of the loads (ΣM = 0). The support nearer the resultant load carries the larger share, here ${r1.label}y = ${fmt(r1.Ry)} ${F} and ${r2.label}y = ${fmt(r2.Ry)} ${F}.`
        : `A fixed support resists both translation and rotation. Its vertical reaction balances the total vertical load (${r1.label}y = ${fmt(r1.Ry)} ${F}), and its moment, ${fmt(Math.abs(r1.M!))} ${FL} ${rotWord(r1.M!)}, balances the turning effect of the loads about the support.`,
    );
  }

  // ---- equivalent resultant force (Hibbeler 4.9): F_R = ΣF, located so that F_R x̄ = ΣM about the left end
  if (p.asked.resultant) {
    const FR = totalDownward(p.loads);
    const FRx = totalRight(p.loads);
    const M0 = loadsMomentAbout(p.loads, 0);
    const from = p.supports.find((sp) => Math.abs(sp.x) < 1e-9 && !sp.y)?.label ?? p.points.find((pt) => Math.abs(pt.x) < 1e-9 && !pt.y)?.label ?? 'the left end';
    const tex = [`${fDirTex}\\ F_R = \\sum F_y = ${joinTerms(downTerms)} = ${q(showForce(-FR, c), F)}`];
    if (Math.abs(FRx) > 1e-9) tex.push(`\\rightarrow +\\ (F_R)_x = \\sum F_x = ${q(FRx, F)}`);
    if (Math.abs(FR) > 1e-9) {
      tex.push(`F_R\\,\\bar{x} = \\sum M:\\quad ${fmt(Math.abs(FR))}\\,\\bar{x} = ${joinTerms(loadTerms(0).map((t) => ({ ...t, sign: t.sign * -mSign * Math.sign(FR) })))}`);
      tex.push(`\\bar{x} = ${q(-M0 / FR, u.length)}\\ \\text{from ${from}}`);
    }
    steps.push({
      title: 'Equivalent resultant force',
      text: `Replace the loads with one force: it equals their sum, and acts where its moment about ${from} equals the moment of the loads.`,
      tex,
    });
    lines.push({ key: 'FR', group: 'resultant', label: 'F_R', value: q(Math.abs(FR), F), note: Math.abs(FR) < 1e-9 ? undefined : FR > 0 ? 'downward' : 'upward' });
    if (Math.abs(FRx) > 1e-9) lines.push({ key: 'FRx', group: 'resultant', label: '(F_R)_x', value: q(FRx, F), note: FRx > 0 ? 'to the right' : 'to the left' });
    if (Math.abs(FR) > 1e-9) lines.push({ key: 'xbar', group: 'resultant', label: '\\bar{x}', value: q(-M0 / FR, u.length), note: `from ${from}` });
    else if (Math.abs(M0) > 1e-9) lines.push({ key: 'MR', group: 'resultant', label: 'M_R', value: q(showMoment(M0, c), FL), note: `${rotWord(M0)}, the loads reduce to a couple` });
  }

  // ---- moments about named points
  for (const label of p.asked.momentAbout) {
    const at = pointAt(p, label);
    if (!at) continue;
    const { x, y } = at;
    const M = momentAboutPoint(p, x, y);
    // a fixed support's reaction moment is M_O too; call the moment of the loads (M_R)_O as the textbook does
    const ML = p.supports.some((sp) => sp.type === 'fixed' && sp.label === label) ? `(M_R)_{${label}}` : `M_{${label}}`;
    const single = p.loads.length === 1 && p.loads[0].kind === 'point' && !p.loads[0].Px && (p.loads[0].y ?? 0) === y;
    const tex = single
      ? [
          `${ML} = F \\times d:`,
          `${ML} = ${q(Math.abs((p.loads[0] as { P: number }).P), F)} \\times ${q(Math.abs((p.loads[0] as { x: number }).x - x), u.length)}`,
          `${ML} = ${q(Math.abs(M), FL)}\\ (\\text{${rotWord(M) || 'zero'}})`,
        ]
      : [`${mDirTex}\\ ${ML} = \\sum F d:`, `${ML} = ${joinTerms(loadTerms(x, y))}`, `${ML} = ${q(showMoment(M, c), FL)}\\ (\\text{${rotWord(M) || 'zero'}})`];
    steps.push({
      title: `Moment about ${label}`,
      text: inclined.length
        ? 'Moment of the applied loads about the point. Each force component times its own perpendicular distance (Varignon), x components with vertical arms, y components with horizontal arms.'
        : 'Moment of the applied loads about the point (force × perpendicular distance).',
      tex,
    });
    lines.push({ key: `MO${label}`, group: 'momentAbout', label: `${ML}`, value: q(showMoment(M, c), FL), note: rotWord(M) });
    expl.push(
      `The moment of a force about a point is the force times its perpendicular distance from the point, the moment arm d. ${
        single
          ? `The ${fmt((p.loads[0] as { P: number }).P)} ${F} load acts ${fmt(Math.abs((p.loads[0] as { x: number }).x - x))} ${u.length} from ${label}, so`
          : inclined.length
            ? `Resolving each inclined force into components and summing each component times its arm gives`
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
    const x = pointAt(p, label)?.x;
    if (x === undefined) continue;
    const at = (f: 'V' | 'N' | 'M', side: 'left' | 'right') => showInternal(valueAt(s.segments, x, f, side), c);
    const [Vl, Vr, M] = [at('V', 'left'), at('V', 'right'), at('M', 'right')];
    const jump = Math.abs(Vl - Vr) > 1e-9 && x > 1e-9 && x < p.length - 1e-9;
    const tex = jump
      ? [`V_{${label}}^{-} = V(${fmt(x)}^{-}) = ${q(Vl, F)},\quad V_{${label}}^{+} = V(${fmt(x)}^{+}) = ${q(Vr, F)}`]
      : [`V_{${label}} = V(${fmt(x)}) = ${q(x >= p.length - 1e-9 ? Vl : Vr, F)}`];
    const Nc = valueAt(s.segments, x, 'N', x >= p.length - 1e-9 ? 'left' : 'right');
    if (inclined.length) tex.unshift(`N_{${label}} = ${q(Nc, F)}\\ (${Nc > 1e-9 ? '\\text{tension}' : Nc < -1e-9 ? '\\text{compression}' : '\\text{zero}'})`);
    tex.push(`M_{${label}} = M(${fmt(x)}) = ${q(M, FL)}`);
    steps.push({ title: `${inclined.length ? 'Normal force, shear' : 'Shear'} and moment at ${label}`, text: `Cut the beam at ${label} (x = ${fmt(x)} ${u.length}) and use the equations above for the segment containing the cut.`, tex });
    if (jump) {
      lines.push({ key: `Vl${label}`, group: 'internal', label: `V_{${label}}^{-}`, value: q(Vl, F), note: 'just left' });
      lines.push({ key: `Vr${label}`, group: 'internal', label: `V_{${label}}^{+}`, value: q(Vr, F), note: 'just right' });
    } else lines.push({ key: `V${label}`, group: 'internal', label: `V_{${label}}`, value: q(x >= p.length - 1e-9 ? Vl : Vr, F) });
    if (inclined.length) lines.push({ key: `N${label}`, group: 'internal', label: `N_{${label}}`, value: q(Nc, F), note: Nc > 1e-9 ? 'tension' : Nc < -1e-9 ? 'compression' : undefined });
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
