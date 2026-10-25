import { newId } from '../input/parse';
import { E_UNITS, FORCE_UNITS, I_UNITS, I_UNIT_LABEL, LENGTH_UNITS, defaultUnits, unitStr } from '../lib/units';
import type { Load, Problem, Support } from '../solver/types';
import { validate } from '../solver/validate';

interface Props {
  problem: Problem;
  onChange: (p: Problem) => void;
  onBack: () => void;
  onBuild: () => void;
  onComingSoon: (reason: string) => void;
}

const num = (v: string) => (v === '' || v === '-' ? 0 : Number(v));

function Num({ value, onChange, step = 'any' }: { value: number; onChange: (n: number) => void; step?: string }) {
  return <input type="number" step={step} value={Number.isFinite(value) ? value : ''} onChange={(e) => onChange(num(e.target.value))} />;
}

export function ConfirmForm({ problem: p, onChange, onBack, onBuild, onComingSoon }: Props) {
  const set = (patch: Partial<Problem>) => onChange({ ...p, ...patch });
  const setSupport = (i: number, patch: Partial<Support>) => set({ supports: p.supports.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const setLoad = (i: number, patch: Partial<Load>) => set({ loads: p.loads.map((l, j) => (j === i ? ({ ...l, ...patch } as Load) : l)) });
  const v = validate(p);
  const u = p.units;

  const loadType = (l: Load) => (l.kind === 'dist' ? (l.w1 === l.w2 ? 'udl' : 'linear') : l.kind);
  const changeLoadType = (i: number, t: string) => {
    const l = p.loads[i];
    const x = l.kind === 'dist' ? l.x1 : l.x;
    const base = { id: l.id, label: l.label };
    const next: Load =
      t === 'point'
        ? { ...base, kind: 'point', x, P: 10 }
        : t === 'moment'
          ? { ...base, kind: 'moment', x, M: 10, dir: 'cw' }
          : { ...base, kind: 'dist', x1: 0, x2: p.length, w1: t === 'udl' ? 5 : 0, w2: 5 };
    set({ loads: p.loads.map((m, j) => (j === i ? next : m)) });
  };

  return (
    <div className="confirm">
      <div className="card">
        <h2>Confirm the values</h2>
        <p className="muted">Check every value against the problem before the model is built. x is measured from the left end of the beam.</p>
        {p.text && <blockquote className="problem-text">{p.text}</blockquote>}

        <div className="grid">
          <label className="field">
            <span>Title</span>
            <input value={p.title} onChange={(e) => set({ title: e.target.value })} />
          </label>
          <label className="field">
            <span>Units</span>
            <select
              value={u.system}
              onChange={(e) => {
                const system = e.target.value as 'SI' | 'US';
                set({ units: defaultUnits(system), stiffness: undefined });
              }}
            >
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
          <label className="field">
            <span>Beam length ({u.length})</span>
            <Num value={p.length} onChange={(length) => set({ length })} />
          </label>
        </div>

        <h3>Supports</h3>
        <table className="edit">
          <thead>
            <tr>
              <th>Label</th>
              <th>Type</th>
              <th>x ({u.length})</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {p.supports.map((s, i) => (
              <tr key={s.id}>
                <td>
                  <input className="short" value={s.label} onChange={(e) => setSupport(i, { label: e.target.value })} />
                </td>
                <td>
                  <select value={s.type} onChange={(e) => setSupport(i, { type: e.target.value as Support['type'] })}>
                    <option value="pin">Pin</option>
                    <option value="roller">Roller</option>
                    <option value="fixed">Fixed</option>
                    <option value="free">Free end</option>
                  </select>
                </td>
                <td>
                  <Num value={s.x} onChange={(x) => setSupport(i, { x })} />
                </td>
                <td>
                  <button className="icon" title="Remove" onClick={() => set({ supports: p.supports.filter((_, j) => j !== i) })}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="small" onClick={() => set({ supports: [...p.supports, { id: newId(), type: 'roller', x: p.length, label: 'C' }] })}>
          + Support
        </button>

        <h3>Loads</h3>
        <table className="edit">
          <thead>
            <tr>
              <th>Type</th>
              <th>Values</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {p.loads.map((l, i) => (
              <tr key={l.id}>
                <td>
                  <select value={loadType(l)} onChange={(e) => changeLoadType(i, e.target.value)}>
                    <option value="point">Point load</option>
                    <option value="udl">Uniform (UDL)</option>
                    <option value="linear">Triangular / linear</option>
                    <option value="moment">Applied moment</option>
                  </select>
                </td>
                <td className="load-values">
                  {l.kind === 'point' && (
                    <>
                      <label>
                        P ({unitStr.force(u)}, + down) <Num value={l.P} onChange={(P) => setLoad(i, { P })} />
                      </label>
                      <label>
                        x <Num value={l.x} onChange={(x) => setLoad(i, { x })} />
                      </label>
                    </>
                  )}
                  {l.kind === 'moment' && (
                    <>
                      <label>
                        M ({unitStr.moment(u)}) <Num value={l.M} onChange={(M) => setLoad(i, { M })} />
                      </label>
                      <label>
                        <select value={l.dir} onChange={(e) => setLoad(i, { dir: e.target.value as 'cw' | 'ccw' })}>
                          <option value="cw">↻ clockwise</option>
                          <option value="ccw">↺ counter-clockwise</option>
                        </select>
                      </label>
                      <label>
                        x <Num value={l.x} onChange={(x) => setLoad(i, { x })} />
                      </label>
                    </>
                  )}
                  {l.kind === 'dist' && (
                    <>
                      {l.w1 === l.w2 && loadType(l) === 'udl' ? (
                        <label>
                          w ({unitStr.dist(u)}, + down) <Num value={l.w1} onChange={(w) => setLoad(i, { w1: w, w2: w })} />
                        </label>
                      ) : (
                        <>
                          <label>
                            w at start <Num value={l.w1} onChange={(w1) => setLoad(i, { w1 })} />
                          </label>
                          <label>
                            w at end <Num value={l.w2} onChange={(w2) => setLoad(i, { w2 })} />
                          </label>
                        </>
                      )}
                      <label>
                        from x <Num value={l.x1} onChange={(x1) => setLoad(i, { x1 })} />
                      </label>
                      <label>
                        to x <Num value={l.x2} onChange={(x2) => setLoad(i, { x2 })} />
                      </label>
                    </>
                  )}
                </td>
                <td>
                  <button className="icon" title="Remove" onClick={() => set({ loads: p.loads.filter((_, j) => j !== i) })}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="small" onClick={() => set({ loads: [...p.loads, { id: newId(), kind: 'point', x: p.length / 2, P: 10 }] })}>
          + Load
        </button>

        <h3>Other named points</h3>
        <p className="muted small">Points where the problem asks for a value, e.g. "shear and moment at C".</p>
        {p.points.map((q, i) => (
          <div className="inline" key={i}>
            <input className="short" value={q.label} onChange={(e) => set({ points: p.points.map((r, j) => (j === i ? { ...r, label: e.target.value } : r)) })} />
            <label>
              x <Num value={q.x} onChange={(x) => set({ points: p.points.map((r, j) => (j === i ? { ...r, x } : r)) })} />
            </label>
            <button className="icon" onClick={() => set({ points: p.points.filter((_, j) => j !== i) })}>
              ✕
            </button>
          </div>
        ))}
        <button className="small" onClick={() => set({ points: [...p.points, { label: 'C', x: p.length / 2 }] })}>
          + Point
        </button>

        <h3>What does the problem ask for?</h3>
        <AskedChecks problem={p} onChange={onChange} />

        <h3>Beam stiffness (E and I)</h3>
        <label className="inline">
          <input
            type="checkbox"
            checked={!!p.stiffness}
            onChange={(e) =>
              set({
                stiffness: e.target.checked
                  ? u.system === 'SI'
                    ? { E: 200, Eunit: 'GPa', I: 100, Iunit: '1e6mm4' }
                    : { E: 29000, Eunit: 'ksi', I: 500, Iunit: 'in4' }
                  : undefined,
              })
            }
          />
          Enter E and I (otherwise deflections are shown divided by EI)
        </label>
        {p.stiffness && (
          <div className="inline">
            <label>
              E <Num value={p.stiffness.E} onChange={(E) => set({ stiffness: { ...p.stiffness!, E } })} />
            </label>
            <select value={p.stiffness.Eunit} onChange={(e) => set({ stiffness: { ...p.stiffness!, Eunit: e.target.value as any } })}>
              {E_UNITS[u.system].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
            <label>
              I <Num value={p.stiffness.I} onChange={(I) => set({ stiffness: { ...p.stiffness!, I } })} />
            </label>
            <select value={p.stiffness.Iunit} onChange={(e) => set({ stiffness: { ...p.stiffness!, Iunit: e.target.value as any } })}>
              {I_UNITS[u.system].map((x) => (
                <option key={x} value={x}>
                  {I_UNIT_LABEL[x]}
                </option>
              ))}
            </select>
          </div>
        )}

        {!v.ok && <p className={v.comingSoon ? 'warn' : 'error'}>{v.comingSoon ? `Coming soon! ${v.reason}: not in the prototype yet.` : v.reason}</p>}
        <div className="actions">
          <button onClick={onBack}>Back</button>
          {!v.ok && v.comingSoon ? (
            <button className="primary" onClick={() => onComingSoon(v.reason)}>
              Continue
            </button>
          ) : (
            <button className="primary" disabled={!v.ok} onClick={onBuild}>
              Build model
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** The "what does the problem ask for" checkboxes; also shown on the solution screen. */
export function AskedChecks({ problem: p, onChange }: { problem: Problem; onChange: (p: Problem) => void }) {
  const set = (patch: Partial<Problem>) => onChange({ ...p, ...patch });
  const labels = [...p.supports.map((s) => s.label), ...p.points.map((q) => q.label)].filter((l, i, a) => l && a.indexOf(l) === i);
  return (
    <div className="checks">
      {(
        [
          ['reactions', 'Support reactions'],
          ['shear', 'Shear force diagram'],
          ['moment', 'Bending moment diagram'],
          ['maxValues', 'Maximum shear and moment'],
          ['deflection', 'Deflection'],
        ] as const
      ).map(([k, text]) => (
        <label key={k}>
          <input type="checkbox" checked={p.asked[k]} onChange={(e) => set({ asked: { ...p.asked, [k]: e.target.checked } })} /> {text}
        </label>
      ))}
      {labels.map((l) => (
        <label key={l}>
          <input
            type="checkbox"
            checked={p.asked.momentAbout.includes(l)}
            onChange={(e) =>
              set({ asked: { ...p.asked, momentAbout: e.target.checked ? [...p.asked.momentAbout, l] : p.asked.momentAbout.filter((m) => m !== l) } })
            }
          />{' '}
          Moment of the loads about {l}
        </label>
      ))}
      {labels.map((l) => {
        const at = p.asked.internalAt ?? [];
        return (
          <label key={'i' + l}>
            <input
              type="checkbox"
              checked={at.includes(l)}
              onChange={(e) => set({ asked: { ...p.asked, internalAt: e.target.checked ? [...at, l] : at.filter((m) => m !== l) } })}
            />{' '}
            Shear and moment at {l}
          </label>
        );
      })}
    </div>
  );
}
