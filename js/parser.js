// parser.js – Eingabezeile (eingabe.js) → Rechenbaum, mit der Rangfolge des fx-991DE X:
//
//   1  Klammern                       7  Multiplikation ohne Malzeichen (2π, 2(1+2), 2√3, Asin30)
//   2  Funktionen mit Klammer         8  nPr, nCr, ∠
//   3  nachgestellte Funktionen       9  Skalarprodukt ·
//      (x² x³ x⁻¹ x! °'" ° r g %,    10  ×, ÷
//      Präfixe k M m µ …), Potenzen  11  +, −
//   4  Brüche (Schablonen)           12  and
//   5  Vorzeichen (−), d h b o       13  or, xor, xnor
//   6  Umrechnungen, x̂ ŷ
//
// Bei gleicher Stufe wird von links nach rechts gerechnet. Fehlende schließende Klammern am Ende sind
// erlaubt. „6÷2(1+2)“ ergibt wie beim Rechner 1, weil die Multiplikation ohne Zeichen stärker bindet.

import { fehler } from './zahl.js';

const syntax = (info) => fehler('syntax', info);

// Bindungsstärken (größer = bindet stärker)
const LBP = {
  or: 10, xor: 10, xnor: 10,
  and: 20,
  '+': 30, '-': 30,
  '×': 40, '÷': 40,
  '·': 50,
  nPr: 60, nCr: 60, '∠': 60,
};
const BP_IMPLIZIT = 70;
const BP_NEG = 80;
const BP_POST = 90;      // ² ³ ⁻¹ ! % ° r g dms Präfixe, Potenzschablone
const BP_POST_TIEF = 75; // Umrechnungen, Schätzwerte (Stufe 6: schwächer als das Vorzeichen)
const BP_POST_GANZ = 1;  // ▸r∠θ, ▸a+bi gelten für den ganzen Ausdruck

/// Nachgestellte Operatoren der Stufe 6
const POST_TIEF = (v) => v.startsWith('conv:') || v === 'xhut' || v === 'yhut' || v === 'xhut1' || v === 'xhut2';
const POST_GANZ = (v) => v === '▸polar' || v === '▸rechtw';

const RELATIONEN = new Set(['=', '≠', '<', '>', '≤', '≥']);

/// Funktionen mit Klammer und erlaubter Anzahl Argumente [min, max]
export const FUNKTIONEN = {
  sin: [1, 1], cos: [1, 1], tan: [1, 1], asin: [1, 1], acos: [1, 1], atan: [1, 1],
  sinh: [1, 1], cosh: [1, 1], tanh: [1, 1], asinh: [1, 1], acosh: [1, 1], atanh: [1, 1],
  log: [1, 2], ln: [1, 1], Pol: [2, 2], Rec: [2, 2], Rnd: [1, 1], RanInt: [2, 2], Abs: [1, 1],
  arg: [1, 1], Conjg: [1, 1], ReP: [1, 1], ImP: [1, 1],
  det: [1, 1], Trn: [1, 1], Identity: [1, 1], Ref: [1, 1], Rref: [1, 1],
  UnitV: [1, 1], Angle: [2, 2],
  Not: [1, 1], Neg: [1, 1],
  P: [1, 1], Q: [1, 1], R: [1, 1],
};

// MARK: Zerlegen einer Zeile in Lexeme

/// Lexeme: { t: 'NUM', text, exp?: Lexem-Liste, periode?: Text }, { t: 'OP', v }, { t: 'NEG' }, …
export function lexe(zeile) {
  const out = [];
  let i = 0;
  while (i < zeile.length) {
    const e = zeile[i];
    switch (e.k) {
      case 'z': {
        let text = '';
        while (i < zeile.length && zeile[i].k === 'z') { text += zeile[i].v; i++; }
        const lex = { t: 'NUM', text };
        // Periode (fx-991DE X): Zahl mit Komma, gefolgt von der Periodenschablone
        if (i < zeile.length && zeile[i].k === 'T' && zeile[i].v === 'period') {
          lex.periode = zeile[i].s[0];
          i++;
        }
        // Zehnerexponent ×₁₀ n
        if (i < zeile.length && zeile[i].k === 'e10') {
          i++;
          const [exp, weiter] = leseExponent(zeile, i);
          lex.exp = exp;
          i = weiter;
        }
        // Grad-Minuten-Sekunden: 2°20°30° (Taste °'" nach jedem Teil)
        if (i < zeile.length && zeile[i].k === 'post' && zeile[i].v === 'dms') {
          const teile = [lex];
          i++;
          while (teile.length < 3 && i < zeile.length && zeile[i].k === 'z') {
            let j = i, t = '';
            while (j < zeile.length && zeile[j].k === 'z') { t += zeile[j].v; j++; }
            if (j < zeile.length && zeile[j].k === 'post' && zeile[j].v === 'dms') {
              teile.push({ t: 'NUM', text: t });
              i = j + 1;
            } else break;
          }
          out.push({ t: 'DMS', teile });
          continue;
        }
        out.push(lex);
        continue;
      }
      case 'e10': {
        i++;
        const [exp, weiter] = leseExponent(zeile, i);
        out.push({ t: 'NUM', text: '1', exp });
        i = weiter;
        continue;
      }
      case 'op':
        if (e.v === ',') out.push({ t: 'SEP' });
        else if (e.v === ':') out.push({ t: 'DOPPEL' });
        else if (RELATIONEN.has(e.v)) out.push({ t: 'REL', v: e.v });
        else out.push({ t: 'OP', v: e.v });
        break;
      case 'neg': out.push({ t: 'NEG' }); break;
      case '(': out.push({ t: 'LP' }); break;
      case ')': out.push({ t: 'RP' }); break;
      case 'fn': out.push({ t: 'FN', v: e.v }); break;
      case 'var': out.push({ t: 'VAR', v: e.v }); break;
      case 'ans': out.push({ t: 'ANS' }); break;
      case 'ran': out.push({ t: 'RAN' }); break;
      case 'k': out.push({ t: 'K', v: e.v }); break;
      case 'post': out.push({ t: 'POST', v: e.v }); break;
      case 'pre': out.push({ t: 'PRE', v: e.v }); break;
      case 'mat': out.push({ t: 'MAT', v: e.v }); break;
      case 'vct': out.push({ t: 'VCT', v: e.v }); break;
      case 'stat': out.push({ t: 'STAT', v: e.v }); break;
      case 'T': out.push({ t: 'T', e }); break;
      default: throw syntax('unbekanntes Element ' + e.k);
    }
    i++;
  }
  return out;
}

/// Exponent nach ×₁₀: optional (−) bzw. −, dann Ziffern
function leseExponent(zeile, i) {
  let vz = '';
  if (i < zeile.length && (zeile[i].k === 'neg' || (zeile[i].k === 'op' && zeile[i].v === '-'))) { vz = '-'; i++; }
  else if (i < zeile.length && zeile[i].k === 'op' && zeile[i].v === '+') i++;
  let text = '';
  while (i < zeile.length && zeile[i].k === 'z' && /\d/.test(zeile[i].v)) { text += zeile[i].v; i++; }
  if (text === '') throw syntax('Exponent fehlt');
  return [vz + text, i];
}

// MARK: Pratt-Parser

class Leser {
  constructor(lexeme) {
    this.l = lexeme;
    this.i = 0;
  }
  sieh() { return this.l[this.i]; }
  nimm() { return this.l[this.i++]; }
  ende() { return this.i >= this.l.length; }
}

/// Kann dieses Lexem einen Operanden beginnen (→ Multiplikation ohne Zeichen)?
function beginntOperand(lx) {
  if (!lx) return false;
  switch (lx.t) {
    case 'NUM': case 'DMS': case 'LP': case 'FN': case 'VAR': case 'ANS': case 'RAN': case 'K':
    case 'MAT': case 'VCT': case 'STAT': case 'PRE':
      return true;
    case 'T':
      return lx.e.v !== 'pow';
    default:
      return false;
  }
}

/// Linke Bindungsstärke des nächsten Lexems (0: Ausdruck endet hier)
function lbp(lx) {
  if (!lx) return 0;
  switch (lx.t) {
    case 'OP': return LBP[lx.v] || 0;
    case 'POST':
      if (POST_GANZ(lx.v)) return BP_POST_GANZ;
      if (POST_TIEF(lx.v)) return BP_POST_TIEF;
      return BP_POST;
    case 'T': return lx.e.v === 'pow' ? BP_POST : BP_IMPLIZIT;
    default: return beginntOperand(lx) ? BP_IMPLIZIT : 0;
  }
}

function ausdruck(L, rbp) {
  let links = praefix(L);
  for (;;) {
    const lx = L.sieh();
    const bp = lbp(lx);
    if (bp <= rbp) break;
    if (lx.t === 'OP') {
      L.nimm();
      // linksassoziativ: rechte Seite bindet eine Stufe stärker
      const rechts = ausdruck(L, bp);
      links = { a: 'bin', op: lx.v, l: links, r: rechts };
    } else if (lx.t === 'POST') {
      L.nimm();
      links = { a: 'post', op: lx.v, x: links };
    } else if (lx.t === 'T' && lx.e.v === 'pow') {
      L.nimm();
      links = { a: 'pow', b: links, e: feld(lx.e.s[0]) };
    } else {
      // Multiplikation ohne Zeichen
      const rechts = ausdruck(L, BP_IMPLIZIT);
      links = { a: 'bin', op: 'imul', l: links, r: rechts };
    }
  }
  return links;
}

function praefix(L) {
  const lx = L.nimm();
  if (!lx) throw syntax('Operand fehlt');
  switch (lx.t) {
    case 'NUM': return zahlKnoten(lx);
    case 'DMS': return { a: 'dms', teile: lx.teile.map(zahlKnoten) };
    case 'NEG': return { a: 'neg', x: ausdruck(L, BP_NEG) };
    case 'OP':
      // + oder − am Anfang: Vorzeichen
      if (lx.v === '-') return { a: 'neg', x: ausdruck(L, BP_NEG) };
      if (lx.v === '+') return ausdruck(L, BP_NEG);
      throw syntax('Operator ohne Operand');
    case 'PRE': return { a: 'pre', b: lx.v, x: ausdruck(L, BP_NEG) };
    case 'LP': {
      const x = ausdruck(L, 0);
      const z = L.sieh();
      if (z && z.t === 'RP') L.nimm();
      else if (z && !(z.t === 'DOPPEL' || z.t === 'REL')) throw syntax('Klammer');
      return { a: 'klammer', x };
    }
    case 'FN': return funktion(L, lx.v);
    case 'VAR': return { a: 'var', n: lx.v };
    case 'ANS': return { a: 'ans' };
    case 'RAN': return { a: 'ran' };
    case 'K': return { a: 'k', n: lx.v };
    case 'MAT': return { a: 'mat', n: lx.v };
    case 'VCT': return { a: 'vct', n: lx.v };
    case 'STAT': return { a: 'stat', n: lx.v };
    case 'T': return schablonenKnoten(lx.e);
    default: throw syntax('unerwartet: ' + lx.t);
  }
}

function zahlKnoten(lx) {
  const k = { a: 'num', text: lx.text };
  if (lx.periode !== undefined) {
    const p = lx.periode;
    if (!p.every((e) => e.k === 'z' && /\d/.test(e.v)) || p.length === 0) throw syntax('Periode');
    k.periode = p.map((e) => e.v).join('');
  }
  if (lx.exp !== undefined) k.exp = lx.exp;
  return k;
}

function funktion(L, name) {
  const [min, max] = FUNKTIONEN[name] || [1, 1];
  const args = [];
  // leeres Argument erlaubt bei log( mit Basis (log(,x) ist ein Fehler) – nicht nötig
  for (;;) {
    const z = L.sieh();
    if (!z || z.t === 'RP' || z.t === 'DOPPEL' || z.t === 'REL') {
      if (args.length === 0) throw syntax('Argument fehlt');
      if (z && z.t === 'RP') L.nimm();
      break;
    }
    args.push(ausdruck(L, 0));
    const n = L.sieh();
    if (n && n.t === 'SEP') {
      L.nimm();
      continue;
    }
    if (n && n.t === 'RP') { L.nimm(); break; }
    if (!n || n.t === 'DOPPEL' || n.t === 'REL') break;
    throw syntax('Funktion');
  }
  if (args.length < min || args.length > max) throw syntax('Anzahl Argumente');
  return { a: 'fn', f: name, args };
}

/// Feld einer Schablone als eigener Ausdruck (leeres Feld → null)
function feld(zeile) {
  if (zeile.length === 0) return null;
  const L = new Leser(lexe(zeile));
  const x = ausdruck(L, 0);
  if (!L.ende()) {
    const r = L.sieh();
    if (r.t === 'RP') throw syntax('Klammer');
    throw syntax('Feld');
  }
  return x;
}

function schablonenKnoten(e) {
  if (e.v === 'period') throw syntax('Periode ohne Zahl');
  if (e.v === 'pow') throw syntax('Potenz ohne Basis');
  const s = e.s.map(feld);
  // Pflichtfelder: alle außer der Basis von log (nicht vorhanden → Fehler wie beim Rechner)
  s.forEach((x) => { if (x === null) throw syntax('leeres Feld'); });
  return { a: 'T', v: e.v, s };
}

// MARK: Ganze Eingabe

/// Parst eine Zeile mit Mehrfachanweisungen (:) und Relationen (=, ≠, <, >, ≤, ≥)
export function parse(zeile) {
  const L = new Leser(lexe(zeile));
  if (L.ende()) throw syntax('leer');
  const anweisungen = [];
  for (;;) {
    let x = ausdruck(L, 0);
    let z = L.sieh();
    if (z && z.t === 'REL') {
      L.nimm();
      const r = ausdruck(L, 0);
      x = { a: 'rel', op: z.v, l: x, r };
      z = L.sieh();
    }
    anweisungen.push(x);
    if (!z) break;
    if (z.t === 'DOPPEL') {
      L.nimm();
      if (L.ende()) break;
      continue;
    }
    if (z.t === 'RP') throw syntax('Klammer zu viel');
    throw syntax('unerwartet');
  }
  return anweisungen;
}

/// Variablen, die in der Eingabe vorkommen, in der Reihenfolge des ersten Auftretens (für CALC/SOLVE)
export function variablenIn(zeile) {
  const liste = [];
  const such = (z) => {
    for (const e of z) {
      if (e.k === 'var' && !liste.includes(e.v)) liste.push(e.v);
      if (e.k === 'T') {
        // in ∫, d/dx, Σ ist x die Laufvariable
        const s = (e.v === 'int' || e.v === 'diff' || e.v === 'sum') ? e.s.slice(1) : e.s;
        if (e.v === 'int' || e.v === 'diff' || e.v === 'sum') {
          for (const f of e.s.slice(0, 1)) such(f.filter((x) => !(x.k === 'var' && x.v === 'x')));
        }
        for (const f of s) such(f);
      }
    }
  };
  such(zeile);
  return liste;
}
