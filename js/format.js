// format.js – Ergebnisse für die Anzeige aufbereiten (Lehrbuchformat wie beim fx-991DE X).
//
// Ausgabe ist eine Liste von Anzeige-Elementen (gleiches Schema wie die Eingabe, siehe eingabe.js,
// plus reine Anzeige-Elemente):
//   { k: 'z', v }          Ziffer oder '.' (wird mit dem eingestellten Dezimalzeichen gezeigt)
//   { k: 'minus' }         Minuszeichen eines Ergebnisses
//   { k: 'plus' }          Pluszeichen (komplexe Zahlen, Wurzelsummen)
//   { k: 'x10', v: '-5' }  ×10 mit hochgestelltem Exponenten
//   { k: 'eng', v: 'k' }   Ingenieursymbol
//   { k: 'T', v: 'frac' | 'sqrt', s: [...] }
//   { k: 'k', v: 'pi' }    π;  { k: 'i' } imaginäre Einheit;  { k: 'winkel' } ∠
//   { k: 'gms', v: '°' | "'" | '"' }
//   { k: 'periode', v: '3' }   Ziffern mit Periodenstrich
//   { k: 'txt', v }        sonstiger Text (z. B. „×“ der Primfaktorzerlegung)
//
// Einstellungen (einst): io ('MM' | 'MD' | 'LL' | 'LD'), zahl ({ art: 'norm'|'fix'|'sci', stellen }),
// ingenieur (bool), bruch ('dc' | 'abc'), komplex ('rechtw' | 'polar'), periode (bool), winkel.

import * as Z from './zahl.js';
import * as K from './komplex.js';

const { Q } = Z;
const ziffern = (text) => [...text].map((c) => ({ k: 'z', v: c }));
const babs = (a) => (a < 0n ? -a : a);
const stellen = (n) => babs(n).toString().length;

// MARK: Dezimalzahlen

/// Zahl → { mantisse: '1.234', exp: 5 } mit n gültigen Stellen (gerundet)
function wissenschaftlich(v, n) {
  const s = Math.abs(v).toExponential(n - 1);
  const [m, e] = s.split('e');
  return { mantisse: m, exp: parseInt(e, 10) };
}

const ohneNullen = (m) => (m.includes('.') ? m.replace(/0+$/, '').replace(/\.$/, '') : m);

/// Zahl im eingestellten Zahlenformat (Norm/Fix/Sci) als Anzeige-Elemente
export function dezimal(v, einst) {
  if (v === 0 || Object.is(v, -0)) v = 0;
  const neg = v < 0;
  const a = Math.abs(v);
  const zf = einst.zahl || { art: 'norm', stellen: 1 };
  let el;
  if (einst.ingenieur && a !== 0 && zf.art === 'norm') {
    const e = ingenieurElemente(v, 0, einst, true);
    if (e) return e;
  }
  if (zf.art === 'sci') {
    const n = zf.stellen === 0 ? 10 : zf.stellen;
    const { mantisse, exp } = wissenschaftlich(a, n);
    el = [...ziffern(mantisse), { k: 'x10', v: String(exp) }];
  } else if (zf.art === 'fix') {
    const n = zf.stellen;
    if (a >= 1e10) {
      const { mantisse, exp } = wissenschaftlich(a, n + 1);
      el = [...ziffern(mantisse), { k: 'x10', v: String(exp) }];
    } else {
      const t = a.toFixed(n);
      if (t.replace('.', '').replace(/^0+/, '').length > 10 && a >= 1e10) {
        const { mantisse, exp } = wissenschaftlich(a, 10);
        el = [...ziffern(ohneNullen(mantisse)), { k: 'x10', v: String(exp) }];
      } else el = ziffern(gruppiere(t, einst));
    }
  } else {
    // Norm 1 / Norm 2
    const untere = zf.stellen === 2 ? 1e-9 : 1e-2;
    if (a === 0) el = ziffern('0');
    else {
      const { mantisse, exp } = wissenschaftlich(a, 10);
      const gerundet = parseFloat(mantisse + 'e' + exp);
      if (gerundet >= 1e10 || gerundet < untere) {
        el = [...ziffern(ohneNullen(mantisse)), { k: 'x10', v: String(exp) }];
      } else {
        // feste Schreibweise mit 10 gültigen Stellen
        const nach = Math.max(0, 9 - exp);
        el = ziffern(gruppiere(ohneNullen(gerundet.toFixed(Math.min(nach, 20))), einst));
      }
    }
  }
  return neg ? [{ k: 'minus' }, ...el] : el;
}

/// Tausendertrennung (nur im ganzzahligen Teil)
function gruppiere(t, einst) {
  if (!einst.tausender) return t;
  const [g, n] = t.split('.');
  const mit = g.replace(/\B(?=(\d{3})+(?!\d))/g, '_');
  return n !== undefined ? mit + '.' + n : mit;
}

// MARK: Ingenieurschreibweise (ENG-Taste, Ingenieursymbole)

const SYMBOLE = { 3: 'k', 6: 'M', 9: 'G', 12: 'T', 15: 'P', 18: 'E', '-3': 'm', '-6': 'μ', '-9': 'n', '-12': 'p', '-15': 'f' };

/// Exponent der Standard-Ingenieurform (Mantisse 1 ≤ |m| < 1000)
export function ingenieurBasis(v) {
  if (v === 0) return 0;
  const { mantisse, exp } = wissenschaftlich(Math.abs(v), 10);
  void mantisse;
  return Math.floor(exp / 3) * 3;
}

/// v als m×10^e mit e = Basis + verschiebung·3; null, wenn die Mantisse nicht passt
export function ingenieurElemente(v, verschiebung, einst, nurSymbol = false) {
  const neg = v < 0;
  const a = Math.abs(v);
  const e = ingenieurBasis(a) - 3 * verschiebung;
  if (a === 0) return [...ziffern('0')];
  const m = a / Math.pow(10, e);
  const zf = einst.zahl || { art: 'norm' };
  let text;
  if (zf.art === 'fix') text = m.toFixed(zf.stellen);
  else {
    const gueltig = zf.art === 'sci' ? (zf.stellen || 10) : 10;
    const vorKomma = Math.floor(Math.log10(Math.max(m, 1e-300))) + 1;
    const nach = Math.max(0, gueltig - Math.max(vorKomma, 1));
    if (nach > 20) return null;
    text = m.toFixed(nach);
    if (zf.art !== 'sci') text = ohneNullen(text);
  }
  if (text.replace('.', '').replace(/^0+/, '').length > 10 && !(zf.art === 'fix')) {
    if (verschiebung !== 0) return null;
  }
  if (text.replace('.', '').length > 13) return null;
  const sym = SYMBOLE[e];
  let el;
  if (einst.ingenieur && sym) el = [...ziffern(text), { k: 'eng', v: sym }];
  else if (einst.ingenieur && e === 0) el = ziffern(text);
  else if (nurSymbol) return null;
  else el = [...ziffern(text), { k: 'x10', v: String(e) }];
  return neg ? [{ k: 'minus' }, ...el] : el;
}

// MARK: Brüche

/// Passt der Bruch in die Anzeige? (Ganze + Zähler + Nenner + Trennzeichen ≤ 10 Stellen)
function bruchPasst(n, d, gemischt) {
  if (d === 1n) return stellen(n) <= 10;
  if (!gemischt) return stellen(n) + stellen(d) + 1 <= 10;
  const g = babs(n) / d, r = babs(n) % d;
  if (g === 0n) return stellen(r) + stellen(d) + 1 <= 10;
  return stellen(g) + stellen(r) + stellen(d) + 2 <= 10;
}

const bruchEl = (zaehler, nenner) => ({ k: 'T', v: 'frac', s: [zaehler, nenner] });

/// Bruch n/d als Anzeige (unecht oder gemischt); null, wenn er nicht passt
export function bruch(n, d, gemischt, einst) {
  if (d === 1n) return bruchPasst(n, d) ? ganzzahl(n, einst) : null;
  if (!bruchPasst(n, d, gemischt)) return null;
  const neg = n < 0n;
  const a = babs(n);
  let el;
  if (gemischt && a > d) {
    const g = a / d, r = a % d;
    el = [...ziffern(g.toString()), { k: 'T', v: 'mixedOut', s: [ziffern(r.toString()), ziffern(d.toString())] }];
  } else el = [bruchEl(ziffern(a.toString()), ziffern(d.toString()))];
  return neg ? [{ k: 'minus' }, ...el] : el;
}

function ganzzahl(n, einst) {
  const neg = n < 0n;
  const el = ziffern(gruppiere(babs(n).toString(), einst));
  return neg ? [{ k: 'minus' }, ...el] : el;
}

// MARK: Periodische Dezimalzahlen (fx-991DE X)

/// n/d → { ganz, vor, periode } oder null (abbrechend oder zu lang)
export function periodenZerlegung(n, d) {
  const a = babs(n);
  let rest = a % d;
  if (rest === 0n) return null;
  const ganz = (a / d).toString();
  const gesehen = new Map();
  let ziff = '';
  while (rest !== 0n && !gesehen.has(rest)) {
    if (ziff.length > 40) return null;
    gesehen.set(rest, ziff.length);
    rest *= 10n;
    ziff += (rest / d).toString();
    rest %= d;
  }
  if (rest === 0n) return null; // abbrechend
  const start = gesehen.get(rest);
  return { neg: n < 0n, ganz, vor: ziff.slice(0, start), periode: ziff.slice(start) };
}

export function periodisch(n, d, einst) {
  const p = periodenZerlegung(n, d);
  if (!p) return null;
  if (p.ganz.length + p.vor.length + p.periode.length > 10) return null;
  const el = [...ziffern(p.ganz), { k: 'z', v: '.' }, ...ziffern(p.vor), { k: 'periode', v: p.periode }];
  void einst;
  return p.neg ? [{ k: 'minus' }, ...el] : el;
}

// MARK: Wurzel- und π-Formen

/// a·√r als Elemente (a ≥ 1, ganzzahlig)
function wurzelTerm(a, r) {
  const wurzel = { k: 'T', v: 'sqrt', s: [ziffern(r.toString())] };
  if (r === 1n) return ziffern(a.toString());
  if (a === 1n) return [wurzel];
  return [...ziffern(a.toString()), wurzel];
}

const kgV = (a, b) => (a / Z.ggT(a, b)) * b;

/// Wurzelsumme als (Σ aᵢ√rᵢ)/N; null, wenn sie die Grenzen des Rechners sprengt
export function wurzelForm(w) {
  const terme = w.w;
  if (terme.length > 2) return null;
  let N = 1n;
  for (const t of terme) N = kgV(N, t.d);
  if (N >= 100n) return null;
  const ganz = terme.map((t) => ({ r: t.r, a: (t.n * N) / t.d }));
  for (const t of ganz) {
    if (t.r !== 1n && (babs(t.a) >= 100n || t.r >= 1000n)) return null;
    if (t.r === 1n && babs(t.a) >= 1000n) return null;
  }
  // Reihenfolge: rationaler Teil zuerst, dann größere Radikanden (wie (√6−√2)/4)
  ganz.sort((x, y) => (x.r === 1n ? -1 : y.r === 1n ? 1 : x.r > y.r ? -1 : 1));
  // nur bei Brüchen das Minus vor den Bruch ziehen: −(1+√3)/2; ohne Nenner: −1−√3
  const alleNeg = N !== 1n && ganz.every((t) => t.a < 0n);
  const zaehler = [];
  ganz.forEach((t, i) => {
    const a = alleNeg ? -t.a : t.a;
    if (i > 0) zaehler.push({ k: a < 0n ? 'minus' : 'plus' });
    else if (a < 0n) zaehler.push({ k: 'minus' });
    zaehler.push(...wurzelTerm(babs(a), t.r));
  });
  let el;
  if (N === 1n) el = zaehler;
  else el = [bruchEl(zaehler, ziffern(N.toString()))];
  return alleNeg ? [{ k: 'minus' }, ...el] : el;
}

/// (n/d)·π als Elemente; null, wenn zu groß
export function piForm(w) {
  if (Math.abs(Z.zahl(w)) >= 1e6) return null;
  const { n, d } = w;
  if (!bruchPasst(n, d, false)) return null;
  const neg = n < 0n;
  const a = babs(n);
  const pi = { k: 'k', v: 'pi' };
  let el;
  if (d === 1n) el = a === 1n ? [pi] : [...ziffern(a.toString()), pi];
  else el = [bruchEl(ziffern(a.toString()), ziffern(d.toString())), pi];
  return neg ? [{ k: 'minus' }, ...el] : el;
}

// MARK: Exakte Form eines reellen Werts

/// Exakte Darstellung (Bruch, Wurzel, π) für MathO; null, wenn es keine gibt
export function exakt(w, einst, gemischt = einst.bruch === 'abc') {
  switch (w.t) {
    case 'q': return bruch(w.n, w.d, gemischt, einst);
    case 's': return wurzelForm(w);
    case 'p': return piForm(w);
    case 'd': {
      const b = Z.erkenneBruch(w.v);
      if (b) return bruch(b.n, b.d, gemischt, einst);
      return null;
    }
    default: return null;
  }
}

/// Bruch (auch aus einer Näherung) für LineO bzw. S⇔D
function bruchAus(w) {
  if (w.t === 'q') return { n: w.n, d: w.d };
  if (w.t === 'd') return Z.erkenneBruch(w.v);
  return null;
}

// MARK: Ergebnisformen (für S⇔D)

/// Alle Formen eines reellen Ergebnisses in der Reihenfolge, in der S⇔D sie durchläuft
export function formenReal(w, einst) {
  const formen = [];
  const dez = { art: 'dezimal', el: dezimal(Z.zahl(w), einst) };
  const io = einst.io || 'MM';
  const gemischt = einst.bruch === 'abc';
  const b = bruchAus(w);
  const ganz = b && b.d === 1n;
  const per = einst.periode && b && !ganz ? periodisch(b.n, b.d, einst) : null;
  const istIngenieurGanz = einst.ingenieur && ganz;

  if (io === 'MM') {
    let ex = istIngenieurGanz ? null : exakt(w, einst, gemischt);
    if (ganz && !istIngenieurGanz && !ex) ex = null;
    if (ex) formen.push({ art: 'exakt', el: ex });
    if (per) formen.push({ art: 'periode', el: per });
    if (!ganz || istIngenieurGanz || !ex) formen.push(dez);
  } else if (io === 'MD') {
    formen.push(dez);
    const ex = exakt(w, einst, gemischt);
    if (ex && !ganz) formen.push({ art: 'exakt', el: ex });
    if (per) formen.push({ art: 'periode', el: per });
  } else if (io === 'LL') {
    const br = b && !ganz && !istIngenieurGanz ? bruch(b.n, b.d, gemischt, einst) : null;
    if (br) formen.push({ art: 'exakt', el: br });
    if (per) formen.push({ art: 'periode', el: per });
    formen.push(dez);
  } else {
    formen.push(dez);
    const br = b && !ganz ? bruch(b.n, b.d, gemischt, einst) : null;
    if (br) formen.push({ art: 'exakt', el: br });
    if (per) formen.push({ art: 'periode', el: per });
  }
  // Ganze Zahlen: nur eine Form
  if (formen.length === 0) formen.push(dez);
  return formen;
}

/// Form mit vertauschtem Bruchtyp (SHIFT S⇔D: a b/c ⇔ d/c) oder null
export function bruchUmschalten(w, einst, gemischtJetzt) {
  const b = bruchAus(w);
  if (!b || b.d === 1n) return null;
  if (babs(b.n) < b.d) return null;
  return bruch(b.n, b.d, !gemischtJetzt, einst);
}

// MARK: Grad, Minuten, Sekunden

export function gms(v, einst) {
  const neg = v < 0;
  let a = Math.abs(v);
  if (a >= 1e7) return null;
  let g = Math.floor(a);
  let restMin = (a - g) * 60;
  let m = Math.floor(restMin + 1e-9);
  let s = (restMin - m) * 60;
  s = Math.round(s * 100) / 100;
  if (s >= 60) { s -= 60; m += 1; }
  if (m >= 60) { m -= 60; g += 1; }
  const sText = ohneNullen(s.toFixed(2));
  const el = [
    ...ziffern(String(g)), { k: 'gms', v: '°' },
    ...ziffern(String(m)), { k: 'gms', v: "'" },
    ...ziffern(sText), { k: 'gms', v: '"' },
  ];
  void einst;
  return neg ? [{ k: 'minus' }, ...el] : el;
}

// MARK: Primfaktorzerlegung (FACT)

export function primfaktoren(w) {
  if (w.t !== 'q' || w.d !== 1n || w.n < 2n || w.n >= 10n ** 10n) return null;
  let n = Number(w.n);
  const faktoren = [];
  let rest = null;
  for (let p = 2; p * p <= n; p += p === 2 ? 1 : 2) {
    if (p >= 1018081) { rest = n; n = 1; break; }
    let e = 0;
    while (n % p === 0) { n /= p; e++; }
    if (e) faktoren.push([p, e]);
  }
  if (n > 1) {
    if (n >= 1018081) rest = n;
    else faktoren.push([n, 1]);
  }
  const el = [];
  faktoren.forEach(([p, e], i) => {
    if (i > 0) el.push({ k: 'txt', v: '×' });
    el.push(...ziffern(String(p)));
    if (e > 1) el.push({ k: 'hoch', v: String(e) });
  });
  if (rest !== null) {
    if (el.length) el.push({ k: 'txt', v: '×' });
    el.push({ k: 'txt', v: '(' }, ...ziffern(String(rest)), { k: 'txt', v: ')' });
  }
  return el;
}

// MARK: Komplexe Zahlen

function teilForm(w, einst) {
  if (einst.io === 'MM' || einst.io === 'LL') {
    const ex = einst.io === 'MM' ? exakt(w, einst, false) : (w.t === 'q' ? bruch(w.n, w.d, false, einst) : null);
    if (ex) return ex;
  }
  return dezimal(Z.zahl(w), einst);
}

/// a+bi oder r∠θ
export function komplex(c, einst, form) {
  if (form === 'polar') {
    const r = K.betrag(c);
    const th = K.arg(c, einst.winkel || 'D');
    if (Z.istNull(r)) return ziffern('0');
    return [...teilForm(r, einst), { k: 'winkel' }, ...teilForm(th, einst)];
  }
  const el = [];
  const reNull = Z.istNull(c.re), imNull = Z.istNull(c.im);
  if (!reNull || imNull) el.push(...teilForm(c.re, einst));
  if (!imNull) {
    const neg = Z.vorzeichen(c.im) < 0;
    const b = neg ? Z.neg(c.im) : c.im;
    if (!reNull) el.push({ k: neg ? 'minus' : 'plus' });
    else if (neg) el.push({ k: 'minus' });
    if (!(b.t === 'q' && b.n === 1n && b.d === 1n)) el.push(...teilForm(b, einst));
    el.push({ k: 'i' });
  }
  return el;
}

export function formenKomplex(c, einst, form) {
  const f = form || (einst.komplex === 'polar' ? 'polar' : 'rechtw');
  const formen = [{ art: 'exakt', el: komplex(c, einst, f) }];
  if (einst.io === 'MM') {
    const dez = { ...einst, io: 'MD' };
    const d = komplex(c, dez, f);
    if (alsText(d) !== alsText(formen[0].el)) formen.push({ art: 'dezimal', el: d });
  }
  return formen;
}

// MARK: Text (für Tests, Vorlesen, Übungen)

/// Anzeige-Elemente → einfacher Text, z. B. „7/12“, „(√6-√2)/4“, „1/6π“, „1.2×10^5“
export function alsText(el, dezimalzeichen = '.') {
  let s = '';
  for (const e of el) {
    switch (e.k) {
      case 'z': s += e.v === '.' ? dezimalzeichen : e.v === '_' ? ' ' : e.v; break;
      case 'minus': s += '-'; break;
      case 'plus': s += '+'; break;
      case 'x10': s += '×10^' + e.v; break;
      case 'eng': s += e.v; break;
      case 'k': s += e.v === 'pi' ? 'π' : e.v; break;
      case 'i': s += 'i'; break;
      case 'winkel': s += '∠'; break;
      case 'gms': s += e.v; break;
      case 'periode': s += '(' + e.v + ')'; break;
      case 'txt': s += e.v; break;
      case 'hoch': s += '^' + e.v; break;
      case 'T': {
        const t = e.s.map((f) => alsText(f, dezimalzeichen));
        const kl = (x) => (/^[\d.,]+$/.test(x) || /^√\d+$/.test(x) ? x : '(' + x + ')');
        if (e.v === 'frac') s += kl(t[0]) + '/' + kl(t[1]);
        else if (e.v === 'mixedOut') s += ' ' + t[0] + '/' + t[1];
        else if (e.v === 'sqrt') s += '√' + (/^\d+$/.test(t[0]) ? t[0] : '(' + t[0] + ')');
        else s += e.v + '(' + t.join(',') + ')';
        break;
      }
      default: s += '?';
    }
  }
  return s;
}

// MARK: Werte kompakt (Tabellen, Editoren)

/// kurze Dezimaldarstellung mit höchstens n gültigen Stellen (für Tabellenzellen)
export function kurz(v, n = 6, einst = {}) {
  if (v === 0) return '0';
  const a = Math.abs(v);
  let t;
  if (a >= Math.pow(10, n) || a < 1e-3) {
    const { mantisse, exp } = wissenschaftlich(a, Math.max(1, n - 3));
    t = ohneNullen(mantisse) + 'E' + exp;
  } else {
    const vor = Math.floor(Math.log10(a)) + 1;
    t = ohneNullen(a.toFixed(Math.max(0, n - Math.max(vor, 1))));
  }
  if (einst.dezimal === ',') t = t.replace('.', ',');
  return (v < 0 ? '-' : '') + t;
}
