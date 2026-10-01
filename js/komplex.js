// komplex.js – Komplexe Zahlen { t: 'c', re, im } mit exakten oder genäherten Teilen (Real aus zahl.js).
// Wie beim Rechner: ganzzahlige Potenzen, Wurzel, Betrag, Argument (−180° < θ ≤ 180°),
// Konjugierte, Polarform r∠θ. Trigonometrische Funktionen komplexer Zahlen kennt der Rechner nicht.

import * as Z from './zahl.js';

const { Q, NULL, EINS } = Z;

export function C(re, im = NULL) {
  return { t: 'c', re, im };
}

export const I = C(NULL, EINS);

export const istKomplex = (a) => a && a.t === 'c';
export const alsKomplex = (a) => (istKomplex(a) ? a : C(a, NULL));
export const istReell = (c) => Z.istNull(c.im);

/// komplexe Zahl mit Imaginärteil 0 → reelle Zahl
export function vereinfache(c) {
  return istReell(c) ? c.re : c;
}

export const add = (a, b) => C(Z.add(a.re, b.re), Z.add(a.im, b.im));
export const sub = (a, b) => C(Z.sub(a.re, b.re), Z.sub(a.im, b.im));
export const neg = (a) => C(Z.neg(a.re), Z.neg(a.im));
export const konj = (a) => C(a.re, Z.neg(a.im));

export function mul(a, b) {
  return C(
    Z.sub(Z.mul(a.re, b.re), Z.mul(a.im, b.im)),
    Z.add(Z.mul(a.re, b.im), Z.mul(a.im, b.re)),
  );
}

export function div(a, b) {
  const n = Z.add(Z.mul(b.re, b.re), Z.mul(b.im, b.im));
  if (Z.istNull(n)) throw Z.fehler('math');
  const z = mul(a, konj(b));
  return C(Z.div(z.re, n), Z.div(z.im, n));
}

/// |z| = √(a² + b²)
export function betrag(a) {
  if (Z.istNull(a.im)) return Z.betrag(a.re);
  if (Z.istNull(a.re)) return Z.betrag(a.im);
  return Z.wurzel(Z.add(Z.mul(a.re, a.re), Z.mul(a.im, a.im)));
}

export function arg(a, einheit) {
  if (Z.istNull(a.re) && Z.istNull(a.im)) return NULL;
  return Z.winkel(a.re, a.im, einheit);
}

/// r∠θ → a + bi
export function polar(r, theta, einheit) {
  return C(Z.mul(r, Z.cos(theta, einheit)), Z.mul(r, Z.sin(theta, einheit)));
}

/// ganzzahlige Potenz (|n| < 10¹⁰); andere Exponenten nur bei reeller Basis/Exponent
export function potenz(a, b) {
  const bb = alsKomplex(b);
  if (!istReell(bb)) throw Z.fehler('math');
  const k = Z.alsGanzzahl(bb.re);
  if (k === null) {
    if (istReell(a)) {
      // reelle Basis, gebrochener Exponent: negative Basis → komplexes Ergebnis (Hauptwert)
      if (Z.vorzeichen(a.re) >= 0) return C(Z.potenz(a.re, bb.re), NULL);
      if (bb.re.t === 'q' && bb.re.d === 2n) {
        // (−x)^(m/2) = (√x · i)^m
        return potenz(wurzel(a), C(Q(bb.re.n), NULL));
      }
      try {
        return C(Z.potenz(a.re, bb.re), NULL);
      } catch (e) {
        throw Z.fehler('math');
      }
    }
    throw Z.fehler('math');
  }
  if (k >= 10n ** 10n || k <= -(10n ** 10n)) throw Z.fehler('math');
  if (istReell(a) && Z.istExakt(a.re)) return C(Z.potenz(a.re, Q(k)), NULL);
  if (k === 0n) {
    if (Z.istNull(a.re) && Z.istNull(a.im)) throw Z.fehler('math');
    return C(EINS, NULL);
  }
  // exakt durch Quadrieren, solange die Teile exakt bleiben; große Exponenten über die Polarform
  const absk = k < 0n ? -k : k;
  if (absk <= 64n && Z.istExakt(a.re) && Z.istExakt(a.im)) {
    let erg = C(EINS, NULL), basis = a, e = absk;
    while (e > 0n) {
      if (e & 1n) erg = mul(erg, basis);
      e >>= 1n;
      if (e > 0n) basis = mul(basis, basis);
    }
    return k < 0n ? div(C(EINS, NULL), erg) : erg;
  }
  const r = Math.hypot(Z.zahl(a.re), Z.zahl(a.im));
  const t = Math.atan2(Z.zahl(a.im), Z.zahl(a.re));
  const n = Number(k);
  const rn = Math.pow(r, n);
  return C(Z.D(rn * Math.cos(n * t)), Z.D(rn * Math.sin(n * t)));
}

/// Hauptwert der Quadratwurzel
export function wurzel(a) {
  if (istReell(a)) {
    if (Z.vorzeichen(a.re) >= 0) return C(Z.wurzel(a.re), NULL);
    return C(NULL, Z.wurzel(Z.neg(a.re)));
  }
  // √(a+bi) = √((|z|+a)/2) + i·sgn(b)·√((|z|−a)/2)
  const r = betrag(a);
  const x = Z.wurzel(Z.mul(Z.add(r, a.re), Q(1n, 2n)));
  let y = Z.wurzel(Z.mul(Z.sub(r, a.re), Q(1n, 2n)));
  if (Z.vorzeichen(a.im) < 0) y = Z.neg(y);
  return C(x, y);
}

export function gleich(a, b) {
  return Z.gleich(a.re, b.re) && Z.gleich(a.im, b.im);
}
