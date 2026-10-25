import { describe, expect, it } from 'vitest';
import { workedExample, beam, sup, dist, point } from '../solver/fixtures';
import { solve } from '../solver/solve';
import { buildReport, texPoly, toGlobal } from './report';
import { defaultConvention } from './format';

describe('report', () => {
  it('worked example reads like the textbook', () => {
    const p = workedExample();
    const r = solve(p);
    if (!r.ok) throw new Error();
    const rep = buildReport(p, r.solution, defaultConvention);
    const mo = rep.lines.find((l) => l.key === 'MOO')!;
    expect(mo.value).toContain('-600');
    expect(mo.note).toBe('clockwise');
    const step = rep.steps.find((s) => s.title === 'Moment about O')!;
    expect(step.tex.join(' ')).toContain('= 600');
  });
  it('cw-positive flips sign only', () => {
    const p = workedExample();
    const r = solve(p);
    if (!r.ok) throw new Error();
    const rep = buildReport(p, r.solution, { ...defaultConvention, momentPositive: 'cw' });
    expect(rep.lines.find((l) => l.key === 'MOO')!.value).toMatch(/^600/);
  });
  it('upward applied loads print as positive terms with the right sign', () => {
    const p = beam(8, [sup('pin', 0, 'A'), sup('roller', 8, 'B')], [point(2.4, 50), point(6, -20)]);
    p.asked = { ...p.asked, momentAbout: ['A'] };
    const r = solve(p);
    if (!r.ok) throw new Error();
    const tex = buildReport(p, r.solution, defaultConvention).steps.flatMap((s) => s.tex).join('\n');
    expect(tex).not.toMatch(/[+-] -/);
    expect(tex).toContain('+ 20(6)');
    expect(tex).toContain('+ 20 = 0');
  });
  it('polynomials convert to global x', () => {
    expect(texPoly(toGlobal([2, 3], 1))).toBe('3x - 1');
  });
  it('cantilever UDL report', () => {
    const p = beam(3, [sup('fixed', 0, 'A'), sup('free', 3, 'B')], [dist(0, 3, 2)]);
    p.asked = { ...p.asked, deflection: true, moment: true };
    p.stiffness = { E: 200, Eunit: 'GPa', I: 100, Iunit: '1e6mm4' };
    const r = solve(p);
    if (!r.ok) throw new Error();
    const rep = buildReport(p, r.solution, defaultConvention);
    // y = wL^4/8EI = 2*81/8 / (200e9*100e-6) m
    expect(rep.deflection.y!).toBeCloseTo((-20.25 / 2e7) * 1000, 6);
  });
});
