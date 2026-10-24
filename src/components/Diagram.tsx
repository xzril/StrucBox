import { fmt } from '../lib/format';

interface Props {
  title: string;
  points: [number, number][];
  length: number;
  xUnit: string;
  yUnit: string;
  color: string;
  marks: number[]; // x positions to label (breakpoints, extrema)
}

const W = 800;
const Hh = 170;
const PAD = { l: 50, r: 50, t: 22, b: 30 };

/** One diagram (SFD, BMD or deflection) as an SVG line with a filled area. */
export function Diagram({ title, points, length, xUnit, yUnit, color, marks }: Props) {
  const maxAbs = Math.max(1e-12, ...points.map(([, y]) => Math.abs(y)));
  const X = (x: number) => PAD.l + ((W - PAD.l - PAD.r) * x) / length;
  const Y = (y: number) => PAD.t + (Hh - PAD.t - PAD.b) / 2 - ((Hh - PAD.t - PAD.b) / 2) * (y / maxAbs);
  const d = points.map(([x, y], i) => `${i ? 'L' : 'M'}${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join(' ');
  const area = `${d} L${X(length)},${Y(0)} L${X(0)},${Y(0)} Z`;
  const valueAt = (x: number) => {
    // largest-magnitude sample at this x (covers both sides of a jump)
    const at = points.filter(([px]) => Math.abs(px - x) < 1e-9);
    return at.reduce((a, b) => (Math.abs(b[1]) > Math.abs(a[1]) ? b : a), at[0] ?? [x, 0])[1];
  };
  const labelled = [...new Set(marks.map((m) => +m.toFixed(9)))];

  return (
    <figure className="diagram">
      <figcaption>
        {title} <span className="muted">({yUnit})</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${Hh}`} role="img" aria-label={title}>
        <path d={area} fill={color} fillOpacity={0.15} />
        <line x1={X(0)} x2={X(length)} y1={Y(0)} y2={Y(0)} stroke="currentColor" strokeOpacity={0.5} />
        <path d={d} fill="none" stroke={color} strokeWidth={2} />
        {labelled.map((x) => {
          const y = valueAt(x);
          if (Math.abs(y) < maxAbs * 1e-6) return null;
          return (
            <g key={x}>
              <circle cx={X(x)} cy={Y(y)} r={3} fill={color} />
              <text x={X(x)} y={Y(y) + (y >= 0 ? -6 : 14)} textAnchor="middle" fontSize={12}>
                {fmt(y)}
              </text>
            </g>
          );
        })}
        <text x={X(0) - 8} y={Y(0) + 4} fontSize={11} textAnchor="end">
          0
        </text>
        <text x={X(length) + 8} y={Y(0) + 4} fontSize={11}>
          {fmt(length)} {xUnit}
        </text>
      </svg>
    </figure>
  );
}
