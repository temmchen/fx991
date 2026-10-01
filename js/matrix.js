// matrix.js – Matrizen (bis 4×4) und Vektoren (2D/3D) mit exakten oder genäherten Einträgen.
//   Matrix: { t: 'm', z: Zeilen, s: Spalten, e: [[Real]] }
//   Vektor: { t: 'v', e: [Real] }

import * as Z from './zahl.js';

const { Q, NULL, EINS, fehler } = Z;
const dim = () => fehler('dimension');

export function matrix(e) {
  return { t: 'm', z: e.length, s: e[0].length, e };
}
export function vektor(e) {
  return { t: 'v', e };
}

export function nullMatrix(z, s) {
  return matrix(Array.from({ length: z }, () => Array.from({ length: s }, () => NULL)));
}

export function einheit(n) {
  const k = Z.alsGanzzahl(n);
  if (k === null || k < 1n || k > 4n) throw fehler('argument');
  const m = Number(k);
  return matrix(Array.from({ length: m }, (_, i) => Array.from({ length: m }, (_, j) => (i === j ? EINS : NULL))));
}

// MARK: Matrizen

export function addM(a, b, minus = false) {
  if (a.z !== b.z || a.s !== b.s) throw dim();
  return matrix(a.e.map((r, i) => r.map((x, j) => (minus ? Z.sub(x, b.e[i][j]) : Z.add(x, b.e[i][j])))));
}

export function skalarM(k, a) {
  return matrix(a.e.map((r) => r.map((x) => Z.mul(k, x))));
}

export function mulM(a, b) {
  if (a.s !== b.z) throw dim();
  const e = [];
  for (let i = 0; i < a.z; i++) {
    const r = [];
    for (let j = 0; j < b.s; j++) {
      let s = NULL;
      for (let k = 0; k < a.s; k++) s = Z.add(s, Z.mul(a.e[i][k], b.e[k][j]));
      r.push(s);
    }
    e.push(r);
  }
  return matrix(e);
}

export function transponiert(a) {
  return matrix(Array.from({ length: a.s }, (_, j) => Array.from({ length: a.z }, (_, i) => a.e[i][j])));
}

export function betragM(a) {
  return matrix(a.e.map((r) => r.map((x) => Z.betrag(x))));
}

/// Pivotsuche: exakt → erstes Element ≠ 0; genähert → betragsgrößtes
function pivot(e, spalte, ab) {
  let beste = -1, bestWert = 0;
  for (let i = ab; i < e.length; i++) {
    const x = e[i][spalte];
    if (Z.istNull(x)) continue;
    const w = Math.abs(Z.zahl(x));
    if (w < 1e-13 && !Z.istExakt(x)) continue;
    if (Z.istExakt(x) && beste < 0) return i;
    if (w > bestWert) { beste = i; bestWert = w; }
  }
  return beste;
}

export function determinante(a) {
  if (a.z !== a.s) throw dim();
  const e = a.e.map((r) => r.slice());
  const n = a.z;
  let det = EINS;
  for (let k = 0; k < n; k++) {
    const p = pivot(e, k, k);
    if (p < 0) return NULL;
    if (p !== k) { [e[p], e[k]] = [e[k], e[p]]; det = Z.neg(det); }
    det = Z.mul(det, e[k][k]);
    for (let i = k + 1; i < n; i++) {
      if (Z.istNull(e[i][k])) continue;
      const f = Z.div(e[i][k], e[k][k]);
      for (let j = k; j < n; j++) e[i][j] = Z.sub(e[i][j], Z.mul(f, e[k][j]));
    }
  }
  return det;
}

export function inverse(a) {
  if (a.z !== a.s) throw dim();
  const n = a.z;
  const e = a.e.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? EINS : NULL))]);
  for (let k = 0; k < n; k++) {
    const p = pivot(e, k, k);
    if (p < 0) throw fehler('math');
    if (p !== k) [e[p], e[k]] = [e[k], e[p]];
    const pv = e[k][k];
    e[k] = e[k].map((x) => Z.div(x, pv));
    for (let i = 0; i < n; i++) {
      if (i === k || Z.istNull(e[i][k])) continue;
      const f = e[i][k];
      e[i] = e[i].map((x, j) => Z.sub(x, Z.mul(f, e[k][j])));
    }
  }
  return matrix(e.map((r) => r.slice(n)));
}

/// Zeilenstufenform (Ref) bzw. reduzierte Zeilenstufenform (Rref)
export function stufenform(a, reduziert) {
  const e = a.e.map((r) => r.slice());
  let zeile = 0;
  for (let sp = 0; sp < a.s && zeile < a.z; sp++) {
    const p = pivot(e, sp, zeile);
    if (p < 0) continue;
    if (p !== zeile) [e[p], e[zeile]] = [e[zeile], e[p]];
    const pv = e[zeile][sp];
    e[zeile] = e[zeile].map((x) => Z.div(x, pv));
    for (let i = reduziert ? 0 : zeile + 1; i < a.z; i++) {
      if (i === zeile || Z.istNull(e[i][sp])) continue;
      const f = e[i][sp];
      e[i] = e[i].map((x, j) => Z.sub(x, Z.mul(f, e[zeile][j])));
    }
    zeile++;
  }
  return matrix(e);
}

export function potenzM(a, k) {
  if (a.z !== a.s) throw dim();
  if (k === -1) return inverse(a);
  let erg = einheit(Q(BigInt(a.z)));
  for (let i = 0; i < k; i++) erg = mulM(erg, a);
  return erg;
}

// MARK: Vektoren

export function addV(a, b, minus = false) {
  if (a.e.length !== b.e.length) throw dim();
  return vektor(a.e.map((x, i) => (minus ? Z.sub(x, b.e[i]) : Z.add(x, b.e[i]))));
}

export function skalarV(k, a) {
  return vektor(a.e.map((x) => Z.mul(k, x)));
}

export function punkt(a, b) {
  if (a.e.length !== b.e.length) throw dim();
  let s = NULL;
  a.e.forEach((x, i) => { s = Z.add(s, Z.mul(x, b.e[i])); });
  return s;
}

export function kreuz(a, b) {
  if (a.e.length !== 3 || b.e.length !== 3) throw dim();
  const [a1, a2, a3] = a.e, [b1, b2, b3] = b.e;
  return vektor([
    Z.sub(Z.mul(a2, b3), Z.mul(a3, b2)),
    Z.sub(Z.mul(a3, b1), Z.mul(a1, b3)),
    Z.sub(Z.mul(a1, b2), Z.mul(a2, b1)),
  ]);
}

export function laenge(a) {
  return Z.wurzel(punkt(a, a));
}

export function einheitsvektor(a) {
  const l = laenge(a);
  if (Z.istNull(l)) throw fehler('math');
  return vektor(a.e.map((x) => Z.div(x, l)));
}

export function winkelV(a, b, einheit) {
  const n = Z.mul(laenge(a), laenge(b));
  if (Z.istNull(n)) throw fehler('math');
  let c = Z.div(punkt(a, b), n);
  // Rundungsfehler an den Rändern abfangen
  const v = Z.zahl(c);
  if (!Z.istExakt(c) && Math.abs(v) > 1) c = Z.D(Math.sign(v));
  return Z.acos(c, einheit);
}

/// Matrix mit einer Zeile/Spalte als Vektor nutzen wäre beim Rechner ein Fehler – hier nicht nötig.
