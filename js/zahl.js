// zahl.js – Reelle Zahlen des Rechners: exakt (Bruch, Wurzelsumme, Vielfaches von π) oder genähert.
//
// Der fx-991DE X zeigt Ergebnisse im Lehrbuchformat möglichst exakt an (7/12, 2√3, ⅙π, (√6−√2)/4).
// Dieses Modul bildet das nach: Solange eine Rechnung exakt darstellbar bleibt, rechnet es mit
// BigInt-Brüchen; sonst mit Gleitkommazahlen (double, knapp 16 Stellen – der Rechner hat intern 15).
//
// Darstellung (unveränderliche Objekte):
//   { t: 'q', n, d }             Bruch n/d (BigInt, d > 0, gekürzt)
//   { t: 's', w: [{ r, n, d }] } Summe Σ (n/d)·√r, r quadratfrei, aufsteigend (r = 1: rationaler Teil)
//   { t: 'p', n, d }             (n/d)·π
//   { t: 'd', v }                Näherungswert (double)
// Grenzen wie beim Rechner: |x| ≥ 10¹⁰⁰ → Math ERROR, |x| < 10⁻⁹⁹ → 0.

export class RechenFehler extends Error {
  /// art: 'math' | 'syntax' | 'argument' | 'stack' | 'dimension' | 'variable' | 'solve' | 'range' | 'zeit'
  constructor(art, info) {
    super(art);
    this.art = art;
    this.info = info;
  }
}
export const fehler = (art, info) => new RechenFehler(art, info);
const mathFehler = () => fehler('math');

const GRENZE = 10n ** 30n;       // größere Zähler/Nenner: weiter mit Näherung
const MAX_TERME = 6;             // mehr verschiedene Wurzeln in einer Summe: Näherung
const MAX_RADIKAND = 10n ** 12n; // größere Radikanden werden nicht mehr zerlegt

const babs = (a) => (a < 0n ? -a : a);

export function ggT(a, b) {
  a = babs(a); b = babs(b);
  while (b) { const t = a % b; a = b; b = t; }
  return a;
}

/// n/d (BigInt) als double, auch wenn beide sehr groß sind
export function bigQuotient(n, d) {
  const neg = (n < 0n) !== (d < 0n);
  n = babs(n); d = babs(d);
  let v;
  if (n < 9007199254740992n && d < 9007199254740992n) v = Number(n) / Number(d);
  else {
    const k = 20 - (n.toString().length - d.toString().length);
    const q = k >= 0 ? (n * 10n ** BigInt(k)) / d : n / (d * 10n ** BigInt(-k));
    v = parseFloat(q.toString() + 'e' + (-k));
  }
  return neg ? -v : v;
}

// MARK: Rohe Brüche {n, d} (ohne Hülle)

function qn(n, d) {
  if (d === 0n) throw mathFehler();
  if (d < 0n) { n = -n; d = -d; }
  const g = ggT(n, d);
  if (g > 1n) { n /= g; d /= g; }
  return { n, d };
}
const qadd = (a, b) => qn(a.n * b.d + b.n * a.d, a.d * b.d);

// MARK: Konstruktoren

/// Bruch n/d (Zahl oder BigInt)
export function Q(n, d = 1n) {
  if (typeof n === 'number') n = BigInt(n);
  if (typeof d === 'number') d = BigInt(d);
  const q = qn(n, d);
  if (babs(q.n) > GRENZE || q.d > GRENZE) return D(bigQuotient(q.n, q.d));
  return { t: 'q', n: q.n, d: q.d };
}

/// Näherungswert; 0 wird exakt, Überlauf ist ein Math ERROR
export function D(v) {
  if (!Number.isFinite(v)) throw mathFehler();
  const a = Math.abs(v);
  if (a >= 1e100) throw mathFehler();
  if (a < 1e-99) return { t: 'q', n: 0n, d: 1n };
  return { t: 'd', v };
}

/// (n/d)·π
export function P(n, d = 1n) {
  const q = Q(n, d);
  if (q.t !== 'q') return D(q.v * Math.PI);
  if (q.n === 0n) return q;
  return { t: 'p', n: q.n, d: q.d };
}

/// Wurzelsumme aus beliebigen Termen [{r, n, d}] (r quadratfrei)
export function S(terme) {
  const m = new Map();
  for (const t of terme) {
    if (t.n === 0n) continue;
    const k = t.r.toString();
    const alt = m.get(k);
    if (alt) { const s = qadd(alt, t); m.set(k, { r: t.r, n: s.n, d: s.d }); }
    else { const s = qn(t.n, t.d); m.set(k, { r: t.r, n: s.n, d: s.d }); }
  }
  const w = [...m.values()].filter((t) => t.n !== 0n).sort((a, b) => (a.r < b.r ? -1 : a.r > b.r ? 1 : 0));
  if (w.length === 0) return Q(0n);
  if (w.length === 1 && w[0].r === 1n) return Q(w[0].n, w[0].d);
  if (w.length > MAX_TERME || w.some((t) => babs(t.n) > GRENZE || t.d > GRENZE || t.r > MAX_RADIKAND)) {
    return D(summenWert(w));
  }
  return { t: 's', w };
}

export const NULL = Q(0n);
export const EINS = Q(1n);
export const PI = P(1n);
export const E_NAEHERUNG = D(Math.E);

// MARK: Grundabfragen

function summenWert(w) {
  let s = 0;
  for (const t of w) s += bigQuotient(t.n, t.d) * (t.r === 1n ? 1 : Math.sqrt(Number(t.r)));
  return s;
}

/// Zahlenwert als double
export function zahl(a) {
  switch (a.t) {
    case 'q': return bigQuotient(a.n, a.d);
    case 'p': return bigQuotient(a.n, a.d) * Math.PI;
    case 's': return summenWert(a.w);
    case 'd': return a.v;
    default: throw fehler('syntax');
  }
}

export const istExakt = (a) => a.t !== 'd';
export const istNull = (a) => (a.t === 'q' && a.n === 0n) || (a.t === 'd' && a.v === 0);
export const istRational = (a) => a.t === 'q';
export const istGanz = (a) => a.t === 'q' && a.d === 1n;

/// -1, 0, 1
export function vorzeichen(a) {
  switch (a.t) {
    case 'q': case 'p': return a.n > 0n ? 1 : a.n < 0n ? -1 : 0;
    case 's': {
      const v = summenWert(a.w);
      if (v !== 0) return Math.sign(v);
      // Auslöschung (z. B. sehr ähnliche Terme): genauer über Quadrate entscheiden
      return 1;
    }
    default: return Math.sign(a.v);
  }
}

/// Exakte Darstellung als Terme [{r, n, d}] (nur für q und s)
function terme(a) {
  if (a.t === 'q') return [{ r: 1n, n: a.n, d: a.d }];
  if (a.t === 's') return a.w;
  throw fehler('math');
}

/// Kanonischer Schlüssel exakter Werte (für Vergleiche); Näherungen → null
export function schluessel(a) {
  switch (a.t) {
    case 'q': return `q${a.n}/${a.d}`;
    case 'p': return `p${a.n}/${a.d}`;
    case 's': return 's' + a.w.map((t) => `${t.n}/${t.d}r${t.r}`).join('+');
    default: return null;
  }
}

/// Gleichheit: exakt, wenn beide exakt; sonst numerisch auf 15 Stellen
export function gleich(a, b) {
  const ka = schluessel(a), kb = schluessel(b);
  if (ka !== null && kb !== null) return ka === kb;
  const x = zahl(a), y = zahl(b);
  return Math.abs(x - y) <= 1e-14 * Math.max(Math.abs(x), Math.abs(y), 1e-300);
}

export function vergleich(a, b) {
  return vorzeichen(sub(a, b));
}

/// Ganzzahl als BigInt (Näherungswerte mit kleiner Toleranz) oder null
export function alsGanzzahl(a) {
  if (a.t === 'q') return a.d === 1n ? a.n : null;
  if (a.t === 'd') {
    const r = Math.round(a.v);
    if (Math.abs(a.v - r) <= 1e-9 * Math.max(1, Math.abs(r)) && Math.abs(r) < 9e15) return BigInt(r);
    return null;
  }
  return null;
}

// MARK: Grundrechenarten

export function neg(a) {
  switch (a.t) {
    case 'q': return { t: 'q', n: -a.n, d: a.d };
    case 'p': return { t: 'p', n: -a.n, d: a.d };
    case 's': return { t: 's', w: a.w.map((t) => ({ r: t.r, n: -t.n, d: t.d })) };
    default: return D(-a.v);
  }
}

export function add(a, b) {
  if (a.t === 'd' || b.t === 'd') return D(zahl(a) + zahl(b));
  if (a.t === 'q' && b.t === 'q') return Q(a.n * b.d + b.n * a.d, a.d * b.d);
  if (a.t === 'p' || b.t === 'p') {
    if (a.t === 'p' && b.t === 'p') return P(a.n * b.d + b.n * a.d, a.d * b.d);
    if (istNull(a)) return b;
    if (istNull(b)) return a;
    return D(zahl(a) + zahl(b));
  }
  return S([...terme(a), ...terme(b)]);
}

export const sub = (a, b) => add(a, neg(b));

export function mul(a, b) {
  if (istNull(a) || istNull(b)) return NULL;
  if (a.t === 'd' || b.t === 'd') return D(zahl(a) * zahl(b));
  if (a.t === 'q' && b.t === 'q') return Q(a.n * b.n, a.d * b.d);
  if (a.t === 'p' || b.t === 'p') {
    if (a.t === 'p' && b.t === 'q') return P(a.n * b.n, a.d * b.d);
    if (a.t === 'q' && b.t === 'p') return P(a.n * b.n, a.d * b.d);
    return D(zahl(a) * zahl(b));
  }
  const ta = terme(a), tb = terme(b);
  if (ta.length * tb.length > 24) return D(zahl(a) * zahl(b));
  const erg = [];
  for (const x of ta) {
    for (const y of tb) {
      const g = ggT(x.r, y.r);
      erg.push({ r: (x.r / g) * (y.r / g), n: x.n * y.n * g, d: x.d * y.d });
    }
  }
  return S(erg);
}

export function kehrwert(a) {
  return div(EINS, a);
}

export function div(a, b) {
  if (istNull(b)) throw mathFehler();
  if (istNull(a)) return NULL;
  if (a.t === 'd' || b.t === 'd') return D(zahl(a) / zahl(b));
  if (b.t === 'q') return mul(a, Q(b.d, b.n));
  if (b.t === 'p') {
    if (a.t === 'p') return Q(a.n * b.d, a.d * b.n);
    return D(zahl(a) / zahl(b));
  }
  // Nenner ist eine Wurzelsumme
  if (a.t === 'p') return D(zahl(a) / zahl(b));
  const w = b.w;
  if (w.length === 1) {
    // 1/(c·√r) = √r·d/(n·r)
    const t = w[0];
    return mul(a, S([{ r: t.r, n: t.d, d: t.n * t.r }]));
  }
  if (w.length === 2) {
    // mit der „Konjugierten“ erweitern: (x + y)(x − y) = x² − y² ist rational
    const konj = S([w[0], { r: w[1].r, n: -w[1].n, d: w[1].d }]);
    const nenner = mul(b, konj);
    if (nenner.t === 'q') return div(mul(a, konj), nenner);
  }
  return D(zahl(a) / zahl(b));
}

// MARK: Wurzeln und Potenzen

const zerlegSpeicher = new Map();

/// m = a²·r mit quadratfreiem r; [a, r] als BigInt oder null (zu groß)
export function zerlege(m) {
  if (m < 2n) return [1n, m];
  if (m > MAX_RADIKAND) return null;
  const k = m.toString();
  const alt = zerlegSpeicher.get(k);
  if (alt) return alt;
  let x = Number(m), a = 1, r = 1;
  for (let p = 2; p * p <= x; p += p === 2 ? 1 : 2) {
    if (x % p !== 0) continue;
    let e = 0;
    while (x % p === 0) { x /= p; e++; }
    a *= p ** Math.floor(e / 2);
    if (e % 2) r *= p;
  }
  r *= x;
  const erg = [BigInt(a), BigInt(r)];
  if (zerlegSpeicher.size > 2000) zerlegSpeicher.clear();
  zerlegSpeicher.set(k, erg);
  return erg;
}

/// Ganzzahlige k-te Wurzel von n ≥ 0, wenn sie aufgeht, sonst null
export function ganzeWurzel(n, k) {
  if (n < 0n) return null;
  if (n < 2n) return n;
  const schaetz = Math.round(Math.pow(Number(n), 1 / k));
  if (!Number.isFinite(schaetz)) return null;
  for (const c of [schaetz, schaetz - 1, schaetz + 1]) {
    if (c < 0) continue;
    const b = BigInt(c);
    if (b ** BigInt(k) === n) return b;
  }
  return null;
}

/// √a (a ≥ 0, sonst Math ERROR – die komplexe Wurzel steht in komplex.js)
export function wurzel(a) {
  const vz = vorzeichen(a);
  if (vz < 0) throw mathFehler();
  if (vz === 0) return NULL;
  if (a.t === 'q') {
    const z = zerlege(a.n * a.d);
    if (z) return S([{ r: z[1], n: z[0], d: a.d }]);
  }
  if (a.t === 's') {
    const w = wurzelAusSumme(a);
    if (w) return w;
  }
  return D(Math.sqrt(zahl(a)));
}

/// √(p + q√r) = √x + √y, falls x, y rational (z. B. √(3+2√2) = 1+√2)
function wurzelAusSumme(a) {
  if (a.w.length !== 2 || a.w[0].r !== 1n) return null;
  const p = Q(a.w[0].n, a.w[0].d);
  const t = a.w[1];
  // q√r = 2√(xy), x + y = p  →  xy = q²r/4
  const qq = mul(Q(t.n * t.n * t.r, t.d * t.d), Q(1n, 4n));
  const disk = sub(mul(p, p), mul(Q(4n), qq));
  if (disk.t !== 'q' || vorzeichen(disk) < 0) return null;
  const wd = wurzel(disk);
  if (wd.t !== 'q') return null;
  const x = mul(add(p, wd), Q(1n, 2n)), y = mul(sub(p, wd), Q(1n, 2n));
  if (vorzeichen(x) < 0 || vorzeichen(y) < 0) return null;
  const sx = wurzel(x), sy = wurzel(y);
  const erg = vorzeichen(Q(t.n)) >= 0 ? add(sx, sy) : sub(sx, sy);
  if (erg.t === 'd') return null;
  return vorzeichen(erg) >= 0 ? erg : neg(erg);
}

/// ∛a
export function kubikwurzel(a) {
  if (istNull(a)) return NULL;
  if (a.t === 'q') {
    const wn = ganzeWurzel(babs(a.n), 3), wd = ganzeWurzel(a.d, 3);
    if (wn !== null && wd !== null) return Q(a.n < 0n ? -wn : wn, wd);
  }
  return D(Math.cbrt(zahl(a)));
}

function ganzPotenz(a, k) {
  if (k === 0n) return EINS;
  if (a.t === 'p') return k === 1n ? a : D(Math.pow(zahl(a), Number(k)));
  let erg = EINS, basis = a, e = k;
  while (e > 0n) {
    if (e & 1n) erg = mul(erg, basis);
    e >>= 1n;
    if (e > 0n) basis = mul(basis, basis);
  }
  return erg;
}

/// a^b nach den Regeln des Rechners (negative Basis nur mit ganzzahligem oder m/(2n+1)-Exponenten)
export function potenz(a, b) {
  const vz = vorzeichen(a);
  // ganzzahliger Exponent
  const k = alsGanzzahl(b);
  if (k !== null && (b.t === 'q' || b.t === 'd')) {
    if (vz === 0) {
      if (k > 0n) return NULL;
      throw mathFehler();
    }
    if (a.t !== 'd' && babs(k) <= 512n) {
      const erg = ganzPotenz(a, babs(k));
      return k < 0n ? div(EINS, erg) : erg;
    }
    return D(Math.pow(zahl(a), Number(k)));
  }
  // rationaler Exponent m/n
  if (b.t === 'q') {
    const m = b.n, n = b.d;
    if (vz === 0) {
      if (m > 0n) return NULL;
      throw mathFehler();
    }
    if (vz < 0 && n % 2n === 0n) throw mathFehler();
    if (a.t === 'q' && n <= 64n && babs(m) <= 64n) {
      const wn = ganzeWurzel(babs(a.n), Number(n)), wd = ganzeWurzel(a.d, Number(n));
      if (wn !== null && wd !== null) return potenz(Q(vz < 0 ? -wn : wn, wd), Q(m));
      if (n === 2n && vz > 0) return potenz(wurzel(a), Q(m));
    }
    const v = Math.pow(Math.abs(zahl(a)), Number(m) / Number(n));
    return D(vz < 0 && babs(m) % 2n === 1n ? -v : v);
  }
  // beliebiger Exponent
  if (vz === 0) {
    if (vorzeichen(b) > 0) return NULL;
    throw mathFehler();
  }
  if (vz < 0) throw mathFehler();
  return D(Math.pow(zahl(a), zahl(b)));
}

/// ˣ√a (Wurzel mit Wurzelexponent x)
export function nteWurzel(x, a) {
  if (istNull(x)) throw mathFehler();
  const k = alsGanzzahl(x);
  if (k !== null && k > 0n && k <= 64n && a.t === 'q') {
    const wn = ganzeWurzel(babs(a.n), Number(k)), wd = ganzeWurzel(a.d, Number(k));
    if (wn !== null && wd !== null) {
      if (a.n < 0n && k % 2n === 0n) throw mathFehler();
      return Q(a.n < 0n ? -wn : wn, wd);
    }
    if (k === 2n) return wurzel(a);
  }
  if (k !== null && k % 2n !== 0n && vorzeichen(a) < 0) {
    return D(-Math.pow(-zahl(a), 1 / Number(k)));
  }
  return potenz(a, div(EINS, x));
}

// MARK: Winkel und Trigonometrie

const halb = Q(1n, 2n);
const SIN_TAB = {
  0: NULL,
  15: S([{ r: 6n, n: 1n, d: 4n }, { r: 2n, n: -1n, d: 4n }]),
  18: S([{ r: 5n, n: 1n, d: 4n }, { r: 1n, n: -1n, d: 4n }]),
  30: halb,
  45: S([{ r: 2n, n: 1n, d: 2n }]),
  54: S([{ r: 5n, n: 1n, d: 4n }, { r: 1n, n: 1n, d: 4n }]),
  60: S([{ r: 3n, n: 1n, d: 2n }]),
  75: S([{ r: 6n, n: 1n, d: 4n }, { r: 2n, n: 1n, d: 4n }]),
  90: EINS,
};
const TAN_TAB = {
  0: NULL,
  15: S([{ r: 1n, n: 2n, d: 1n }, { r: 3n, n: -1n, d: 1n }]),
  30: S([{ r: 3n, n: 1n, d: 3n }]),
  45: EINS,
  60: S([{ r: 3n, n: 1n, d: 1n }]),
  75: S([{ r: 1n, n: 2n, d: 1n }, { r: 3n, n: 1n, d: 1n }]),
};

/// Winkel exakt in Grad (Q) oder null
function inGrad(a, einheit) {
  if (einheit === 'D') return a.t === 'q' ? a : null;
  if (einheit === 'R') {
    if (a.t === 'p') return Q(a.n * 180n, a.d);
    if (istNull(a)) return NULL;
    return null;
  }
  if (a.t === 'q') return Q(a.n * 9n, a.d * 10n);
  return null;
}

/// Grad (Q, ganzzahlig) → exakter Sinus aus der Tabelle oder null
function sinTab(g) {
  if (g.d !== 1n) return null;
  let k = Number(((g.n % 360n) + 360n) % 360n);
  let vz = 1;
  if (k >= 180) { k -= 180; vz = -1; }
  if (k > 90) k = 180 - k;
  const w = SIN_TAB[k];
  if (!w) return null;
  return vz < 0 ? neg(w) : w;
}

/// Winkel in Bogenmaß (double), für Näherungen
export function imBogenmass(a, einheit) {
  let v = zahl(a);
  if (einheit === 'R') return v;
  const voll = einheit === 'D' ? 360 : 400;
  if (Math.abs(v) < 1e15) v = v % voll;
  return einheit === 'D' ? (v * Math.PI) / 180 : (v * Math.PI) / 200;
}

/// Bogenmaß (double) → Einheit
export function ausBogenmass(v, einheit) {
  if (einheit === 'R') return D(v);
  return D(einheit === 'D' ? (v * 180) / Math.PI : (v * 200) / Math.PI);
}

/// Grad (exakt) → Ergebnis in der Winkeleinheit (exakt)
export function gradIn(g, einheit) {
  if (einheit === 'D') return g;
  if (einheit === 'R') return P(g.n, g.d * 180n);
  return Q(g.n * 10n, g.d * 9n);
}

function eingabeBereich(a, einheit) {
  const v = Math.abs(zahl(a));
  const grenze = einheit === 'D' ? 9e9 : einheit === 'R' ? 157079632.7 : 1e10;
  if (v >= grenze) throw mathFehler();
}

const klein = (v) => (Math.abs(v) < 1e-15 ? 0 : v);

export function sin(a, einheit) {
  eingabeBereich(a, einheit);
  const g = inGrad(a, einheit);
  if (g) { const w = sinTab(g); if (w) return w; }
  return D(klein(Math.sin(imBogenmass(a, einheit))));
}

export function cos(a, einheit) {
  eingabeBereich(a, einheit);
  const g = inGrad(a, einheit);
  if (g) { const w = sinTab(sub(Q(90n), g)); if (w) return w; }
  return D(klein(Math.cos(imBogenmass(a, einheit))));
}

export function tan(a, einheit) {
  eingabeBereich(a, einheit);
  const g = inGrad(a, einheit);
  if (g && g.d === 1n) {
    const k = Number(((g.n % 180n) + 180n) % 180n);
    if (k === 90) throw mathFehler();
    const w = k <= 90 ? TAN_TAB[k] : TAN_TAB[180 - k];
    if (w) return k <= 90 ? w : neg(w);
  }
  const r = imBogenmass(a, einheit);
  const c = Math.cos(r);
  if (Math.abs(c) < 1e-15) throw mathFehler();
  return D(klein(Math.sin(r) / c));
}

/// Tabellenwert suchen: liefert Grad (Zahl) oder null
function sucheTabelle(tab, x) {
  const k = schluessel(x);
  if (k === null) return null;
  for (const [grad, w] of Object.entries(tab)) {
    if (schluessel(w) === k) return Number(grad);
    if (schluessel(neg(w)) === k) return -Number(grad);
  }
  return null;
}

export function asin(x, einheit) {
  const v = zahl(x);
  if (Math.abs(v) > 1 + 1e-15) throw mathFehler();
  const g = sucheTabelle(SIN_TAB, x);
  if (g !== null) return gradIn(Q(g), einheit);
  return ausBogenmass(Math.asin(Math.max(-1, Math.min(1, v))), einheit);
}

export function acos(x, einheit) {
  const v = zahl(x);
  if (Math.abs(v) > 1 + 1e-15) throw mathFehler();
  const g = sucheTabelle(SIN_TAB, x);
  if (g !== null) return gradIn(Q(90 - g), einheit);
  return ausBogenmass(Math.acos(Math.max(-1, Math.min(1, v))), einheit);
}

export function atan(x, einheit) {
  const g = sucheTabelle(TAN_TAB, x);
  if (g !== null) return gradIn(Q(g), einheit);
  return ausBogenmass(Math.atan(zahl(x)), einheit);
}

/// Winkel des Punktes (x, y) im Bereich −180° < θ ≤ 180° (exakt, wenn möglich)
export function winkel(x, y, einheit) {
  const vx = vorzeichen(x), vy = vorzeichen(y);
  if (vx === 0 && vy === 0) throw mathFehler();
  if (vx === 0) return gradIn(Q(vy > 0 ? 90n : -90n), einheit);
  if (vy === 0) return gradIn(Q(vx > 0 ? 0n : 180n), einheit);
  const q = div(y, x);
  const g = sucheTabelle(TAN_TAB, q);
  if (g !== null) {
    let w = g;
    if (vx < 0) w = vy > 0 ? w + 180 : w - 180;
    return gradIn(Q(w), einheit);
  }
  return ausBogenmass(Math.atan2(zahl(y), zahl(x)), einheit);
}

// Hyperbelfunktionen (immer genähert, außer an 0)
export function sinh(a) { if (istNull(a)) return NULL; const v = zahl(a); if (Math.abs(v) > 230.2585092) throw mathFehler(); return D(Math.sinh(v)); }
export function cosh(a) { if (istNull(a)) return EINS; const v = zahl(a); if (Math.abs(v) > 230.2585092) throw mathFehler(); return D(Math.cosh(v)); }
export function tanh(a) { if (istNull(a)) return NULL; return D(Math.tanh(zahl(a))); }
export function asinh(a) { if (istNull(a)) return NULL; return D(Math.asinh(zahl(a))); }
export function acosh(a) { const v = zahl(a); if (v < 1) throw mathFehler(); if (v === 1) return NULL; return D(Math.acosh(v)); }
export function atanh(a) { const v = zahl(a); if (Math.abs(v) >= 1) throw mathFehler(); if (v === 0) return NULL; return D(Math.atanh(v)); }

// MARK: Logarithmen und Exponentialfunktionen

/// Ist die positive rationale Zahl eine Zehnerpotenz? → Exponent (BigInt) oder null
function zehnerExponent(a) {
  if (a.t !== 'q' || a.n <= 0n) return null;
  const pruefe = (z) => { const s = z.toString(); return /^10*$/.test(s) ? BigInt(s.length - 1) : null; };
  if (a.d === 1n) return pruefe(a.n);
  if (a.n === 1n) { const e = pruefe(a.d); return e === null ? null : -e; }
  return null;
}

export function log10(a) {
  if (vorzeichen(a) <= 0) throw mathFehler();
  const e = zehnerExponent(a);
  if (e !== null) return Q(e);
  return D(Math.log10(zahl(a)));
}

export function ln(a) {
  if (vorzeichen(a) <= 0) throw mathFehler();
  if (a.t === 'q' && a.n === 1n && a.d === 1n) return NULL;
  return D(Math.log(zahl(a)));
}

/// Logarithmus von a zur Basis b; exakt, wenn a = b^(m/n) mit kleinen m, n
export function logBasis(b, a) {
  if (vorzeichen(a) <= 0 || vorzeichen(b) <= 0) throw mathFehler();
  if (b.t === 'q' && b.n === b.d) throw mathFehler();
  if (a.t === 'q' && b.t === 'q') {
    if (a.n === 1n && a.d === 1n) return NULL;
    const lb = Math.log(zahl(b)), la = Math.log(zahl(a));
    for (let n = 1; n <= 6; n++) {
      const m = Math.round((n * la) / lb);
      if (m === 0 || Math.abs(m) > 99) continue;
      // a^n == b^m exakt prüfen
      try {
        const links = potenz(a, Q(n)), rechts = potenz(b, Q(m));
        if (links.t === 'q' && rechts.t === 'q' && links.n === rechts.n && links.d === rechts.d) return Q(m, n);
      } catch (e) { /* zu groß: weiter */ }
    }
  }
  return D(Math.log(zahl(a)) / Math.log(zahl(b)));
}

export function exp(a) {
  if (istNull(a)) return EINS;
  const v = zahl(a);
  if (v > 230.2585092) throw mathFehler();
  return D(Math.exp(v));
}

export function zehnHoch(a) {
  const k = a.t === 'q' && a.d === 1n ? a.n : null;
  if (k !== null) {
    if (k > 99n) throw mathFehler();
    if (k < -99n) return NULL;
    return k >= 0n ? Q(10n ** k) : Q(1n, 10n ** -k);
  }
  const v = zahl(a);
  if (v >= 100) throw mathFehler();
  return D(Math.pow(10, v));
}

// MARK: Weitere Funktionen

export function betrag(a) {
  return vorzeichen(a) < 0 ? neg(a) : a;
}

/// Ganzzahl für Funktionen, die nur ganze Zahlen annehmen (sonst Math ERROR)
function ganzOderFehler(a) {
  const k = alsGanzzahl(a);
  if (k === null) throw mathFehler();
  return k;
}

export function fakultaet(a) {
  const n = ganzOderFehler(a);
  if (n < 0n || n > 69n) throw mathFehler();
  let f = 1n;
  for (let i = 2n; i <= n; i++) f *= i;
  return grossGanz(f);
}

/// Sehr große Ganzzahlen: exakt bis 10³⁰, darüber Näherung (bis 10¹⁰⁰)
function grossGanz(f) {
  if (babs(f) <= GRENZE) return Q(f);
  const v = bigQuotient(f, 1n);
  return D(v);
}

export function nPr(a, b) {
  const n = ganzOderFehler(a), r = ganzOderFehler(b);
  if (n < 0n || r < 0n || r > n || n >= 10n ** 10n) throw mathFehler();
  let p = 1n;
  for (let i = 0n; i < r; i++) {
    p *= n - i;
    if (p >= 10n ** 100n) throw mathFehler();
  }
  return grossGanz(p);
}

export function nCr(a, b) {
  const n = ganzOderFehler(a);
  let r = ganzOderFehler(b);
  if (n < 0n || r < 0n || r > n || n >= 10n ** 10n) throw mathFehler();
  if (r > n - r) r = n - r;
  let p = 1n;
  for (let i = 1n; i <= r; i++) {
    p = (p * (n - r + i)) / i;
    if (p >= 10n ** 100n) throw mathFehler();
  }
  return grossGanz(p);
}

/// Prozent: x %
export const prozent = (a) => mul(a, Q(1n, 100n));

/// Grad, Minuten, Sekunden → Grad
export const ausGMS = (g, m, s) => add(add(g, div(m, Q(60n))), div(s, Q(3600n)));

/// Zufallszahl 0,000 … 0,999
export function zufall() {
  return Q(BigInt(Math.floor(Math.random() * 1000)), 1000n);
}

export function zufallGanz(a, b) {
  const x = ganzOderFehler(a), y = ganzOderFehler(b);
  if (!(x < y) || babs(x) >= 10n ** 10n || babs(y) >= 10n ** 10n) throw mathFehler();
  const spanne = Number(y - x) + 1;
  return Q(x + BigInt(Math.floor(Math.random() * spanne)));
}

/// Dezimalzahl als Text („12.345“, „.5“, „7“) → exakter Bruch
export function ausDezimal(text) {
  const m = /^(\d*)(?:\.(\d*))?$/.exec(text);
  if (!m || (m[1] === '' && (m[2] === undefined || m[2] === ''))) throw fehler('syntax');
  const ganz = m[1] || '0', nach = m[2] || '';
  return Q(BigInt(ganz + nach), 10n ** BigInt(nach.length));
}

/// Periodische Dezimalzahl: „0.1“ mit Periode „6“ → 1/6
export function ausPeriode(text, periode) {
  if (!/^\d+$/.test(periode)) throw fehler('syntax');
  const m = /^(\d*)(?:\.(\d*))?$/.exec(text);
  if (!m) throw fehler('syntax');
  const ganz = m[1] || '0', nach = m[2] || '';
  const vor = BigInt(ganz + nach);              // Ziffern ohne Komma
  const k = BigInt(nach.length), p = BigInt(periode.length);
  // x = vor/10^k + periode/(10^k·(10^p − 1))
  return add(Q(vor, 10n ** k), Q(BigInt(periode), 10n ** k * (10n ** p - 1n)));
}

/// Runden wie Rnd( ): Fix n → n Nachkommastellen, Sci n → n gültige Stellen, sonst 10 gültige Stellen
export function runde(a, format) {
  const v = zahl(a);
  if (v === 0) return NULL;
  let text;
  if (format.art === 'fix') text = v.toFixed(format.stellen);
  else {
    const stellen = format.art === 'sci' ? (format.stellen || 10) : 10;
    text = v.toExponential(stellen - 1);
  }
  return ausExponentText(text);
}

/// „-1.2345e-5“ → exakter Bruch
export function ausExponentText(text) {
  const m = /^(-?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/.exec(text);
  if (!m) return D(parseFloat(text));
  const ganz = m[2] || '0', nach = m[3] || '';
  let n = BigInt(ganz + nach), d = 10n ** BigInt(nach.length);
  const e = m[4] ? parseInt(m[4], 10) : 0;
  if (e > 0) n *= 10n ** BigInt(e); else if (e < 0) d *= 10n ** BigInt(-e);
  return Q(m[1] === '-' ? -n : n, d);
}

/// Näherung → kurzer Bruch, wenn die Zahl (fast) genau einer ist (wie die Bruchanzeige des Rechners)
export function erkenneBruch(v, maxNenner = 100000, tol = 4e-15) {
  if (!Number.isFinite(v)) return null;
  const s = v < 0 ? -1 : 1;
  const x = Math.abs(v);
  if (x >= 1e10) return null;
  let h0 = 0, h1 = 1, k0 = 1, k1 = 0, r = x;
  for (let i = 0; i < 40; i++) {
    const a = Math.floor(r);
    const h2 = a * h1 + h0, k2 = a * k1 + k0;
    if (k2 > maxNenner) break;
    if (Math.abs(x - h2 / k2) <= tol * Math.max(1, x)) return { n: BigInt(s * h2), d: BigInt(k2) };
    h0 = h1; h1 = h2; k0 = k1; k1 = k2;
    const f = r - a;
    if (f < 1e-18) break;
    r = 1 / f;
  }
  return null;
}
