export function ComingSoon({ reason, onBack }: { reason: string; onBack: () => void }) {
  return (
    <div className="card center soon">
      <div className="soon-badge">Coming soon!</div>
      <p>
        <strong>{reason}</strong>
      </p>
      <p>This problem type is not in the prototype yet.</p>
      <p className="muted">This version solves statically determinate beams: simply supported, overhanging, and cantilever.</p>
      <button className="primary" onClick={onBack}>
        Try another problem
      </button>
    </div>
  );
}
