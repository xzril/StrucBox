import { useEffect, useMemo, useState } from 'react';
import { aiAvailable, postJson } from '../input/api';
import { conventionText } from '../lib/format';
import { buildReport, sampleDiagram, type ResultLine } from '../lib/report';
import { eiInProblemUnits, toDeflectionUnit, unitStr } from '../lib/units';
import { solve } from '../solver/solve';
import type { Load, Problem } from '../solver/types';
import { BeamView3D } from './BeamView3D';
import { Diagram } from './Diagram';
import type { Settings } from './SettingsDialog';
import { Tex } from './Tex';

interface Props {
  problem: Problem;
  settings: Settings;
  onChange: (p: Problem) => void;
  onEdit: () => void;
}

export function ModelScreen({ problem: p, settings, onChange, onEdit }: Props) {
  const [showSolution, setShowSolution] = useState(false);
  const [showUnasked, setShowUnasked] = useState(false);
  const [bend, setBend] = useState(true);
  const [ai, setAi] = useState<{ key: string; text?: string; error?: string; loading?: boolean } | null>(null);
  const [hasAi, setHasAi] = useState(false);
  useEffect(() => {
    aiAvailable().then(setHasAi);
  }, []);

  const outcome = useMemo(() => solve(p), [p]);
  const report = useMemo(() => (outcome.ok ? buildReport(p, outcome.solution, settings) : null), [p, outcome, settings]);
  if (!outcome.ok || !report)
    return (
      <div className="card center">
        <p className="error">{!outcome.ok && outcome.reason}</p>
        <button onClick={onEdit}>Edit values</button>
      </div>
    );
  const s = outcome.solution;
  const u = p.units;
  const a = p.asked;

  const groupAsked: Record<ResultLine['group'], boolean> = {
    reactions: a.reactions,
    momentAbout: a.momentAbout.length > 0,
    maxValues: a.maxValues || a.shear || a.moment,
    deflection: a.deflection,
  };
  const asked = report.lines.filter((l) => groupAsked[l.group]);
  const unasked = report.lines.filter((l) => !groupAsked[l.group]);
  const diagrams = [
    { key: 'shear', on: a.shear },
    { key: 'moment', on: a.moment },
    { key: 'deflection', on: a.deflection },
  ].filter((d) => d.on || showUnasked);

  const marks = [...s.breakpoints, s.max.M.x, s.min.M.x, s.max.V.x, s.min.V.x];
  const ei = p.stiffness ? eiInProblemUnits(p.stiffness, u) : undefined;
  const deflPoints = sampleDiagram(s, 'EIy', settings).map(([x, y]) => [x, ei ? toDeflectionUnit(y / ei, u) : y] as [number, number]);

  const aiKey = JSON.stringify([p.length, p.supports, p.loads, p.asked, p.stiffness, settings]);
  const explainWithAi = async () => {
    setAi({ key: aiKey, loading: true });
    try {
      const { text } = await postJson<{ text: string }>('/api/explain', {
        problem: { title: p.title, text: p.text, units: u, length: p.length, supports: p.supports, loads: p.loads, asked: p.asked },
        signConvention: conventionText(settings),
        results: report.lines.filter((l) => groupAsked[l.group]).map((l) => ({ quantity: l.label, value: l.value, note: l.note })),
        answerKey: p.answerKey,
      });
      setAi({ key: aiKey, text });
    } catch (e: any) {
      setAi({ key: aiKey, error: e?.message ?? String(e) });
    }
  };

  const moveLoad = (l: Load) => onChange({ ...p, loads: p.loads.map((m) => (m.id === l.id ? l : m)) });

  return (
    <div className="model">
      <div className="model-main">
        <div className="toolbar">
          <h2>{p.title}</h2>
          <div className="toggles">
            <button className={showSolution ? 'primary' : ''} onClick={() => setShowSolution(!showSolution)}>
              {showSolution ? 'Hide solution' : 'Show solution'}
            </button>
            <label>
              <input type="checkbox" checked={showUnasked} onChange={(e) => setShowUnasked(e.target.checked)} /> Show results not asked for
            </label>
            <label>
              <input type="checkbox" checked={bend} onChange={(e) => setBend(e.target.checked)} /> Bend the beam
            </label>
            <button onClick={onEdit}>Edit values</button>
          </div>
        </div>
        <BeamView3D problem={p} solution={s} showSolution={showSolution} bend={bend} onMoveLoad={moveLoad} />
        {showSolution ? (
          diagrams.map((d) =>
            d.key === 'shear' ? (
              <Diagram
                key="V"
                title="Shear force diagram"
                points={sampleDiagram(s, 'V', settings)}
                length={p.length}
                xUnit={u.length}
                yUnit={unitStr.force(u)}
                color="#1c7ed6"
                marks={marks}
              />
            ) : d.key === 'moment' ? (
              <Diagram
                key="M"
                title="Bending moment diagram"
                points={sampleDiagram(s, 'M', settings)}
                length={p.length}
                xUnit={u.length}
                yUnit={unitStr.moment(u)}
                color="#d9480f"
                marks={marks}
              />
            ) : (
              <Diagram
                key="y"
                title={ei ? 'Deflection' : 'Deflection × EI'}
                points={deflPoints}
                length={p.length}
                xUnit={u.length}
                yUnit={ei ? report.deflection.unit : `${u.force}·${u.length}³ / EI`}
                color="#2b8a3e"
                marks={[...s.breakpoints, s.min.EIy.x, s.max.EIy.x]}
              />
            ),
          )
        ) : (
          diagrams.length > 0 && <p className="muted center-text">The diagrams are part of the solution. Try the problem first, then press Show solution.</p>
        )}
      </div>

      <aside className="panel">
        {p.text && <blockquote className="problem-text">{p.text}</blockquote>}
        <h3>Results</h3>
        <ResultTable lines={asked} hidden={!showSolution} />
        {showUnasked && unasked.length > 0 && (
          <>
            <h4 className="muted">Not asked for</h4>
            <ResultTable lines={unasked} hidden={!showSolution} />
          </>
        )}
        <p className="muted small">{conventionText(settings)}. Change this in Settings.</p>

        {showSolution && (
          <>
            <h3>Solution</h3>
            <ol className="steps-list">
              {report.steps.map((st, i) => (
                <li key={i}>
                  <strong>{st.title}</strong>
                  {st.text && <p>{st.text}</p>}
                  {st.tex.map((t, j) => (
                    <Tex key={j} tex={t} block />
                  ))}
                </li>
              ))}
            </ol>

            <h3>Explanation</h3>
            {ai?.text && ai.key === aiKey ? (
              <p className="explain">{ai.text}</p>
            ) : (
              report.explanation.split('\n\n').map((t, i) => (
                <p className="explain" key={i}>
                  {t}
                </p>
              ))
            )}
            {ai?.text && ai.key !== aiKey && <p className="muted small">The AI explanation was for the earlier load positions.</p>}
            {ai?.error && <p className="error small">{ai.error}</p>}
            {hasAi ? (
              <button className="small" disabled={ai?.loading} onClick={explainWithAi}>
                {ai?.loading ? 'Writing…' : p.answerKey ? 'Explain with AI and check the answer key' : 'Explain with AI'}
              </button>
            ) : (
              <p className="muted small">Add an API key (see README) for an AI explanation written for this problem.</p>
            )}
            {p.answerKey && <p className="muted small">Answer key: {p.answerKey}</p>}
          </>
        )}
      </aside>
    </div>
  );
}

function ResultTable({ lines, hidden }: { lines: ResultLine[]; hidden: boolean }) {
  if (!lines.length) return <p className="muted small">Nothing selected. Use "Edit values" to choose what the problem asks for.</p>;
  return (
    <table className="results">
      <tbody>
        {lines.map((l) => (
          <tr key={l.key}>
            <td>
              <Tex tex={l.label} />
            </td>
            <td>{hidden ? <span className="hidden-value">?</span> : <Tex tex={l.value} />}</td>
            <td className="muted small">{hidden ? '' : l.note}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
