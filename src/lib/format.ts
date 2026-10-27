// Number formatting and the user's sign convention (D19).

export interface SignConvention {
  momentPositive: 'ccw' | 'cw';
  forcePositive: 'up' | 'down';
  internal: 'standard' | 'reversed'; // standard: sagging moment and "left side up" shear positive
}

export const defaultConvention: SignConvention = { momentPositive: 'ccw', forcePositive: 'up', internal: 'standard' };

/** Round to about 4 significant figures, without exponent notation for normal ranges. */
export function fmt(n: number, sig = 4): string {
  if (!isFinite(n)) return '—';
  if (Math.abs(n) < 1e-9) return '0';
  const abs = Math.abs(n);
  if (abs >= 1e7 || abs < 1e-4) return n.toExponential(sig - 1).replace('e+', 'e');
  const decimals = Math.max(0, sig - 1 - Math.floor(Math.log10(abs)));
  return String(Number(n.toFixed(Math.min(decimals, 6))));
}

/** Signed internal value (CCW+ / up+ / standard) to the user's convention. */
export function showMoment(mCcw: number, c: SignConvention): number {
  return c.momentPositive === 'ccw' ? mCcw : -mCcw;
}
export function showForce(fUp: number, c: SignConvention): number {
  return c.forcePositive === 'up' ? fUp : -fUp;
}
export function showInternal(v: number, c: SignConvention): number {
  return c.internal === 'standard' ? v : -v;
}

export function rotWord(mCcw: number): string {
  if (Math.abs(mCcw) < 1e-9) return '';
  return mCcw > 0 ? 'counter-clockwise' : 'clockwise';
}
export function dirArrow(fUp: number): string {
  if (Math.abs(fUp) < 1e-9) return '';
  return fUp > 0 ? '↑' : '↓';
}

export function conventionText(c: SignConvention): string {
  return `${c.momentPositive === 'ccw' ? '↺ counter-clockwise' : '↻ clockwise'} moments positive, ${
    c.forcePositive === 'up' ? '↑ upward' : '↓ downward'
  } forces positive`;
}

/** A curved load's formula as plain text, e.g. "2x² − 8x + 18". */
export function polyText(l: { poly?: number[] }): string {
  const sup = ['', '', '²', '³', '⁴', '⁵'];
  const parts = (l.poly ?? [])
    .map((c, k) => ({ c, k }))
    .filter(({ c }) => Math.abs(c) > 1e-12)
    .reverse()
    .map(({ c, k }, i) => {
      const a = fmt(Math.abs(c));
      const body = k === 0 ? a : `${a === '1' ? '' : a}x${sup[k] ?? '^' + k}`;
      return i === 0 ? (c < 0 ? '−' : '') + body : (c < 0 ? ' − ' : ' + ') + body;
    });
  return parts.join('') || '0';
}

/** "2x^2 - 8x + 18" (or 2x² − 8x + 18) → [18, -8, 2]; null if it is not a polynomial in x. */
export function parsePoly(text: string): number[] | null {
  const s = text.replace(/\s+/g, '').replace(/[−–]/g, '-').replace(/²/g, '^2').replace(/³/g, '^3').replace(/\*/g, '');
  if (!s) return null;
  const out: number[] = [];
  const re = /([+-]?)(\d*\.?\d*)(x(?:\^(\d+))?)?/gy;
  let i = 0;
  while (i < s.length) {
    re.lastIndex = i;
    const m = re.exec(s);
    if (!m || m[0] === '' || (!m[2] && !m[3])) return null;
    const c = (m[1] === '-' ? -1 : 1) * (m[2] ? Number(m[2]) : 1);
    const k = m[3] ? Number(m[4] ?? 1) : 0;
    if (!Number.isFinite(c) || k > 6) return null;
    while (out.length <= k) out.push(0);
    out[k] += c;
    i = re.lastIndex;
  }
  return out;
}
