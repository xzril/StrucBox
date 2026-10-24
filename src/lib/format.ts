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
