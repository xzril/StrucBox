// Cable: enter the supports, the loads and one fact that fixes the sag; see the shape, tensions and length.
import { useState } from 'react';
import { buildCableReport } from '../lib/cableReport';
import type { Palette } from '../lib/theme';
import { FORCE_UNITS, LENGTH_UNITS, defaultUnits } from '../lib/units';
import { solveCable, type Cable, type CableGiven } from '../solver/cable';
import { newId } from '../input/parse';
import { CableView3D } from './CableView3D';
import { ResultTable } from './ModelScreen';
import { Tex } from './Tex';

/** Three loads on a cable (Hibbeler 7-95 layout) as a starting point. */
export function sampleCable(): Cable {
  return {
    kind: 'cable',
    title: 'Cable',
    text: '',
    units: { system: 'US', force: 'lb', length: 'ft' },
    A: { label: 'A', x: 0, y: 0 },
    B: { label: 'E', x: 59, y: 4 },
    points: [
      { id: newId(), label: 'B', x: 12, P: 250 },
      { id: newId(), label: 'C', x: 32, P: 400 },
      { id: newId(), label: 'D', x: 47, P: 250 },
    ],
    w1: 0,
    w2: 0,
    w0: 0,
    given: { kind: 'y', x: 32, y: -14 },
  };
}

const GIVEN: { kind: CableGiven['kind']; label: string }[] = [
  { kind: 'y', label: 'A point of the cable (x, y), e.g. the sag at a load' },
  { kind: 'sag', label: 'Sag h of the lowest point below the first support' },
  { kind: 'Tmax', label: 'Maximum tension' },
  { kind: 'H', label: 'Horizontal tension F_H' },
  { kind: 'length', label: 'Cable length' },
];
function blankGiven(kind: CableGiven['kind'], c: Cable): CableGiven {
  const L = c.B.x - c.A.x;
  if (kind === 'y') return { kind, x: c.A.x + L / 2, y: Math.min(c.A.y, c.B.y) - L / 10 };
  if (kind === 'sag') return { kind, h: L / 10 };
  if (kind === 'Tmax') return { kind, T: 1000 };
  if (kind === 'H') return { kind, H: 1000 };
  return { kind, s: Math.ceil(Math.hypot(L, c.B.y - c.A.y) * 1.05) };
}

const num = (v: string) => (v === '' || v === '-' ? 0 : Number(v));
function Num({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return <input type="number" step="any" value={Number.isFinite(value) ? value : ''} onChange={(e) => onChange(num(e.target.value))} />;
}

export function CableScreen({ cable: c, photo, onChange, onSave, C }: { cable: Cable; photo?: File; onChange: (c: Cable) => void; onSave?: () => void; C: Palette }) {
  const [photoUrl] = useState(() => photo && URL.createObjectURL(photo));
  const [showSolution, setShowSolution] = useState(false);
  const set = (patch: Partial<Cable>) => onChange({ ...c, ...patch });
  const u = c.units;
  const r = solveCable(c);
  const report = r.ok ? buildCableReport(c, r.solution) : null;
  const g = c.given;
  const end = (key: 'A' | 'B') => (
    <tr>
      <td>
        <input className="short" value={c[key].label} onChange={(e) => set({ [key]: { ...c[key], label: e.target.value.trim() } })} />
      </td>
      <td>
        <Num value={c[key].x} onChange={(x) => set({ [key]: { ...c[key], x } })} />
      </td>
      <td>
        <Num value={c[key].y} onChange={(y) => set({ [key]: { ...c[key], y } })} />
      </td>
    </tr>
  );

  return (
    <div className="truss">
      <div className="card">
        <h2>Cable</h2>
        <p className="muted">x right, y up. Loads act downward. Check every value against the figure.</p>
        {photoUrl && <img className="truss-photo" src={photoUrl} alt="The problem's figure" />}
        {c.text && <blockquote className="problem-text">{c.text}</blockquote>}
        <div className="grid">
          <label className="field">
            <span>Title</span>
            <input value={c.title} onChange={(e) => set({ title: e.target.value })} />
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

        <h3>Supports</h3>
        <table className="edit">
          <thead>
            <tr>
              <th>Label</th>
              <th>x ({u.length})</th>
              <th>y ({u.length})</th>
            </tr>
          </thead>
          <tbody>
            {end('A')}
            {end('B')}
          </tbody>
        </table>

        <h3>Concentrated loads</h3>
        <table className="edit">
          <thead>
            <tr>
              <th>Label</th>
              <th>x ({u.length})</th>
              <th>P ({u.force}) ↓</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {c.points.map((p, i) => (
              <tr key={p.id}>
                <td>
                  <input className="short" value={p.label} onChange={(e) => set({ points: c.points.map((q, k) => (k === i ? { ...q, label: e.target.value.trim() } : q)) })} />
                </td>
                <td>
                  <Num value={p.x} onChange={(x) => set({ points: c.points.map((q, k) => (k === i ? { ...q, x } : q)) })} />
                </td>
                <td>
                  <Num value={p.P} onChange={(P) => set({ points: c.points.map((q, k) => (k === i ? { ...q, P } : q)) })} />
                </td>
                <td>
                  <button className="icon" title="Remove" onClick={() => set({ points: c.points.filter((_, k) => k !== i) })}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button
          className="small"
          onClick={() => set({ points: [...c.points, { id: newId(), label: String.fromCharCode(66 + c.points.length), x: (c.A.x + c.B.x) / 2, P: 10 }] })}
        >
          + Load
        </button>

        <h3>Distributed loads</h3>
        <div className="grid">
          <label className="field">
            <span>
              w along the horizontal at {c.A.label} ({u.force}/{u.length})
            </span>
            <Num value={c.w1} onChange={(w1) => set({ w1, w2: c.w2 === c.w1 ? w1 : c.w2 })} />
          </label>
          <label className="field">
            <span>
              … at {c.B.label} (same = uniform)
            </span>
            <Num value={c.w2} onChange={(w2) => set({ w2 })} />
          </label>
          <label className="field">
            <span>Own weight w₀ per length of cable ({u.force}/{u.length}); kg/m × 9.81 = N/m</span>
            <Num value={c.w0} onChange={(w0) => set({ w0 })} />
          </label>
        </div>

        <h3>Given</h3>
        <label className="field">
          <span>The fact that fixes the sag</span>
          <select value={g.kind} onChange={(e) => set({ given: blankGiven(e.target.value as CableGiven['kind'], c) })}>
            {GIVEN.map((o) => (
              <option key={o.kind} value={o.kind}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <div className="grid">
          {g.kind === 'y' && (
            <>
              <label className="field">
                <span>x ({u.length})</span>
                <Num value={g.x} onChange={(x) => set({ given: { ...g, x } })} />
              </label>
              <label className="field">
                <span>y ({u.length})</span>
                <Num value={g.y} onChange={(y) => set({ given: { ...g, y } })} />
              </label>
            </>
          )}
          {g.kind === 'sag' && (
            <label className="field">
              <span>h ({u.length})</span>
              <Num value={g.h} onChange={(h) => set({ given: { ...g, h } })} />
            </label>
          )}
          {g.kind === 'Tmax' && (
            <label className="field">
              <span>T_max ({u.force})</span>
              <Num value={g.T} onChange={(T) => set({ given: { ...g, T } })} />
            </label>
          )}
          {g.kind === 'H' && (
            <label className="field">
              <span>F_H ({u.force})</span>
              <Num value={g.H} onChange={(H) => set({ given: { ...g, H } })} />
            </label>
          )}
          {g.kind === 'length' && (
            <label className="field">
              <span>s ({u.length})</span>
              <Num value={g.s} onChange={(s) => set({ given: { ...g, s } })} />
            </label>
          )}
        </div>
      </div>

      <div className="card">
        <div className="toolbar">
          <h2>{c.title || 'Cable'}</h2>
          {onSave && <button onClick={onSave}>Save to folder</button>}
          <button className={showSolution ? 'primary' : ''} onClick={() => setShowSolution(!showSolution)}>
            {showSolution ? 'Hide solution' : 'Show solution'}
          </button>
        </div>
        {r.ok ? (
          <CableView3D c={c} s={r.solution} showSolution={showSolution} onMovePoint={(p) => set({ points: c.points.map((q) => (q.id === p.id ? p : q)) })} C={C} />
        ) : (
          <p className={r.comingSoon ? 'warn' : 'error'}>{r.comingSoon ? `Coming soon! ${r.reason}: not in the prototype yet.` : r.reason}</p>
        )}
        {report && (
          <>
            <h3>Results</h3>
            <ResultTable lines={report.lines} hidden={!showSolution} />
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
