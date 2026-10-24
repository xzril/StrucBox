// Turns problem text into a draft Problem. The AI path maps the model's JSON;
// the local path is a simple keyword/number reader used offline. Either way the
// user confirms every value before the model is built (D7).

import type { ForceUnit, LengthUnit, Load, Problem, Support } from '../solver/types';

let n = 0;
export const newId = () => `i${Date.now().toString(36)}${(n++).toString(36)}`;

export function emptyAsked(): Problem['asked'] {
  return { reactions: true, momentAbout: [], shear: false, moment: false, maxValues: false, deflection: false };
}

export function blankProblem(): Problem {
  return {
    title: 'New beam',
    text: '',
    length: 6,
    supports: [
      { id: newId(), type: 'pin', x: 0, label: 'A' },
      { id: newId(), type: 'roller', x: 6, label: 'B' },
    ],
    loads: [{ id: newId(), kind: 'point', x: 3, P: 10 }],
    points: [],
    units: { system: 'SI', force: 'kN', length: 'm' },
    asked: { ...emptyAsked(), shear: true, moment: true },
  };
}

export function workedExample(): Problem {
  return {
    title: 'Moment about O',
    text: 'Simply supported beam: pin at O, roller at the right end, span 4 m. A 600 N load acts 1 m from O. Find the moment about O.',
    length: 4,
    supports: [
      { id: newId(), type: 'pin', x: 0, label: 'O' },
      { id: newId(), type: 'roller', x: 4, label: 'B' },
    ],
    loads: [{ id: newId(), kind: 'point', x: 1, P: 600 }],
    points: [],
    units: { system: 'SI', force: 'N', length: 'm' },
    asked: { ...emptyAsked(), reactions: false, momentAbout: ['O'] },
  };
}

export type ParseResult = { ok: true; problem: Problem } | { ok: false; comingSoon: true; reason: string };

/** Map the AI's JSON (see server/ai.ts schema) to a Problem. */
export function fromAi(j: any, text: string): ParseResult {
  if (j.structure !== 'beam')
    return { ok: false, comingSoon: true, reason: j.unsupportedReason || `${String(j.structure).replace(/_/g, ' ')} problems` };
  const loads: Load[] = (j.loads ?? []).map((l: any): Load => {
    if (l.kind === 'point') return { id: newId(), kind: 'point', x: l.x, P: l.P, label: l.label || undefined };
    if (l.kind === 'moment') return { id: newId(), kind: 'moment', x: l.x, M: l.M, dir: l.dir, label: l.label || undefined };
    return { id: newId(), kind: 'dist', x1: l.x1, x2: l.x2, w1: l.w1, w2: l.w2, label: l.label || undefined };
  });
  const supports: Support[] = (j.supports ?? []).map((s: any) => ({ id: newId(), type: s.type, x: s.x, label: s.label || '?' }));
  return {
    ok: true,
    problem: {
      title: j.title || 'Beam problem',
      text,
      length: j.length,
      supports,
      loads,
      points: j.points ?? [],
      units: j.units,
      asked: j.asked,
      stiffness: j.stiffness?.given ? { E: j.stiffness.E, Eunit: j.stiffness.Eunit, I: j.stiffness.I, Iunit: j.stiffness.Iunit } : undefined,
    },
  };
}

const NUM = String.raw`(\d+(?:[.,]\d+)?)`;
const FORCE = String.raw`(kN|N|kips?|k|lbs?|lb)`;
const LEN = String.raw`(mm|m|ft|in)`;

function forceUnit(s: string): ForceUnit {
  s = s.toLowerCase();
  if (s === 'kn') return 'kN';
  if (s === 'n') return 'N';
  if (s.startsWith('k')) return 'kip';
  return 'lb';
}

/** Offline best-effort reader. Fills what it can; the confirm step fixes the rest. */
export function localParse(raw: string): ParseResult {
  const text = raw.replace(/\s+/g, ' ');
  const lower = text.toLowerCase();
  for (const [word, what] of [
    ['truss', 'Truss problems'],
    ['frame', 'Frame problems'],
    ['incline', 'Incline and friction problems'],
    ['friction', 'Incline and friction problems'],
    ['pulley', 'Pulley and cable problems'],
    ['cable', 'Cable problems'],
    ['arch', 'Arch problems'],
  ] as const)
    if (new RegExp(`\\b${word}`).test(lower)) return { ok: false, comingSoon: true, reason: what };

  const p = blankProblem();
  p.text = raw.trim();
  p.title = 'Beam problem';
  p.loads = [];

  const dist = [...text.matchAll(new RegExp(`${NUM}\\s*${FORCE}\\s*/\\s*${LEN}`, 'gi'))];
  const moments = [...text.matchAll(new RegExp(`${NUM}\\s*${FORCE}\\s*[·.\\-•]?\\s*${LEN}\\b`, 'gi'))].filter(
    (m) => !dist.some((d) => d.index === m.index),
  );
  const used = new Set([...dist, ...moments].map((m) => m.index));
  const forces = [...text.matchAll(new RegExp(`${NUM}\\s*${FORCE}\\b(?!\\s*[/·.\\-•]?\\s*${LEN}\\b)`, 'gi'))].filter((m) => !used.has(m.index));
  const lengths = [...text.matchAll(new RegExp(`${NUM}\\s*${LEN}\\b`, 'gi'))].filter(
    (m) => ![...dist, ...moments].some((d) => m.index! >= d.index! && m.index! < d.index! + d[0].length),
  );

  const num = (s: string) => parseFloat(s.replace(',', '.'));
  const firstUnit = forces[0]?.[2] ?? dist[0]?.[2] ?? moments[0]?.[2];
  if (firstUnit) {
    const fu = forceUnit(firstUnit);
    p.units = { system: fu === 'N' || fu === 'kN' ? 'SI' : 'US', force: fu, length: p.units.length };
  }
  const lu = (lengths[0]?.[2] ?? dist[0]?.[3] ?? '') as LengthUnit;
  if (lu) p.units.length = lu;
  else if (p.units.system === 'US') p.units.length = 'ft';

  const lens = lengths.map((m) => num(m[1]));
  const spanMatch = text.match(new RegExp(`(?:span|long|length)[^\\d]{0,20}${NUM}\\s*${LEN}`, 'i'));
  const span = spanMatch ? num(spanMatch[1]) : lens.length ? Math.max(...lens) : 6;
  p.length = span;
  const positions = lens.filter((v) => v !== span);

  forces.forEach((m, i) => p.loads.push({ id: newId(), kind: 'point', x: positions[i] ?? span / 2, P: num(m[1]) }));
  dist.forEach((m) => p.loads.push({ id: newId(), kind: 'dist', x1: 0, x2: span, w1: num(m[1]), w2: num(m[1]) }));
  moments.forEach((m) => p.loads.push({ id: newId(), kind: 'moment', x: span / 2, M: num(m[1]), dir: 'cw' }));
  if (/triangular|linearly varying/.test(lower))
    p.loads.forEach((l) => {
      if (l.kind === 'dist') l.w1 = 0;
    });
  if (!p.loads.length) p.loads.push({ id: newId(), kind: 'point', x: span / 2, P: 10 });

  const letters = [...text.matchAll(/\b(?:at|point|support)\s+([A-Z])\b/g)].map((m) => m[1]);
  const [l1, l2] = [letters[0] ?? 'A', letters.find((l) => l !== letters[0]) ?? 'B'];
  if (/cantilever/.test(lower)) {
    p.supports = [
      { id: newId(), type: 'fixed', x: 0, label: l1 },
      { id: newId(), type: 'free', x: span, label: l2 },
    ];
  } else {
    p.supports = [
      { id: newId(), type: 'pin', x: 0, label: l1 },
      { id: newId(), type: 'roller', x: span, label: l2 },
    ];
  }

  p.asked = emptyAsked();
  p.asked.reactions = /reaction/.test(lower);
  const about = [...text.matchAll(/moment (?:about|at) (?:point )?([A-Z])\b/gi)].map((m) => m[1].toUpperCase());
  p.asked.momentAbout = about;
  p.asked.shear = /shear/.test(lower);
  p.asked.moment = /bending moment|moment diagram|bmd/.test(lower);
  p.asked.maxValues = /maximum|max\b/.test(lower);
  p.asked.deflection = /deflect/.test(lower);
  if (!p.asked.reactions && !about.length && !p.asked.shear && !p.asked.moment && !p.asked.deflection) p.asked.reactions = true;
  return { ok: true, problem: p };
}
