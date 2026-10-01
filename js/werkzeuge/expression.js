// expression.js – Zerleger (Tokenizer), Parser, symbolisches Ableiten und Übersetzen von Termen
// in schnelle JavaScript-Funktionen (Portierung von Expression.swift).
//
// Zwei Modi:
//  • 'graph'  – wie Desmos/GeoGebra: einbuchstabige Variablen, implizite Multiplikation
//               („2ax“ = 2·a·x, „sin2x“ = sin(2x), „ln|x|“), Ableitungen f'(x), f''(x)
//  • 'solver' – Formeln mit mehrbuchstabigen Variablen wie beim HP-42S-SOLVER („P = U*I“, „X_L“)
//
// Knoten sind schlichte Objekte:
//   {k:'num', v} {k:'v', n} {k:'neg', a} {k:'add'|'sub'|'mul'|'div'|'pow', a, b}
//   {k:'fn', f /*Builtin-Name*/, args:[…]} {k:'user', n, o /*Ableitungsordnung*/, a} {k:'nd', a}
// Tokens: {t:'num',v} {t:'id',s} {t:'fn',b} {t:'user',s} {t:'const',v} {t:'sym',c}
import { gamma } from './numerics.js';

export class MathError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MathError';
  }
  get description() { return this.message; }
}

// MARK: - Hilfen für Swift-gleiches Zahlenverhalten

/// pow mit den Sonderfällen von C/Foundation: pow(1, y) = 1 und pow(−1, ±∞) = 1 (JS liefert NaN)
export function cPow(a, b) {
  if (a === 1) return 1;
  if (a === -1 && (b === Infinity || b === -Infinity)) return 1;
  return Math.pow(a, b);
}

/// Swift-Rundung x.rounded(): halb von 0 weg
export function roundHalfAway(x) {
  return Math.sign(x) * Math.round(Math.abs(x));
}

/// Ganzzahlig im Sinne von Swift „v == v.rounded()“ (auch ±∞, nicht NaN)
function isWhole(v) {
  return Math.trunc(v) === v;
}

/// Swift.min(x, y) = y < x ? y : x (Vorzeichen der Null wie Swift)
function swiftMin(x, y) { return y < x ? y : x; }
/// Swift.max(x, y) = y >= x ? y : x
function swiftMax(x, y) { return y >= x ? y : x; }

/// Text einer Gleitkommazahl wie Swift String(Double): „2.0“, „0.5“, „1e-05“, „1e+16“, „nan“, „inf“
export function swiftDoubleString(v) {
  if (Number.isNaN(v)) return 'nan';
  if (v === Infinity) return 'inf';
  if (v === -Infinity) return '-inf';
  if (v === 0) return Object.is(v, -0) ? '-0.0' : '0.0';
  const ex = v.toExponential();            // kürzeste eindeutige Ziffernfolge
  const k = ex.indexOf('e');
  const e10 = parseInt(ex.slice(k + 1), 10);
  // Swift schaltet auf Exponentialdarstellung unter 1e-4 und über 2^53
  if (e10 < -4 || Math.abs(v) > 9007199254740992) {
    const mant = ex.slice(0, k);
    const sign = e10 < 0 ? '-' : '+';
    const digits = String(Math.abs(e10)).padStart(2, '0');
    return mant + 'e' + sign + digits;
  }
  const s = String(v);
  return s.includes('.') ? s : s + '.0';
}

// MARK: - Eingebaute Funktionen

/// Alle eingebauten Funktionen (Rohwerte wie Swift „Builtin.rawValue“)
export const BUILTIN_CASES = Object.freeze([
  'sin', 'cos', 'tan', 'cot', 'asin', 'acos', 'atan', 'acot',
  'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh',
  'ln', 'log', 'ld', 'exp', 'sqrt', 'cbrt', 'root',
  'abs', 'sign', 'floor', 'ceil', 'round', 'frac', 'trunc',
  'min', 'max', 'mod',
  'gamma', 'fact', 'step',
  'degsym',   // Gradzeichen „°“ – Umrechnung in den aktuellen Winkelmodus
]);

function nullProto(obj) {
  return Object.freeze(Object.assign(Object.create(null), obj));
}

/// Name → Builtin (wie Builtin.names in Swift); ohne Prototyp, damit „constructor“ o. Ä. nicht trifft
export const BUILTINS = nullProto({
  sin: 'sin', cos: 'cos', tan: 'tan', cot: 'cot',
  asin: 'asin', arcsin: 'asin', acos: 'acos', arccos: 'acos',
  atan: 'atan', arctan: 'atan', acot: 'acot', arccot: 'acot',
  sinh: 'sinh', cosh: 'cosh', tanh: 'tanh',
  asinh: 'asinh', arsinh: 'asinh', arcsinh: 'asinh',
  acosh: 'acosh', arcosh: 'acosh', arccosh: 'acosh',
  atanh: 'atanh', artanh: 'atanh', arctanh: 'atanh',
  ln: 'ln', log: 'log', lg: 'log', ld: 'ld', lb: 'ld', exp: 'exp',
  sqrt: 'sqrt', wurzel: 'sqrt', cbrt: 'cbrt', root: 'root', nroot: 'root',
  abs: 'abs', betrag: 'abs', sign: 'sign', sgn: 'sign', signum: 'sign',
  floor: 'floor', ceil: 'ceil', round: 'round', frac: 'frac', trunc: 'trunc',
  min: 'min', max: 'max', mod: 'mod',
  gamma: 'gamma', fact: 'fact', step: 'step', heaviside: 'step',
});

/// Builtin zu einem Namen oder null
export function builtinFor(name) {
  const b = BUILTINS[name];
  return b === undefined ? null : b;
}

/// Namen nach Länge absteigend (für die gierige Zerlegung im Graph-Modus)
export const BUILTIN_NAMES_BY_LENGTH = Object.freeze(
  Object.keys(BUILTINS).sort((x, y) => y.length - x.length).map((k) => [k, BUILTINS[k]]));

const INVERSE = nullProto({
  sin: 'asin', cos: 'acos', tan: 'atan', cot: 'acot', sinh: 'asinh', cosh: 'acosh', tanh: 'atanh',
});

/// Umkehrfunktion (für sin^-1 usw.) oder null
export function builtinInverse(b) {
  const inv = INVERSE[b];
  return inv === undefined ? null : inv;
}

// MARK: - Syntaxbaum

export const N = {
  num: (v) => ({ k: 'num', v }),
  v: (n) => ({ k: 'v', n }),                           // Variable (x, Parameter a, Solver-Variable U …)
  neg: (a) => ({ k: 'neg', a }),
  add: (a, b) => ({ k: 'add', a, b }),
  sub: (a, b) => ({ k: 'sub', a, b }),
  mul: (a, b) => ({ k: 'mul', a, b }),
  div: (a, b) => ({ k: 'div', a, b }),
  pow: (a, b) => ({ k: 'pow', a, b }),
  fn: (f, args) => ({ k: 'fn', f, args }),
  user: (n, o, a) => ({ k: 'user', n, o, a }),     // f(u), f'(u) … : Name, Ableitungsordnung, Argument
  nd: (a) => ({ k: 'nd', a }),                      // numerische Ableitung nach der Hauptvariablen
};


export function nodeIsZero(n) { return n.k === 'num' && n.v === 0; }
export function nodeIsOne(n) { return n.k === 'num' && n.v === 1; }
export function nodeIsNumber(n) { return n.k === 'num'; }

/// Strukturgleichheit wie Swift „Equatable“ (NaN ≠ NaN, 0 = −0)
export function nodeEquals(a, b) {
  if (!a || !b || a.k !== b.k) return false;
  switch (a.k) {
    case 'num': return a.v === b.v;
    case 'v': return a.n === b.n;
    case 'neg': case 'nd': return nodeEquals(a.a, b.a);
    case 'add': case 'sub': case 'mul': case 'div': case 'pow':
      return nodeEquals(a.a, b.a) && nodeEquals(a.b, b.b);
    case 'fn':
      if (a.f !== b.f || a.args.length !== b.args.length) return false;
      for (let i = 0; i < a.args.length; i++) if (!nodeEquals(a.args[i], b.args[i])) return false;
      return true;
    case 'user': return a.n === b.n && a.o === b.o && nodeEquals(a.a, b.a);
    default: return false;
  }
}

/// Textdarstellung wie Swift „Node.description“ (voll geklammert, für Vergleiche und Fehlersuche)
export function nodeToString(n) {
  switch (n.k) {
    case 'num': {
      const v = n.v;
      if (v === roundHalfAway(v) && Math.abs(v) < 1e15) return String(Math.trunc(v) || 0);
      return swiftDoubleString(v);
    }
    case 'v': return n.n;
    case 'neg': return `(-${nodeToString(n.a)})`;
    case 'add': return `(${nodeToString(n.a)}+${nodeToString(n.b)})`;
    case 'sub': return `(${nodeToString(n.a)}-${nodeToString(n.b)})`;
    case 'mul': return `(${nodeToString(n.a)}*${nodeToString(n.b)})`;
    case 'div': return `(${nodeToString(n.a)}/${nodeToString(n.b)})`;
    case 'pow': return `(${nodeToString(n.a)}^${nodeToString(n.b)})`;
    case 'fn': return `${n.f}(${n.args.map(nodeToString).join(';')})`;
    case 'user': return `${n.n}${"'".repeat(n.o)}(${nodeToString(n.a)})`;
    case 'nd': return `nd(${nodeToString(n.a)})`;
    default: return '?';
  }
}

/// Enthält der Term die Variable (oder eine numerische Ableitung, die immer von x abhängt)?
export function containsVar(n, variable) {
  switch (n.k) {
    case 'num': return false;
    case 'v': return n.n === variable;
    case 'neg': return containsVar(n.a, variable);
    case 'add': case 'sub': case 'mul': case 'div': case 'pow':
      return containsVar(n.a, variable) || containsVar(n.b, variable);
    case 'fn': return n.args.some((a) => containsVar(a, variable));
    case 'user': return containsVar(n.a, variable);
    case 'nd': return true;
    default: return false;
  }
}

/// Alle Variablennamen in Reihenfolge des ersten Auftretens
export function variables(node) {
  const out = [];
  const walk = (n) => {
    switch (n.k) {
      case 'num': break;
      case 'v': if (!out.includes(n.n)) out.push(n.n); break;
      case 'neg': case 'nd': walk(n.a); break;
      case 'add': case 'sub': case 'mul': case 'div': case 'pow': walk(n.a); walk(n.b); break;
      case 'fn': n.args.forEach(walk); break;
      case 'user': walk(n.a); break;
    }
  };
  walk(node);
  return out;
}

/// Namen aller aufgerufenen benutzerdefinierten Funktionen
export function userFunctions(node) {
  const out = new Set();
  const walk = (n) => {
    switch (n.k) {
      case 'num': case 'v': break;
      case 'neg': case 'nd': walk(n.a); break;
      case 'add': case 'sub': case 'mul': case 'div': case 'pow': walk(n.a); walk(n.b); break;
      case 'fn': n.args.forEach(walk); break;
      case 'user': out.add(n.n); walk(n.a); break;
    }
  };
  walk(node);
  return out;
}

// MARK: - Zerleger

/// Text eines Tokens wie Swift „Token.text“ (für Fehlermeldungen)
export function tokenText(tok) {
  switch (tok.t) {
    case 'num': return swiftDoubleString(tok.v);
    case 'id': case 'user': return tok.s;
    case 'fn': return tok.b;
    case 'const': return tok.v === Math.PI ? 'π' : 'e';
    case 'sym': return tok.c;
    default: return '?';
  }
}

/// Gleichheit zweier Tokens (wie Swift „Token: Equatable“)
export function tokenEquals(a, b) {
  if (!a || !b || a.t !== b.t) return false;
  switch (a.t) {
    case 'num': case 'const': return a.v === b.v;
    case 'id': case 'user': return a.s === b.s;
    case 'fn': return a.b === b.b;
    case 'sym': return a.c === b.c;
    default: return false;
  }
}

const isSymTok = (tok, c) => tok !== undefined && tok !== null && tok.t === 'sym' && tok.c === c;

const SUPERSCRIPTS = nullProto({
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-',
});

const SEGMENTER = (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function')
  ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;

/// Zerlegt einen Text in Zeichen wie Swift „Array(String)“ (Graphem-Gruppen, z. B. „e“ + Akzent = 1 Zeichen)
export function characters(s) {
  // unterhalb U+0300 ist jeder Codepunkt eine eigene Gruppe – außer CR LF
  if (/^[\u0000-˿]*$/.test(s) && !s.includes('\r\n')) return Array.from(s);
  if (SEGMENTER) return Array.from(SEGMENTER.segment(s), (x) => x.segment);
  return Array.from(s);
}

const ALPHABETIC = /^\p{Alphabetic}/u;
const SYMBOLS = new Set(Array.from("+-*/^!()|;,='°"));

function isDigit(c) { return c !== undefined && c >= '0' && c <= '9'; }
function isLetter(c) {
  if (c === undefined) return false;
  if (c === 'π' || c === '√' || c === '∛' || c === '°') return false;
  return ALPHABETIC.test(c);   // wie Swift Character.isLetter: erster Skalar alphabetisch
}

/// Vereinheitlicht Sonderzeichen: − · × ÷ : ² ³ √ [ ] { } …  → Zeichenliste
function normalize(s) {
  const out = [];
  const chars = characters(s);
  let i = 0;
  while (i < chars.length) {
    const c = chars[i];
    if (SUPERSCRIPTS[c] !== undefined) {
      let sup = '';
      while (i < chars.length && SUPERSCRIPTS[chars[i]] !== undefined) { sup += SUPERSCRIPTS[chars[i]]; i++; }
      out.push(...Array.from('^(' + sup + ')'));
      continue;
    }
    switch (c) {
      case '−': case '–': case '—': out.push('-'); break;
      case '·': case '×': case '⋅': case '∙': case '•': out.push('*'); break;
      case '÷': case ':': out.push('/'); break;
      case '[': case '{': out.push('('); break;
      case ']': case '}': out.push(')'); break;
      case '’': case '′': case '`': case '´': out.push("'"); break;
      case '*':
        if (i + 1 < chars.length && chars[i + 1] === '*') { out.push('^'); i++; } else { out.push('*'); }
        break;
      default: out.push(c);
    }
    i++;
  }
  return out;
}

function tokenize(text, mode = 'graph', userFunctionNames = new Set()) {
  const ch = normalize(text === null || text === undefined ? '' : String(text));
  const n = ch.length;
  const toks = [];
  let i = 0;
  const userNames = Array.from(userFunctionNames || [], (s) => [s, characters(s).length])
    .sort((x, y) => y[1] - x[1]);

  const nextNonSpace = (j) => {
    let k = j;
    while (k < n && ch[k] === ' ') k++;
    return k < n ? ch[k] : null;
  };

  while (i < n) {
    const c = ch[i];
    if (c === ' ' || c === '\t' || c === '\n') { i++; continue; }

    // Zahl: 12  3.5  3,5  .5  1.2e-3  2E6
    if (isDigit(c) || (c === '.' && i + 1 < n && isDigit(ch[i + 1]))) {
      let s = '';
      while (i < n && isDigit(ch[i])) { s += ch[i]; i++; }
      if (i < n && (ch[i] === '.' || (ch[i] === ',' && i + 1 < n && isDigit(ch[i + 1]) && s !== ''))) {
        if (ch[i] === '.' || (i + 1 < n && isDigit(ch[i + 1]))) {
          s += '.';
          i++;
          while (i < n && isDigit(ch[i])) { s += ch[i]; i++; }
        }
      }
      if (i < n && (ch[i] === 'e' || ch[i] === 'E')) {
        let j = i + 1;
        let exp = 'e';
        if (j < n && (ch[j] === '+' || ch[j] === '-')) { exp += ch[j]; j++; }
        if (j < n && isDigit(ch[j])) {
          while (j < n && isDigit(ch[j])) { exp += ch[j]; j++; }
          s += exp;
          i = j;
        }
      }
      if (s.endsWith('.')) s += '0';
      if (s.startsWith('.')) s = '0' + s;
      const v = /^[0-9]+(\.[0-9]+)?(e[+-]?[0-9]+)?$/.test(s) ? Number(s) : NaN;
      if (Number.isNaN(v)) throw new MathError(`Ungültige Zahl „${s}“`);
      toks.push({ t: 'num', v });
      continue;
    }

    if (c === 'π') { toks.push({ t: 'const', v: Math.PI }); i++; continue; }
    if (c === '√') { toks.push({ t: 'fn', b: 'sqrt' }); i++; continue; }
    if (c === '∛') { toks.push({ t: 'fn', b: 'cbrt' }); i++; continue; }
    if (c === '∞') { toks.push({ t: 'num', v: Infinity }); i++; continue; }

    if (isLetter(c) || (mode === 'solver' && c === '_')) {
      if (mode === 'solver') {
        let j = i;
        while (j < n && (isLetter(ch[j]) || isDigit(ch[j]) || ch[j] === '_')) j++;
        const word = ch.slice(i, j).join('');
        i = j;
        const b = BUILTINS[word.toLowerCase()];
        if (b !== undefined && nextNonSpace(j) === '(') {
          toks.push({ t: 'fn', b });
        } else if (word === 'pi' || word === 'PI') {
          toks.push({ t: 'const', v: Math.PI });
        } else if (word === 'e') {
          toks.push({ t: 'const', v: Math.E });
        } else {
          toks.push({ t: 'id', s: word });
        }
        continue;
      }
      // Graph-Modus: 1) benutzerdefinierte Funktion, gefolgt von ( oder '
      let matched = false;
      for (const [name, len] of userNames) {
        if (i + len <= n && ch.slice(i, i + len).join('') === name) {
          const after = nextNonSpace(i + len);
          if (after === '(' || after === "'") {
            toks.push({ t: 'user', s: name });
            i += len;
            matched = true;
            break;
          }
        }
      }
      if (matched) continue;
      // 2) längster eingebauter Funktionsname oder „pi“
      for (const [name, b] of BUILTIN_NAMES_BY_LENGTH) {
        if (name.length < 2) continue;
        const len = name.length;
        if (i + len <= n && ch.slice(i, i + len).join('').toLowerCase() === name) {
          toks.push({ t: 'fn', b });
          i += len;
          matched = true;
          break;
        }
      }
      if (matched) continue;
      if (i + 2 <= n && ch.slice(i, i + 2).join('').toLowerCase() === 'pi') {
        toks.push({ t: 'const', v: Math.PI });
        i += 2;
        continue;
      }
      // 3) einzelner Buchstabe: Variable/Parameter, „e“ = Eulersche Zahl
      if (c === 'e') toks.push({ t: 'const', v: Math.E }); else toks.push({ t: 'id', s: c });
      i++;
      continue;
    }

    if (SYMBOLS.has(c)) {
      toks.push({ t: 'sym', c });
      i++;
      continue;
    }
    throw new MathError(`Unbekanntes Zeichen „${c}“`);
  }
  return toks;
}

export const Tokenizer = {
  normalize,
  isDigit,
  isLetter,
  /// Zerlegt den Text in Tokens; userFunctions: Set (oder Liste) der Namen benutzerdefinierter Funktionen
  tokenize,
};

// MARK: - Parser

class ParserState {
  constructor(tokens, mode) {
    this.t = tokens;
    this.p = 0;
    this.absDepth = 0;
    this.mode = mode;
  }

  get peek() { return this.p < this.t.length ? this.t[this.p] : null; }
  isSym(c) { return isSymTok(this.peek, c); }

  expect(c) {
    if (!this.isSym(c)) {
      if (c === ')') throw new MathError('Eine „)“ fehlt');
      throw new MathError(`„${c}“ erwartet`);
    }
    this.p++;
  }

  expression() {
    let lhs = this.term();
    for (;;) {
      if (this.isSym('+')) { this.p++; lhs = N.add(lhs, this.term()); }
      else if (this.isSym('-')) { this.p++; lhs = N.sub(lhs, this.term()); }
      else return lhs;
    }
  }

  startsImplicitFactor(allowFunctions = true) {
    const tok = this.peek;
    if (tok === null) return false;
    switch (tok.t) {
      case 'num': case 'id': case 'const': return true;
      case 'fn': case 'user': return allowFunctions;
      case 'sym': return tok.c === '(' || (tok.c === '|' && this.absDepth === 0);
      default: return false;
    }
  }

  term() {
    let lhs = this.unary();
    for (;;) {
      if (this.isSym('*')) { this.p++; lhs = N.mul(lhs, this.unary()); }
      else if (this.isSym('/')) { this.p++; lhs = N.div(lhs, this.unary()); }
      else if (this.startsImplicitFactor()) { lhs = N.mul(lhs, this.power()); }
      else return lhs;
    }
  }

  unary() {
    if (this.isSym('-')) {
      this.p++;
      const u = this.unary();
      if (u.k === 'num') return N.num(-u.v);
      return N.neg(u);
    }
    if (this.isSym('+')) { this.p++; return this.unary(); }
    return this.power();
  }

  power() {
    const base = this.postfix();
    if (this.isSym('^')) {
      this.p++;
      const ex = this.unary();
      return N.pow(base, ex);
    }
    return base;
  }

  postfix() {
    let n = this.primary();
    for (;;) {
      if (this.isSym('!')) { this.p++; n = N.fn('fact', [n]); }
      else if (this.isSym('°')) { this.p++; n = N.fn('degsym', [n]); }
      else return n;
    }
  }

  primary() {
    if (this.p >= this.t.length) throw new MathError('Ausdruck unvollständig');
    const tok = this.t[this.p];
    this.p++;
    switch (tok.t) {
      case 'num': return N.num(tok.v);
      case 'const': return N.num(tok.v);
      case 'id': return N.v(tok.s);
      case 'fn': return this.functionCall(tok.b);
      case 'user': {
        let order = 0;
        while (this.isSym("'")) { this.p++; order++; }
        if (!this.isSym('(')) throw new MathError(`„(“ nach ${tok.s} erwartet`);
        this.p++;
        const saved = this.absDepth;
        this.absDepth = 0;
        const arg = this.expression();
        this.absDepth = saved;
        this.expect(')');
        return N.user(tok.s, order, arg);
      }
      case 'sym': {
        const c = tok.c;
        if (c === '(') {
          const saved = this.absDepth;
          this.absDepth = 0;
          const e = this.expression();
          this.absDepth = saved;
          this.expect(')');
          return e;
        }
        if (c === '|') {
          this.absDepth++;
          const e = this.expression();
          if (!this.isSym('|')) throw new MathError('Betragsstrich „|“ fehlt');
          this.p++;
          this.absDepth--;
          return N.fn('abs', [e]);
        }
        if (c === ')') throw new MathError('Eine „(“ fehlt');
        throw new MathError(`Unerwartetes Zeichen „${c}“`);
      }
      default:
        throw new MathError(`Unerwartetes Zeichen „${tokenText(tok)}“`);
    }
  }

  functionCall(b) {
    // sin^2(x) oder sin^-1(x)
    let exponent = null;
    if (this.isSym('^')) {
      this.p++;
      if (this.isSym('-')) {
        this.p++;
        const a = this.primary();
        exponent = a.k === 'num' ? N.num(-a.v) : N.neg(a);
      } else {
        exponent = this.primary();
      }
    }
    let args;
    if (this.isSym('(')) {
      this.p++;
      const saved = this.absDepth;
      this.absDepth = 0;
      args = [this.expression()];
      while (this.isSym(';') || this.isSym(',')) {
        this.p++;
        args.push(this.expression());
      }
      this.absDepth = saved;
      this.expect(')');
    } else if (this.mode === 'solver') {
      // nur „√3“ oder „√x“: ein einzelner Faktor
      if (this.p >= this.t.length) throw new MathError(`Argument nach ${b} fehlt`);
      args = [this.power()];
    } else {
      // Argument ohne Klammern: sin 2x, ln x, sin x^2
      let arg;
      if (this.isSym('-')) {
        this.p++;
        arg = N.neg(this.power());
      } else {
        arg = this.power();
      }
      while (this.startsImplicitFactor(false)) {
        arg = N.mul(arg, this.power());
      }
      args = [arg];
    }
    let node = makeCall(b, args);
    if (exponent !== null) {
      const inv = builtinInverse(b);
      if (exponent.k === 'num' && exponent.v === -1 && inv !== null) {
        node = makeCall(inv, args);
      } else {
        node = N.pow(node, exponent);
      }
    }
    return node;
  }
}

function makeCall(b, args) {
  switch (b) {
    case 'log':
      if (args.length === 2) return N.div(N.fn('ln', [args[1]]), N.fn('ln', [args[0]]));   // log(b; x)
      if (args.length === 1) return N.fn('log', args);
      throw new MathError('log erwartet 1 oder 2 Argumente');
    case 'root':
      if (args.length === 2) return N.fn('root', args);   // root(x; n)
      throw new MathError('root erwartet 2 Argumente: root(x; n)');
    case 'min': case 'max': {
      if (args.length < 2) throw new MathError(`${b} erwartet mindestens 2 Argumente`);
      let n = N.fn(b, [args[0], args[1]]);
      for (const a of args.slice(2)) n = N.fn(b, [n, a]);
      return n;
    }
    case 'mod':
      if (args.length !== 2) throw new MathError('mod erwartet 2 Argumente: mod(a; b)');
      return N.fn('mod', args);
    default:
      if (args.length !== 1) throw new MathError(`${b} erwartet 1 Argument`);
      return N.fn(b, args);
  }
}

function parseTokens(tokens, mode = 'graph') {
  if (!tokens || tokens.length === 0) throw new MathError('Leerer Ausdruck');
  const ps = new ParserState(tokens, mode);
  const node = ps.expression();
  if (ps.p < ps.t.length) {
    const tok = ps.t[ps.p];
    if (isSymTok(tok, ')')) throw new MathError('Eine „(“ fehlt');
    if (isSymTok(tok, '=')) throw new MathError('Nur ein „=“ erlaubt');
    throw new MathError(`Unerwartetes „${tokenText(tok)}“`);
  }
  return node;
}

export const Parser = {
  parse(text, mode = 'graph', userFunctionNames = new Set()) {
    const toks = tokenize(text, mode, userFunctionNames);
    return parseTokens(toks, mode);
  },
  parseTokens,
  makeCall,
};

// MARK: - Umformungen

/// Winkelmodus einarbeiten: factor = 1 (RAD), π/180 (DEG), π/200 (GRAD)
function applyAngle(node, k) {
  const go = (n) => {
    switch (n.k) {
      case 'num': case 'v': return n;
      case 'neg': return N.neg(go(n.a));
      case 'add': return N.add(go(n.a), go(n.b));
      case 'sub': return N.sub(go(n.a), go(n.b));
      case 'mul': return N.mul(go(n.a), go(n.b));
      case 'div': return N.div(go(n.a), go(n.b));
      case 'pow': return N.pow(go(n.a), go(n.b));
      case 'user': return N.user(n.n, n.o, go(n.a));
      case 'nd': return N.nd(go(n.a));
      case 'fn': {
        const a2 = n.args.map(go);
        switch (n.f) {
          case 'degsym':
            return N.mul(a2[0], N.num((Math.PI / 180) / k));
          case 'sin': case 'cos': case 'tan': case 'cot':
            return k === 1 ? N.fn(n.f, a2) : N.fn(n.f, [N.mul(a2[0], N.num(k))]);
          case 'asin': case 'acos': case 'atan': case 'acot':
            return k === 1 ? N.fn(n.f, a2) : N.div(N.fn(n.f, a2), N.num(k));
          default:
            return N.fn(n.f, a2);
        }
      }
      default: return n;
    }
  };
  return go(node);
}

function simplify(n) {
  switch (n.k) {
    case 'num': case 'v': return n;
    case 'neg': {
      const s = simplify(n.a);
      if (s.k === 'num') return N.num(-s.v);
      if (s.k === 'neg') return s.a;
      return N.neg(s);
    }
    case 'add': {
      const x = simplify(n.a), y = simplify(n.b);
      if (x.k === 'num' && y.k === 'num') return N.num(x.v + y.v);
      if (nodeIsZero(x)) return y;
      if (nodeIsZero(y)) return x;
      if (y.k === 'neg') return N.sub(x, y.a);
      return N.add(x, y);
    }
    case 'sub': {
      const x = simplify(n.a), y = simplify(n.b);
      if (x.k === 'num' && y.k === 'num') return N.num(x.v - y.v);
      if (nodeIsZero(y)) return x;
      if (nodeIsZero(x)) return simplify(N.neg(y));
      if (y.k === 'neg') return N.add(x, y.a);
      return N.sub(x, y);
    }
    case 'mul': {
      const x = simplify(n.a), y = simplify(n.b);
      if (x.k === 'num' && y.k === 'num') return N.num(x.v * y.v);
      if (nodeIsZero(x) || nodeIsZero(y)) return N.num(0);
      if (nodeIsOne(x)) return y;
      if (nodeIsOne(y)) return x;
      if (x.k === 'num' && x.v === -1) return simplify(N.neg(y));
      if (y.k === 'num' && y.v === -1) return simplify(N.neg(x));
      if (x.k === 'num' && y.k === 'mul' && y.a.k === 'num') return N.mul(N.num(x.v * y.a.v), y.b);
      if (y.k === 'num' && x.k !== 'num') return N.mul(y, x);   // Zahl nach vorn
      return N.mul(x, y);
    }
    case 'div': {
      const x = simplify(n.a), y = simplify(n.b);
      if (x.k === 'num' && y.k === 'num' && y.v !== 0) return N.num(x.v / y.v);
      if (nodeIsZero(x)) return N.num(0);
      if (nodeIsOne(y)) return x;
      return N.div(x, y);
    }
    case 'pow': {
      const x = simplify(n.a), y = simplify(n.b);
      if (x.k === 'num' && y.k === 'num') return N.num(cPow(x.v, y.v));
      if (nodeIsZero(y)) return N.num(1);
      if (nodeIsOne(y)) return x;
      if (nodeIsOne(x)) return N.num(1);
      return N.pow(x, y);
    }
    case 'fn': return N.fn(n.f, n.args.map(simplify));
    case 'user': return N.user(n.n, n.o, simplify(n.a));
    case 'nd': return N.nd(simplify(n.a));
    default: return n;
  }
}

function d(n, v) {
  switch (n.k) {
    case 'num': return N.num(0);
    case 'v': return N.num(n.n === v ? 1 : 0);
    case 'neg': return N.neg(d(n.a, v));
    case 'add': return N.add(d(n.a, v), d(n.b, v));
    case 'sub': return N.sub(d(n.a, v), d(n.b, v));
    case 'mul': {
      const a = n.a, b = n.b;
      if (!containsVar(a, v)) return N.mul(a, d(b, v));
      if (!containsVar(b, v)) return N.mul(d(a, v), b);
      return N.add(N.mul(d(a, v), b), N.mul(a, d(b, v)));
    }
    case 'div': {
      const a = n.a, b = n.b;
      if (!containsVar(b, v)) return N.div(d(a, v), b);
      if (!containsVar(a, v)) return N.neg(N.div(N.mul(a, d(b, v)), N.pow(b, N.num(2))));
      return N.div(N.sub(N.mul(d(a, v), b), N.mul(a, d(b, v))), N.pow(b, N.num(2)));
    }
    case 'pow': {
      const a = n.a, b = n.b;
      if (!containsVar(b, v)) {
        if (!containsVar(a, v)) return N.num(0);
        return N.mul(N.mul(b, N.pow(a, simplify(N.sub(b, N.num(1))))), d(a, v));
      }
      if (!containsVar(a, v)) {
        if (a.k === 'num' && a.v === Math.E) return N.mul(n, d(b, v));
        return N.mul(N.mul(n, N.fn('ln', [a])), d(b, v));
      }
      return N.mul(n, N.add(N.mul(d(b, v), N.fn('ln', [a])), N.div(N.mul(b, d(a, v)), a)));
    }
    case 'user':
      if (!containsVar(n.a, v)) return N.num(0);
      return N.mul(N.user(n.n, n.o + 1, n.a), d(n.a, v));
    case 'nd':
      return N.nd(n);
    case 'fn': {
      const args = n.args;
      if (!args.some((a) => containsVar(a, v))) return N.num(0);
      const u = args[0];
      const du = d(u, v);
      const one = N.num(1);
      let g;
      switch (n.f) {
        case 'sin': g = N.fn('cos', [u]); break;
        case 'cos': g = N.neg(N.fn('sin', [u])); break;
        case 'tan': g = N.div(one, N.pow(N.fn('cos', [u]), N.num(2))); break;
        case 'cot': g = N.neg(N.div(one, N.pow(N.fn('sin', [u]), N.num(2)))); break;
        case 'asin': g = N.div(one, N.fn('sqrt', [N.sub(one, N.pow(u, N.num(2)))])); break;
        case 'acos': g = N.neg(N.div(one, N.fn('sqrt', [N.sub(one, N.pow(u, N.num(2)))]))); break;
        case 'atan': g = N.div(one, N.add(one, N.pow(u, N.num(2)))); break;
        case 'acot': g = N.neg(N.div(one, N.add(one, N.pow(u, N.num(2))))); break;
        case 'sinh': g = N.fn('cosh', [u]); break;
        case 'cosh': g = N.fn('sinh', [u]); break;
        case 'tanh': g = N.div(one, N.pow(N.fn('cosh', [u]), N.num(2))); break;
        case 'asinh': g = N.div(one, N.fn('sqrt', [N.add(N.pow(u, N.num(2)), one)])); break;
        case 'acosh': g = N.div(one, N.fn('sqrt', [N.sub(N.pow(u, N.num(2)), one)])); break;
        case 'atanh': g = N.div(one, N.sub(one, N.pow(u, N.num(2)))); break;
        case 'ln': g = N.div(one, u); break;
        case 'log': g = N.div(one, N.mul(u, N.num(Math.log(10)))); break;
        case 'ld': g = N.div(one, N.mul(u, N.num(Math.log(2)))); break;
        case 'exp': g = N.fn('exp', [u]); break;
        case 'sqrt': g = N.div(one, N.mul(N.num(2), N.fn('sqrt', [u]))); break;
        case 'cbrt': g = N.div(one, N.mul(N.num(3), N.pow(N.fn('cbrt', [u]), N.num(2)))); break;
        case 'abs': g = N.fn('sign', [u]); break;
        case 'sign': case 'floor': case 'ceil': case 'round': case 'trunc': case 'step': return N.num(0);
        case 'frac': g = one; break;
        case 'degsym': g = N.num(Math.PI / 180); break;
        case 'root':
          if (containsVar(args[1], v)) return N.nd(n);
          // d/dx x^(1/n) = x^(1/n) / (n·x)
          g = N.div(n, N.mul(args[1], u));
          break;
        case 'mod':
          return N.sub(du, N.mul(N.fn('floor', [N.div(args[0], args[1])]), d(args[1], v)));
        case 'min': case 'max': {
          // min(a,b) = (a + b − |a − b|)/2, max(a,b) = (a + b + |a − b|)/2
          const a = args[0], b = args[1];
          const da = du, db = d(b, v);
          const s = N.mul(N.fn('sign', [N.sub(a, b)]), N.sub(da, db));
          if (n.f === 'min') return N.div(N.sub(N.add(da, db), s), N.num(2));
          return N.div(N.add(N.add(da, db), s), N.num(2));
        }
        case 'gamma': case 'fact':
          return N.nd(n);
        default:
          return N.nd(n);
      }
      return N.mul(g, du);
    }
    default: return N.num(0);
  }
}

export const Algebra = {
  applyAngle,
  simplify,
  /// Symbolische Ableitung nach v (vereinfacht)
  derive(n, v) { return simplify(d(n, v)); },
};

// MARK: - Übersetzen in Funktionen

/// Werte von Parametern (Schieberegler) bzw. Solver-Variablen; Funktionen lesen über feste Plätze.
export class ParamEnv {
  constructor() {
    this.slots = new Map();   // Name → Platz
    this.values = [];
  }
  slot(name, def = 1) {
    const s = this.slots.get(name);
    if (s !== undefined) return s;
    this.slots.set(name, this.values.length);
    this.values.push(def);
    return this.values.length - 1;
  }
  set(name, v) { this.values[this.slot(name)] = v; }
  get(name) {
    const s = this.slots.get(name);
    return s === undefined ? undefined : this.values[s];
  }
  names() {
    return Array.from(this.slots.entries()).sort((a, b) => a[1] - b[1]).map((e) => e[0]);
  }
}

/// Platzhalter für eine benutzerdefinierte Funktion (wird nach dem Übersetzen aller Zeilen gefüllt)
export class FunctionBox {
  constructor() { this.f = () => NaN; }
}

export class Compiler {
  /// resolver: { box(name, order) → FunctionBox | null }
  constructor({ variable = 'x', env = null, resolver = null } = {}) {
    this.variable = variable;
    this.env = env;
    this.resolver = resolver;
  }

  compile(n) {
    switch (n.k) {
      case 'num': {
        const c = n.v;
        return () => c;
      }
      case 'v': {
        if (n.n === this.variable) return (x) => x;
        const env = this.env;
        if (!env) throw new MathError(`Unbekannte Variable „${n.n}“`);
        const s = env.slot(n.n);
        return () => env.values[s];
      }
      case 'neg': {
        const fa = this.compile(n.a);
        return (x) => -fa(x);
      }
      case 'add': {
        const fa = this.compile(n.a), fb = this.compile(n.b);
        return (x) => fa(x) + fb(x);
      }
      case 'sub': {
        const fa = this.compile(n.a), fb = this.compile(n.b);
        return (x) => fa(x) - fb(x);
      }
      case 'mul': {
        if (n.a.k === 'num') {
          const c = n.a.v;
          const fb = this.compile(n.b);
          return (x) => c * fb(x);
        }
        const fa = this.compile(n.a), fb = this.compile(n.b);
        return (x) => fa(x) * fb(x);
      }
      case 'div': {
        const fa = this.compile(n.a), fb = this.compile(n.b);
        return (x) => fa(x) / fb(x);
      }
      case 'pow': {
        if (n.b.k === 'num') {
          const e = n.b.v;
          const fa = this.compile(n.a);
          if (e === 2) return (x) => { const t = fa(x); return t * t; };
          if (e === 3) return (x) => { const t = fa(x); return t * t * t; };
          if (e === 0.5) return (x) => Math.sqrt(fa(x));
          if (isWhole(e)) return (x) => cPow(fa(x), e);
          return (x) => realPow(fa(x), e);
        }
        if (n.a.k === 'num' && n.a.v === Math.E) {
          const fb = this.compile(n.b);
          return (x) => Math.exp(fb(x));
        }
        const fa = this.compile(n.a), fb = this.compile(n.b);
        return (x) => realPow(fa(x), fb(x));
      }
      case 'fn': {
        const fs = n.args.map((a) => this.compile(a));
        return Compiler.builtin(n.f, fs);
      }
      case 'user': {
        const box = this.resolver ? this.resolver.box(n.n, n.o) : null;
        if (!box) throw new MathError(`Unbekannte Funktion „${n.n}“`);
        const fa = this.compile(n.a);
        return (x) => box.f(fa(x));
      }
      case 'nd': {
        const fi = this.compile(n.a);
        return (x) => numericDerivative(fi, x);
      }
      default:
        throw new MathError('Ungültiger Term');
    }
  }

  static builtin(b, fs) {
    const f = fs[0];
    switch (b) {
      case 'sin': return (x) => Math.sin(f(x));
      case 'cos': return (x) => Math.cos(f(x));
      case 'tan': return (x) => Math.tan(f(x));
      case 'cot': return (x) => 1 / Math.tan(f(x));
      case 'asin': return (x) => Math.asin(f(x));
      case 'acos': return (x) => Math.acos(f(x));
      case 'atan': return (x) => Math.atan(f(x));
      case 'acot': return (x) => Math.PI / 2 - Math.atan(f(x));
      case 'sinh': return (x) => Math.sinh(f(x));
      case 'cosh': return (x) => Math.cosh(f(x));
      case 'tanh': return (x) => Math.tanh(f(x));
      case 'asinh': return (x) => Math.asinh(f(x));
      case 'acosh': return (x) => Math.acosh(f(x));
      case 'atanh': return (x) => Math.atanh(f(x));
      case 'ln': return (x) => Math.log(f(x));
      case 'log': return (x) => Math.log10(f(x));
      case 'ld': return (x) => Math.log2(f(x));
      case 'exp': return (x) => Math.exp(f(x));
      case 'sqrt': return (x) => Math.sqrt(f(x));
      case 'cbrt': return (x) => Math.cbrt(f(x));
      case 'root': {
        const g = fs[1];
        return (x) => rootN(f(x), g(x));
      }
      case 'abs': return (x) => Math.abs(f(x));
      case 'sign': return (x) => { const v = f(x); return v > 0 ? 1 : (v < 0 ? -1 : (Number.isNaN(v) ? NaN : 0)); };
      case 'floor': return (x) => Math.floor(f(x));
      case 'ceil': return (x) => Math.ceil(f(x));
      case 'round': return (x) => roundHalfAway(f(x));
      case 'trunc': return (x) => Math.trunc(f(x));
      case 'frac': return (x) => { const v = f(x); return v - Math.trunc(v); };
      case 'min': {
        const g = fs[1];
        return (x) => { const a = f(x), c = g(x); return (Number.isNaN(a) || Number.isNaN(c)) ? NaN : swiftMin(a, c); };
      }
      case 'max': {
        const g = fs[1];
        return (x) => { const a = f(x), c = g(x); return (Number.isNaN(a) || Number.isNaN(c)) ? NaN : swiftMax(a, c); };
      }
      case 'mod': {
        const g = fs[1];
        return (x) => { const a = f(x), m = g(x); return a - m * Math.floor(a / m); };
      }
      case 'gamma': return (x) => gamma(f(x));
      case 'fact': return (x) => gamma(f(x) + 1);
      case 'step': return (x) => { const v = f(x); return Number.isNaN(v) ? NaN : (v >= 0 ? 1 : 0); };
      case 'degsym': return (x) => f(x) * Math.PI / 180;
      default: throw new MathError(`Unbekannte Funktion „${b}“`);
    }
  }
}

// MARK: - Reelle Hilfsfunktionen

/// Kettenbruch-Näherung p/q (für reelle Wurzeln aus negativen Zahlen, z. B. x^(1/3)) → [p, q] | null
export function smallFraction(x, maxDen = 99) {
  if (!Number.isFinite(x) || !(Math.abs(x) < 1e9)) return null;
  let h0 = 0, h1 = 1, k0 = 1, k1 = 0;
  let r = x;
  for (let it = 0; it < 20; it++) {
    const a = Math.floor(r);
    const h2 = a * h1 + h0, k2 = a * k1 + k0;
    if (k2 > maxDen) break;
    h0 = h1; h1 = h2; k0 = k1; k1 = k2;
    if (Math.abs(h1 / k1 - x) < 1e-12 * swiftMax(1, Math.abs(x))) return [Math.trunc(h1), Math.trunc(k1)];
    const frac = r - a;
    if (frac < 1e-15) break;
    r = 1 / frac;
  }
  return null;
}

export function realPow(a, b) {
  if (a >= 0 || isWhole(b) || !Number.isFinite(a)) return cPow(a, b);
  const pq = smallFraction(b);
  if (pq !== null && pq[1] % 2 === 1) {
    const r = cPow(-a, b);
    return pq[0] % 2 === 0 ? r : -r;
  }
  return NaN;
}

/// n-te Wurzel (reell; ungerade n auch für negative x)
export function rootN(x, n) {
  if (n === 0 || !Number.isFinite(n)) return NaN;
  if (x >= 0) return cPow(x, 1 / n);
  if (isWhole(n) && n % 2 !== 0) return -cPow(-x, 1 / n);
  return NaN;
}

/// Fünf-Punkte-Ableitung
export function numericDerivative(f, x) {
  const h = 1e-3 * swiftMax(1, Math.abs(x));
  return (f(x - 2 * h) - 8 * f(x - h) + 8 * f(x + h) - f(x + 2 * h)) / (12 * h);
}

/// Konstanten Ausdruck auswerten („2π“, „sqrt(2)/2“, „1,5e-3“) – für Eingabefelder; wirft MathError
export function evaluateConstant(text, angleFactor = 1) {
  const node = applyAngle(Parser.parse(text, 'solver'), angleFactor);
  const vars = variables(node);
  if (vars.length > 0) throw new MathError(`Unbekannte Variable „${vars[0]}“`);
  const f = new Compiler().compile(node);
  return f(0);
}
