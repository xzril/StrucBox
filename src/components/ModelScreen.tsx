import { useEffect, useMemo, useRef, useState } from 'react';
import { postJson, providerName, WEB_BUILD, type Plan } from '../input/api';
import { conventionText, fmt } from '../lib/format';
import type { Palette } from '../lib/theme';
import { buildReport, sampleDiagram, type ResultLine } from '../lib/report';
import { eiInProblemUnits, toDeflectionUnit, unitStr } from '../lib/units';
import { solve } from '../solver/solve';
import type { Load, Problem } from '../solver/types';
import { BeamView3D } from './BeamView3D';
import { AskedChecks } from './ConfirmForm';
import { Diagram } from './Diagram';
import type { Settings } from './SettingsDialog';
import { Tex } from './Tex';

interface Props {
  problem: Problem;
  settings: Settings;
  onChange: (p: Problem) => void;
  onEdit: () => void;
  C: Palette;
  plan: Plan;
}

export function ModelScreen({ problem: p, settings, onChange, onEdit, C, plan }: Props) {
  const [showSolution, setShowSolution] = useState(false);
  const [showUnasked, setShowUnasked] = useState(false);
  const [bend, setBend] = useState(true);
  const [ai, setAi] = useState<{ key: string; text?: string; error?: string; loading?: boolean } | null>(null);
  const [typePos, setTypePos] = useState(false);
  const [labels, setLabels] = useState(true);
  const [question, setQuestion] = useState('');
  const [tutor, setTutor] = useState<{ q: string; text?: string; error?: string; loading?: boolean } | null>(null);
  const [show3d, setShow3d] = useState(true);
  const pin = useRef<HTMLDivElement>(null);

  // The 3D view stays pinned at the top and shrinks to half height as the solution scrolls.
  // Set on the element directly so scrolling never re-renders the 3D scene; the margin keeps the page height fixed.
  useEffect(() => {
    const el = pin.current;
    if (!el) return;
    const fit = () => {
      const full = Math.max(340, innerHeight * 0.52);
      const h = Math.max(full / 2, full - scrollY);
      el.style.height = `${h}px`;
      el.style.marginBottom = `${full - h}px`;
      el.classList.toggle('shrunk', h < full * 0.8);
    };
    fit();
    addEventListener('scroll', fit, { passive: true });
    addEventListener('resize', fit);
    return () => (removeEventListener('scroll', fit), removeEventListener('resize', fit));
  }, [show3d]);

  const outcome = useMemo(() => solve(p), [p]);
  const report = useMemo(() => (outcome.ok ? buildReport(p, outcome.solution, settings) : null), [p, outcome, settings]);
  if (!outcome.ok || !report)
    return (
      <div className="card center">
        <p className="error">{!outcome.ok && outcome.reason}</p>
        <button onClick={onEdit}>Edit problem</button>
      </div>
    );
  const s = outcome.solution;
  const u = p.units;
  const a = p.asked;

  const groupAsked: Record<ResultLine['group'], boolean> = {
    reactions: a.reactions,
    resultant: !!a.resultant,
    notAsked: false,
    momentAbout: a.momentAbout.length > 0,
    internal: (a.internalAt ?? []).length > 0,
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
  const context = {
    problem: { title: p.title, text: p.text, units: u, length: p.length, supports: p.supports, loads: p.loads, asked: p.asked },
    signConvention: conventionText(settings),
    results: report.lines.map((l) => ({ quantity: l.label, value: l.value, note: l.note })),
    solutionSteps: report.steps.map((st) => st.title),
  };
  const explainWithAi = async () => {
    setAi({ key: aiKey, loading: true });
    try {
      const { text } = await postJson<{ text: string }>('/api/explain', {
        ...context,
        results: context.results.filter((_, i) => groupAsked[report.lines[i].group]),
        answerKey: p.answerKey,
      });
      setAi({ key: aiKey, text });
    } catch (e: any) {
      setAi({ key: aiKey, error: e?.message ?? String(e) });
    }
  };

  const askTutor = async () => {
    const q = question.trim();
    if (!q) return;
    setTutor({ q, loading: true });
    try {
      const { text } = await postJson<{ text: string }>('/api/ask', { question: q, ...context });
      setTutor({ q, text });
    } catch (e: any) {
      setTutor({ q, error: e?.message ?? String(e) });
    }
  };

  const moveLoad = (l: Load) => onChange({ ...p, loads: p.loads.map((m) => (m.id === l.id ? l : m)) });

  return (
    <div className="model">
      {show3d ? (
        <div className={`pin3d ${labels ? '' : 'no-labels'}`} ref={pin}>
          <BeamView3D problem={p} solution={s} showSolution={showSolution} bend={bend} onMoveLoad={moveLoad} C={C} />
          <button className="small hide3d" onClick={() => setShow3d(false)}>
            Hide 3D
          </button>
        </div>
      ) : (
        <button className="show3d" onClick={() => setShow3d(true)}>
          Show 3D model
        </button>
      )}
      <div className="model-main">
        <div className="toolbar">
          <h2>{p.title}</h2>
          <div className="toggles">
            <button onClick={onEdit}>✎ Edit problem</button>
            <button className={showSolution ? 'primary' : ''} onClick={() => setShowSolution(!showSolution)}>
              {showSolution ? 'Hide solution' : 'Show solution'}
            </button>
            <label>
              <input type="checkbox" checked={showUnasked} onChange={(e) => setShowUnasked(e.target.checked)} /> Show results not asked for
            </label>
            <label>
              <input type="checkbox" checked={bend} onChange={(e) => setBend(e.target.checked)} /> Bend the beam
            </label>
            <label>
              <input type="checkbox" checked={labels} onChange={(e) => setLabels(e.target.checked)} /> Show labels
            </label>
            <button className={typePos ? 'primary' : ''} onClick={() => setTypePos(!typePos)}>
              ✎ Edit loads
            </button>
          </div>
        </div>
        {typePos && (
          <div className="positions">
            {p.loads.map((l, i) => {
              const name = l.label || `Load ${i + 1}`;
              const at = (lo: number, hi: number, x: number, set: (x: number) => Load) => (
                <PosInput value={x} lo={lo} hi={hi} onCommit={(x) => moveLoad(set(x))} />
              );
              return (
                <label key={l.id}>
                  <span>{name}</span>
                  {l.kind === 'dist' ? (
                    <>
                      x₁ {at(0, l.x2 - 1e-9, l.x1, (x1) => ({ ...l, x1 }))} to x₂ {at(l.x1 + 1e-9, p.length, l.x2, (x2) => ({ ...l, x2 }))}
                    </>
                  ) : (
                    <>x = {at(0, p.length, l.x, (x) => ({ ...l, x }))}</>
                  )}{' '}
                  {u.length}
                  <button className="icon" aria-label={`Delete ${name}`} title="Delete this force" onClick={() => onChange({ ...p, loads: p.loads.filter((m) => m.id !== l.id) })}>
                    ✕
                  </button>
                </label>
              );
            })}
            <span className="muted small">x is measured from the left end (0 to {fmt(p.length)} {u.length}).</span>
          </div>
        )}
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
                color={C.shear}
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
                color={C.bending}
                marks={marks}
              />
            ) : (
              <Diagram
                key="y"
                title="Deflection"
                points={deflPoints}
                length={p.length}
                xUnit={u.length}
                yUnit={ei ? report.deflection.unit : `${u.force}·${u.length}³ / EI`}
                color={C.deflection}
                marks={[...s.breakpoints, s.min.EIy.x, s.max.EIy.x]}
              />
            ),
          )
        ) : (
          diagrams.length > 0 && <p className="muted center-text">The diagrams are part of the solution. Try the problem first, then press Show solution.</p>
        )}
      </div>

      <aside className="panel">
        <details className="asked">
          <summary>What does the problem ask for?</summary>
          <AskedChecks problem={p} onChange={onChange} />
        </details>
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
            {p.answerKey && <p className="muted small">Answer key: {p.answerKey}</p>}
          </>
        )}

        <section className="tools">
          <h3>AI tools {plan.premium ? `· ${providerName(plan.provider)}` : '· Premium'}</h3>
          {plan.premium ? (
            <>
              <button className="small" disabled={ai?.loading} onClick={() => (setShowSolution(true), explainWithAi())}>
                {ai?.loading ? 'Writing…' : p.answerKey ? 'Explain with AI and check the answer key' : 'Explain with AI'}
              </button>
              <label className="field">
                <span>Ask the tutor about this problem</span>
                <textarea
                  rows={2}
                  value={question}
                  placeholder="e.g. Why is the moment about O clockwise?"
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), askTutor())}
                />
              </label>
              <button className="small" disabled={!question.trim() || tutor?.loading} onClick={askTutor}>
                {tutor?.loading ? 'Thinking…' : 'Ask'}
              </button>
              {tutor?.text && (
                <p className="explain">
                  <strong>{tutor.q}</strong>
                  <br />
                  {tutor.text}
                </p>
              )}
              {tutor?.error && <p className="error small">{tutor.error}</p>}
              <p className="muted small">The AI explains; every number still comes from StrucBox's solver.</p>
            </>
          ) : (
            <p className="locked">
              🔒 AI reading of photos, AI explanations with answer-key checks, and an ask-the-tutor box come with Premium.{' '}
              {WEB_BUILD ? 'This online version is the free app only.' : 'Run SetApiKey.bat with a Claude or Gemini key, then restart StrucBox.'}
            </p>
          )}
        </section>
      </aside>
    </div>
  );
}

/** Number box that only passes on values inside [lo, hi], so a half-typed value never breaks the model. */
function PosInput({ value, lo, hi, onCommit }: { value: number; lo: number; hi: number; onCommit: (x: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const n = Number(draft);
  const bad = draft !== null && (draft.trim() === '' || !Number.isFinite(n) || n < lo || n > hi);
  return (
    <input
      type="number"
      step="any"
      min={lo}
      max={hi}
      className={bad ? 'bad' : ''}
      title={bad ? `Enter a value from ${fmt(lo)} to ${fmt(hi)}` : undefined}
      value={draft ?? value}
      onChange={(e) => {
        const t = e.target.value;
        setDraft(t);
        const x = Number(t);
        if (t.trim() !== '' && Number.isFinite(x) && x >= lo && x <= hi && x !== value) onCommit(x);
      }}
      onBlur={() => setDraft(null)}
    />
  );
}

export function ResultTable({ lines, hidden }: { lines: ResultLine[]; hidden: boolean }) {
  if (!lines.length) return <p className="muted small">Nothing selected. Use "Edit problem" to choose what the problem asks for.</p>;
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
