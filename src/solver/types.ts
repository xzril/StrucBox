// Problem schema. Internal convention: x from the left end, y up, forces in
// "force units", lengths in "length units". Sign conventions chosen by the user
// are applied only at display time (see lib/format.ts).

export type SupportType = 'pin' | 'roller' | 'fixed' | 'free';

export interface Support {
  id: string;
  type: SupportType;
  x: number;
  label: string; // e.g. "O", "A", "B"
  y?: number; // the support sits on a rigid arm this high above the beam axis (an L-shaped member); 0 if omitted
  angle?: number; // roller only: direction of its reaction in degrees, counter-clockwise from +x (a rocker, a roller on an incline, a cable or link); 90 (straight up) if omitted
}

export interface PointLoad {
  id: string;
  kind: 'point';
  x: number;
  P: number; // vertical component, positive = downward
  Px?: number; // horizontal component, positive = to the right (an inclined force); 0 if omitted
  y?: number; // point of application this high above the beam axis (a bracket or arm); 0 if omitted
  label?: string;
}

/** Uniform (w1 = w2) or linearly varying (triangular / trapezoidal) load. */
export interface DistLoad {
  id: string;
  kind: 'dist';
  x1: number;
  x2: number;
  w1: number; // intensity at x1, positive = downward
  w2: number; // intensity at x2
  label?: string;
}

export interface MomentLoad {
  id: string;
  kind: 'moment';
  x: number;
  M: number; // magnitude
  dir: 'cw' | 'ccw';
  label?: string;
}

export type Load = PointLoad | DistLoad | MomentLoad;

export type ForceUnit = 'N' | 'kN' | 'lb' | 'kip';
export type LengthUnit = 'm' | 'mm' | 'ft' | 'in';

export interface Units {
  system: 'SI' | 'US';
  force: ForceUnit;
  length: LengthUnit;
}

export type EUnit = 'GPa' | 'MPa' | 'Pa' | 'ksi' | 'psi';
export type IUnit = 'mm4' | 'cm4' | 'm4' | 'in4' | '1e6mm4';

export interface Stiffness {
  E: number;
  Eunit: EUnit;
  I: number;
  Iunit: IUnit;
}

export interface NamedPoint {
  label: string;
  x: number;
  y?: number; // height above the beam axis, e.g. a point O off the beam; 0 if omitted
}

export interface Asked {
  reactions: boolean;
  momentAbout: string[]; // point labels, e.g. ["O"]
  resultant?: boolean; // the single resultant force equivalent to the loads, and where it acts
  internalAt?: string[]; // labels where the internal shear and moment are asked ("V and M at C")
  shear: boolean; // SFD
  moment: boolean; // BMD
  maxValues: boolean; // max shear / max moment
  deflection: boolean;
}

export interface Problem {
  title: string;
  text: string;
  length: number;
  supports: Support[];
  loads: Load[];
  points: NamedPoint[]; // extra named points (supports are named points too)
  units: Units;
  asked: Asked;
  stiffness?: Stiffness; // undefined -> results shown divided by EI (D25)
  answerKey?: string;
}

export type BeamKind = 'simple' | 'cantilever';
