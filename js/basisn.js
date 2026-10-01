// basisn.js – Rechnen im Modus Basis-N: ganze Zahlen mit 32 Bit (Zweierkomplement),
// Zahlsysteme DEC, HEX, BIN, OCT, logische Verknüpfungen and, or, xor, xnor, Not, Neg.

import { fehler } from './zahl.js';

export const BASEN = { DEC: 10, HEX: 16, BIN: 2, OCT: 8 };
const KUERZEL = { d: 'DEC', h: 'HEX', b: 'BIN', o: 'OCT' };
const ZWEI32 = 1n << 32n;
const MAX = (1n << 31n) - 1n, MIN = -(1n << 31n);

function bereich(v) {
  if (v > MAX || v < MIN) throw fehler('math');
  return v;
}

const ohneVorzeichen = (v) => (v < 0n ? v + ZWEI32 : v);
const mitVorzeichen = (u) => (u >= 1n << 31n ? u - ZWEI32 : u);

/// Literal (Text) in einer Basis → BigInt mit Vorzeichen
export function literal(text, basis) {
  const b = BASEN[basis];
  const gueltig = { 2: /^[01]+$/, 8: /^[0-7]+$/, 10: /^\d+$/, 16: /^[0-9A-F]+$/ }[b];
  if (!gueltig.test(text)) throw fehler('syntax');
  let v = 0n;
  for (const c of text) v = v * BigInt(b) + BigInt(parseInt(c, 16));
  if (b === 10) return bereich(v);
  if (v >= ZWEI32) throw fehler('math');
  return mitVorzeichen(v);
}

/// Rechenbaum auswerten (ktx.basis: aktuelle Basis)
export function werteBasis(k, ktx, basis = ktx.basis) {
  switch (k.a) {
    case 'num':
      if (k.exp !== undefined || k.periode !== undefined || k.text.includes('.')) throw fehler('syntax');
      return literal(k.text, basis);
    case 'klammer': return werteBasis(k.x, ktx, basis);
    case 'neg': return bereich(-werteBasis(k.x, ktx, basis));
    case 'pre': return werteBasis(k.x, ktx, KUERZEL[k.b]);
    case 'ans': return ktx.ansBasis || 0n;
    case 'var': {
      const v = ktx.varsBasis && ktx.varsBasis[k.n];
      return v === undefined ? 0n : v;
    }
    case 'bin': {
      const a = werteBasis(k.l, ktx, basis), b = werteBasis(k.r, ktx, basis);
      switch (k.op) {
        case '+': return bereich(a + b);
        case '-': return bereich(a - b);
        case '×': case 'imul': return bereich(a * b);
        case '÷': if (b === 0n) throw fehler('math'); return bereich(a / b);
        case 'and': return mitVorzeichen(ohneVorzeichen(a) & ohneVorzeichen(b));
        case 'or': return mitVorzeichen(ohneVorzeichen(a) | ohneVorzeichen(b));
        case 'xor': return mitVorzeichen(ohneVorzeichen(a) ^ ohneVorzeichen(b));
        case 'xnor': return mitVorzeichen((ZWEI32 - 1n) ^ (ohneVorzeichen(a) ^ ohneVorzeichen(b)));
        default: throw fehler('syntax');
      }
    }
    case 'fn': {
      if (k.args.length !== 1) throw fehler('syntax');
      const a = werteBasis(k.args[0], ktx, basis);
      if (k.f === 'Not') return mitVorzeichen((ZWEI32 - 1n) ^ ohneVorzeichen(a));
      if (k.f === 'Neg') return bereich(-a);
      throw fehler('syntax');
    }
    case 'post':
      if (k.op === '²') return bereich(werteBasis(k.x, ktx, basis) ** 2n);
      if (k.op === '³') return bereich(werteBasis(k.x, ktx, basis) ** 3n);
      throw fehler('syntax');
    default:
      throw fehler('syntax');
  }
}

/// Anzeige: Zeilen (BIN zweizeilig in Vierergruppen wie beim Rechner)
export function formatBasis(v, basis) {
  if (basis === 'DEC') return [v.toString()];
  const u = ohneVorzeichen(v);
  if (basis === 'HEX') return [u.toString(16).toUpperCase().padStart(8, '0')];
  if (basis === 'OCT') return [u.toString(8).padStart(11, '0')];
  const bits = u.toString(2).padStart(32, '0');
  const gruppen = (s) => s.match(/.{4}/g).join(' ');
  return [gruppen(bits.slice(0, 16)), gruppen(bits.slice(16))];
}
