// statistik.js – Statistik (Modus 6): Daten, Kennwerte, Regressionen, Schätzwerte.
// Typen: '1var' (eine Variable), 'lin' y=a+bx, 'quad' y=a+bx+cx², 'log' y=a+b·ln(x),
// 'eexp' y=a·e^(bx), 'abexp' y=a·b^x, 'pot' y=a·x^b, 'inv' y=a+b/x.

import * as Z from './zahl.js';
import { lgs } from './gleichungen.js';

const { Q, D, NULL, EINS, fehler } = Z;

export const TYPEN = ['1var', 'lin', 'quad', 'log', 'eexp', 'abexp', 'pot', 'inv'];
export const TYP_FORMEL = {
  '1var': '1-Variable', lin: 'y=a+bx', quad: 'y=a+bx+cx²', log: 'y=a+b·ln(x)',
  eexp: 'y=a·e^(bx)', abexp: 'y=a·b^x', pot: 'y=a·x^b', inv: 'y=a+b/x',
};

/// Anzeigenamen der Statistikvariablen
export const STAT_NAMEN = {
  n: 'n', xquer: 'x̄', sigx: 'σx', sx: 'sx', sigx2: 'σ²x', sx2: 's²x',
  yquer: 'ȳ', sigy: 'σy', sy: 'sy', sigy2: 'σ²y', sy2: 's²y',
  sumx: 'Σx', sumx2: 'Σx²', sumy: 'Σy', sumy2: 'Σy²', sumxy: 'Σxy', sumx3: 'Σx³', sumx2y: 'Σx²y', sumx4: 'Σx⁴',
  minx: 'min(x)', maxx: 'max(x)', miny: 'min(y)', maxy: 'max(y)', Q1: 'Q₁', Med: 'Med', Q3: 'Q₃',
  a: 'a', b: 'b', c: 'c', r: 'r',
};

/// Wurzel als Zahl für Kennwerte (wie beim Rechner: dezimal, nur Quadratzahlen exakt)
function wurzelDezimal(x) {
  if (Z.vorzeichen(x) < 0) {
    if (Math.abs(Z.zahl(x)) < 1e-12) return NULL;
    throw fehler('math');
  }
  const w = Z.wurzel(x);
  return w.t === 's' || w.t === 'p' ? D(Z.zahl(w)) : w;
}

export class Statistik {
  constructor(typ = '1var') {
    this.typ = typ;
    this.daten = []; // { x, y, f } (Reals)
    this.cache = null;
  }

  get zweiVar() { return this.typ !== '1var'; }

  setzeTyp(typ) {
    if ((typ === '1var') !== (this.typ === '1var')) this.daten = [];
    this.typ = typ;
    this.cache = null;
  }

  geaendert() { this.cache = null; }

  /// gültige Zeilen (x gesetzt; bei zwei Variablen auch y)
  zeilen() {
    return this.daten.filter((z) => z.x && (!this.zweiVar || z.y));
  }

  kennwerte() {
    if (this.cache) return this.cache;
    const zeilen = this.zeilen();
    if (zeilen.length === 0) throw fehler('math');
    const f = (z) => z.f || EINS;
    let n = NULL;
    const s = { sumx: NULL, sumx2: NULL, sumy: NULL, sumy2: NULL, sumxy: NULL, sumx3: NULL, sumx2y: NULL, sumx4: NULL };
    for (const z of zeilen) {
      const h = f(z);
      if (Z.vorzeichen(h) < 0) throw fehler('math');
      n = Z.add(n, h);
      const x = z.x, x2 = Z.mul(x, x);
      s.sumx = Z.add(s.sumx, Z.mul(h, x));
      s.sumx2 = Z.add(s.sumx2, Z.mul(h, x2));
      s.sumx3 = Z.add(s.sumx3, Z.mul(h, Z.mul(x2, x)));
      s.sumx4 = Z.add(s.sumx4, Z.mul(h, Z.mul(x2, x2)));
      if (this.zweiVar) {
        const y = z.y;
        s.sumy = Z.add(s.sumy, Z.mul(h, y));
        s.sumy2 = Z.add(s.sumy2, Z.mul(h, Z.mul(y, y)));
        s.sumxy = Z.add(s.sumxy, Z.mul(h, Z.mul(x, y)));
        s.sumx2y = Z.add(s.sumx2y, Z.mul(h, Z.mul(x2, y)));
      }
    }
    if (Z.istNull(n)) throw fehler('math');
    const k = { n, ...s };
    k.xquer = Z.div(s.sumx, n);
    k.sigx2 = Z.sub(Z.div(s.sumx2, n), Z.mul(k.xquer, k.xquer));
    if (Z.vorzeichen(k.sigx2) < 0) k.sigx2 = NULL;
    k.sigx = wurzelDezimal(k.sigx2);
    const n1 = Z.sub(n, EINS);
    if (!Z.istNull(n1)) {
      k.sx2 = Z.div(Z.mul(k.sigx2, n), n1);
      k.sx = wurzelDezimal(k.sx2);
    }
    const xs = zeilen.map((z) => z.x);
    k.minx = xs.reduce((a, b) => (Z.zahl(b) < Z.zahl(a) ? b : a));
    k.maxx = xs.reduce((a, b) => (Z.zahl(b) > Z.zahl(a) ? b : a));
    if (this.zweiVar) {
      k.yquer = Z.div(s.sumy, n);
      k.sigy2 = Z.sub(Z.div(s.sumy2, n), Z.mul(k.yquer, k.yquer));
      if (Z.vorzeichen(k.sigy2) < 0) k.sigy2 = NULL;
      k.sigy = wurzelDezimal(k.sigy2);
      if (!Z.istNull(n1)) {
        k.sy2 = Z.div(Z.mul(k.sigy2, n), n1);
        k.sy = wurzelDezimal(k.sy2);
      }
      const ys = zeilen.map((z) => z.y);
      k.miny = ys.reduce((a, b) => (Z.zahl(b) < Z.zahl(a) ? b : a));
      k.maxy = ys.reduce((a, b) => (Z.zahl(b) > Z.zahl(a) ? b : a));
      Object.assign(k, this.regression(zeilen));
    } else Object.assign(k, this.quartile(zeilen));
    this.cache = k;
    return k;
  }

  /// Median und Quartile (Hälften ohne den Median bei ungerader Anzahl)
  quartile(zeilen) {
    const liste = [];
    for (const z of zeilen) {
      const h = z.f ? Z.alsGanzzahl(z.f) : 1n;
      if (h === null || h > 100000n) return {};
      for (let i = 0n; i < h; i++) liste.push(z.x);
    }
    liste.sort((a, b) => Z.zahl(a) - Z.zahl(b));
    const median = (arr) => {
      const m = arr.length;
      if (m === 0) return NULL;
      if (m % 2 === 1) return arr[(m - 1) / 2];
      return Z.div(Z.add(arr[m / 2 - 1], arr[m / 2]), Q(2n));
    };
    const m = liste.length;
    const unten = liste.slice(0, Math.floor(m / 2));
    const oben = liste.slice(Math.ceil(m / 2));
    return { Med: median(liste), Q1: m > 1 ? median(unten) : liste[0], Q3: m > 1 ? median(oben) : liste[0] };
  }

  /// Regressionskoeffizienten (a, b, c, r) für den gewählten Typ
  regression(zeilen) {
    const typ = this.typ;
    const tx = (x) => {
      if (typ === 'log' || typ === 'pot') { if (Z.vorzeichen(x) <= 0) throw fehler('math'); return Z.ln(x); }
      if (typ === 'inv') return Z.kehrwert(x);
      return x;
    };
    const ty = (y) => {
      if (typ === 'eexp' || typ === 'abexp' || typ === 'pot') { if (Z.vorzeichen(y) <= 0) throw fehler('math'); return Z.ln(y); }
      return y;
    };
    const f = (z) => z.f || EINS;
    if (typ === 'quad') {
      // Normalgleichungen
      let S = Array.from({ length: 5 }, () => NULL), T = Array.from({ length: 3 }, () => NULL);
      for (const z of zeilen) {
        const h = f(z);
        let p = EINS;
        for (let i = 0; i < 5; i++) {
          S[i] = Z.add(S[i], Z.mul(h, p));
          if (i < 3) T[i] = Z.add(T[i], Z.mul(h, Z.mul(p, z.y)));
          p = Z.mul(p, z.x);
        }
      }
      const loes = lgs([
        [S[0], S[1], S[2], T[0]],
        [S[1], S[2], S[3], T[1]],
        [S[2], S[3], S[4], T[2]],
      ]);
      if (loes.art !== 'eindeutig') throw fehler('math');
      const [a, b, c] = loes.x;
      return { a, b, c };
    }
    let n = NULL, sx = NULL, sy = NULL, sxx = NULL, syy = NULL, sxy = NULL;
    for (const z of zeilen) {
      const h = f(z);
      const X = tx(z.x), Y = ty(z.y);
      n = Z.add(n, h);
      sx = Z.add(sx, Z.mul(h, X));
      sy = Z.add(sy, Z.mul(h, Y));
      sxx = Z.add(sxx, Z.mul(h, Z.mul(X, X)));
      syy = Z.add(syy, Z.mul(h, Z.mul(Y, Y)));
      sxy = Z.add(sxy, Z.mul(h, Z.mul(X, Y)));
    }
    const Sxx = Z.sub(sxx, Z.div(Z.mul(sx, sx), n));
    const Syy = Z.sub(syy, Z.div(Z.mul(sy, sy), n));
    const Sxy = Z.sub(sxy, Z.div(Z.mul(sx, sy), n));
    if (Z.istNull(Sxx)) throw fehler('math');
    const B = Z.div(Sxy, Sxx);
    const A = Z.div(Z.sub(sy, Z.mul(B, sx)), n);
    let r;
    const prod = Z.mul(Sxx, Syy);
    if (Z.vorzeichen(prod) <= 0) r = NULL;
    else {
      r = Z.div(Sxy, Z.wurzel(prod));
      if (r.t === 's' || r.t === 'p') r = D(Z.zahl(r));
    }
    switch (typ) {
      case 'eexp': return { a: Z.exp(A), b: B, r };
      case 'abexp': return { a: Z.exp(A), b: Z.exp(B), r };
      case 'pot': return { a: Z.exp(A), b: B, r };
      default: return { a: A, b: B, r };
    }
  }

  /// Wert einer Statistikvariablen
  wert(name) {
    const k = this.kennwerte();
    const v = k[name];
    if (v === undefined) throw fehler('math');
    return v;
  }

  /// (x − x̄)/σx  (x▸t)
  normiert(x) {
    const k = this.kennwerte();
    if (Z.istNull(k.sigx)) throw fehler('math');
    return Z.div(Z.sub(x, k.xquer), k.sigx);
  }

  /// Schätzwerte ŷ(x), x̂(y), x̂₁/x̂₂ (quadratisch)
  schaetz(art, w) {
    const k = this.kennwerte();
    const { a, b } = k;
    if (!this.zweiVar) throw fehler('syntax');
    const typ = this.typ;
    if (art === 'yhut') {
      switch (typ) {
        case 'lin': return Z.add(a, Z.mul(b, w));
        case 'quad': return Z.add(Z.add(a, Z.mul(b, w)), Z.mul(k.c, Z.mul(w, w)));
        case 'log': return Z.add(a, Z.mul(b, Z.ln(w)));
        case 'eexp': return Z.mul(a, Z.exp(Z.mul(b, w)));
        case 'abexp': return Z.mul(a, Z.potenz(b, w));
        case 'pot': return Z.mul(a, Z.potenz(w, b));
        case 'inv': return Z.add(a, Z.div(b, w));
        default: throw fehler('syntax');
      }
    }
    if (typ === 'quad') {
      if (art !== 'xhut1' && art !== 'xhut2') throw fehler('syntax');
      const c = k.c;
      // c x² + b x + (a − y) = 0
      const disk = Z.sub(Z.mul(b, b), Z.mul(Q(4n), Z.mul(c, Z.sub(a, w))));
      if (Z.vorzeichen(disk) < 0) throw fehler('math');
      const wd = Z.wurzel(disk), n2 = Z.mul(Q(2n), c);
      return art === 'xhut1' ? Z.div(Z.add(Z.neg(b), wd), n2) : Z.div(Z.sub(Z.neg(b), wd), n2);
    }
    if (art !== 'xhut') throw fehler('syntax');
    switch (typ) {
      case 'lin': return Z.div(Z.sub(w, a), b);
      case 'log': return Z.exp(Z.div(Z.sub(w, a), b));
      case 'eexp': return Z.div(Z.ln(Z.div(w, a)), b);
      case 'abexp': return Z.div(Z.ln(Z.div(w, a)), Z.ln(b));
      case 'pot': return Z.potenz(Z.div(w, a), Z.kehrwert(b));
      case 'inv': return Z.div(b, Z.sub(w, a));
      default: throw fehler('syntax');
    }
  }
}
