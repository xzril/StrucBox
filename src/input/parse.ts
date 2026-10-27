// Turns problem text into a draft Problem. The AI path maps the model's JSON;
// the local path is a simple keyword/number reader used offline. Either way the
// user confirms every value before the model is built (D7).

import { parsePoly } from '../lib/format';
import type { Truss } from '../solver/truss';
import type { ForceUnit, LengthUnit, Load, Problem, Support } from '../solver/types';

let n = 0;
export const newId = () => `i${Date.now().toString(36)}${(n++).toString(36)}`;

export function emptyAsked(): Problem['asked'] {
  return { reactions: true, momentAbout: [], internalAt: [], shear: false, moment: false, maxValues: false, deflection: false };
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

// exact: the text itself placed every load ("x=1.0", "x=[1.5, 2.5]"), so the drawing should not move them
// a truss is not a beam: it comes back as "not ok" with the truss read so far, and goes to the Truss screen
export type ParseResult = { ok: true; problem: Problem; exact?: boolean } | { ok: false; comingSoon: true; reason: string; truss?: Truss };

/** Map the AI's JSON (see server/ai.ts schema) to a Problem. */
export function fromAi(j: any, text: string): ParseResult {
  if (j.structure === 'truss' && j.truss) {
    const t = j.truss;
    return {
      ok: false,
      comingSoon: true,
      reason: 'Truss problems',
      truss: {
        kind: 'truss',
        title: j.title || 'Truss',
        text,
        units: j.units,
        joints: t.joints ?? [],
        members: (t.members ?? []).map((m: string) => (m.includes('-') ? m.split('-') : [m[0], m.slice(1)])),
        supports: (t.supports ?? []).map((s: any) => ({ joint: s.joint, type: s.type, ...(s.type === 'roller' && s.angle && s.angle !== 90 ? { angle: s.angle } : {}) })),
        // the AI copies the direction as drawn; resolving into components happens here (D24)
        loads: (t.loads ?? []).map((l: any) => {
          const [dx, dy] = l.dirX || l.dirY ? [l.dirX, l.dirY] : [0, -1];
          const k = l.F / Math.hypot(dx, dy);
          return { id: newId(), joint: l.joint, Fx: k * dx, Fy: k * dy };
        }),
        asked: t.askedMembers ?? [],
      },
    };
  }
  if (j.structure !== 'beam')
    return { ok: false, comingSoon: true, reason: j.unsupportedReason || `${String(j.structure).replace(/_/g, ' ')} problems` };
  const loads: Load[] = (j.loads ?? []).map((l: any): Load => {
    if (l.kind === 'point') {
      // the AI copies the direction as drawn (slope legs or cos/sin); resolving into components happens here (D24)
      const [dx, dy] = l.dirX || l.dirY ? [l.dirX ?? 0, l.dirY ?? 0] : [0, -1];
      const k = l.P / Math.hypot(dx, dy);
      return { id: newId(), kind: 'point', x: l.x, P: -k * dy, Px: k * dx || undefined, y: l.y || undefined, label: l.label || undefined };
    }
    if (l.kind === 'moment') return { id: newId(), kind: 'moment', x: l.x, M: l.M, dir: l.dir, label: l.label || undefined };
    return { id: newId(), kind: 'dist', x1: l.x1, x2: l.x2, w1: l.w1, w2: l.w2, ...(l.poly?.length ? { poly: l.poly, x0: l.x0 || undefined } : {}), label: l.label || undefined };
  });
  const supports: Support[] = (j.supports ?? []).map((s: any) => ({ id: newId(), type: s.type, x: s.x, y: s.y || undefined, angle: s.type === 'roller' && s.angle && s.angle !== 90 ? s.angle : undefined, label: s.label || '?' }));
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
      asked: { ...j.asked, internalAt: j.asked?.internalAt ?? [] },
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
/** Offline, a truss's geometry is entered by hand from the figure; the text still gives the units and the asked members. */
export function trussFromText(raw: string): Truss {
  const text = raw.replace(/\s+/g, ' ');
  const unit = text.match(new RegExp(`${NUM}\\s*${FORCE}\\b`, 'i'))?.[2];
  const fu = unit ? forceUnit(unit) : 'kN';
  const system = fu === 'N' || fu === 'kN' ? 'SI' : 'US';
  // "force in members BC, HC and HG"
  const list = text.match(/members?\s+((?:[A-Z]{2}\s*(?:,|and|&)?\s*)+)/)?.[1] ?? '';
  return {
    kind: 'truss',
    title: 'Truss',
    text: raw.trim(),
    units: { system, force: fu, length: system === 'SI' ? 'm' : 'ft' },
    joints: [],
    members: [],
    supports: [],
    loads: [],
    asked: list.match(/[A-Z]{2}/g) ?? [],
  };
}

export function localParse(raw: string): ParseResult {
  const text = raw.replace(/\s+/g, ' ');
  const lower = text.toLowerCase();
  for (const [word, what] of [
    ['truss', 'Truss problems'],
    ['frame', 'Frame problems'],
    ['incline\\b|inclined plane', 'Incline and friction problems'], // the plane, not an inclined force
    ['friction', 'Incline and friction problems'],
    ['pulley', 'Pulley and cable problems'],
    ['cable', 'Cable problems'],
    ['cord', 'Cable problems'],
    ['arch', 'Arch problems'],
  ] as const)
    // a beam held by a cable or loaded through a pulley is still a beam (the cable is an inclined roller)
    if (new RegExp(`\\b${word}`).test(lower) && !(/cable|cord|pulley/.test(word) && /\b(?:beam|boom|bar|rod|lever|shaft)\b/.test(lower)))
      return { ok: false, comingSoon: true, reason: what, ...(word === 'truss' ? { truss: trussFromText(raw) } : {}) };

  const p = blankProblem();
  p.text = raw.trim();
  p.title = 'Beam problem';
  p.loads = [];

  // a curved load given by its formula: "w = (2x^2 - 8x + 18) lb/ft"; its constant term is not a separate load
  const curve = text.match(/\bw\s*=\s*\(?\s*([-−\d.\sx^²³+*]*x[-−\d.\sx^²³+*]*)\)?/i);
  const poly = curve && parsePoly(curve[1]);
  const inCurve = (m: RegExpMatchArray) => !!poly && m.index! >= curve!.index! && m.index! < curve!.index! + curve![0].length;
  const dist = [...text.matchAll(new RegExp(`${NUM}\\s*${FORCE}\\s*/\\s*${LEN}`, 'gi'))].filter((m) => !inCurve(m));
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
  // position labels written next to each load: "x=1.0", "x=[1.5, 2.5]" (a range for a distributed load)
  // (OCR of a typewriter font can drop the decimal point: "x=0 5" is 0.5)
  const xLabels = [...text.matchAll(new RegExp(String.raw`\bx\s*=\s*(?:[\[({]\s*${NUM}\s*[,;]\s*${NUM}\s*[\])}]|(\d+)(?:\.(\d+)|\s(\d)\b)?)`, 'gi'))].map((m) =>
    m[3] !== undefined ? { at: num(`${m[3]}.${m[4] ?? m[5] ?? 0}`), used: false } : { from: num(m[1]), to: num(m[2]), used: false },
  );
  const spanMatch =
    text.match(new RegExp(String.raw`\bL\s*=\s*${NUM}`)) ?? text.match(new RegExp(`(?:span|long|length)[^\\d]{0,20}${NUM}\\s*${LEN}`, 'i'));
  const xs = xLabels.flatMap((l) => ('at' in l ? [l.at!] : [l.from!, l.to!]));
  const span = spanMatch ? num(spanMatch[1]) : xs.length ? Math.max(...xs) : lens.length ? Math.max(...lens) : 6;
  p.length = span;
  const positions = lens.filter((v) => v !== span);
  const take = (range: boolean) => {
    const l = xLabels.find((l) => !l.used && 'from' in l === range);
    if (l) l.used = true;
    return l;
  };
  // a minus sign on any load means the problem uses y up: negative loads point down
  const signed = [...forces, ...dist, ...moments].some((m) => /[-−–]\s*$/.test(text.slice(Math.max(0, m.index! - 2), m.index)));
  const down = (m: RegExpMatchArray) => (signed && !/[-−–]\s*$/.test(text.slice(Math.max(0, m.index! - 2), m.index)) ? -1 : 1) * num(m[1]);
  let placed = 0;
  for (const m of [...forces, ...dist, ...moments].sort((a, b) => a.index! - b.index!)) {
    if (dist.includes(m)) {
      const r = take(true);
      if (r) placed++;
      p.loads.push({ id: newId(), kind: 'dist', x1: r?.from ?? 0, x2: r?.to ?? span, w1: down(m), w2: down(m) });
    } else {
      const at = take(false);
      if (at) placed++;
      const x = at?.at ?? (forces.includes(m) ? positions[forces.indexOf(m)] : undefined) ?? span / 2;
      if (forces.includes(m)) p.loads.push({ id: newId(), kind: 'point', x, P: down(m) });
      else p.loads.push({ id: newId(), kind: 'moment', x, M: num(m[1]), dir: 'cw' });
    }
  }
  // position labels left over after the loads mark the supports
  const supportXs = [...new Set(xLabels.filter((l) => !l.used && 'at' in l).map((l) => l.at!))].sort((a, b) => a - b);
  if (/triangular|linearly varying/.test(lower))
    p.loads.forEach((l) => {
      if (l.kind === 'dist') l.w1 = 0;
    });
  if (poly) {
    p.loads.push({ id: newId(), kind: 'dist', x1: 0, x2: span, w1: poly[0], w2: poly.reduce((s, c, k) => s + c * span ** k, 0), poly });
  }
  if (!p.loads.length) p.loads.push({ id: newId(), kind: 'point', x: span / 2, P: 10 });

  const letters = [...text.matchAll(/\b(?:at|point|support)\s+([A-Z])\b/g)].map((m) => m[1]);
  const [l1, l2] = [letters[0] ?? 'A', letters.find((l) => l !== letters[0]) ?? 'B'];
  if (/cantilever/.test(lower)) {
    p.supports = [
      { id: newId(), type: 'fixed', x: 0, label: l1 },
      { id: newId(), type: 'free', x: span, label: l2 },
    ];
  } else {
    const [a, b] = supportXs.length >= 2 ? supportXs : [0, span];
    p.supports = [
      { id: newId(), type: 'pin', x: a, label: l1 },
      { id: newId(), type: 'roller', x: b, label: l2 },
    ];
  }

  p.asked = emptyAsked();
  p.asked.reactions = /reaction/.test(lower);
  p.asked.resultant = /resultant/.test(lower);
  // "moment of the forces about O"; "resultant force and couple moment at A" is the same thing
  const about = [...text.matchAll(/(?:moment (?:of [a-z ]{0,30})?about|couple moment (?:acting )?at) (?:point )?([A-Z])\b/gi)].map((m) => m[1].toUpperCase());
  p.asked.momentAbout = about;
  // "the internal shear and moment at C", "shear force and bending moment at point C"
  const internal = [...text.matchAll(/(?:internal|shear|normal force|moment)[a-z ,]{0,60}?\bat (?:points? )?([A-Z])\b(?:\s*and\s*([A-Z])\b)?/gi)]
    .flatMap((m) => [m[1], m[2]])
    .filter((l): l is string => !!l && !about.includes(l.toUpperCase()))
    .map((l) => l.toUpperCase());
  p.asked.internalAt = [...new Set(internal)];
  for (const l of p.asked.internalAt)
    if (!p.supports.some((s) => s.label === l)) p.points.push({ label: l, x: span / 2 });
  p.asked.shear = /shear(?: force)? diagram|shear and (?:bending )?moment diagrams|\bsfd\b/.test(lower);
  p.asked.moment = /moment diagram|\bbmd\b/.test(lower);
  p.asked.maxValues = /maximum|max\b/.test(lower);
  p.asked.deflection = /deflect/.test(lower);
  if (!p.asked.reactions && !about.length && !internal.length && !p.asked.shear && !p.asked.moment && !p.asked.deflection) p.asked.reactions = true;
  return { ok: true, problem: p, exact: placed > 0 && placed === p.loads.length };
}
