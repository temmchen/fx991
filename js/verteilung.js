// verteilung.js – Wahrscheinlichkeitsverteilungen (Modus 7) und P( Q( R( der Statistik.
// Normalverteilung: Reihe nach Marsaglia (2004) für |z| < 3, Kettenbruch (Mills-Quotient) für die
// Ränder; Inverse: Acklam-Näherung mit Halley-Nachbesserung. Binomial/Poisson über log Γ (Lanczos).

const LN_SQRT_2PI = 0.91893853320467274178;

/// Dichte der Standardnormalverteilung
export function phi(z) {
  return Math.exp(-0.5 * z * z - LN_SQRT_2PI);
}

/// rechter Rand 1 − Φ(z) für z ≥ 0 (genau auch weit draußen)
function oben(z) {
  if (z < 3) return 0.5 - marsaglia(z);
  let t = z;
  for (let k = 120; k >= 1; k--) t = z + k / t;
  return phi(z) / t;
}

/// Φ(z) − 1/2 als Reihe
function marsaglia(z) {
  let s = z, t = 0, b = z;
  const q = z * z;
  let i = 1;
  while (s !== t) {
    t = s;
    i += 2;
    b *= q / i;
    s = t + b;
  }
  return s * Math.exp(-0.5 * q - LN_SQRT_2PI);
}

/// Verteilungsfunktion der Standardnormalverteilung Φ(z)
export function Phi(z) {
  if (!Number.isFinite(z)) return z > 0 ? 1 : 0;
  if (z >= 0) return 1 - oben(z);
  return oben(-z);
}

/// P(a ≤ X ≤ b) für N(μ, σ²) – mit Rändern genau gerechnet
export function normalCD(a, b, sigma, mu) {
  if (!(sigma > 0)) throw new RangeError('sigma');
  const za = (a - mu) / sigma, zb = (b - mu) / sigma;
  if (za > zb) return normalCD(b, a, sigma, mu);
  if (za >= 0) return oben(za) - oben(zb);
  if (zb <= 0) return oben(-zb) - oben(-za);
  return 1 - oben(-za) - oben(zb);
}

export function normalPD(x, sigma, mu) {
  if (!(sigma > 0)) throw new RangeError('sigma');
  return phi((x - mu) / sigma) / sigma;
}

/// Quantil Φ⁻¹(p)
export function PhiInv(p) {
  if (!(p > 0 && p < 1)) {
    if (p === 0) return -Infinity;
    if (p === 1) return Infinity;
    throw new RangeError('p');
  }
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.383577518672690e2, -3.066479806614716e1, 2.506628277459239e0];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838e0, -2.549732539343734e0, 4.374664141464968e0, 2.938163982698783e0];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996e0, 3.754408661907416e0];
  const plow = 0.02425;
  let x;
  if (p < plow) {
    const q = Math.sqrt(-2 * Math.log(p));
    x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= 1 - plow) {
    const q = p - 0.5, r = q * q;
    x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  // zwei Halley-Schritte
  for (let k = 0; k < 2; k++) {
    const e = (x >= 0 ? (1 - oben(x)) : oben(-x)) - p;
    const u = e / phi(x);
    x = x - u / (1 + (x * u) / 2);
  }
  return x;
}

export function normalInv(flaeche, sigma, mu) {
  if (!(sigma > 0) || !(flaeche >= 0 && flaeche <= 1)) throw new RangeError('area');
  return mu + sigma * PhiInv(flaeche);
}

// MARK: diskrete Verteilungen

const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];

/// ln Γ(x) für x > 0
export function lnGamma(x) {
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  x -= 1;
  let a = LANCZOS[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += LANCZOS[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

function lnFak(n) {
  if (n < 2) return 0;
  if (n < 30) { let s = 0; for (let i = 2; i <= n; i++) s += Math.log(i); return s; }
  return lnGamma(n + 1);
}

function pruefeGanz(x, name) {
  if (!Number.isInteger(x) || x < 0) throw new RangeError(name);
}

export function binomialPD(x, n, p) {
  pruefeGanz(n, 'N');
  if (!(p >= 0 && p <= 1)) throw new RangeError('p');
  if (!Number.isInteger(x) || x < 0 || x > n) return 0;
  if (p === 0) return x === 0 ? 1 : 0;
  if (p === 1) return x === n ? 1 : 0;
  // kleine n: exakt multiplizieren (genauer)
  if (n <= 60) {
    let c = 1;
    for (let i = 1; i <= x; i++) c = (c * (n - x + i)) / i;
    return c * Math.pow(p, x) * Math.pow(1 - p, n - x);
  }
  const l = lnFak(n) - lnFak(x) - lnFak(n - x) + x * Math.log(p) + (n - x) * Math.log1p(-p);
  return Math.exp(l);
}

export function binomialCD(x, n, p) {
  pruefeGanz(n, 'N');
  if (!(p >= 0 && p <= 1)) throw new RangeError('p');
  if (x < 0) return 0;
  const k = Math.min(Math.floor(x), n);
  let s = 0;
  for (let i = 0; i <= k; i++) s += binomialPD(i, n, p);
  return Math.min(1, s);
}

export function poissonPD(x, lambda) {
  if (!(lambda > 0)) throw new RangeError('lambda');
  if (!Number.isInteger(x) || x < 0) return 0;
  return Math.exp(-lambda + x * Math.log(lambda) - lnFak(x));
}

export function poissonCD(x, lambda) {
  if (!(lambda > 0)) throw new RangeError('lambda');
  if (x < 0) return 0;
  const k = Math.floor(x);
  let s = 0;
  for (let i = 0; i <= k; i++) s += poissonPD(i, lambda);
  return Math.min(1, s);
}

// P( Q( R( der Statistik (Standardnormalverteilung)
export const normalP = (t) => Phi(t);
export const normalQ = (t) => Math.abs(Phi(t) - 0.5);
export const normalR = (t) => (t >= 0 ? oben(t) : 1 - oben(-t));
