// Worked steps for a cable (Hibbeler 7.4). Every number comes from solveCable (D24); this only arranges them.
import type { Cable, CableSolution } from '../solver/cable';
import { fmt } from './format';
import { q, unitTex, type ResultLine, type Step } from './report';

export function buildCableReport(c: Cable, s: CableSolution): { lines: ResultLine[]; steps: Step[]; explanation: string } {
  const [F, Lu] = [c.units.force, c.units.length];
  const wu = `${unitTex(F)}/${unitTex(Lu)}`;
  const steps: Step[] = [];
  const lines: ResultLine[] = [];
  const g = c.given;
  const L = c.B.x - c.A.x;
  const [A, B] = [c.A.label, c.B.label];
  const deg = (sl: number) => fmt((Math.atan(Math.abs(sl)) * 180) / Math.PI);
  const givenText =
    g.kind === 'y'
      ? `the cable passes through (${fmt(g.x)}, ${fmt(g.y)}) ${Lu}`
      : g.kind === 'sag'
        ? `the lowest point is ${fmt(g.h)} ${Lu} below ${A}`
        : g.kind === 'Tmax'
          ? `the largest tension is ${fmt(g.T)} ${F}`
          : g.kind === 'H'
            ? `the horizontal tension is ${fmt(g.H)} ${F}`
            : `the cable is ${fmt(g.s)} ${Lu} long`;

  steps.push({
    title: 'Free-body diagram',
    text: `A cable carries tension only, along its own direction. With vertical loads only, ΣF_x = 0 on any piece of it shows the horizontal component F_H is the same everywhere. Given: ${givenText}. Supports ${A}(${fmt(c.A.x)}, ${fmt(c.A.y)}) and ${B}(${fmt(c.B.x)}, ${fmt(c.B.y)}) ${Lu}.`,
    tex: [],
  });

  if (c.w0) {
    const k = c.w0 / s.H;
    steps.push({
      title: 'Catenary (cable under its own weight)',
      text: `With w₀ = ${fmt(c.w0)} ${F}/${Lu} along the cable and the lowest point at (${fmt(s.c!)}, ${fmt(s.yv!)}), integrating dy/dx = s w₀/F_H gives the catenary. Its two constants and F_H follow from the supports and the given fact (solved numerically).`,
      tex: [
        `y = ${fmt(s.yv!)} + \\frac{F_H}{w_0}\\left[\\cosh\\frac{w_0 (x - ${fmt(s.c!)})}{F_H} - 1\\right]`,
        `F_H = ${q(s.H, F)}, \\quad \\frac{w_0}{F_H} = ${fmt(k)}\\ ${unitTex(Lu)}^{-1}`,
        `T = F_H \\cosh\\frac{w_0 (x - x_0)}{F_H} = F_H + w_0 (y - y_0)`,
        `T_{${A}} = ${fmt(s.H)} + ${fmt(c.w0)}(${fmt(c.A.y - s.yv!)}) = ${q(s.TA, F)}`,
        `T_{${B}} = ${fmt(s.H)} + ${fmt(c.w0)}(${fmt(c.B.y - s.yv!)}) = ${q(s.TB, F)}`,
        `s = \\frac{F_H}{w_0}\\left[\\sinh\\frac{w_0 (x_{${B}} - x_0)}{F_H} - \\sinh\\frac{w_0 (x_{${A}} - x_0)}{F_H}\\right] = ${q(s.length, Lu)}`,
      ],
    });
  } else {
    const dist = c.w1 || c.w2;
    const M = (x: number) => (c.A.y + ((c.B.y - c.A.y) * (x - c.A.x)) / L - s.y(x)) * s.H; // moment of the loads at x, as on a beam
    const chord = (x: number) => c.A.y + ((c.B.y - c.A.y) * (x - c.A.x)) / L;
    const tex = [`y(x) = y_{${A}} + \\frac{y_{${B}} - y_{${A}}}{L}\\,(x - x_{${A}}) - \\frac{M(x)}{F_H}`];
    if (g.kind === 'y')
      tex.push(
        `M(${fmt(g.x)}) = ${q(M(g.x), `${F}·${Lu}`)}, \\quad F_H = \\frac{M}{y_{chord} - y} = \\frac{${fmt(M(g.x))}}{${fmt(chord(g.x))} - (${fmt(g.y)})} = ${q(s.H, F)}`,
      );
    else tex.push(`F_H = ${q(s.H, F)}\\ \\text{(from the given fact, solved numerically)}`);
    steps.push({
      title: 'Cable equation from moments',
      text: `Cut the cable at x and take moments about the cut for the part to its left: F_H times the cable's depth below the chord ${A}${B} equals M(x), the moment the same loads cause in a simply supported beam of span ${fmt(L)} ${Lu}.${dist ? ` The distributed load is ${fmt(c.w1)}${c.w2 !== c.w1 ? ` to ${fmt(c.w2)}` : ''} ${F}/${Lu} along the horizontal, so the shape is a ${c.w1 === c.w2 ? 'parabola' : 'cubic'}.` : ''}`,
      tex,
    });
    if (c.points.length)
      steps.push({
        title: 'Position of each load',
        tex: c.points.map((p, i) => `y_{${p.label}} = ${fmt(chord(p.x))} - \\frac{${fmt(M(p.x))}}{${fmt(s.H)}} = ${q(s.pointY[i], Lu)}`),
      });
    steps.push({
      title: 'Tensions',
      text: 'T = F_H / cos θ = F_H √(1 + (dy/dx)²). The cable is steepest at a support, so the largest tension is there.',
      tex: s.segments.length
        ? s.segments.map((sg) => `T_{${sg.from}${sg.to}} = ${fmt(s.H)}\\sqrt{1 + (${fmt(sg.slope)})^2} = ${q(sg.T, F)}\\quad (\\theta = ${deg(sg.slope)}^\\circ)`)
        : [
            `T_{${A}} = ${fmt(s.H)}\\sqrt{1 + (${fmt(s.slope(c.A.x))})^2} = ${q(s.TA, F)}`,
            `T_{${B}} = ${fmt(s.H)}\\sqrt{1 + (${fmt(s.slope(c.B.x))})^2} = ${q(s.TB, F)}`,
          ],
    });
    steps.push({ title: 'Length', text: 'Sum of √(dx² + dy²) along the cable.', tex: [`s = ${q(s.length, Lu)}`] });
  }

  const line = (key: string, label: string, v: number, u: string, note?: string) => lines.push({ key, group: 'internal', label, value: q(v, u), note });
  line('H', 'F_H', s.H, F, 'horizontal tension, the same everywhere');
  for (const sg of s.segments) line(`T${sg.from}${sg.to}`, `T_{${sg.from}${sg.to}}`, sg.T, F);
  if (!s.segments.length) {
    line('TA', `T_{${A}}`, s.TA, F, `at ${A}`);
    line('TB', `T_{${B}}`, s.TB, F, `at ${B}`);
  }
  line('Tmax', 'T_{max}', s.Tmax, F, `at ${s.TA >= s.TB ? A : B}`);
  c.points.forEach((p, i) => line(`y${p.label}`, `y_{${p.label}}`, s.pointY[i], Lu, `${fmt(c.A.y - s.pointY[i])} ${Lu} below ${A}`));
  if (s.low && g.kind !== 'sag') line('h', 'h', c.A.y - s.low.y, Lu, `sag of the lowest point below ${A}, at x = ${fmt(s.low.x)} ${Lu}`);
  line('s', 's', s.length, Lu, 'cable length');

  const explanation = c.w0
    ? `A cable hanging under its own weight takes the shape of a catenary. The horizontal component of the tension, ${fmt(s.H)} ${F}, is constant; the tension grows with height, so it is largest at the higher support (${fmt(s.Tmax)} ${F}).`
    : `Because the cable cannot carry bending, the moment of the loads about any point of it must be balanced by the horizontal tension times the cable's depth below the chord. That fixes F_H = ${fmt(s.H)} ${F}; the tension in each part is F_H divided by the cosine of its slope, largest where the cable is steepest (${fmt(s.Tmax)} ${F}).`;
  return { lines, steps, explanation };
}
