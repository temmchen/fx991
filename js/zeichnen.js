// zeichnen.js – Brücke vom Casio-Rechner zum Graphen (SHIFT OPTN, wie die QR-Funktion des ClassWiz,
// die eine Wertetabelle als Kurve aufs Handy schickt). Eine Eingabe im Lehrbuchformat wird über den
// Casio-Rechenbaum (parser.js, also mit Casio-Rangfolge: 1÷2x = 1/(2x)) in einen Funktionsterm für den
// Graphen (js/werkzeuge/graph.js, Syntax von RPN42) übersetzt. Variablen außer x werden durch ihren
// gespeicherten Wert ersetzt. Ohne DOM (läuft auch in JavaScriptCore).

import { parse } from './parser.js';
import * as Z from './zahl.js';
import { konstantenWert, PRAEFIX_EXPONENT } from './konstanten.js';

const nichtZeichenbar = (info) => Z.fehler('syntax', info || 'nicht zeichenbar');

// Bindungsstärke der erzeugten Teilterme
const ADD = 1, MUL = 2, NEG = 3, POW = 4, ATOM = 5;

/// Zahl als Text für den Graphen (Punkt als Dezimaltrenner, höchstens 15 Stellen)
export function zahlText(v) {
  if (!Number.isFinite(v)) throw nichtZeichenbar('Zahl');
  if (Number.isInteger(v) && Math.abs(v) < 1e15) return String(v);
  let t = Number(v.toPrecision(15)).toString();
  if (t.includes('e')) {
    const [m, e] = t.split('e');
    t = `${m}*10^(${Number(e)})`;
  }
  return t;
}

function wertTerm(w) {
  if (!w || w.t === 'c' || w.t === 'm' || w.t === 'v') throw nichtZeichenbar('Wert');
  const v = Z.zahl(w);
  const t = zahlText(Math.abs(v));
  const prec = t.includes('*') ? MUL : ATOM;
  return v < 0 ? { t: '-' + klammer({ t, p: prec }, POW), p: NEG } : { t, p: prec };
}

const klammer = (x, mindestens) => (x.p < mindestens ? `(${x.t})` : x.t);

/// Rechenbaum → { t: Text, p: Bindungsstärke }
function term(k, ktx) {
  switch (k.a) {
    case 'num': {
      let w;
      if (k.periode !== undefined) w = Z.ausPeriode(k.text, k.periode);
      else w = Z.ausDezimal(k.text);
      let x = { t: zahlText(Z.zahl(w)), p: ATOM };
      if (k.exp !== undefined) x = { t: `${x.t}*10^(${Number(k.exp)})`, p: MUL };
      return x;
    }
    case 'var':
      if (k.n === 'x') return { t: 'x', p: ATOM };
      return wertTerm(ktx.vars[k.n] || Z.NULL);
    case 'ans': return wertTerm(ktx.ans || Z.NULL);
    case 'k':
      if (k.n === 'pi') return { t: 'π', p: ATOM };
      if (k.n === 'e') return { t: 'e', p: ATOM };
      if (k.n === 'i') throw nichtZeichenbar('i');
      return wertTerm(konstantenWert(k.n));
    case 'klammer': return term(k.x, ktx);
    case 'neg': {
      const x = term(k.x, ktx);
      return { t: '-' + klammer(x, POW), p: NEG };
    }
    case 'bin': return binaer(k, ktx);
    case 'post': return nachgestellt(k, ktx);
    case 'pow': {
      const b = term(k.b, ktx), e = term(k.e, ktx);
      return { t: `${klammer(b, ATOM)}^${klammer(e, ATOM)}`, p: POW };
    }
    case 'fn': return funktion(k, ktx);
    case 'T': return schablone(k, ktx);
    default: throw nichtZeichenbar(k.a);
  }
}

function binaer(k, ktx) {
  const l = term(k.l, ktx), r = term(k.r, ktx);
  switch (k.op) {
    case '+': return { t: `${klammer(l, ADD)}+${r.p === NEG ? `(${r.t})` : klammer(r, ADD)}`, p: ADD };
    case '-': return { t: `${klammer(l, ADD)}-${r.p <= ADD || r.p === NEG ? `(${r.t})` : r.t}`, p: ADD };
    case '×': case 'imul':
      return { t: `${klammer(l, MUL)}*${r.p === NEG || r.p < MUL ? `(${r.t})` : r.t}`, p: MUL };
    case '÷':
      return { t: `${klammer(l, MUL)}/${r.p <= MUL || r.p === NEG ? `(${r.t})` : r.t}`, p: MUL };
    default: throw nichtZeichenbar(k.op);
  }
}

function nachgestellt(k, ktx) {
  const x = term(k.x, ktx);
  switch (k.op) {
    case '²': return { t: `${klammer(x, ATOM)}^2`, p: POW };
    case '³': return { t: `${klammer(x, ATOM)}^3`, p: POW };
    case '⁻¹': return { t: `${klammer(x, ATOM)}^(-1)`, p: POW };
    case '!': return { t: `fact(${x.t})`, p: ATOM };
    case '%': return { t: `${klammer(x, MUL)}/100`, p: MUL };
    default:
      if (k.op.startsWith('eng:')) {
        const e = PRAEFIX_EXPONENT[k.op.slice(4)];
        if (e === undefined) throw nichtZeichenbar(k.op);
        return { t: `${klammer(x, MUL)}*10^(${e})`, p: MUL };
      }
      throw nichtZeichenbar(k.op);
  }
}

const EINFACH = new Set(['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh', 'ln']);

function funktion(k, ktx) {
  const a = k.args.map((x) => term(x, ktx));
  if (EINFACH.has(k.f)) return { t: `${k.f}(${a[0].t})`, p: ATOM };
  if (k.f === 'log') {
    if (a.length === 1) return { t: `log(${a[0].t})`, p: ATOM };
    return { t: `ln(${a[1].t})/ln(${a[0].t})`, p: MUL };
  }
  if (k.f === 'Abs') return { t: `abs(${a[0].t})`, p: ATOM };
  throw nichtZeichenbar(k.f);
}

function schablone(k, ktx) {
  const s = k.s.map((x) => term(x, ktx));
  switch (k.v) {
    case 'frac': return { t: `${klammer(s[0], ATOM)}/${klammer(s[1], ATOM)}`, p: MUL };
    case 'mixed': {
      const minus = k.s[0].a === 'neg';
      const ganz = minus ? term(k.s[0].x, ktx) : s[0];
      const t = `${klammer(ganz, ADD)}+${klammer(s[1], ATOM)}/${klammer(s[2], ATOM)}`;
      return minus ? { t: `-(${t})`, p: NEG } : { t, p: ADD };
    }
    case 'sqrt': return { t: `sqrt(${s[0].t})`, p: ATOM };
    case 'cbrt': return { t: `cbrt(${s[0].t})`, p: ATOM };
    case 'root': return { t: `root(${s[1].t}; ${s[0].t})`, p: ATOM };
    case 'pow10': return { t: `10^${klammer(s[0], ATOM)}`, p: POW };
    case 'epow': return { t: `e^${klammer(s[0], ATOM)}`, p: POW };
    case 'log': return { t: `ln(${s[1].t})/ln(${s[0].t})`, p: MUL };
    case 'abs': return { t: `abs(${s[0].t})`, p: ATOM };
    default: throw nichtZeichenbar(k.v);
  }
}

/// Enthält die Eingabe die Variable x (auch in Schablonen)?
export function enthaeltX(zeile) {
  const such = (z) => z.some((e) => (e.k === 'var' && e.v === 'x') || (e.k === 'T' && e.s.some(such)));
  return such(zeile || []);
}

/// Casio-Eingabe → Funktionsterm des Graphen. „y = …“ zeichnet die rechte Seite.
/// ktx: { vars, ans } (Werte der Variablen außer x). Wirft einen Syntaxfehler, wenn nicht zeichenbar.
export function funktionstext(zeile, ktx) {
  const anw = parse(zeile);
  if (anw.length !== 1) throw nichtZeichenbar('mehrere Anweisungen');
  let k = anw[0];
  if (k.a === 'rel') {
    if (k.op !== '=' || k.l.a !== 'var' || k.l.n !== 'y') throw nichtZeichenbar('Gleichung');
    k = k.r;
  }
  return term(k, ktx).t;
}

/// Polynom a·xⁿ + … (Koeffizienten als Reals, höchster zuerst) als Funktionsterm
export function polynomText(koeff) {
  const n = koeff.length - 1;
  const teile = [];
  koeff.forEach((a, i) => {
    const v = Z.zahl(a);
    if (v === 0) return;
    const p = n - i;
    const betrag = Math.abs(v);
    let s = p === 0 ? zahlText(betrag) : (betrag === 1 ? '' : zahlText(betrag) + '*') + (p === 1 ? 'x' : `x^${p}`);
    if (s.includes('*10^(') && p === 0) s = `(${s})`;
    teile.push({ s, neg: v < 0 });
  });
  if (teile.length === 0) return '0';
  return teile.map((t, i) => (i === 0 ? (t.neg ? '-' : '') + t.s : (t.neg ? ' - ' : ' + ') + t.s)).join('');
}

/// Summe der Teile [Koeffizient, Term] in dieser Reihenfolge (wie der Rechner: a + b·x …): 0 entfällt,
/// Faktor 1 wird nicht geschrieben, „- 2*x“ statt „+ -2*x“. Term '' = Zahl allein.
function summe(teile) {
  const out = [];
  for (const [c, t] of teile) {
    if (c === 0) continue;
    const betrag = Math.abs(c);
    const s = t === '' ? zahlText(betrag) : (betrag === 1 ? '' : zahlText(betrag) + '*') + t;
    out.push({ s, neg: c < 0 });
  }
  if (out.length === 0) return '0';
  return out.map((x, i) => (i === 0 ? (x.neg ? '-' : '') + x.s : (x.neg ? ' - ' : ' + ') + x.s)).join('');
}

/// Faktor · Term (Faktor 1 bzw. −1 nicht geschrieben)
const produkt = (v, t) => (v === 1 ? t : v === -1 ? '-' + t : `${zahlText(v)}*${t}`);

/// Regressionskurve der Statistik als Funktionsterm (Typ wie in statistik.js) oder null.
/// Formen wie beim Rechner: y = a + bx, a + bx + cx², a + b·ln x, a·e^(bx), a·b^x, a·x^b, a + b/x
export function regressionText(typ, k) {
  const wert = (w) => (w ? Z.zahl(w) : NaN);
  const a = wert(k.a), b = wert(k.b), c = wert(k.c);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const bt = zahlText(b);
  switch (typ) {
    case 'lin': return summe([[a, ''], [b, 'x']]);
    case 'quad': return Number.isFinite(c) ? summe([[a, ''], [b, 'x'], [c, 'x^2']]) : null;
    case 'log': return summe([[a, ''], [b, 'ln(x)']]);
    case 'eexp': return produkt(a, b === 1 ? 'e^x' : b === -1 ? 'e^(-x)' : `e^(${bt}*x)`);
    case 'abexp': return produkt(a, `${b > 0 && !bt.includes('*') ? bt : `(${bt})`}^x`);
    case 'pot': return produkt(a, `x^(${bt})`);
    case 'inv': return summe([[a, ''], [Math.sign(b), Math.abs(b) === 1 ? '1/x' : `${zahlText(Math.abs(b))}/x`]]);
    default: return null;
  }
}
