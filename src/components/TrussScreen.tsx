// Plane truss: enter joints, members, supports and joint loads; see the member forces and the method of joints.
import { useState } from 'react';
import { fmt } from '../lib/format';
import type { Palette } from '../lib/theme';
import { buildTrussReport } from '../lib/trussReport';
import { FORCE_UNITS, LENGTH_UNITS, defaultUnits } from '../lib/units';
import { memberName, solveTruss, type JointLoad, type Truss, type TrussSolution } from '../solver/truss';
import { newId } from '../input/parse';
import { ResultTable } from './ModelScreen';
import { Tex } from './Tex';

/** Hibbeler 6-9 as a starting point. */
export function sampleTruss(): Truss {
  return {
    kind: 'truss',
    title: 'Truss',
    text: '',
    units: { system: 'SI', force: 'kN', length: 'm' },
    joints: [
      { label: 'A', x: 0, y: 0 },
      { label: 'B', x: 4, y: 0 },
      { label: 'C', x: 8, y: 0 },
      { label: 'D', x: 12, y: 0 },
      { label: 'E', x: 6, y: 6 },
    ],
    members: ['AB', 'BC', 'CD', 'AE', 'BE', 'CE', 'DE'].map((m) => [m[0], m[1]]),
    supports: [
      { joint: 'A', type: 'pin' },
      { joint: 'D', type: 'roller' },
    ],
    loads: [
      { id: newId(), joint: 'B', Fx: 0, Fy: -3 },
      { id: newId(), joint: 'C', Fx: 0, Fy: -6 },
    ],
  };
}

const num = (v: string) => (v === '' || v === '-' ? 0 : Number(v));
function Num({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return <input type="number" step="any" value={Number.isFinite(value) ? value : ''} onChange={(e) => onChange(num(e.target.value))} />;
}
/** "AB, BC; C-D" → [["A","B"], ["B","C"], ["C","D"]] for single-letter joints, or "A1-B1" with a dash. */
export function parseMembers(text: string): [string, string][] {
  return text
    .split(/[,;\s]+/)
    .filter(Boolean)
    .map((m) => (m.includes('-') ? m.split('-') : [m.slice(0, Math.ceil(m.length / 2)), m.slice(Math.ceil(m.length / 2))]) as [string, string])
    .filter(([a, b]) => a && b);
}

export function TrussScreen({ truss: t, onChange, C }: { truss: Truss; onChange: (t: Truss) => void; C: Palette }) {
  const [showSolution, setShowSolution] = useState(false);
  const [membersText, setMembersText] = useState(() => t.members.map((m) => (m[0].length > 1 || m[1].length > 1 ? m.join('-') : memberName(m))).join(', '));
  const set = (patch: Partial<Truss>) => onChange({ ...t, ...patch });
  const u = t.units;
  const r = solveTruss(t);
  const report = r.ok ? buildTrussReport(t, r.solution) : null;
  const labels = t.joints.map((j) => j.label);
  const setLoad = (i: number, F: number, deg: number) => {
    const a = (deg * Math.PI) / 180;
    const clean = (v: number) => (Math.abs(v) < 1e-9 ? 0 : v);
    set({ loads: t.loads.map((l, k) => (k === i ? { ...l, Fx: clean(F * Math.cos(a)), Fy: clean(F * Math.sin(a)) } : l)) });
  };

  return (
    <div className="truss">
      <div className="card">
        <h2>Truss</h2>
        <p className="muted">Joints are pins; loads act at the joints. x right, y up.</p>
        <div className="grid">
          <label className="field">
            <span>Title</span>
            <input value={t.title} onChange={(e) => set({ title: e.target.value })} />
          </label>
          <label className="field">
            <span>Units</span>
            <select value={u.system} onChange={(e) => set({ units: defaultUnits(e.target.value as 'SI' | 'US') })}>
              <option value="SI">SI</option>
              <option value="US">US customary</option>
            </select>
          </label>
          <label className="field">
            <span>Force</span>
            <select value={u.force} onChange={(e) => set({ units: { ...u, force: e.target.value as any } })}>
              {FORCE_UNITS[u.system].map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Length</span>
            <select value={u.length} onChange={(e) => set({ units: { ...u, length: e.target.value as any } })}>
              {LENGTH_UNITS[u.system].map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </label>
        </div>

        <h3>Joints</h3>
        <table className="edit">
          <thead>
            <tr>
              <th>Label</th>
              <th>x ({u.length})</th>
              <th>y ({u.length})</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {t.joints.map((j, i) => (
              <tr key={i}>
                <td>
                  <input className="short" value={j.label} onChange={(e) => set({ joints: t.joints.map((p, k) => (k === i ? { ...p, label: e.target.value.trim() } : p)) })} />
                </td>
                <td>
                  <Num value={j.x} onChange={(x) => set({ joints: t.joints.map((p, k) => (k === i ? { ...p, x } : p)) })} />
                </td>
                <td>
                  <Num value={j.y} onChange={(y) => set({ joints: t.joints.map((p, k) => (k === i ? { ...p, y } : p)) })} />
                </td>
                <td>
                  <button className="icon" title="Remove" onClick={() => set({ joints: t.joints.filter((_, k) => k !== i) })}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button
          className="small"
          onClick={() => set({ joints: [...t.joints, { label: String.fromCharCode(65 + t.joints.length), x: 0, y: 0 }] })}
        >
          + Joint
        </button>

        <h3>Members</h3>
        <label className="field">
          <span>Pairs of joints, e.g. AB, BC, AE (use a dash for longer labels: A1-B1)</span>
          <input
            value={membersText}
            onChange={(e) => {
              setMembersText(e.target.value);
              set({ members: parseMembers(e.target.value) });
            }}
          />
        </label>

        <h3>Supports</h3>
        <table className="edit">
          <thead>
            <tr>
              <th>Joint</th>
              <th>Type</th>
              <th title="Rollers only: direction of the reaction, degrees counter-clockwise from +x. 90 = straight up.">reaction angle (°)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {t.supports.map((sp, i) => (
              <tr key={i}>
                <td>
                  <select value={sp.joint} onChange={(e) => set({ supports: t.supports.map((p, k) => (k === i ? { ...p, joint: e.target.value } : p)) })}>
                    {labels.map((l) => (
                      <option key={l}>{l}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <select value={sp.type} onChange={(e) => set({ supports: t.supports.map((p, k) => (k === i ? { ...p, type: e.target.value as 'pin' | 'roller' } : p)) })}>
                    <option value="pin">Pin</option>
                    <option value="roller">Roller</option>
                  </select>
                </td>
                <td>
                  {sp.type === 'roller' && (
                    <Num value={sp.angle ?? 90} onChange={(a) => set({ supports: t.supports.map((p, k) => (k === i ? { ...p, angle: a === 90 ? undefined : a } : p)) })} />
                  )}
                </td>
                <td>
                  <button className="icon" title="Remove" onClick={() => set({ supports: t.supports.filter((_, k) => k !== i) })}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="small" onClick={() => set({ supports: [...t.supports, { joint: labels[0] ?? 'A', type: 'roller' }] })}>
          + Support
        </button>

        <h3>Loads</h3>
        <table className="edit">
          <thead>
            <tr>
              <th>Joint</th>
              <th>F ({u.force})</th>
              <th title="Direction in degrees, counter-clockwise from → (↓ -90, ↑ 90, ← 180).">θ (°)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {t.loads.map((l, i) => {
              const F = Math.hypot(l.Fx, l.Fy);
              const deg = F ? (Math.atan2(l.Fy, l.Fx) * 180) / Math.PI : -90;
              return (
                <tr key={l.id}>
                  <td>
                    <select value={l.joint} onChange={(e) => set({ loads: t.loads.map((p, k) => (k === i ? { ...p, joint: e.target.value } : p)) })}>
                      {labels.map((j) => (
                        <option key={j}>{j}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <Num value={Number(fmt(F, 6))} onChange={(v) => setLoad(i, v, deg)} />
                  </td>
                  <td>
                    <Num value={Number(fmt(deg, 6))} onChange={(d) => setLoad(i, F, d)} />
                  </td>
                  <td>
                    <button className="icon" title="Remove" onClick={() => set({ loads: t.loads.filter((_, k) => k !== i) })}>
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <button className="small" onClick={() => set({ loads: [...t.loads, { id: newId(), joint: labels[0] ?? 'A', Fx: 0, Fy: -10 } as JointLoad] })}>
          + Load
        </button>
      </div>

      <div className="card">
        <div className="toolbar">
          <h2>{t.title || 'Truss'}</h2>
          <button className={showSolution ? 'primary' : ''} onClick={() => setShowSolution(!showSolution)}>
            {showSolution ? 'Hide solution' : 'Show solution'}
          </button>
        </div>
        {r.ok ? <TrussDrawing t={t} s={r.solution} showSolution={showSolution} C={C} /> : <p className={r.comingSoon ? 'warn' : 'error'}>{r.comingSoon ? `Coming soon! ${r.reason}: not in the prototype yet.` : r.reason}</p>}
        {report && (
          <>
            <h3>Results</h3>
            <ResultTable lines={report.lines} hidden={!showSolution} />
            <p className="muted small">Tension positive. T = tension, C = compression.</p>
            {showSolution && (
              <>
                <h3>Solution</h3>
                <ol className="steps-list">
                  {report.steps.map((st, i) => (
                    <li key={i}>
                      <strong>{st.title}</strong>
                      {st.text && <p>{st.text}</p>}
                      {st.tex.map((x, j) => (
                        <Tex key={j} tex={x} block />
                      ))}
                    </li>
                  ))}
                </ol>
                <h3>Explanation</h3>
                <p className="explain">{report.explanation}</p>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** 2D drawing: members coloured by tension / compression once the solution is shown. */
function TrussDrawing({ t, s, showSolution, C }: { t: Truss; s: TrussSolution; showSolution: boolean; C: Palette }) {
  const xs = t.joints.map((j) => j.x);
  const ys = t.joints.map((j) => j.y);
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 1e-9);
  const k = 600 / span; // px per length unit
  const pad = 90;
  const W = (Math.max(...xs) - Math.min(...xs)) * k + 2 * pad;
  const H = (Math.max(...ys) - Math.min(...ys)) * k + 2 * pad;
  const X = (x: number) => (x - Math.min(...xs)) * k + pad;
  const Y = (y: number) => H - ((y - Math.min(...ys)) * k + pad);
  const at = (l: string) => t.joints.find((j) => j.label === l)!;
  const arrow = (x: number, y: number, fx: number, fy: number, color: string, label: string, key: string) => {
    const F = Math.hypot(fx, fy) || 1;
    const [ux, uy] = [fx / F, -fy / F]; // screen y down
    const [x2, y2] = [X(x), Y(y)];
    const [x1, y1] = [x2 - ux * 55, y2 - uy * 55];
    return (
      <g key={key} stroke={color} fill={color}>
        <line x1={x1} y1={y1} x2={x2 - ux * 8} y2={y2 - uy * 8} strokeWidth={3} />
        <polygon points={`${x2},${y2} ${x2 - ux * 12 - uy * 6},${y2 - uy * 12 + ux * 6} ${x2 - ux * 12 + uy * 6},${y2 - uy * 12 - ux * 6}`} stroke="none" />
        <text x={x1 - ux * 6} y={y1 - uy * 6} fontSize={14} stroke="none" textAnchor="middle">
          {label}
        </text>
      </g>
    );
  };
  return (
    <svg className="truss-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Truss drawing">
      {t.members.map((m, i) => {
        const [a, b] = [at(m[0]), at(m[1])];
        const f = s.forces[i];
        const color = !showSolution || Math.abs(f) < 1e-9 ? C.beam : f > 0 ? C.reaction : C.load;
        return (
          <g key={i}>
            <line x1={X(a.x)} y1={Y(a.y)} x2={X(b.x)} y2={Y(b.y)} stroke={color} strokeWidth={6} strokeLinecap="round" strokeDasharray={showSolution && Math.abs(f) < 1e-9 ? '8 6' : undefined} />
            {showSolution && (
              <text x={(X(a.x) + X(b.x)) / 2} y={(Y(a.y) + Y(b.y)) / 2 + 5} fontSize={13} fontWeight={600} textAnchor="middle" fill={color} stroke={C.bg} strokeWidth={4} paintOrder="stroke">
                {Math.abs(f) < 1e-9 ? '0' : `${fmt(Math.abs(f), 3)} ${f > 0 ? 'T' : 'C'}`}
              </text>
            )}
          </g>
        );
      })}
      {t.supports.map((sp, i) => {
        const j = at(sp.joint);
        const rot = sp.type === 'roller' ? 90 - (sp.angle ?? 90) : 0;
        return (
          <g key={i} transform={`translate(${X(j.x)} ${Y(j.y)}) rotate(${rot})`} fill="none" stroke={C.support} strokeWidth={2}>
            <polygon points="0,0 -14,24 14,24" />
            {sp.type === 'roller' ? <line x1={-18} y1={34} x2={18} y2={34} /> : <line x1={-18} y1={26} x2={18} y2={26} />}
            {sp.type === 'roller' && (
              <>
                <circle cx={-7} cy={29} r={4} />
                <circle cx={7} cy={29} r={4} />
              </>
            )}
          </g>
        );
      })}
      {t.loads.map((l) => arrow(at(l.joint).x, at(l.joint).y, l.Fx, l.Fy, C.load, `${fmt(Math.hypot(l.Fx, l.Fy))} ${t.units.force}`, l.id))}
      {t.joints.map((j) => (
        <g key={j.label}>
          <circle cx={X(j.x)} cy={Y(j.y)} r={6} fill={C.support} />
          <text x={X(j.x) + 10} y={Y(j.y) - 10} fontSize={15} fontWeight={600} fill={C.support}>
            {j.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
