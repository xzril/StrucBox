// Small polynomial helpers. A Poly is coefficients [c0, c1, c2, ...] in a
// local variable t, i.e. p(t) = c0 + c1 t + c2 t^2 + ...

export type Poly = number[];

export function add(a: Poly, b: Poly): Poly {
  const out = new Array(Math.max(a.length, b.length)).fill(0);
  a.forEach((c, i) => (out[i] += c));
  b.forEach((c, i) => (out[i] += c));
  return out;
}

export function scale(a: Poly, k: number): Poly {
  return a.map((c) => c * k);
}

export function mul(a: Poly, b: Poly): Poly {
  if (!a.length || !b.length) return [];
  const out = new Array(a.length + b.length - 1).fill(0);
  a.forEach((ca, i) => b.forEach((cb, j) => (out[i + j] += ca * cb)));
  return out;
}

/** (s0 + t)^n */
export function shiftedPow(s0: number, n: number): Poly {
  let out: Poly = [1];
  for (let i = 0; i < n; i++) out = mul(out, [s0, 1]);
  return out;
}

export function evaluate(p: Poly, t: number): number {
  let v = 0;
  for (let i = p.length - 1; i >= 0; i--) v = v * t + p[i];
  return v;
}

export function derivative(p: Poly): Poly {
  return p.slice(1).map((c, i) => c * (i + 1));
}

/** Antiderivative with constant term c0. */
export function integrate(p: Poly, c0 = 0): Poly {
  return [c0, ...p.map((c, i) => c / (i + 1))];
}

/** Real roots of p strictly inside (0, h), found by sampling + bisection. */
export function rootsIn(p: Poly, h: number, samples = 64): number[] {
  const roots: number[] = [];
  if (p.every((c) => Math.abs(c) < 1e-14)) return roots;
  let t0 = 0;
  let f0 = evaluate(p, t0);
  for (let i = 1; i <= samples; i++) {
    const t1 = (h * i) / samples;
    const f1 = evaluate(p, t1);
    if (f0 === 0 && i > 1) roots.push(t0);
    else if (f0 * f1 < 0) {
      let lo = t0;
      let hi = t1;
      let flo = f0;
      for (let k = 0; k < 80; k++) {
        const mid = (lo + hi) / 2;
        const fm = evaluate(p, mid);
        if (flo * fm <= 0) hi = mid;
        else {
          lo = mid;
          flo = fm;
        }
      }
      roots.push((lo + hi) / 2);
    }
    t0 = t1;
    f0 = f1;
  }
  return roots.filter((t) => t > 1e-12 && t < h - 1e-12);
}
