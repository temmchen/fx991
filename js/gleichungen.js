// gleichungen.js – Gleichungssysteme (2–4 Unbekannte), Polynomgleichungen (Grad 2–4),
// Polynom-Ungleichungen, Verhältnisse und SOLVE (Newton-Verfahren).
// Exakte Koeffizienten → exakte Lösungen (Brüche, Wurzeln wie −1+√3), sonst Näherungen.

import * as Z from './zahl.js';
import * as K from './komplex.js';

const { Q, D, NULL, EINS, fehler } = Z;

// MARK: Lineare Gleichungssysteme

/// zeilen: n Zeilen mit n+1 Einträgen (Koeffizienten | rechte Seite)
/// → { art: 'eindeutig', x: [Real] } | { art: 'keine' } | { art: 'unendlich' }
export function lgs(zeilen) {
  const n = zeilen.length;
  const e = zeilen.map((r) => r.slice());
  const istNullW = (x) => Z.istNull(x) || (!Z.istExakt(x) && Math.abs(Z.zahl(x)) < 1e-12);
  let rang = 0;
  const pivotSpalte = [];
  for (let sp = 0; sp < n && rang < n; sp++) {
    let p = -1, best = 0;
    for (let i = rang; i < n; i++) {
      if (istNullW(e[i][sp])) continue;
      const w = Math.abs(Z.zahl(e[i][sp]));
      if (Z.istExakt(e[i][sp]) && p < 0) { p = i; break; }
      if (w > best) { p = i; best = w; }
    }
    if (p < 0) continue;
    [e[p], e[rang]] = [e[rang], e[p]];
    const pv = e[rang][sp];
    e[rang] = e[rang].map((x) => Z.div(x, pv));
    for (let i = 0; i < n; i++) {
      if (i === rang || istNullW(e[i][sp])) continue;
      const f = e[i][sp];
      e[i] = e[i].map((x, j) => Z.sub(x, Z.mul(f, e[rang][j])));
    }
    pivotSpalte.push(sp);
    rang++;
  }
  if (rang < n) {
    for (let i = rang; i < n; i++) if (!istNullW(e[i][n])) return { art: 'keine' };
    return { art: 'unendlich' };
  }
  const x = Array(n).fill(NULL);
  pivotSpalte.forEach((sp, i) => { x[sp] = e[i][n]; });
  return { art: 'eindeutig', x };
}

// MARK: Polynome

/// Horner mit Reals
function hornerR(koeff, x) {
  let s = NULL;
  for (const a of koeff) s = Z.add(Z.mul(s, x), a);
  return s;
}

/// Division durch (x − r): Koeffizienten des Quotienten
function abspalten(koeff, r) {
  const q = [];
  let s = NULL;
  for (let i = 0; i < koeff.length - 1; i++) {
    s = Z.add(Z.mul(s, r), koeff[i]);
    q.push(s);
  }
  return q;
}

/// positive Teiler einer Ganzzahl (BigInt), höchstens bis 10¹² sinnvoll
function teiler(n) {
  n = n < 0n ? -n : n;
  if (n === 0n || n > 10n ** 12n) return null;
  const t = [];
  const m = Number(n);
  for (let i = 1; i * i <= m; i++) {
    if (m % i === 0) {
      t.push(BigInt(i));
      if (i * i !== m) t.push(BigInt(m / i));
    }
  }
  return t;
}

/// rationale Nullstellen (Satz über rationale Nullstellen); koeff: rationale Reals
function rationaleNullstellen(koeff) {
  if (!koeff.every((a) => a.t === 'q')) return [];
  // auf ganze Zahlen bringen
  let kgv = 1n;
  for (const a of koeff) kgv = (kgv / Z.ggT(kgv, a.d)) * a.d;
  let ganz = koeff.map((a) => (a.n * kgv) / a.d);
  // Nullstelle 0 abspalten
  const erg = [];
  while (ganz.length > 1 && ganz[ganz.length - 1] === 0n) {
    erg.push(NULL);
    ganz = ganz.slice(0, -1);
  }
  if (ganz.length <= 1) return erg;
  const pT = teiler(ganz[ganz.length - 1]), qT = teiler(ganz[0]);
  if (!pT || !qT) return erg;
  const kandidaten = new Map();
  for (const p of pT) for (const q of qT) for (const v of [Q(p, q), Q(-p, q)]) kandidaten.set(Z.schluessel(v), v);
  let rest = ganz.map((x) => Q(x));
  for (const v of kandidaten.values()) {
    // mehrfache Nullstellen: so lange abspalten, wie es geht
    while (rest.length > 1 && Z.istNull(hornerR(rest, v))) {
      erg.push(v);
      rest = abspalten(rest, v);
    }
  }
  return erg;
}

/// numerische Nullstellen (Aberth/Durand-Kerner) eines Polynoms mit double-Koeffizienten
export function nullstellenNumerisch(k) {
  const n = k.length - 1;
  const a = k.map((x) => x / k[0]);
  // Startwerte auf einem Kreis
  const radius = 1 + Math.max(...a.slice(1).map(Math.abs));
  let z = Array.from({ length: n }, (_, i) => {
    const w = (2 * Math.PI * i) / n + 0.4;
    return [radius * Math.cos(w), radius * Math.sin(w)];
  });
  const cmul = (p, q) => [p[0] * q[0] - p[1] * q[1], p[0] * q[1] + p[1] * q[0]];
  const cdiv = (p, q) => { const d = q[0] * q[0] + q[1] * q[1]; return [(p[0] * q[0] + p[1] * q[1]) / d, (p[1] * q[0] - p[0] * q[1]) / d]; };
  const pw = (x) => { let s = [1, 0]; for (let i = 1; i <= n; i++) s = [s[0] * x[0] - s[1] * x[1] + a[i], s[0] * x[1] + s[1] * x[0]]; return s; };
  for (let it = 0; it < 500; it++) {
    let maxSchritt = 0;
    const neu = z.map((zi, i) => {
      let nenner = [1, 0];
      z.forEach((zj, j) => { if (j !== i) nenner = cmul(nenner, [zi[0] - zj[0], zi[1] - zj[1]]); });
      const d = cdiv(pw(zi), nenner);
      maxSchritt = Math.max(maxSchritt, Math.hypot(d[0], d[1]));
      return [zi[0] - d[0], zi[1] - d[1]];
    });
    z = neu;
    if (maxSchritt < 1e-15 * radius) break;
  }
  // Newton-Nachbesserung
  const dk = a.slice(0, -1).map((c, i) => c * (n - i));
  const dw = (x) => { let s = [0, 0]; for (let i = 0; i < n; i++) s = [s[0] * x[0] - s[1] * x[1] + dk[i], s[0] * x[1] + s[1] * x[0]]; return s; };
  z = z.map((x) => {
    for (let it = 0; it < 4; it++) {
      const f = pw(x), fs = dw(x);
      if (fs[0] === 0 && fs[1] === 0) break;
      const d = cdiv(f, fs);
      x = [x[0] - d[0], x[1] - d[1]];
    }
    return x;
  });
  return z;
}

/// Quadratische Gleichung exakt: Lösungen als Real oder Komplex
function quadratisch(a, b, c) {
  const disk = Z.sub(Z.mul(b, b), Z.mul(Q(4n), Z.mul(a, c)));
  const zweiA = Z.mul(Q(2n), a);
  const vz = Z.vorzeichen(disk);
  const nahNull = !Z.istExakt(disk) && Math.abs(Z.zahl(disk)) < 1e-14 * Math.max(1, Z.zahl(Z.mul(b, b)));
  if (vz === 0 || nahNull) return [Z.div(Z.neg(b), zweiA)];
  if (vz > 0) {
    const w = Z.wurzel(disk);
    return [Z.div(Z.add(Z.neg(b), w), zweiA), Z.div(Z.sub(Z.neg(b), w), zweiA)];
  }
  const re = Z.div(Z.neg(b), zweiA);
  const im = Z.betrag(Z.div(Z.wurzel(Z.neg(disk)), zweiA));
  return [K.C(re, im), K.C(re, Z.neg(im))];
}

/// Polynomgleichung a xⁿ + … = 0 (Grad 2–4)
/// → { loesungen: [Real | Komplex], extremum?: { art: 'min'|'max', x, y } }
export function polynom(koeff, mitKomplex = true) {
  if (Z.istNull(koeff[0])) throw fehler('math');
  const grad = koeff.length - 1;
  let loes;
  if (grad === 2) loes = quadratisch(...koeff);
  else {
    // rationale Nullstellen exakt abspalten, Rest quadratisch exakt oder numerisch
    const rat = rationaleNullstellen(koeff);
    let rest = koeff;
    const exakt = [];
    for (const r of rat) {
      if (rest.length <= 1) break;
      if (Z.istNull(hornerR(rest, r))) { exakt.push(r); rest = abspalten(rest, r); }
    }
    loes = [...exakt];
    if (rest.length === 3) loes.push(...quadratisch(...rest));
    else if (rest.length > 3) {
      const num = nullstellenNumerisch(rest.map(Z.zahl));
      for (const [re, im] of num) {
        const skala = Math.max(1, Math.hypot(re, im));
        if (Math.abs(im) < 1e-9 * skala) loes.push(D(sauber(re)));
        else loes.push(K.C(D(sauber(re)), D(im)));
      }
    } else if (rest.length === 2) loes.push(Z.div(Z.neg(rest[1]), rest[0]));
  }
  // doppelte Lösungen nur einmal, reelle absteigend, dann komplexe (+ Imaginärteil zuerst)
  const reell = [], komplex = [];
  for (const l of loes) {
    if (l.t === 'c' && !K.istReell(l)) komplex.push(l);
    else reell.push(l.t === 'c' ? l.re : l);
  }
  const einmal = [];
  for (const r of reell) if (!einmal.some((x) => Z.gleich(x, r) || Math.abs(Z.zahl(x) - Z.zahl(r)) < 1e-12 * Math.max(1, Math.abs(Z.zahl(r))))) einmal.push(r);
  einmal.sort((x, y) => Z.zahl(y) - Z.zahl(x));
  const kEinmal = [];
  for (const c of komplex) if (!kEinmal.some((x) => Math.abs(Z.zahl(x.re) - Z.zahl(c.re)) < 1e-12 && Math.abs(Z.zahl(x.im) - Z.zahl(c.im)) < 1e-12)) kEinmal.push(c);
  kEinmal.sort((x, y) => Z.zahl(x.re) - Z.zahl(y.re) || Z.zahl(y.im) - Z.zahl(x.im));
  const erg = { loesungen: mitKomplex ? [...einmal, ...kEinmal] : einmal, keineReelle: !mitKomplex && einmal.length === 0 };
  if (grad === 2) {
    const [a, b, c] = koeff;
    const x = Z.div(Z.neg(b), Z.mul(Q(2n), a));
    const y = Z.sub(c, Z.div(Z.mul(b, b), Z.mul(Q(4n), a)));
    erg.extremum = { art: Z.vorzeichen(a) > 0 ? 'min' : 'max', x, y };
  }
  return erg;
}

function sauber(v) {
  const r = Math.round(v);
  if (Math.abs(v - r) < 1e-12 * Math.max(1, Math.abs(r))) return r;
  return v;
}

// MARK: Ungleichungen

/// koeff (Grad 2–4), rel: '>' | '<' | '≥' | '≤' →
/// { art: 'alle' } | { art: 'keine' } | { art: 'intervalle', teile: [{ von, bis, vonZu, bisZu }] }
/// (von/bis: Real oder null für ±∞; vonZu/bisZu: true = Grenze gehört dazu)
export function ungleichung(koeff, rel) {
  if (Z.istNull(koeff[0])) throw fehler('math');
  const { loesungen } = polynom(koeff, true);
  const nst = loesungen.filter((l) => l.t !== 'c');
  nst.sort((x, y) => Z.zahl(x) - Z.zahl(y));
  const f = (x) => Z.zahl(hornerR(koeff, D(x)));
  const gleichZaehlt = rel === '≥' || rel === '≤';
  const groesser = rel === '>' || rel === '≥';
  const passt = (v) => (groesser ? v > 0 : v < 0);
  // Vorzeichen in den Abschnitten zwischen den Nullstellen
  const punkte = nst.map(Z.zahl);
  const proben = [];
  if (punkte.length === 0) proben.push(0);
  else {
    proben.push(punkte[0] - 1 - Math.abs(punkte[0]));
    for (let i = 0; i < punkte.length - 1; i++) proben.push((punkte[i] + punkte[i + 1]) / 2);
    proben.push(punkte[punkte.length - 1] + 1 + Math.abs(punkte[punkte.length - 1]));
  }
  const abschnittOk = proben.map((p) => passt(f(p)));
  // Abschnitte i: (punkte[i-1], punkte[i])
  const teile = [];
  let offen = null;
  for (let i = 0; i < abschnittOk.length; i++) {
    const von = i === 0 ? null : nst[i - 1];
    const bis = i === abschnittOk.length - 1 ? null : nst[i];
    if (abschnittOk[i]) {
      if (offen) { offen.bis = bis; offen.bisZu = gleichZaehlt; }
      else offen = { von, bis, vonZu: gleichZaehlt, bisZu: gleichZaehlt };
      // Nullstelle am Ende: bei ≥/≤ gehört sie dazu; bei > / < trennt sie (auch doppelte)
      if (bis !== null && !gleichZaehlt) { teile.push(offen); offen = null; }
    } else {
      if (offen) { teile.push(offen); offen = null; }
      // einzelne Nullstelle bei ≥/≤, wenn beide Nachbarabschnitte nicht passen
      if (gleichZaehlt && bis !== null && !abschnittOk[i + 1]) teile.push({ von: bis, bis: bis, vonZu: true, bisZu: true, punkt: true });
    }
  }
  if (offen) teile.push(offen);
  if (teile.length === 0) return { art: 'keine' };
  if (teile.length === 1 && teile[0].von === null && teile[0].bis === null) return { art: 'alle' };
  return { art: 'intervalle', teile };
}

// MARK: Verhältnisse

/// A:B = X:D → X = A·D/B;  A:B = C:X → X = B·C/A
export function verhaeltnis(art, a, b, c, d) {
  if ([a, b, art === 'X:D' ? d : c].some(Z.istNull)) throw fehler('math');
  if (art === 'X:D') return Z.div(Z.mul(a, d), b);
  return Z.div(Z.mul(b, c), a);
}

// MARK: SOLVE (Newton-Verfahren)

/// f: double → double; Start x0 → { x, lr } oder Fehler 'solve'
export function newton(f, x0) {
  let x = x0;
  let fx = f(x);
  for (let it = 0; it < 200; it++) {
    if (fx === 0) return { x, lr: 0 };
    const h = 1e-6 * Math.max(1, Math.abs(x));
    let fs = (f(x + h) - f(x - h)) / (2 * h);
    if (!Number.isFinite(fs) || fs === 0) {
      // flache Stelle: etwas weiter weg probieren
      const h2 = 1e-3 * Math.max(1, Math.abs(x));
      fs = (f(x + h2) - f(x - h2)) / (2 * h2);
      if (!Number.isFinite(fs) || fs === 0) { x += h2 * 10; fx = f(x); continue; }
    }
    let schritt = fx / fs;
    // Schrittweitensteuerung: nicht schlechter werden
    let xn = x - schritt, fn;
    for (let k = 0; k < 30; k++) {
      try {
        fn = f(xn);
        if (Number.isFinite(fn) && Math.abs(fn) <= Math.abs(fx) * 1.5 + 1e-300) break;
      } catch (e) { /* außerhalb des Definitionsbereichs: Schritt halbieren */ }
      schritt /= 2;
      xn = x - schritt;
      fn = undefined;
    }
    if (fn === undefined) throw fehler('solve');
    const fertig = Math.abs(xn - x) <= 1e-14 * Math.max(1, Math.abs(xn));
    x = xn;
    fx = fn;
    if (Math.abs(x) > 1e100) throw fehler('solve');
    if (fertig) break;
  }
  const skala = Math.max(1e-10, Math.abs(f(x + 1e-6 * Math.max(1, Math.abs(x))) - fx) * 1e4);
  if (!(Math.abs(fx) <= skala * 1e-6 || Math.abs(fx) < 1e-9)) throw fehler('solve');
  return { x: sauber(x), lr: Math.abs(fx) < 1e-14 ? 0 : fx };
}

export { hornerR, EINS };
