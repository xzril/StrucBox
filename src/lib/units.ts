import type { EUnit, ForceUnit, IUnit, LengthUnit, Stiffness, Units } from '../solver/types';

export const FORCE_TO_N: Record<ForceUnit, number> = { N: 1, kN: 1000, lb: 4.4482216152605, kip: 4448.2216152605 };
export const LENGTH_TO_M: Record<LengthUnit, number> = { m: 1, mm: 0.001, ft: 0.3048, in: 0.0254 };
export const E_TO_PA: Record<EUnit, number> = { GPa: 1e9, MPa: 1e6, Pa: 1, ksi: 6.894757293168e6, psi: 6894.757293168 };
export const I_TO_M4: Record<IUnit, number> = { mm4: 1e-12, cm4: 1e-8, m4: 1, in4: 0.0254 ** 4, '1e6mm4': 1e-6 };

export const FORCE_UNITS: Record<Units['system'], ForceUnit[]> = { SI: ['N', 'kN'], US: ['lb', 'kip'] };
export const LENGTH_UNITS: Record<Units['system'], LengthUnit[]> = { SI: ['m', 'mm'], US: ['ft', 'in'] };
export const E_UNITS: Record<Units['system'], EUnit[]> = { SI: ['GPa', 'MPa', 'Pa'], US: ['ksi', 'psi'] };
export const I_UNITS: Record<Units['system'], IUnit[]> = { SI: ['1e6mm4', 'mm4', 'cm4', 'm4'], US: ['in4'] };

export const I_UNIT_LABEL: Record<IUnit, string> = {
  mm4: 'mm⁴',
  cm4: 'cm⁴',
  m4: 'm⁴',
  in4: 'in⁴',
  '1e6mm4': '×10⁶ mm⁴',
};

export const defaultUnits = (system: Units['system']): Units =>
  system === 'SI' ? { system, force: 'kN', length: 'm' } : { system, force: 'kip', length: 'ft' };

/** EI in the problem's force·length² units. */
export function eiInProblemUnits(s: Stiffness, u: Units): number {
  const EI_SI = s.E * E_TO_PA[s.Eunit] * s.I * I_TO_M4[s.Iunit]; // N·m²
  return EI_SI / (FORCE_TO_N[u.force] * LENGTH_TO_M[u.length] ** 2);
}

/** Unit used to report a deflection: mm for SI, in for US. */
export function deflectionUnit(u: Units): LengthUnit {
  return u.system === 'SI' ? 'mm' : 'in';
}

/** Convert a length in problem units to the deflection display unit. */
export function toDeflectionUnit(y: number, u: Units): number {
  return (y * LENGTH_TO_M[u.length]) / LENGTH_TO_M[deflectionUnit(u)];
}

export const unitStr = {
  force: (u: Units) => u.force,
  length: (u: Units) => u.length,
  moment: (u: Units) => `${u.force}·${u.length}`,
  dist: (u: Units) => `${u.force}/${u.length}`,
};
