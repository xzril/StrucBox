export function ComingSoon({ reason, onBack, onTruss }: { reason: string; onBack: () => void; onTruss?: () => void }) {
  return (
    <div className="card center soon">
      <div className="soon-badge">Coming soon!</div>
      <p>
        <strong>{reason}</strong>
      </p>
      <p>This problem type is not in the prototype yet.</p>
      <p className="muted">This version solves statically determinate beams (simply supported, overhanging, cantilever) plane trusses and hanging cables entered by hand.</p>
      {onTruss && (
        <button className="primary" onClick={onTruss}>
          Enter the truss by hand
        </button>
      )}
      <button className="primary" onClick={onBack}>
        Try another problem
      </button>
    </div>
  );
}
