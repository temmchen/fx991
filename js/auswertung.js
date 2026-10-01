// auswertung.js – Rechenbaum (parser.js) → Wert. Werte sind
//   Real (zahl.js: q, s, p, d), komplex { t: 'c' }, Matrix { t: 'm' }, Vektor { t: 'v' }
//   oder mehrere Ergebnisse { t: 'multi', namen, werte } (Pol, Rec).
// Der Kontext (ktx) enthält Modus, Winkeleinheit, Variablen, Ans, Zahlenformat, Matrizen/Vektoren
// und die Statistikdaten.

import * as Z from './zahl.js';
import * as K from './komplex.js';
import * as M from './matrix.js';
import { konstantenWert, umrechnen, PRAEFIX_EXPONENT } from './konstanten.js';
import { normalP, normalQ, normalR } from './verteilung.js';

const { Q, D, NULL, EINS, fehler } = Z;

export const istReal = (v) => !!v && (v.t === 'q' || v.t === 's' || v.t === 'p' || v.t === 'd');

/// Kontext mit Voreinstellungen
export function kontext(teile = {}) {
  return {
    modus: 'COMP',
    winkel: 'D',
    vars: {},
    ans: NULL,
    format: { art: 'norm', stellen: 1 },
    mat: {},
    vct: {},
    stat: null,
    lokal: null,
    zuweisen(n, w) { this.vars[n] = w; },
    ...teile,
  };
}

// MARK: Typprüfungen

function reell(v) {
  if (istReal(v)) return v;
  if (v && v.t === 'c') {
    if (K.istReell(v)) return v.re;
    throw fehler('math');
  }
  if (v && v.t === 'multi') throw fehler('syntax');
  throw fehler('syntax');
}

function vereinfacheK(c) {
  return K.istReell(c) ? c.re : c;
}

const komplexModus = (ktx) => ktx.modus === 'CMPLX';

// MARK: Operationen mit Typverteilung

export function plus(a, b, minus = false) {
  if (istReal(a) && istReal(b)) return minus ? Z.sub(a, b) : Z.add(a, b);
  if ((a.t === 'c' || istReal(a)) && (b.t === 'c' || istReal(b))) {
    const x = K.alsKomplex(a), y = K.alsKomplex(b);
    return vereinfacheK(minus ? K.sub(x, y) : K.add(x, y));
  }
  if (a.t === 'm' && b.t === 'm') return M.addM(a, b, minus);
  if (a.t === 'v' && b.t === 'v') return M.addV(a, b, minus);
  if (a.t === 'm' || a.t === 'v' || b.t === 'm' || b.t === 'v') throw fehler('syntax');
  throw fehler('syntax');
}

export function mal(a, b, kreuz = true) {
  if (istReal(a) && istReal(b)) return Z.mul(a, b);
  if ((a.t === 'c' || istReal(a)) && (b.t === 'c' || istReal(b))) return vereinfacheK(K.mul(K.alsKomplex(a), K.alsKomplex(b)));
  if (a.t === 'm' && b.t === 'm') return M.mulM(a, b);
  if (a.t === 'm' && istReal(b)) return M.skalarM(b, a);
  if (istReal(a) && b.t === 'm') return M.skalarM(a, b);
  if (a.t === 'v' && b.t === 'v') {
    if (!kreuz) throw fehler('syntax');
    return M.kreuz(a, b);
  }
  if (a.t === 'v' && istReal(b)) return M.skalarV(b, a);
  if (istReal(a) && b.t === 'v') return M.skalarV(a, b);
  if (a.t === 'm' && b.t === 'v') {
    // Matrix × Vektor (Spaltenvektor)
    if (a.s !== b.e.length) throw fehler('dimension');
    return M.vektor(a.e.map((r) => r.reduce((s, x, j) => Z.add(s, Z.mul(x, b.e[j])), NULL)));
  }
  throw fehler('syntax');
}

export function durch(a, b) {
  if (istReal(a) && istReal(b)) return Z.div(a, b);
  if ((a.t === 'c' || istReal(a)) && (b.t === 'c' || istReal(b))) return vereinfacheK(K.div(K.alsKomplex(a), K.alsKomplex(b)));
  if (a.t === 'm' && istReal(b)) return M.skalarM(Z.kehrwert(b), a);
  if (a.t === 'v' && istReal(b)) return M.skalarV(Z.kehrwert(b), a);
  throw fehler('syntax');
}

export function negiere(a) {
  if (istReal(a)) return Z.neg(a);
  if (a.t === 'c') return K.neg(a);
  if (a.t === 'm') return M.skalarM(Q(-1n), a);
  if (a.t === 'v') return M.skalarV(Q(-1n), a);
  throw fehler('syntax');
}

export function hoch(a, b, ktx) {
  if (a.t === 'm') {
    const k = Z.alsGanzzahl(reell(b));
    if (k === null || k < -1n || k > 64n) throw fehler('math');
    return M.potenzM(a, Number(k));
  }
  if (a.t === 'v' || a.t === 'multi') throw fehler('syntax');
  if (a.t === 'c' || (b && b.t === 'c')) return vereinfacheK(K.potenz(K.alsKomplex(a), b));
  if (komplexModus(ktx) && Z.vorzeichen(a) < 0 && Z.alsGanzzahl(b) === null) {
    return vereinfacheK(K.potenz(K.alsKomplex(a), b));
  }
  return Z.potenz(a, reell(b));
}

function wurzelV(a, ktx) {
  if (a.t === 'c') return vereinfacheK(K.wurzel(a));
  const r = reell(a);
  if (Z.vorzeichen(r) < 0 && komplexModus(ktx)) return K.wurzel(K.alsKomplex(r));
  return Z.wurzel(r);
}

function betragV(a) {
  if (istReal(a)) return Z.betrag(a);
  if (a.t === 'c') return K.betrag(a);
  if (a.t === 'm') return M.betragM(a);
  if (a.t === 'v') return M.laenge(a);
  throw fehler('syntax');
}

// MARK: Auswerten

export function werte(k, ktx) {
  switch (k.a) {
    case 'num': return zahlWert(k);
    case 'dms': {
      const t = k.teile.map(zahlWert);
      return Z.ausGMS(t[0], t[1] || NULL, t[2] || NULL);
    }
    case 'var': {
      if (ktx.lokal && k.n in ktx.lokal) return ktx.lokal[k.n];
      return ktx.vars[k.n] || NULL;
    }
    case 'ans': return ktx.ans || NULL;
    case 'ran': return Z.zufall();
    case 'k': return konstante(k.n, ktx);
    case 'mat': {
      const m = ktx.mat[k.n];
      if (!m) throw fehler('dimension');
      return m;
    }
    case 'vct': {
      const v = ktx.vct[k.n];
      if (!v) throw fehler('dimension');
      return v;
    }
    case 'stat': {
      if (!ktx.stat) throw fehler('syntax');
      return ktx.stat.wert(k.n);
    }
    case 'klammer': return werte(k.x, ktx);
    case 'neg': return negiere(werte(k.x, ktx));
    case 'pre': throw fehler('syntax');
    case 'bin': return binaer(k, ktx);
    case 'post': return nachgestellt(k, ktx);
    case 'pow': return hoch(werte(k.b, ktx), werte(k.e, ktx), ktx);
    case 'fn': return funktion(k, ktx);
    case 'T': return schablone(k, ktx);
    case 'rel': throw fehler('syntax');
    default: throw fehler('syntax');
  }
}

function zahlWert(k) {
  let w;
  if (k.periode !== undefined) w = Z.ausPeriode(k.text, k.periode);
  else {
    const ziffern = k.text.replace('.', '').replace(/^0+/, '');
    if (ziffern.length > 15) {
      // mehr Stellen als der Rechner intern hat: auf 15 Stellen runden (Näherung)
      w = D(parseFloat(parseFloat(k.text).toPrecision(15)));
    } else w = Z.ausDezimal(k.text);
  }
  if (k.exp !== undefined) {
    const e = BigInt(k.exp);
    w = Z.mul(w, Z.zehnHoch(Q(e)));
  }
  return w;
}

function konstante(n, ktx) {
  if (n === 'pi') return Z.PI;
  if (n === 'e') return Z.E_NAEHERUNG;
  if (n === 'i') {
    if (!komplexModus(ktx)) throw fehler('syntax');
    return K.I;
  }
  const w = konstantenWert(n);
  if (!w) throw fehler('syntax');
  return w;
}

function binaer(k, ktx) {
  const a = werte(k.l, ktx), b = werte(k.r, ktx);
  if (a.t === 'multi' || b.t === 'multi') throw fehler('syntax');
  switch (k.op) {
    case '+': return plus(a, b);
    case '-': return plus(a, b, true);
    case '×': return mal(a, b);
    case 'imul': return mal(a, b);
    case '÷': return durch(a, b);
    case 'nPr': return Z.nPr(reell(a), reell(b));
    case 'nCr': return Z.nCr(reell(a), reell(b));
    case '∠': {
      if (!komplexModus(ktx)) throw fehler('syntax');
      return vereinfacheK(K.polar(reell(a), reell(b), ktx.winkel));
    }
    case '·': {
      if (a.t === 'v' && b.t === 'v') return M.punkt(a, b);
      throw fehler('syntax');
    }
    default: throw fehler('syntax');
  }
}

function nachgestellt(k, ktx) {
  const x = werte(k.x, ktx);
  if (x.t === 'multi') throw fehler('syntax');
  const op = k.op;
  switch (op) {
    case '²': return hoch(x, Q(2n), ktx);
    case '³': return hoch(x, Q(3n), ktx);
    case '⁻¹': {
      if (x.t === 'm') return M.inverse(x);
      return durch(EINS, x);
    }
    case '!': return Z.fakultaet(reell(x));
    case '%': return mal(x, Q(1n, 100n));
    case '°': return winkelAus(reell(x), 'D', ktx.winkel);
    case 'r': return winkelAus(reell(x), 'R', ktx.winkel);
    case 'g': return winkelAus(reell(x), 'G', ktx.winkel);
    case 'dms': return reell(x);
    case 't': {
      if (!ktx.stat) throw fehler('syntax');
      return ktx.stat.normiert(reell(x));
    }
    case 'xhut': case 'yhut': case 'xhut1': case 'xhut2':
      if (!ktx.stat) throw fehler('syntax');
      return ktx.stat.schaetz(op, reell(x));
    case '▸polar': case '▸rechtw':
      if (!komplexModus(ktx)) throw fehler('syntax');
      return x;
    default:
      if (op.startsWith('eng:')) {
        const e = PRAEFIX_EXPONENT[op.slice(4)];
        if (e === undefined) throw fehler('syntax');
        return mal(x, Z.zehnHoch(Q(BigInt(e))));
      }
      if (op.startsWith('conv:')) return umrechnen(op.slice(5), reell(x), Z);
      throw fehler('syntax');
  }
}

/// Winkel in der Einheit „von“ → aktuelle Einheit
function winkelAus(x, von, nach) {
  if (von === nach) return x;
  // zuerst in Grad (exakt, wo möglich)
  let grad;
  if (von === 'D') grad = x;
  else if (von === 'R') grad = Z.div(Z.mul(x, Q(180n)), Z.PI);
  else grad = Z.mul(x, Q(9n, 10n));
  if (nach === 'D') return grad;
  if (nach === 'R') return Z.mul(grad, Z.P(1n, 180n));
  return Z.mul(grad, Q(10n, 9n));
}

function funktion(k, ktx) {
  const f = k.f;
  const a = k.args.map((x) => werte(x, ktx));
  if (a.some((v) => v.t === 'multi')) throw fehler('syntax');
  const w = ktx.winkel;
  switch (f) {
    case 'sin': return Z.sin(reell(a[0]), w);
    case 'cos': return Z.cos(reell(a[0]), w);
    case 'tan': return Z.tan(reell(a[0]), w);
    case 'asin': return Z.asin(reell(a[0]), w);
    case 'acos': return Z.acos(reell(a[0]), w);
    case 'atan': return Z.atan(reell(a[0]), w);
    case 'sinh': return Z.sinh(reell(a[0]));
    case 'cosh': return Z.cosh(reell(a[0]));
    case 'tanh': return Z.tanh(reell(a[0]));
    case 'asinh': return Z.asinh(reell(a[0]));
    case 'acosh': return Z.acosh(reell(a[0]));
    case 'atanh': return Z.atanh(reell(a[0]));
    case 'log':
      if (a.length === 1) return Z.log10(reell(a[0]));
      return Z.logBasis(reell(a[0]), reell(a[1]));
    case 'ln': return Z.ln(reell(a[0]));
    case 'Pol': {
      const x = reell(a[0]), y = reell(a[1]);
      const r = Z.wurzel(Z.add(Z.mul(x, x), Z.mul(y, y)));
      const th = Z.winkel(x, y, w);
      ktx.zuweisen('x', r);
      ktx.zuweisen('y', th);
      return { t: 'multi', namen: ['r', 'θ'], werte: [r, th] };
    }
    case 'Rec': {
      const r = reell(a[0]), th = reell(a[1]);
      const x = Z.mul(r, Z.cos(th, w)), y = Z.mul(r, Z.sin(th, w));
      ktx.zuweisen('x', x);
      ktx.zuweisen('y', y);
      return { t: 'multi', namen: ['x', 'y'], werte: [x, y] };
    }
    case 'Rnd': {
      if (a[0].t === 'c') return vereinfacheK(K.C(Z.runde(a[0].re, ktx.format), Z.runde(a[0].im, ktx.format)));
      return Z.runde(reell(a[0]), ktx.format);
    }
    case 'RanInt': return Z.zufallGanz(reell(a[0]), reell(a[1]));
    case 'Abs': return betragV(a[0]);
    case 'arg': return K.arg(K.alsKomplex(a[0]), w);
    case 'Conjg': return vereinfacheK(K.konj(K.alsKomplex(a[0])));
    case 'ReP': return K.alsKomplex(a[0]).re;
    case 'ImP': return K.alsKomplex(a[0]).im;
    case 'det': if (a[0].t !== 'm') throw fehler('syntax'); return M.determinante(a[0]);
    case 'Trn': if (a[0].t !== 'm') throw fehler('syntax'); return M.transponiert(a[0]);
    case 'Identity': return M.einheit(reell(a[0]));
    case 'Ref': if (a[0].t !== 'm') throw fehler('syntax'); return M.stufenform(a[0], false);
    case 'Rref': if (a[0].t !== 'm') throw fehler('syntax'); return M.stufenform(a[0], true);
    case 'UnitV': if (a[0].t !== 'v') throw fehler('syntax'); return M.einheitsvektor(a[0]);
    case 'Angle':
      if (a[0].t !== 'v' || a[1].t !== 'v') throw fehler('syntax');
      return M.winkelV(a[0], a[1], w);
    case 'P': return D(normalP(Z.zahl(reell(a[0]))));
    case 'Q': return D(normalQ(Z.zahl(reell(a[0]))));
    case 'R': return D(normalR(Z.zahl(reell(a[0]))));
    default: throw fehler('syntax');
  }
}

function schablone(k, ktx) {
  const s = k.s;
  switch (k.v) {
    case 'frac': return durch(werte(s[0], ktx), werte(s[1], ktx));
    case 'mixed': {
      const g = reell(werte(s[0], ktx)), z = reell(werte(s[1], ktx)), n = reell(werte(s[2], ktx));
      const bruch = Z.div(z, n);
      return Z.vorzeichen(g) < 0 ? Z.sub(g, bruch) : Z.add(g, bruch);
    }
    case 'sqrt': return wurzelV(werte(s[0], ktx), ktx);
    case 'cbrt': return Z.kubikwurzel(reell(werte(s[0], ktx)));
    case 'root': return Z.nteWurzel(reell(werte(s[0], ktx)), reell(werte(s[1], ktx)));
    case 'pow10': return Z.zehnHoch(reell(werte(s[0], ktx)));
    case 'epow': return Z.exp(reell(werte(s[0], ktx)));
    case 'log': return Z.logBasis(reell(werte(s[0], ktx)), reell(werte(s[1], ktx)));
    case 'abs': return betragV(werte(s[0], ktx));
    case 'int': return integral(s[0], reell(werte(s[1], ktx)), reell(werte(s[2], ktx)), ktx);
    case 'diff': return ableitungKnoten(s[0], reell(werte(s[1], ktx)), ktx);
    case 'sum': return summe(s[0], reell(werte(s[1], ktx)), reell(werte(s[2], ktx)), ktx);
    default: throw fehler('syntax');
  }
}

// MARK: Analysis (numerisch wie beim Rechner)

/// Funktion t ↦ f(t) (double) mit x als Laufvariable
function alsFunktion(knoten, ktx) {
  const alt = ktx.lokal;
  return (t) => {
    ktx.lokal = { ...(alt || {}), x: D(t) };
    try {
      return Z.zahl(reell(werte(knoten, ktx)));
    } finally {
      ktx.lokal = alt;
    }
  };
}

const XGK = [0.991455371120812639206854697526329, 0.949107912342758524526189684047851,
  0.864864423359769072789712788640926, 0.741531185599394439863864773280788,
  0.586087235467691130294144845693013, 0.405845151377397166906606412076961,
  0.207784955007898467600689403773245, 0];
const WGK = [0.022935322010529224963732008058970, 0.063092092629978553290700663189204,
  0.104790010322250183839876322541518, 0.140653259715525918745189590510238,
  0.169004726639267902826583426598550, 0.190350578064785409913256402421014,
  0.204432940075298892414161999234649, 0.209482141084727828012999174891714];
const WG = [0.129484966168869693270611432679082, 0.279705391489276667901467771423780,
  0.381830050505118944950369775488975, 0.417959183673469387755102040816327];

function gk15(f, a, b) {
  const c = (a + b) / 2, h = (b - a) / 2;
  const fc = f(c);
  let k = fc * WGK[7], g = fc * WG[3];
  for (let j = 0; j < 7; j++) {
    const x = h * XGK[j];
    const s = f(c - x) + f(c + x);
    k += WGK[j] * s;
    if (j % 2 === 1) g += WG[(j - 1) / 2] * s;
  }
  return { wert: k * h, fehler: Math.abs((k - g) * h) };
}

/// Integral mit adaptiver Gauß-Kronrod-Regel (G7/K15)
export function integriere(f, a, b) {
  if (a === b) return 0;
  let intervalle = [{ a, b, ...gk15(f, a, b) }];
  let auswertungen = 15;
  for (let schritt = 0; schritt < 400; schritt++) {
    let summe = 0, fehlerSumme = 0, schlechtestes = 0;
    intervalle.forEach((iv, i) => {
      summe += iv.wert;
      fehlerSumme += iv.fehler;
      if (iv.fehler > intervalle[schlechtestes].fehler) schlechtestes = i;
    });
    if (fehlerSumme <= Math.max(1e-13 * Math.abs(summe), 1e-15)) return summe;
    const iv = intervalle[schlechtestes];
    const m = (iv.a + iv.b) / 2;
    if (m === iv.a || m === iv.b) return summe;
    intervalle.splice(schlechtestes, 1, { a: iv.a, b: m, ...gk15(f, iv.a, m) }, { a: m, b: iv.b, ...gk15(f, m, iv.b) });
    auswertungen += 30;
    if (auswertungen > 30000) break;
  }
  const summe = intervalle.reduce((s, iv) => s + iv.wert, 0);
  const fehlerSumme = intervalle.reduce((s, iv) => s + iv.fehler, 0);
  if (fehlerSumme > 1e-5 * Math.max(1, Math.abs(summe))) throw fehler('zeit');
  return summe;
}

function integral(f, a, b, ktx) {
  const g = alsFunktion(f, ktx);
  let wert;
  try {
    wert = integriere(g, Z.zahl(a), Z.zahl(b));
  } catch (e) {
    if (e instanceof Z.RechenFehler) throw e;
    throw fehler('math');
  }
  return D(sauber(wert));
}

/// Ableitung (Ridders: zentrale Differenzen mit Extrapolation)
export function ableitung(f, x0) {
  let h0 = Math.max(1e-3, 0.1 * Math.abs(x0));
  for (let versuch = 0; versuch < 6; versuch++, h0 /= 10) {
    try {
      const CON = 1.4, CON2 = CON * CON;
      let h = h0, err = Infinity, ans = NaN;
      const a = [[(f(x0 + h) - f(x0 - h)) / (2 * h)]];
      for (let i = 1; i < 12; i++) {
        h /= CON;
        a[i] = [(f(x0 + h) - f(x0 - h)) / (2 * h)];
        let fac = CON2;
        for (let j = 1; j <= i; j++) {
          a[i][j] = (a[i][j - 1] * fac - a[i - 1][j - 1]) / (fac - 1);
          fac *= CON2;
          const errt = Math.max(Math.abs(a[i][j] - a[i][j - 1]), Math.abs(a[i][j] - a[i - 1][j - 1]));
          if (errt <= err) { err = errt; ans = a[i][j]; }
        }
        if (Math.abs(a[i][i] - a[i - 1][i - 1]) >= 2 * err) break;
      }
      if (Number.isFinite(ans)) return ans;
    } catch (e) {
      if (!(e instanceof Z.RechenFehler)) throw e;
    }
  }
  throw fehler('math');
}

function ableitungKnoten(f, a, ktx) {
  const g = alsFunktion(f, ktx);
  return D(sauber(ableitung(g, Z.zahl(a))));
}

/// Rundungsrauschen an ganzen Zahlen und an 0 entfernen (Darstellung wie beim Rechner)
function sauber(v) {
  if (Math.abs(v) < 1e-12) return Math.abs(v) < 1e-14 ? 0 : v;
  const r = Math.round(v);
  if (r !== 0 && Math.abs(v - r) < 1e-11 * Math.abs(r)) return r;
  return v;
}

/// Σ: exakt, solange die Glieder exakt sind
function summe(f, a, b, ktx) {
  const von = Z.alsGanzzahl(a), bis = Z.alsGanzzahl(b);
  if (von === null || bis === null) throw fehler('math');
  if (bis < von) throw fehler('math');
  if (bis - von > 200000n) throw fehler('zeit');
  const alt = ktx.lokal;
  let s = NULL;
  try {
    for (let k = von; k <= bis; k++) {
      ktx.lokal = { ...(alt || {}), x: Q(k) };
      s = plus(s, werte(f, ktx));
    }
  } finally {
    ktx.lokal = alt;
  }
  return s;
}

// MARK: Hilfen für den Rechner

/// Zeigt das Ergebnis eines Ausdrucks in Grad-Minuten-Sekunden? (nur + − × ÷ mit °'"-Werten)
export function istGMSAusdruck(k) {
  switch (k.a) {
    case 'dms': return true;
    case 'post': return k.op === 'dms';
    case 'klammer': return istGMSAusdruck(k.x);
    case 'neg': return istGMSAusdruck(k.x);
    case 'bin':
      if (!['+', '-', '×', '÷', 'imul'].includes(k.op)) return false;
      return (istGMSAusdruck(k.l) && nurZahlen(k.r)) || (istGMSAusdruck(k.r) && nurZahlen(k.l));
    default: return false;
  }
}

function nurZahlen(k) {
  switch (k.a) {
    case 'num': case 'dms': return true;
    case 'post': return k.op === 'dms' && nurZahlen(k.x);
    case 'klammer': case 'neg': return nurZahlen(k.x);
    case 'bin': return ['+', '-', '×', '÷', 'imul'].includes(k.op) && nurZahlen(k.l) && nurZahlen(k.r);
    default: return false;
  }
}

/// Ausgabeform für komplexe Ergebnisse, falls ▸r∠θ oder ▸a+bi am Ende steht
export function komplexFormIn(k) {
  if (k.a === 'post' && k.op === '▸polar') return 'polar';
  if (k.a === 'post' && k.op === '▸rechtw') return 'rechtw';
  return null;
}

/// Gleichung/Relation auswerten: { links, rechts } (für SOLVE, Prüfen)
export function seiten(k, ktx) {
  if (k.a !== 'rel') return { links: werte(k, ktx), rechts: NULL, op: '=' };
  return { links: werte(k.l, ktx), rechts: werte(k.r, ktx), op: k.op };
}
