// calculator.js – RPN-Rechenkern im Stil des HP-42S.
// Stack X/Y/Z/T mit Stack-Lift, LASTx, Register 00–99, komplexe Zahlen, Menüs, Prompts (STO/RCL/FIX …),
// SOLVER und ∫f(x) über die Formeln bzw. Graphen der App, Statistik mit Regression, BASE (36 Bit),
// Druckprotokoll (MAN/NORM/TRACE) und Rückgängig.
// Dazu die Belegung der Hardware-Tastatur (KeyMap.swift) und die Tastenverteilung (AppModel.route).
// Portierung von Calculator.swift und KeyMap.swift (Stand Version 1.3). Ohne DOM – läuft auch in JavaScriptCore.
//
// Werte im Stack: reelle Zahl = number, komplexe Zahl = Complex (wie CalcValue.real / .cpx in Swift).
// Die 36-Bit-Logik (BASE) rechnet mit BigInt, weil die Bitoperatoren von JavaScript nur 32 Bit haben.
import { Complex } from './complex.js';
import { HPFormat, toRad, baseString, wrap36, WORD_MASK } from './hpformat.js';
import { Fmt, CFormat } from './fmt.js';
import { Rational } from './rational.js';
import { evaluateConstant, rootN } from './expression.js';
import { gamma, SOLVE, solveMeldung } from './numerics.js';
import { GROUPS, BUILTIN_CONSTANTS, randomID } from './constants.js';

// MARK: - Hilfen

/// Swift `rounded()`: halb von der Null weg
function roundHalfAway(x) {
  return Math.sign(x) * Math.round(Math.abs(x));
}

/// x == x.rounded() wie in Swift (auch ±∞ gilt als „ganz“)
function isWhole(x) {
  return x === roundHalfAway(x);
}

/// 10^k für ganzzahlige k korrekt gerundet (wie pow(10, k) der C-Bibliothek)
function pow10(k) {
  if (Number.isInteger(k) && Math.abs(k) <= 400) return Number('1e' + k);
  return Math.pow(10, k);
}

/// String(format: "%02d", n)
function pad2(n) {
  const s = String(Math.abs(n));
  return (n < 0 ? '-' : '') + (s.length < 2 ? '0' + s : s);
}

/// Zeichenzahl wie Swift `count` (Unicode-Zeichen statt UTF-16-Einheiten)
function charCount(s) {
  return Array.from(s).length;
}

/// Letztes Zeichen entfernen (Swift `removeLast()`)
function dropLast(s) {
  const a = Array.from(s);
  a.pop();
  return a.join('');
}

/// Leerraum am Rand entfernen (Swift `.whitespaces`, ohne Zeilenumbrüche)
function trimSpaces(s) {
  return String(s).replace(/^[\t\p{Zs}]+|[\t\p{Zs}]+$/gu, '');
}

const isNum = (v) => typeof v === 'number';
const isCpx = (v) => v instanceof Complex;
/// CalcValue.real: reeller Wert oder null
const realOf = (v) => (typeof v === 'number' ? v : null);
/// CalcValue.c: immer als Complex
const cOf = (v) => Complex.of(v);

/// Ganzzahl als Int64 (BigInt) wie `Int64(x)` in Swift (schneidet ab; nicht endliche Werte → Bereichsfehler)
function int64(x) {
  if (!Number.isFinite(x)) throw CalcError.range;
  return BigInt.asIntN(64, BigInt(Math.trunc(x)));
}

// MARK: - Fehler

export class CalcError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CalcError';
  }
}
CalcError.divZero = new CalcError('Division durch 0');
CalcError.invalid = new CalcError('Ungültige Daten');
CalcError.range = new CalcError('Außerhalb des Bereichs');
CalcError.type = new CalcError('Ungültiger Typ');
CalcError.missing = new CalcError('Nicht vorhanden');
CalcError.program = new CalcError('Programmierung nicht verfügbar');
CalcError.stat = new CalcError('Zu wenige Statistikdaten');

export const PRINT_MODES = Object.freeze(['man', 'norm', 'trace']);
export const FIT_MODELS = Object.freeze(['lin', 'log', 'exp', 'pwr']);
const ANGLES = ['deg', 'rad', 'grad'];
const DISPS = ['fix', 'sci', 'eng', 'all'];
const BASES = ['dec', 'hex', 'oct', 'bin'];
const RADIX = { dec: 10, hex: 16, oct: 8, bin: 2 };
const TAPE_KINDS = ['op', 'result', 'info', 'alpha', 'separator'];

// MARK: - Tasten (Anordnung wie HP-42S)

// [Kennung, Beschriftung, Shift-Beschriftung] in der Reihenfolge von CalcKey.allCases
const KEY_DEFS = [
  ['sigma', 'Σ+', 'Σ−'], ['inv', '1/x', 'yˣ'], ['sqrt', '√x', 'x²'], ['log', 'LOG', '10ˣ'], ['ln', 'LN', 'eˣ'],
  ['xeq', 'XEQ', 'GTO'],
  ['sto', 'STO', 'COMPLEX'], ['rcl', 'RCL', '%'], ['rdn', 'R↓', 'π'], ['sin', 'SIN', 'ASIN'], ['cos', 'COS', 'ACOS'],
  ['tan', 'TAN', 'ATAN'],
  ['enter', 'ENTER', 'ALPHA'], ['swap', 'x≷y', 'LASTx'], ['chs', '+/−', 'MODES'], ['eex', 'E', 'DISP'],
  ['back', '←', 'CLEAR'],
  ['up', '▲', 'BST'], ['n7', '7', 'SOLVER'], ['n8', '8', '∫f(x)'], ['n9', '9', 'MATRIX'], ['div', '÷', 'STAT'],
  ['down', '▼', 'SST'], ['n4', '4', 'BASE'], ['n5', '5', 'CONVERT'], ['n6', '6', 'FLAGS'], ['mul', '×', 'PROB'],
  ['shift', '', ''], ['n1', '1', 'ASSIGN'], ['n2', '2', 'CUSTOM'], ['n3', '3', 'PGM.FCN'], ['sub', '−', 'PRINT'],
  ['exit', 'EXIT', 'OFF'], ['n0', '0', 'TOP.FCN'], ['dot', '·', 'SHOW'], ['rs', 'R/S', 'PRGM'], ['add', '+', 'CATALOG'],
];

/// Obere Tastenreihe = Menütasten
const MENU_KEYS = ['sigma', 'inv', 'sqrt', 'log', 'ln', 'xeq'];

/// Alle 37 Tasten: { id, label, shifted, menuIndex (0…5 oder null), digit ('0'…'9' oder null) }
export const KEYS = Object.freeze(KEY_DEFS.map(([id, label, shifted]) => {
  const mi = MENU_KEYS.indexOf(id);
  const digit = /^n[0-9]$/.test(id) ? id.slice(1) : null;
  return Object.freeze({ id, label, shifted, menuIndex: mi >= 0 ? mi : null, digit });
}));

/// Taste nach Kennung
export const KEY_BY_ID = Object.freeze(Object.fromEntries(KEYS.map((k) => [k.id, k])));

/// Tastenreihen wie auf dem HP-42S
export const KEY_ROWS = Object.freeze([
  Object.freeze(['sigma', 'inv', 'sqrt', 'log', 'ln', 'xeq']),
  Object.freeze(['sto', 'rcl', 'rdn', 'sin', 'cos', 'tan']),
  Object.freeze(['enter', 'swap', 'chs', 'eex', 'back']),
  Object.freeze(['up', 'n7', 'n8', 'n9', 'div']),
  Object.freeze(['down', 'n4', 'n5', 'n6', 'mul']),
  Object.freeze(['shift', 'n1', 'n2', 'n3', 'sub']),
  Object.freeze(['exit', 'n0', 'dot', 'rs', 'add']),
]);

/// Menütaste i (CalcKey.forMenu)
export function keyForMenu(i) {
  return MENU_KEYS[i];
}

/// Schnellknöpfe über der obersten Tastenreihe
export const QUICK_MODES = Object.freeze([
  Object.freeze({ id: 'deg', label: 'DEG', help: 'Winkel in Grad (DEG)' }),
  Object.freeze({ id: 'rad', label: 'RAD', help: 'Winkel im Bogenmaß (RAD)' }),
  Object.freeze({ id: 'bin', label: 'BIN', help: 'Dualsystem ein/aus (BIN, 36 Bit) – erneut drücken: dezimal' }),
  Object.freeze({
    id: 'hex', label: 'HEX',
    help: 'Hexadezimal ein/aus (HEX, 36 Bit) – A–F über die Menütasten oder die Mac-Tasten a–f; erneut drücken: dezimal',
  }),
  Object.freeze({ id: 'rect', label: 'RECT', help: 'Komplexe Zahlen kartesisch anzeigen: 3 i4 (RECT)' }),
  Object.freeze({ id: 'polar', label: 'POLAR', help: 'Komplexe Zahlen polar anzeigen: 5 ∠53,13 (POLAR)' }),
]);

export const CATALOG_NAMES = Object.freeze([
  '%', '%CH', '+', '-', '×', '÷', '1/X', '10^X', 'ABS', 'ACOS', 'ACOSH', 'ADV', 'ALL', 'AND', 'ASIN',
  'ASINH', 'ATAN', 'ATANH', 'BEST', 'BINM', 'BIT?', 'CHS', 'CLA', 'CLALL', 'CLLCD', 'CLRG', 'CLST',
  'CLTAPE', 'CLV', 'CLX', 'CLΣ', 'COMB', 'COMPLEX', 'CORR', 'COS', 'COSH', 'CPXRES', 'DATE', 'DECM', 'DEG',
  'E^X', 'E^X-1', 'ENG', 'ENTER', 'EXPF', 'FCSTX', 'FCSTY', 'FIX', 'FP', 'GAM', 'GRAD', 'HEXM',
  'HMS+', 'HMS-', 'IP', 'LASTX', 'LINF', 'LN', 'LN1+X', 'LOG', 'LOGF', 'MAN', 'MEAN', 'MOD', 'N!',
  'NORM', 'NOT', 'OCTM', 'OR', 'PERM', 'PI', 'POLAR', 'PRA', 'PRLCD', 'PRSTK', 'PRV', 'PRX', 'PRΣ',
  'PWRF', 'R↑', 'R↓', 'RAD', 'RAN', 'REALRES', 'RECT', 'RND', 'ROTXY', 'SCI', 'SDEV', 'SEED',
  'SIGN', 'SIN', 'SINH', 'SLOPE', 'SQRT', 'TAN', 'TANH', 'TIME', 'TRACE', 'WMEAN', 'X^2', 'X<>Y', 'XOR',
  'XROOT', 'Y^X', 'YINT', 'Σ+', 'Σ-', 'ΣSUM', '→DEG', '→HMS', '→HR', '→POL', '→RAD', '→REC',
]);

// MARK: - Statistik-Summen

export class StatSums {
  constructor(obj = null) {
    this.#reset();
    if (obj && typeof obj === 'object') {
      for (const k of ['n', 'x', 'x2', 'y', 'y2', 'xy', 'lx', 'lx2', 'ly', 'ly2', 'lxly', 'xly', 'ylx']) {
        if (typeof obj[k] === 'number' && Number.isFinite(obj[k])) this[k] = obj[k];
      }
      if (typeof obj.logX === 'boolean') this.logX = obj.logX;
      if (typeof obj.logY === 'boolean') this.logY = obj.logY;
      if (Array.isArray(obj.points)) {
        this.points = obj.points
          .filter((p) => Array.isArray(p) && p.length === 2 && isNum(p[0]) && isNum(p[1]))
          .map((p) => [p[0], p[1]]);
      }
    }
  }

  #reset() {
    this.n = 0; this.x = 0; this.x2 = 0; this.y = 0; this.y2 = 0; this.xy = 0;
    this.lx = 0; this.lx2 = 0; this.ly = 0; this.ly2 = 0; this.lxly = 0; this.xly = 0; this.ylx = 0;
    this.logX = true; this.logY = true;
    this.points = [];
  }

  /// Messpunkt hinzufügen (s = 1) bzw. entfernen (s = −1)
  add(xv, yv, s) {
    this.n += s;
    this.x += s * xv; this.x2 += s * xv * xv;
    this.y += s * yv; this.y2 += s * yv * yv;
    this.xy += s * xv * yv;
    if (xv > 0) {
      const l = Math.log(xv);
      this.lx += s * l; this.lx2 += s * l * l; this.ylx += s * yv * l;
    } else { this.logX = false; }
    if (yv > 0) {
      const l = Math.log(yv);
      this.ly += s * l; this.ly2 += s * l * l; this.xly += s * xv * l;
      if (xv > 0) this.lxly += s * Math.log(xv) * l;
    } else { this.logY = false; }
    if (s > 0) {
      this.points.push([xv, yv]);
    } else {
      for (let i = this.points.length - 1; i >= 0; i--) {
        if (this.points[i][0] === xv && this.points[i][1] === yv) { this.points.splice(i, 1); break; }
      }
    }
    if (this.n === 0) this.#reset();
  }

  /// Steigung, Achsenabschnitt (im Modell), Korrelation – oder null
  fit(m) {
    let su, su2, sv, sv2, suv;
    switch (m) {
      case 'lin': [su, su2, sv, sv2, suv] = [this.x, this.x2, this.y, this.y2, this.xy]; break;
      case 'log':
        if (!this.logX) return null;
        [su, su2, sv, sv2, suv] = [this.lx, this.lx2, this.y, this.y2, this.ylx]; break;
      case 'exp':
        if (!this.logY) return null;
        [su, su2, sv, sv2, suv] = [this.x, this.x2, this.ly, this.ly2, this.xly]; break;
      case 'pwr':
        if (!this.logX || !this.logY) return null;
        [su, su2, sv, sv2, suv] = [this.lx, this.lx2, this.ly, this.ly2, this.lxly]; break;
      default: return null;
    }
    const n = this.n;
    if (!(n >= 2)) return null;
    const d = n * su2 - su * su;
    if (d === 0) return null;
    const slope = (n * suv - su * sv) / d;
    let intercept = (sv - slope * su) / n;
    const dv = n * sv2 - sv * sv;
    const r = dv > 0 ? (n * suv - su * sv) / Math.sqrt(d * dv) : 1;
    if (m === 'exp' || m === 'pwr') intercept = Math.exp(intercept);
    return { slope, intercept, r };
  }

  clone() { return new StatSums(this.toJSON()); }

  toJSON() {
    return {
      n: this.n, x: this.x, x2: this.x2, y: this.y, y2: this.y2, xy: this.xy,
      lx: this.lx, lx2: this.lx2, ly: this.ly, ly2: this.ly2, lxly: this.lxly, xly: this.xly, ylx: this.ylx,
      logX: this.logX, logY: this.logY, points: this.points.map((p) => [p[0], p[1]]),
    };
  }
}

// MARK: - Eingabe

/// Entry: { mant, exp (string|null), neg, expNeg, baseDigits (string|null) }
function newEntry() {
  return { mant: '', exp: null, neg: false, expNeg: false, baseDigits: null };
}

/// Zahlenwert der Eingabe (Entry.value)
function entryValue(e) {
  let m = e.mant === '' ? '0' : e.mant;
  if (m.startsWith('.')) m = '0' + m;
  if (m.endsWith('.')) m += '0';
  let s = (e.neg ? '-' : '') + m;
  if (e.exp !== null && e.exp !== '') s += 'e' + (e.expNeg ? '-' : '') + e.exp;
  const v = Number(s);
  return Number.isNaN(v) ? 0 : v;
}

// MARK: - Zustand (JSON)

function numOut(x) {
  return Number.isFinite(x) ? x : String(x);           // „Infinity“, „-Infinity“, „NaN“
}

function numIn(x) {
  if (typeof x === 'number') return x;
  if (x === 'Infinity' || x === '-Infinity' || x === 'NaN') return Number(x);
  return null;
}

/// Wert → JSON (komplex als {re, im, cpx:true})
function encodeValue(v) {
  if (isCpx(v)) return { re: numOut(v.re), im: numOut(v.im), cpx: true };
  return numOut(v);
}

/// JSON → Wert (oder null bei unbrauchbaren Daten)
function decodeValue(o) {
  const n = numIn(o);
  if (n !== null) return n;
  if (o && typeof o === 'object') {
    const re = numIn(o.re), im = numIn(o.im);
    if (re !== null && im !== null) return new Complex(re, im);
  }
  return null;
}

function decodeList(a) {
  if (!Array.isArray(a)) return null;
  const out = [];
  for (const o of a) {
    const v = decodeValue(o);
    if (v === null) return null;
    out.push(v);
  }
  return out;
}

const BLANK = Object.freeze({ label: '', submenu: false, active: false, action: null });

/// Menüpunkt für die Oberfläche (ohne Aktion)
function publicItem(it) {
  return { label: it.label, submenu: it.submenu, active: it.active, enabled: typeof it.action === 'function' };
}

function chunk(items) {
  const rows = [];
  for (let i = 0; i < items.length; i += 6) rows.push(items.slice(i, i + 6));
  return rows;
}

// MARK: - Rechner

export class Calculator {
  static tapeWidth = 24;

  constructor() {
    this.stack = [0, 0, 0, 0];
    this.lastX = 0;
    this.regs = new Array(100).fill(0);
    this.vars = Object.create(null);
    this.liftEnabled = true;
    this.entry = null;
    this.shift = false;
    this.message = null;
    this.prompt = null;             // { kind: 'sto'|'rcl'|'fix'|'sci'|'eng'|'xeq', arith, digits, name }
    this.alphaMode = false;
    this.alpha = '';
    this.menuStack = [];            // [{ id, row, ctx }]
    this.showFull = false;

    this.angle = 'deg';
    this.polar = false;
    this.cpxRes = false;
    this.disp = 'fix';
    this.digits = 4;
    this.radixComma = true;
    this.grouping = true;
    this.base = 'dec';
    this.fourLines = true;
    this.showClock = true;

    this.printOn = true;
    this.printMode = 'trace';
    this.tape = [];                 // [{ id, text, kind }]

    this.stats = new StatSums();
    this.fitModel = 'lin';

    /// Verbindung zur übrigen App (Graph, Solver-Formeln, Arbeitsbereich) – siehe ARCHITEKTUR.md
    this.host = null;
    /// wird nach jeder Zustandsänderung aufgerufen
    this.onChange = null;
    /// Uhr für TIME/DATE (austauschbar für Tests)
    this.now = () => new Date();
  }

  #rng = 0x9E3779B97F4A7C15n;
  #undoStack = [];
  #promptRow = 0;
  #depth = 0;

  /// Führt eine öffentliche Aktion aus und meldet danach (einmal) die Änderung
  #run(fn) {
    this.#depth++;
    try {
      return fn();
    } finally {
      this.#depth--;
      if (this.#depth === 0 && typeof this.onChange === 'function') this.onChange();
    }
  }

  get format() {
    return new HPFormat({ mode: this.disp, digits: this.digits, comma: this.radixComma, grouping: this.grouping });
  }

  // MARK: Zustand sichern / laden

  get state() {
    return {
      stack: this.stack.map(encodeValue),
      lastX: encodeValue(this.lastX),
      regs: this.regs.map(encodeValue),
      vars: Object.fromEntries(Object.keys(this.vars).map((k) => [k, numOut(this.vars[k])])),
      angle: this.angle, polar: this.polar, cpxRes: this.cpxRes,
      disp: this.disp, digits: this.digits, radixComma: this.radixComma, grouping: this.grouping,
      fourLines: this.fourLines, printOn: this.printOn, printMode: this.printMode,
      tape: this.tape.slice(-3000).map((l) => ({ id: l.id, text: l.text, kind: l.kind })),
      stats: this.stats.toJSON(),
      fitModel: this.fitModel, alpha: this.alpha, liftEnabled: this.liftEnabled, base: this.base,
      showClock: this.showClock,
    };
  }

  /// Zustand laden; unbrauchbare Teile behalten den bisherigen Wert
  restore(s) {
    return this.#run(() => {
      if (!s || typeof s !== 'object') return;
      const st = decodeList(s.stack);
      if (st && st.length === 4) this.stack = st;
      const lx = decodeValue(s.lastX);
      if (lx !== null) this.lastX = lx;
      const rg = decodeList(s.regs);
      if (rg && rg.length === 100) this.regs = rg;
      if (s.vars && typeof s.vars === 'object' && !Array.isArray(s.vars)) {
        const v = Object.create(null);
        for (const k of Object.keys(s.vars)) {
          const n = numIn(s.vars[k]);
          if (n !== null) v[k] = n;
        }
        this.vars = v;
      }
      if (ANGLES.includes(s.angle)) this.angle = s.angle;
      if (typeof s.polar === 'boolean') this.polar = s.polar;
      if (typeof s.cpxRes === 'boolean') this.cpxRes = s.cpxRes;
      if (DISPS.includes(s.disp)) this.disp = s.disp;
      if (Number.isInteger(s.digits) && s.digits >= 0 && s.digits <= 11) this.digits = s.digits;
      if (typeof s.radixComma === 'boolean') this.radixComma = s.radixComma;
      if (typeof s.grouping === 'boolean') this.grouping = s.grouping;
      if (typeof s.fourLines === 'boolean') this.fourLines = s.fourLines;
      if (typeof s.printOn === 'boolean') this.printOn = s.printOn;
      if (PRINT_MODES.includes(s.printMode)) this.printMode = s.printMode;
      if (Array.isArray(s.tape)) {
        this.tape = s.tape
          .filter((l) => l && typeof l.text === 'string' && TAPE_KINDS.includes(l.kind))
          .map((l) => ({ id: typeof l.id === 'string' && l.id ? l.id : randomID(), text: l.text, kind: l.kind }));
      }
      if (s.stats && typeof s.stats === 'object') this.stats = new StatSums(s.stats);
      if (FIT_MODELS.includes(s.fitModel)) this.fitModel = s.fitModel;
      if (typeof s.alpha === 'string') this.alpha = s.alpha;
      if (typeof s.liftEnabled === 'boolean') this.liftEnabled = s.liftEnabled;
      this.base = BASES.includes(s.base) ? s.base : 'dec';
      this.showClock = typeof s.showClock === 'boolean' ? s.showClock : true;
    });
  }

  // MARK: Anzeige

  formatValue(v) {
    if (isCpx(v)) return this.format.formatComplex(v, this.polar, this.angle);
    if (this.base !== 'dec') {
      const s = baseString(v, this.base);
      if (s !== null) return s;
    }
    return this.format.format(v);
  }

  /// Volle Genauigkeit (SHOW, Zwischenablage)
  fullText(v) {
    if (isCpx(v)) {
      const f = new HPFormat({ mode: 'all', digits: 11, comma: this.radixComma, grouping: false });
      return f.formatComplex(v, this.polar, this.angle);
    }
    let s = CFormat.g(v, 15);
    if (this.radixComma) s = s.split('.').join(',');
    return s;
  }

  #entryText(e) {
    if (e.baseDigits !== null) return e.baseDigits + '_';
    let m = e.mant;
    if (this.radixComma) m = m.split('.').join(',');
    let s = (e.neg ? '-' : '') + m;
    if (e.exp !== null) s += 'E' + (e.expNeg ? '-' : '') + e.exp;
    return s + '_';
  }

  #promptText(p) {
    switch (p.kind) {
      case 'sto': case 'rcl': {
        const head = (p.kind === 'sto' ? 'STO' : 'RCL') + (p.arith ?? '');
        if (p.name !== null) return head + ' "' + p.name + '_"';
        return head + ' ' + p.digits + '_'.repeat(Math.max(0, 2 - p.digits.length));
      }
      case 'fix': case 'sci': case 'eng': {
        const head = p.kind === 'fix' ? 'FIX' : (p.kind === 'sci' ? 'SCI' : 'ENG');
        return head + ' ' + p.digits + '_'.repeat(Math.max(0, 2 - p.digits.length));
      }
      default:
        return 'XEQ ' + (p.name !== null ? p.name + '_' : '_');
    }
  }

  /// Zeilen des LCD von oben nach unten: [{ label, text, isMessage }]
  lcdLines() {
    const n = this.fourLines ? 4 : 2;
    const names = ['x', 'y', 'z', 't'];
    const lines = [];
    for (let i = n - 1; i >= 0; i--) {
      lines.push({ label: names[i] + ':', text: this.formatValue(this.stack[i]), isMessage: false });
    }
    if (this.entry) lines[n - 1].text = this.#entryText(this.entry);
    if (this.alphaMode) lines[n - 1] = { label: '', text: '▸' + this.alpha + '_', isMessage: false };
    if (this.prompt) lines[n - 1] = { label: '', text: this.#promptText(this.prompt), isMessage: false };
    if (this.showFull) lines[n - 2] = { label: '', text: this.fullText(this.stack[0]), isMessage: true };
    if (this.message != null) {
      lines[n - 2] = { label: '', text: this.message, isMessage: true };
    }
    return lines;
  }

  annunciators() {
    const a = [];
    if (this.shift) a.push('SHIFT');
    if (this.#menuRowsRaw().length > 1) a.push('▲▼');
    if (this.printOn) a.push('PRT');
    if (this.alphaMode) a.push('ALPHA');
    if (this.angle !== 'deg') a.push(this.angle.toUpperCase());
    if (this.polar) a.push('∠');
    if (this.base !== 'dec') a.push(this.base.toUpperCase());
    return a;
  }

  // MARK: Menüs

  get currentMenu() {
    return this.menuStack.length > 0 ? this.menuStack[this.menuStack.length - 1] : null;
  }

  #menuRowsRaw() {
    if (this.prompt) return this.#promptMenu();
    const ref = this.currentMenu;
    if (!ref) return [];
    return this.#buildMenu(ref);
  }

  /// Alle Menüzeilen: [[{ label, submenu, active, enabled }]]
  menuRows() {
    return this.#menuRowsRaw().map((row) => row.map(publicItem));
  }

  #visibleMenuRaw() {
    const rows = this.#menuRowsRaw();
    if (rows.length === 0) return null;
    const r = Math.min(Math.max(this.currentMenu?.row ?? 0, 0), rows.length - 1);
    const row = (this.prompt ? rows[Math.min(this.#promptRow, rows.length - 1)] : rows[r]).slice();
    while (row.length < 6) row.push(BLANK);
    return row.slice(0, 6);
  }

  /// Sichtbare Menüzeile (immer 6 Einträge) oder null
  visibleMenu() {
    const row = this.#visibleMenuRaw();
    return row ? row.map(publicItem) : null;
  }

  #openMenu(id, ctx = '', sub = false) {
    const ref = { id, row: 0, ctx };
    if (sub) this.menuStack.push(ref); else this.menuStack = [ref];
  }

  /// Menü verlassen. Anders als beim HP-42S bleibt HEX/OCT/BIN aktiv (Schnellknöpfe als Schalter);
  /// zurück ins Dezimalsystem über DECM oder den leuchtenden Schnellknopf.
  #exitMenu() {
    this.menuStack.pop();
  }

  // MARK: Schnellknöpfe

  isActive(q) {
    switch (q) {
      case 'deg': return this.angle === 'deg';
      case 'rad': return this.angle === 'rad';
      case 'bin': return this.base === 'bin';
      case 'hex': return this.base === 'hex';
      case 'rect': return !this.polar;
      case 'polar': return this.polar;
      default: return false;
    }
  }

  quick(q) {
    if (!QUICK_MODES.some((m) => m.id === q)) return;
    this.#run(() => {
      this.#pushUndo();
      this.shift = false;
      this.message = null;
      switch (q) {
        case 'deg': this.#execute('DEG'); break;
        case 'rad': this.#execute('RAD'); break;
        case 'rect': this.polar = false; break;
        case 'polar': this.polar = true; break;
        default: {        // hex, bin
          this.#finishEntry();
          const target = q === 'hex' ? 'hex' : 'bin';
          if (this.base === target) {
            this.base = 'dec';
            const top = this.currentMenu?.id;
            if (top === 'BASE' || top === 'LOGIC') this.menuStack = [];
          } else {
            this.base = target;
            if (target === 'hex') {
              this.#openMenu('BASE');                         // A–F auf den Menütasten
            } else if (this.currentMenu?.id === 'BASE') {
              this.menuStack[this.menuStack.length - 1].row = 1;   // BIN: Modi und LOGIC
            }
          }
          this.#tapeOp(this.base === 'dec' ? 'DECM' : (this.base === 'hex' ? 'HEXM' : 'BINM'), null, null);
        }
      }
    });
  }

  #item(label, action, { active = false, submenu = false } = {}) {
    return { label, submenu, active, action };
  }

  /// Menüpunkt, der eine benannte Funktion ausführt
  #fn(name, label = null, active = false) {
    return { label: label ?? name, submenu: false, active, action: () => { this.#execute(name); } };
  }

  #buildMenu(ref) {
    const fn = (n, l = null, a = false) => this.#fn(n, l, a);
    const item = (l, act, o) => this.#item(l, act, o);
    switch (ref.id) {
      case 'MODES':
        return [[fn('DEG', null, this.angle === 'deg'), fn('RAD', null, this.angle === 'rad'),
          fn('GRAD', null, this.angle === 'grad'), fn('RECT', null, !this.polar), fn('POLAR', null, this.polar), BLANK],
        [fn('REALRES', null, !this.cpxRes), fn('CPXRES', null, this.cpxRes),
          item('2ZEIL', () => { this.fourLines = false; }, { active: !this.fourLines }),
          item('4ZEIL', () => { this.fourLines = true; }, { active: this.fourLines }),
          item('UHR', () => { this.showClock = !this.showClock; }, { active: this.showClock }), BLANK]];
      case 'DISP':
        return [[item('FIX', () => { this.prompt = this.#newPrompt('fix'); }, { active: this.disp === 'fix' }),
          item('SCI', () => { this.prompt = this.#newPrompt('sci'); }, { active: this.disp === 'sci' }),
          item('ENG', () => { this.prompt = this.#newPrompt('eng'); }, { active: this.disp === 'eng' }),
          fn('ALL', null, this.disp === 'all'),
          item('RDX.', () => { this.radixComma = false; }, { active: !this.radixComma }),
          item('RDX,', () => { this.radixComma = true; }, { active: this.radixComma })],
        [item('1.000', () => { this.grouping = !this.grouping; }, { active: this.grouping }),
          BLANK, BLANK, BLANK, BLANK, BLANK]];
      case 'CLEAR':
        return [[fn('CLΣ'), fn('CLV'), fn('CLST'), fn('CLA'), fn('CLX'), fn('CLRG')],
          [fn('CLTAPE', 'CLTAPE'), fn('CLLCD'), BLANK, BLANK, BLANK,
            item('CLALL', () => { this.#openMenu('CLALL?', '', true); this.message = 'Alles löschen?'; }, { submenu: true })]];
      case 'CLALL?':
        return [[item('JA', () => { this.#clearAll(); this.menuStack = []; }),
          BLANK, BLANK, BLANK, BLANK,
          item('NEIN', () => { this.#exitMenu(); this.message = null; })]];
      case 'CONVERT':
        return [[fn('→DEG'), fn('→RAD'), fn('→HR'), fn('→HMS'), fn('HMS+'), fn('HMS-')],
          [fn('→REC'), fn('→POL'), fn('IP'), fn('FP'), fn('RND'), fn('ABS')],
          [fn('SIGN'), fn('MOD'), fn('%CH'), fn('XROOT'), fn('LN1+X'), fn('E^X-1')]];
      case 'PROB':
        return [[fn('COMB'), fn('PERM'), fn('N!'), fn('GAM'), fn('RAN'), fn('SEED')]];
      case 'STAT':
        return [[fn('Σ+'), fn('Σ-'), fn('MEAN'), fn('SDEV'), fn('WMEAN'),
          item('CFIT', () => { this.#openMenu('CFIT', '', true); }, { submenu: true })],
        [fn('ΣSUM'), item('PLOT', () => { this.#plotStats(); }), fn('CLΣ'),
          item('n', () => { this.#push(this.stats.n, 'n'); }), BLANK, BLANK]];
      case 'CFIT':
        return [[fn('FCSTX'), fn('FCSTY'), fn('SLOPE'), fn('YINT'), fn('CORR'),
          item('MODL', () => { this.#openMenu('MODL', '', true); }, { submenu: true })]];
      case 'MODL':
        return [[fn('LINF', null, this.fitModel === 'lin'), fn('LOGF', null, this.fitModel === 'log'),
          fn('EXPF', null, this.fitModel === 'exp'), fn('PWRF', null, this.fitModel === 'pwr'), BLANK, fn('BEST')]];
      case 'BASE': {
        const hexItems = ['A', 'B', 'C', 'D', 'E', 'F'].map((d) => item(d, () => { this.#baseDigit(d); }));
        return [hexItems,
          [fn('HEXM', null, this.base === 'hex'), fn('DECM', null, this.base === 'dec'), fn('OCTM', null, this.base === 'oct'),
            fn('BINM', null, this.base === 'bin'),
            item('LOGIC', () => { this.#openMenu('LOGIC', '', true); }, { submenu: true }), BLANK]];
      }
      case 'LOGIC':
        return [[fn('AND'), fn('OR'), fn('XOR'), fn('NOT'), fn('BIT?'), fn('ROTXY')]];
      case 'PRINT':
        return [[fn('PRΣ'), fn('PRV'), fn('PRSTK'), fn('PRA'), fn('PRX'), fn('PRLCD')],
          [item('ON', () => { this.printOn = true; }, { active: this.printOn }),
            item('OFF', () => { this.printOn = false; }, { active: !this.printOn }),
            fn('MAN', null, this.printMode === 'man'), fn('NORM', null, this.printMode === 'norm'),
            fn('TRACE', null, this.printMode === 'trace'), fn('ADV')]];
      case 'TOPFCN':
        return [[fn('Σ+'), fn('1/X'), fn('SQRT', '√x'), fn('LOG'), fn('LN'),
          item('XEQ', () => { this.#startXEQ(); })]];
      case 'CUSTOM': {
        const groups = GROUPS.filter((g) => this.#constantList(g.id).length > 0);
        return chunk(groups.map((g) =>
          item(g.menu, () => { this.#openMenu('KONST', g.id, true); }, { submenu: true })));
      }
      case 'KONST': {
        const g = GROUPS.some((x) => x.id === ref.ctx) ? ref.ctx : 'physik';
        return chunk(this.#constantList(g).map((k) => {
          const sym = String(k.symbol).split('_').join('');
          return item(sym, () => {
            this.#push(k.value, k.symbol);
            this.message = sym + ' = ' + this.format.format(k.value) + (k.unit ? ' ' + k.unit : '');
          });
        }));
      }
      case 'CATALOG':
        return chunk(CATALOG_NAMES.map((n) => fn(n)));
      case 'MATRIX':
        return [[item('SIMQ', () => { this.#openLGS(); }),
          item('QUAD', () => { this.host?.openWorkspace?.({ kind: 'quadratic' }); }),
          item('CUBIC', () => { this.host?.openWorkspace?.({ kind: 'cubic' }); }),
          item('POLY', () => { this.#openPoly(); }), BLANK, BLANK]];
      case 'SOLVER': {
        const eqs = this.host?.solverEquations?.() ?? [];
        if (eqs.length === 0) {
          return [[item('NEU', () => { this.host?.openWorkspace?.('solver'); }), BLANK, BLANK, BLANK, BLANK, BLANK]];
        }
        return chunk(eqs.map((eq) => item(eq.name, () => {
          this.#openMenu('SOLVEVARS', eq.id, true);
          this.message = 'Wert eingeben + Taste = speichern, nur Taste = lösen';
        }, { submenu: true })));
      }
      case 'SOLVEVARS': {
        const names = this.host?.solverVariables?.(ref.ctx) ?? [];
        return chunk(names.map((v) =>
          item(v, () => { this.#solverKey(ref.ctx, v); }, { active: this.vars[v] !== undefined })));
      }
      case 'INTEG': {
        const fns = this.host?.graphFunctionNames?.() ?? [];
        if (fns.length === 0) {
          return [[item('GRAPH', () => {
            this.host?.openWorkspace?.('graph');
            this.message = 'Zuerst Funktion im Graph anlegen';
          }), BLANK, BLANK, BLANK, BLANK, BLANK]];
        }
        return chunk(fns.map((f) => item(f, () => { this.#openMenu('INTPARAMS', f, true); }, { submenu: true })));
      }
      case 'INTPARAMS':
        return [[item('LLIM', () => { this.#limitKey('LLIM'); }, { active: this.vars.LLIM !== undefined }),
          item('ULIM', () => { this.#limitKey('ULIM'); }, { active: this.vars.ULIM !== undefined }),
          BLANK, BLANK, BLANK,
          item('∫', () => { this.#integrate(ref.ctx); })]];
      default:
        return [];
    }
  }

  /// Konstanten einer Gruppe: über den Host (mit eigenen Konstanten), sonst der eingebaute Katalog
  #constantList(g) {
    if (this.host && typeof this.host.constants === 'function') return this.host.constants(g) ?? [];
    return BUILTIN_CONSTANTS.filter((c) => c.group === g);
  }

  #promptMenu() {
    const p = this.prompt;
    if (!p) return [];
    switch (p.kind) {
      case 'sto': case 'rcl': {
        const names = Object.keys(this.vars).sort();
        return chunk(names.map((v) => this.#item(v, () => { this.#finishStoRcl(v); })));
      }
      case 'xeq': {
        const fns = (this.host?.graphFunctionNames?.() ?? []).flatMap((f) => [f, f + "'", f + "''"]);
        return chunk(fns.map((f) => this.#item(f, () => { this.prompt = null; this.#evalGraphFunction(f); })));
      }
      default:
        return [];
    }
  }

  // MARK: Tastendruck

  press(keyId) {
    const key = KEY_BY_ID[keyId];
    if (!key) return;
    this.#run(() => this.#press(key));
  }

  #press(key) {
    this.showFull = false;
    if (this.message != null) {
      const isClear = (key.id === 'back' || key.id === 'exit') && !this.shift;
      if (this.currentMenu?.id !== 'CLALL?') this.message = null;
      if (isClear && !this.prompt && !this.alphaMode) return;
    }
    if (this.prompt) { this.#promptKey(key); return; }
    if (this.alphaMode) { this.#alphaKey(key); return; }
    const shifted = this.shift;
    this.shift = false;
    if (key.id === 'shift') { this.shift = !shifted; return; }

    // Menütasten
    if (!shifted && key.menuIndex !== null && this.#visibleMenuRaw() !== null) {
      this.#pressMenu(key.menuIndex);
      return;
    }
    if (!shifted && (key.id === 'up' || key.id === 'down') && this.menuStack.length > 0) {
      const rows = this.#menuRowsRaw().length;
      if (rows > 1) {
        const ref = this.menuStack[this.menuStack.length - 1];
        ref.row = (ref.row + (key.id === 'down' ? 1 : -1) + rows) % rows;
        return;
      }
    }
    this.#pushUndo();
    this.#dispatch(key, shifted);
  }

  pressMenu(index) {
    this.#run(() => this.#pressMenu(index));
  }

  #pressMenu(index) {
    const row = this.#visibleMenuRaw();
    if (row && index >= 0 && index < row.length && typeof row[index].action === 'function') {
      if (!this.prompt) this.#pushUndo();
      this.shift = false;
      row[index].action();
    }
  }

  #dispatch(key, s) {
    if (key.digit !== null && !s) { this.#digit(key.digit); return; }
    const k = key.id;
    if (!s) {
      switch (k) {
        case 'dot': this.#dot(); return;
        case 'eex': this.#eex(); return;
        case 'chs': this.#chs(); return;
        case 'back': this.#backspace(); return;
        case 'enter': this.#enter(); return;
        case 'add': this.#execute('+'); return;
        case 'sub': this.#execute('-'); return;
        case 'mul': this.#execute('×'); return;
        case 'div': this.#execute('÷'); return;
        case 'sigma': this.#execute('Σ+'); return;
        case 'inv': this.#execute('1/X'); return;
        case 'sqrt': this.#execute('SQRT'); return;
        case 'log': this.#execute('LOG'); return;
        case 'ln': this.#execute('LN'); return;
        case 'xeq': this.#startXEQ(); return;
        case 'sto': this.#finishEntry(); this.prompt = this.#newPrompt('sto'); this.#promptRow = 0; return;
        case 'rcl': this.#finishEntry(); this.prompt = this.#newPrompt('rcl'); this.#promptRow = 0; return;
        case 'rdn': this.#execute('R↓'); return;
        case 'sin': this.#execute('SIN'); return;
        case 'cos': this.#execute('COS'); return;
        case 'tan': this.#execute('TAN'); return;
        case 'swap': this.#execute('X<>Y'); return;
        case 'up': this.#execute('R↑'); return;
        case 'down': this.#execute('R↓'); return;
        case 'exit':
          this.#finishEntry();
          this.#exitMenu();
          return;
        case 'rs': this.message = CalcError.program.message; return;
        default: return;
      }
    }
    switch (k) {
      case 'sigma': this.#execute('Σ-'); return;
      case 'inv': this.#execute('Y^X'); return;
      case 'sqrt': this.#execute('X^2'); return;
      case 'log': this.#execute('10^X'); return;
      case 'ln': this.#execute('E^X'); return;
      case 'sto': this.#execute('COMPLEX'); return;
      case 'rcl': this.#execute('%'); return;
      case 'rdn': this.#execute('PI'); return;
      case 'sin': this.#execute('ASIN'); return;
      case 'cos': this.#execute('ACOS'); return;
      case 'tan': this.#execute('ATAN'); return;
      case 'enter': this.#finishEntry(); this.alphaMode = true; return;
      case 'swap': this.#execute('LASTX'); return;
      case 'chs': this.#openMenu('MODES'); return;
      case 'eex': this.#openMenu('DISP'); return;
      case 'back': this.#openMenu('CLEAR'); return;
      case 'n7': this.#openMenu('SOLVER'); return;
      case 'n8': this.#openMenu('INTEG'); return;
      case 'n9': this.#openMenu('MATRIX'); return;
      case 'div': this.#openMenu('STAT'); return;
      case 'n4': this.#openMenu('BASE'); return;
      case 'n5': this.#openMenu('CONVERT'); return;
      case 'mul': this.#openMenu('PROB'); return;
      case 'n2': this.#openMenu('CUSTOM'); return;
      case 'sub': this.#openMenu('PRINT'); return;
      case 'exit': this.host?.hideApplication?.(); return;
      case 'n0': this.#openMenu('TOPFCN'); return;
      case 'dot': this.#finishEntry(); this.showFull = true; return;
      case 'add': this.#openMenu('CATALOG'); return;
      case 'up': case 'down': case 'n6': case 'n1': case 'n3': case 'rs': case 'xeq':
        this.message = CalcError.program.message;
        return;
      default: return;
    }
  }

  // MARK: Zahleneingabe

  #lift() {
    this.stack[3] = this.stack[2];
    this.stack[2] = this.stack[1];
    this.stack[1] = this.stack[0];
  }

  #startEntry() {
    if (this.liftEnabled) this.#lift();
    this.entry = newEntry();
    this.liftEnabled = true;
  }

  #updateX() {
    const e = this.entry;
    if (!e) return;
    if (e.baseDigits !== null) {
      const v = parseRadix(e.baseDigits === '' ? '0' : e.baseDigits, RADIX[this.base] ?? 10);
      this.stack[0] = Number(wrap36(v));
    } else {
      this.stack[0] = entryValue(e);
    }
  }

  /// Eingabe abschließen; liefert den eingetippten Text (für das Protokoll)
  finishEntry() {
    return this.#run(() => this.#finishEntry());
  }

  #finishEntry() {
    if (!this.entry) return null;
    this.#updateX();
    const t = this.formatValue(this.stack[0]);
    this.entry = null;
    return t;
  }

  #digit(d) {
    if (this.base !== 'dec') { this.#baseDigit(d); return; }
    if (!this.entry) this.#startEntry();
    const e = { ...this.entry };
    if (e.exp !== null) {
      if (e.exp.length >= 3) return;
      e.exp += d;
    } else {
      if (e.mant.replace(/[^0-9]/g, '').length >= 12) return;
      if (e.mant === '0') e.mant = d; else e.mant += d;
    }
    this.entry = e;
    this.#updateX();
  }

  /// Ziffer im gewählten Zahlensystem (A–F im HEX-Modus)
  baseDigit(ch) {
    this.#run(() => this.#baseDigit(String(ch)));
  }

  #baseDigit(d) {
    let allowed;
    switch (this.base) {
      case 'bin': allowed = '01'; break;
      case 'oct': allowed = '01234567'; break;
      case 'hex': allowed = '0123456789ABCDEF'; break;
      default:
        if (/^\p{N}$/u.test(d)) this.#digit(d); else this.message = 'Nur im HEX-Modus';
        return;
    }
    if (d.length !== 1 || !allowed.includes(d)) { this.message = 'Ungültige Ziffer'; return; }
    if (!this.entry) { this.#startEntry(); this.entry.baseDigits = ''; }
    if (this.entry.baseDigits === null) this.entry = { ...this.entry, baseDigits: '' };
    const bd = this.entry.baseDigits;
    if (!(bd.length < (this.base === 'bin' ? 36 : 12))) return;
    this.entry = { ...this.entry, baseDigits: bd + d };
    this.#updateX();
  }

  #dot() {
    if (this.base !== 'dec') return;
    if (!this.entry) this.#startEntry();
    const e = { ...this.entry };
    if (e.exp !== null) return;
    if (!e.mant.includes('.')) e.mant = e.mant === '' ? '0.' : e.mant + '.';
    this.entry = e;
    this.#updateX();
  }

  #eex() {
    if (this.base !== 'dec') return;
    if (!this.entry) { this.#startEntry(); this.entry.mant = '1'; }
    const e = { ...this.entry };
    if (e.exp !== null) return;
    if (e.mant === '') e.mant = '1';
    e.exp = '';
    this.entry = e;
    this.#updateX();
  }

  #chs() {
    if (this.entry && this.entry.baseDigits === null) {
      const e = { ...this.entry };
      if (e.exp !== null) e.expNeg = !e.expNeg; else e.neg = !e.neg;
      this.entry = e;
      this.#updateX();
      return;
    }
    this.#execute('CHS');
  }

  #backspace() {
    if (!this.entry) {
      this.#execute('CLX');
      return;
    }
    const e = { ...this.entry };
    if (e.baseDigits !== null) {
      e.baseDigits = dropLast(e.baseDigits);
      if (e.baseDigits === '') { this.entry = null; this.stack[0] = 0; this.liftEnabled = false; return; }
      this.entry = e;
      this.#updateX();
      return;
    }
    if (e.exp !== null) {
      if (e.exp === '') {
        if (e.expNeg) e.expNeg = false; else e.exp = null;
      } else {
        e.exp = dropLast(e.exp);
      }
    } else if (e.mant !== '') {
      e.mant = dropLast(e.mant);
      if (e.mant === '' && e.neg) e.neg = false;
    }
    if (e.mant === '' && e.exp === null) {
      this.entry = null;
      this.stack[0] = 0;
      this.liftEnabled = false;
      return;
    }
    this.entry = e;
    this.#updateX();
  }

  #enter() {
    const t = this.#finishEntry() ?? this.formatValue(this.stack[0]);
    this.#lift();
    this.liftEnabled = false;
    this.#tapeOp('ENTER', t, null);
  }

  // MARK: Stack-Hilfen

  /// Wert in X (mit Stack-Lift); mit Name auch ins Protokoll
  push(v, name = null) {
    this.#run(() => this.#push(v, name));
  }

  #push(v, name = null) {
    const t = this.#finishEntry();
    if (this.liftEnabled) this.#lift();
    this.stack[0] = v;
    this.liftEnabled = true;
    if (name !== null && name !== undefined) this.#tapeOp(name, t, v);
  }

  /// Wert aus dem Graphen oder den Gleichungen übernehmen (Stack-Lift)
  pushValue(x, label = null) {
    this.#run(() => {
      this.#pushUndo();
      this.#push(x);
      if (label !== null && label !== undefined) this.#tapeInfo(label + ': ' + this.formatValue(x));
    });
  }

  #check(v) {
    if (isCpx(v)) {
      if (Number.isNaN(v.re) || Number.isNaN(v.im)) throw CalcError.invalid;
      if (!v.isFinite()) throw CalcError.range;
    } else {
      if (Number.isNaN(v)) throw CalcError.invalid;
      if (!Number.isFinite(v)) throw CalcError.range;
    }
    return v;
  }

  #fail(e) {
    this.message = e instanceof CalcError ? e.message : CalcError.invalid.message;
  }

  #unary(name, f, saveLast = true) {
    const t = this.#finishEntry();
    const x = this.stack[0];
    try {
      const r = this.#check(f(x));
      if (saveLast) this.lastX = x;
      this.stack[0] = r;
      this.liftEnabled = true;
      this.#tapeOp(name, t, r);
    } catch (e) {
      this.#fail(e);
    }
  }

  #binary(name, f) {
    const t = this.#finishEntry();
    const x = this.stack[0], y = this.stack[1];
    try {
      const r = this.#check(f(y, x));
      this.lastX = x;
      this.stack = [r, this.stack[2], this.stack[3], this.stack[3]];
      this.liftEnabled = true;
      this.#tapeOp(name, t, r);
    } catch (e) {
      this.#fail(e);
    }
  }

  #realUnary(name, f) {
    this.#unary(name, (x) => {
      if (!isNum(x)) throw CalcError.type;
      return f(x);
    });
  }

  #realBinary(name, f) {
    this.#binary(name, (y, x) => {
      if (!isNum(y) || !isNum(x)) throw CalcError.type;
      return f(y, x);
    });
  }

  // MARK: Winkelfunktionen

  #realTrig(f, v) {
    if (this.angle === 'rad') {
      return f === 'sin' ? Math.sin(v) : (f === 'cos' ? Math.cos(v) : Math.tan(v));
    }
    const full = this.angle === 'deg' ? 360 : 400;
    const r = v % full;
    const q = full / 4;
    if (r % q === 0) {
      let k = roundHalfAway(r / q) % 4;
      if (k < 0) k += 4;
      k = Math.abs(k);            // −0 → 0
      switch (f) {
        case 'sin': return [0, 1, 0, -1][k];
        case 'cos': return [1, 0, -1, 0][k];
        default:
          if (k % 2 === 1) throw CalcError.range;
          return 0;
      }
    }
    const rad = r * toRad(this.angle);
    let res = f === 'sin' ? Math.sin(rad) : (f === 'cos' ? Math.cos(rad) : Math.tan(rad));
    // Rundungsrauschen bei „schönen“ Winkeln entfernen (sin 30° = 0,5)
    const half = roundHalfAway(res * 2) / 2;
    if (Math.abs(res - half) < 4e-16 * Math.max(1, Math.abs(res))) res = half;
    return res;
  }

  #trig(name, f) {
    this.#unary(name, (x) => {
      if (isNum(x)) return this.#realTrig(f, x);
      return f === 'sin' ? x.sin() : (f === 'cos' ? x.cos() : x.tan());
    });
  }

  #inverseTrig(name, f) {
    this.#unary(name, (x) => {
      if (isNum(x)) {
        const k = toRad(this.angle);
        if (f === 'tan') return Math.atan(x) / k;
        if (Math.abs(x) <= 1) return (f === 'sin' ? Math.asin(x) : Math.acos(x)) / k;
        if (!this.cpxRes) throw CalcError.invalid;
        return f === 'sin' ? new Complex(x).asin() : new Complex(x).acos();
      }
      return f === 'sin' ? x.asin() : (f === 'cos' ? x.acos() : x.atan());
    });
  }

  // MARK: Ausführen benannter Funktionen (Tasten, Menüs, CATALOG, XEQ)

  /// Benannte Funktion ausführen; false = unbekannter Name
  execute(rawName) {
    return this.#run(() => this.#execute(rawName));
  }

  #execute(rawName) {
    const name = String(rawName).toUpperCase();
    const k = () => toRad(this.angle);
    switch (name) {
      // Arithmetik
      case '+': this.#binary('+', (y, x) => this.#arith(y, x, '+')); break;
      case '-': case '−': this.#binary('−', (y, x) => this.#arith(y, x, '-')); break;
      case '×': case '*': this.#binary('×', (y, x) => this.#arith(y, x, '*')); break;
      case '÷': case '/': this.#binary('÷', (y, x) => this.#arith(y, x, '/')); break;
      case 'Y^X':
        this.#binary('yˣ', (y, x) => {
          if (isNum(y) && isNum(x)) {
            const a = y, b = x;
            if (a === 0 && b <= 0) throw CalcError.invalid;
            if (a < 0 && b !== roundHalfAway(b)) {
              if (!this.cpxRes) throw CalcError.invalid;
              return new Complex(a).pow(new Complex(b));
            }
            return Math.pow(a, b);
          }
          const yc = cOf(y), xc = cOf(x);
          if (yc.isZero()) {
            if (xc.re > 0) return Complex.ZERO;
            throw CalcError.invalid;
          }
          return yc.pow(xc);
        });
        break;
      case 'XROOT':
        this.#realBinary('XROOT', (a, b) => {
          if (b === 0) throw CalcError.invalid;
          const r = rootN(a, b);
          if (Number.isNaN(r)) throw CalcError.invalid;
          return r;
        });
        break;
      case '1/X':
        this.#unary('1/x', (x) => {
          if (isNum(x)) {
            if (x === 0) throw CalcError.divZero;
            return 1 / x;
          }
          if (x.isZero()) throw CalcError.divZero;
          return Complex.ONE.div(x);
        });
        break;
      case 'SQRT':
        this.#unary('√x', (x) => {
          if (isNum(x)) {
            if (x >= 0) return Math.sqrt(x);
            if (!this.cpxRes) throw CalcError.invalid;
            return new Complex(0, Math.sqrt(-x));
          }
          return x.sqrt();
        });
        break;
      case 'X^2':
        this.#unary('x²', (x) => (isNum(x) ? x * x : x.mul(x)));
        break;
      case 'LN': case 'LOG': {
        const isLn = name === 'LN';
        this.#unary(isLn ? 'LN' : 'LOG', (x) => {
          const kk = isLn ? 1 : Math.log(10);
          if (isNum(x)) {
            if (x > 0) return isLn ? Math.log(x) : Math.log10(x);
            if (x === 0) throw CalcError.invalid;
            if (!this.cpxRes) throw CalcError.invalid;
            return new Complex(x).log().div(kk);
          }
          if (x.isZero()) throw CalcError.invalid;
          return x.log().div(kk);
        });
        break;
      }
      case 'E^X':
        this.#unary('eˣ', (x) => (isNum(x) ? Math.exp(x) : x.exp()));
        break;
      case '10^X':
        this.#unary('10ˣ', (x) => (isNum(x) ? pow10(x) : x.mul(Math.log(10)).exp()));
        break;
      case 'LN1+X':
        this.#realUnary('LN1+X', (v) => {
          if (!(v > -1)) throw CalcError.invalid;
          return Math.log1p(v);
        });
        break;
      case 'E^X-1': this.#realUnary('E^X-1', (v) => Math.expm1(v)); break;
      case 'SIN': this.#trig('SIN', 'sin'); break;
      case 'COS': this.#trig('COS', 'cos'); break;
      case 'TAN': this.#trig('TAN', 'tan'); break;
      case 'ASIN': this.#inverseTrig('ASIN', 'sin'); break;
      case 'ACOS': this.#inverseTrig('ACOS', 'cos'); break;
      case 'ATAN': this.#inverseTrig('ATAN', 'tan'); break;
      case 'SINH': case 'COSH': case 'TANH': case 'ASINH': case 'ACOSH': case 'ATANH':
        this.#unary(name, (x) => {
          if (isNum(x)) {
            switch (name) {
              case 'SINH': return Math.sinh(x);
              case 'COSH': return Math.cosh(x);
              case 'TANH': return Math.tanh(x);
              case 'ASINH': return Math.asinh(x);
              case 'ACOSH':
                if (x >= 1) return Math.acosh(x);
                if (!this.cpxRes) throw CalcError.invalid;
                return new Complex(x).acosh();
              default:
                if (Math.abs(x) < 1) return Math.atanh(x);
                if (!this.cpxRes || Math.abs(x) === 1) throw CalcError.invalid;
                return new Complex(x).atanh();
            }
          }
          switch (name) {
            case 'SINH': return x.sinh();
            case 'COSH': return x.cosh();
            case 'TANH': return x.tanh();
            case 'ASINH': return x.asinh();
            case 'ACOSH': return x.acosh();
            default: return x.atanh();
          }
        });
        break;
      case 'CHS':
        this.#unary('+/−', (x) => {
          if (isNum(x)) {
            if (this.base !== 'dec') return Number(wrap36(-int64(x)));
            return -x;
          }
          return x.neg();
        }, false);
        break;
      case 'ABS':
        this.#unary('ABS', (x) => (isCpx(x) ? x.abs : Math.abs(x)));
        break;
      case 'SIGN':
        this.#unary('SIGN', (x) => {
          if (isNum(x)) return x > 0 ? 1 : (x < 0 ? -1 : 0);
          return x.isZero() ? Complex.ZERO : x.div(x.abs);
        });
        break;
      case 'IP': this.#realUnary('IP', (v) => Math.trunc(v)); break;
      case 'FP': this.#realUnary('FP', (v) => v - Math.trunc(v)); break;
      case 'RND': this.#realUnary('RND', (v) => this.#roundToDisplay(v)); break;
      case 'MOD':
        this.#realBinary('MOD', (a, b) => {
          if (b === 0) return a;
          return a - b * Math.floor(a / b);
        });
        break;
      case '%': {
        const t = this.#finishEntry();
        const x = realOf(this.stack[0]), y = realOf(this.stack[1]);
        if (x === null || y === null) { this.message = CalcError.type.message; return true; }
        this.lastX = this.stack[0];
        this.stack[0] = x * y / 100;
        this.liftEnabled = true;
        this.#tapeOp('%', t, this.stack[0]);
        break;
      }
      case '%CH': {
        const t = this.#finishEntry();
        const x = realOf(this.stack[0]), y = realOf(this.stack[1]);
        if (x === null || y === null) { this.message = CalcError.type.message; return true; }
        if (y === 0) { this.message = CalcError.divZero.message; return true; }
        this.lastX = this.stack[0];
        this.stack[0] = (x - y) / y * 100;
        this.liftEnabled = true;
        this.#tapeOp('%CH', t, this.stack[0]);
        break;
      }
      case 'N!':
        this.#realUnary('N!', (v) => {
          if (!(v >= 0) || !isWhole(v)) throw CalcError.invalid;
          if (!(v <= 170)) throw CalcError.range;
          return roundHalfAway(gamma(v + 1));
        });
        break;
      case 'GAM':
        this.#realUnary('GAM', (v) => {
          if (v <= 0 && isWhole(v)) throw CalcError.invalid;
          return gamma(v);
        });
        break;
      case 'COMB': case 'PERM': {
        const isComb = name === 'COMB';
        this.#realBinary(name, (n, kk0) => {
          if (!(n >= 0) || !(kk0 >= 0) || !isWhole(n) || !isWhole(kk0) || !(kk0 <= n)) throw CalcError.invalid;
          let r = 1;
          // Das Produkt wächst monoton; ist es einmal unendlich, bleibt es das (früher Abbruch, gleiches Ergebnis)
          if (isComb) {
            const kk = Math.min(kk0, n - kk0);
            for (let i = 1; i <= kk && Number.isFinite(r); i++) r = r * (n - kk + i) / i;
            return roundHalfAway(r);
          }
          for (let i = 0; i < kk0 && Number.isFinite(r); i++) r *= (n - i);
          return r;
        });
        break;
      }
      case 'RAN': {
        const M = (1n << 64n) - 1n;
        let s = this.#rng;
        s ^= (s << 13n) & M; s ^= s >> 7n; s ^= (s << 17n) & M;
        this.#rng = s;
        this.#push(Number(s >> 11n) / 9007199254740992, 'RAN');
        break;
      }
      case 'SEED': {
        const v = realOf(this.stack[0]);
        if (v !== null) {
          const w = Math.abs(v) * 1e9 + 1;
          if (!Number.isFinite(w)) { this.message = CalcError.range.message; return true; }
          this.#rng = (BigInt.asUintN(64, BigInt(Math.trunc(w)))) | 1n;
          this.#tapeOp('SEED', this.#finishEntry(), null);
        }
        break;
      }
      case 'PI': this.#push(Math.PI, 'π'); break;
      case 'TIME': {
        // wie HP-41CX: Uhrzeit als H.MMSS
        const d = this.now();
        const h = d.getHours(), mi = d.getMinutes(), se = d.getSeconds();
        this.#push(h + mi / 100 + se / 10000, 'TIME');
        this.message = `TIME ${pad2(h)}:${pad2(mi)}:${pad2(se)}  (H.MMSS)`;
        break;
      }
      case 'DATE': {
        // Datum als TT.MMJJJJ (europäisch)
        const dt = this.now();
        const d = dt.getDate(), mo = dt.getMonth() + 1, y = dt.getFullYear();
        this.#push(d + mo / 100 + y / 1000000, 'DATE');
        this.message = `DATE ${pad2(d)}.${pad2(mo)}.${String(y).padStart(4, '0')}  (TT.MMJJJJ)`;
        break;
      }
      case '→DEG': this.#realUnary('→DEG', (v) => v * 180 / Math.PI); break;
      case '→RAD': this.#realUnary('→RAD', (v) => v * Math.PI / 180); break;
      case '→HR': this.#realUnary('→HR', (v) => Calculator.hmsToHours(v)); break;
      case '→HMS': this.#realUnary('→HMS', (v) => Calculator.hoursToHMS(v)); break;
      case 'HMS+':
        this.#realBinary('HMS+', (a, b) => Calculator.hoursToHMS(Calculator.hmsToHours(a) + Calculator.hmsToHours(b)));
        break;
      case 'HMS-':
        this.#realBinary('HMS−', (a, b) => Calculator.hoursToHMS(Calculator.hmsToHours(a) - Calculator.hmsToHours(b)));
        break;
      case '→POL': case '→REC': {
        const t = this.#finishEntry();
        const x = realOf(this.stack[0]), y = realOf(this.stack[1]);
        if (x === null || y === null) { this.message = CalcError.type.message; return true; }
        this.lastX = this.stack[0];
        if (name === '→POL') {
          this.stack[0] = Math.hypot(x, y);
          this.stack[1] = Math.atan2(y, x) / k();
        } else {
          this.stack[0] = x * Math.cos(y * k());
          this.stack[1] = x * Math.sin(y * k());
        }
        this.liftEnabled = true;
        this.#tapeOp(name, t, this.stack[0]);
        break;
      }
      case 'COMPLEX': {
        const t = this.#finishEntry();
        const x = this.stack[0], y = this.stack[1];
        if (isCpx(x)) {
          this.lastX = x;
          const a = this.polar ? x.abs : x.re;
          const b = this.polar ? x.arg / k() : x.im;
          this.stack = [b, a, this.stack[1], this.stack[2]];
        } else if (isNum(x) && isNum(y)) {
          this.lastX = x;
          const z = this.polar ? Complex.polar(y, x * k()) : new Complex(y, x);
          this.stack = [z, this.stack[2], this.stack[3], this.stack[3]];
        } else {
          this.message = CalcError.type.message;
          return true;
        }
        this.liftEnabled = true;
        this.#tapeOp('COMPLEX', t, this.stack[0]);
        break;
      }

      // Stack
      case 'X<>Y': {
        this.#finishEntry();
        const s = this.stack;
        [s[0], s[1]] = [s[1], s[0]];
        this.liftEnabled = true;
        this.#tapeOp('x≷y', null, null);
        break;
      }
      case 'R↓':
        this.#finishEntry();
        this.stack = [this.stack[1], this.stack[2], this.stack[3], this.stack[0]];
        this.liftEnabled = true;
        this.#tapeOp('R↓', null, null);
        break;
      case 'R↑':
        this.#finishEntry();
        this.stack = [this.stack[3], this.stack[0], this.stack[1], this.stack[2]];
        this.liftEnabled = true;
        this.#tapeOp('R↑', null, null);
        break;
      case 'CLX':
        this.entry = null;
        this.stack[0] = 0;
        this.liftEnabled = false;
        this.#tapeOp('CLX', null, null);
        break;
      case 'CLST':
        this.#finishEntry();
        this.stack = [0, 0, 0, 0];
        this.liftEnabled = true;
        this.#tapeOp('CLST', null, null);
        break;
      case 'LASTX': this.#push(this.lastX, 'LASTx'); break;
      case 'ENTER': this.#enter(); break;

      // Modi
      case 'DEG': this.angle = 'deg'; this.#tapeOp('DEG', null, null); break;
      case 'RAD': this.angle = 'rad'; this.#tapeOp('RAD', null, null); break;
      case 'GRAD': this.angle = 'grad'; this.#tapeOp('GRAD', null, null); break;
      case 'RECT': this.polar = false; break;
      case 'POLAR': this.polar = true; break;
      case 'REALRES': this.cpxRes = false; break;
      case 'CPXRES': this.cpxRes = true; break;
      case 'ALL': this.disp = 'all'; break;
      case 'FIX': this.prompt = this.#newPrompt('fix'); break;
      case 'SCI': this.prompt = this.#newPrompt('sci'); break;
      case 'ENG': this.prompt = this.#newPrompt('eng'); break;
      case 'MAN': this.printMode = 'man'; break;
      case 'NORM': this.printMode = 'norm'; break;
      case 'TRACE': this.printMode = 'trace'; break;
      case 'HEXM': case 'DECM': case 'OCTM': case 'BINM':
        this.#finishEntry();
        this.base = name === 'HEXM' ? 'hex' : (name === 'OCTM' ? 'oct' : (name === 'BINM' ? 'bin' : 'dec'));
        break;

      // Löschen
      case 'CLΣ': this.stats = new StatSums(); this.message = 'Statistik gelöscht'; break;
      case 'CLV': this.vars = Object.create(null); this.message = 'Variablen gelöscht'; break;
      case 'CLA': this.alpha = ''; break;
      case 'CLRG': this.regs = new Array(100).fill(0); this.message = 'Register gelöscht'; break;
      case 'CLTAPE': this.tape = []; break;
      case 'CLLCD': this.message = null; break;
      case 'CLALL': this.#openMenu('CLALL?'); this.message = 'Alles löschen?'; break;

      // Statistik
      case 'Σ+': case 'Σ-': {
        const t = this.#finishEntry();
        const x = realOf(this.stack[0]), y = realOf(this.stack[1]);
        if (x === null || y === null) { this.message = CalcError.type.message; return true; }
        this.stats.add(x, y, name === 'Σ+' ? 1 : -1);
        this.lastX = this.stack[0];
        this.stack[0] = this.stats.n;
        this.liftEnabled = false;
        this.#tapeOp(name, t, this.stack[0]);
        break;
      }
      case 'MEAN': case 'SDEV': {
        if (!(this.stats.n >= (name === 'MEAN' ? 1 : 2))) { this.message = CalcError.stat.message; return true; }
        const st = this.stats, n = st.n;
        if (name === 'MEAN') {
          this.#push(st.y / n); this.#push(st.x / n, 'MEAN');
        } else {
          const sx = Math.sqrt(Math.max(0, (st.x2 - st.x * st.x / n) / (n - 1)));
          const sy = Math.sqrt(Math.max(0, (st.y2 - st.y * st.y / n) / (n - 1)));
          this.#push(sy); this.#push(sx, 'SDEV');
        }
        break;
      }
      case 'WMEAN':
        if (this.stats.y === 0) { this.message = CalcError.stat.message; return true; }
        this.#push(this.stats.xy / this.stats.y, 'WMEAN');
        break;
      case 'ΣSUM':
        this.#push(this.stats.y); this.#push(this.stats.x, 'ΣSUM');
        break;
      case 'LINF': this.fitModel = 'lin'; break;
      case 'LOGF': this.fitModel = 'log'; break;
      case 'EXPF': this.fitModel = 'exp'; break;
      case 'PWRF': this.fitModel = 'pwr'; break;
      case 'BEST': {
        let best = null;
        for (const m of FIT_MODELS) {
          const f = this.stats.fit(m);
          if (f && (best === null || Math.abs(f.r) > Math.abs(best[1]))) best = [m, f.r];
        }
        if (best) { this.fitModel = best[0]; this.message = 'Modell: ' + best[0].toUpperCase() + 'F'; }
        else this.message = CalcError.stat.message;
        break;
      }
      case 'SLOPE': case 'YINT': case 'CORR': {
        const f = this.stats.fit(this.fitModel);
        if (!f) { this.message = CalcError.stat.message; return true; }
        const v = name === 'SLOPE' ? f.slope : (name === 'YINT' ? f.intercept : f.r);
        this.#push(v, name);
        break;
      }
      case 'FCSTX': case 'FCSTY': {
        const f = this.stats.fit(this.fitModel);
        if (!f) { this.message = CalcError.stat.message; return true; }
        const m = this.fitModel;
        this.#realUnary(name, (v) => {
          let r;
          if (name === 'FCSTY') {
            switch (m) {
              case 'lin': r = f.slope * v + f.intercept; break;
              case 'log': r = f.slope * Math.log(v) + f.intercept; break;
              case 'exp': r = f.intercept * Math.exp(f.slope * v); break;
              default: r = f.intercept * Math.pow(v, f.slope);
            }
          } else {
            switch (m) {
              case 'lin': r = (v - f.intercept) / f.slope; break;
              case 'log': r = Math.exp((v - f.intercept) / f.slope); break;
              case 'exp': r = Math.log(v / f.intercept) / f.slope; break;
              default: r = Math.pow(v / f.intercept, 1 / f.slope);
            }
          }
          if (!Number.isFinite(r)) throw CalcError.invalid;
          return r;
        });
        break;
      }

      // Logik (BASE)
      case 'AND': case 'OR': case 'XOR': case 'ROTXY': case 'BIT?': {
        const t = this.#finishEntry();
        const x = realOf(this.stack[0]), y = realOf(this.stack[1]);
        if (x === null || y === null || !isWhole(x) || !isWhole(y) || !Number.isFinite(x) || !Number.isFinite(y)) {
          this.message = CalcError.invalid.message; return true;
        }
        const a = int64(y) & WORD_MASK, b = int64(x) & WORD_MASK;
        if (name === 'BIT?') {
          this.message = (b < 36n && ((a >> b) & 1n) === 1n) ? 'Ja (Bit gesetzt)' : 'Nein';
          return true;
        }
        let r;
        switch (name) {
          case 'AND': r = a & b; break;
          case 'OR': r = a | b; break;
          case 'XOR': r = a ^ b; break;
          default: {
            const n = int64(x) % 36n;               // Rest mit Vorzeichen wie quotientAndRemainder
            const s = (n + 36n) % 36n;
            r = ((a >> s) | (a << (36n - s))) & WORD_MASK;
          }
        }
        this.lastX = this.stack[0];
        this.stack = [Number(wrap36(r)), this.stack[2], this.stack[3], this.stack[3]];
        this.liftEnabled = true;
        this.#tapeOp(name, t, this.stack[0]);
        break;
      }
      case 'NOT':
        this.#realUnary('NOT', (v) => {
          if (!isWhole(v)) throw CalcError.invalid;
          return Number(wrap36(~int64(v)));
        });
        break;

      // Drucken
      case 'PRX': this.#printLine(this.formatValue(this.stack[0]), 'result'); break;
      case 'PRSTK':
        ['t', 'z', 'y', 'x'].forEach((n, i) => {
          this.#printLine(n + ': ' + this.formatValue(this.stack[3 - i]), 'result', false);
        });
        break;
      case 'PRA': this.#printLine(this.alpha, 'alpha', false); break;
      case 'PRV': {
        const keys = Object.keys(this.vars).sort();
        if (keys.length === 0) this.#printLine('(keine Variablen)', 'info', false);
        for (const kk of keys) this.#printLine(kk + '=' + this.format.format(this.vars[kk]), 'result', false);
        break;
      }
      case 'PRΣ': {
        const s = this.stats;
        for (const [kk, v] of [['n', s.n], ['Σx', s.x], ['Σx²', s.x2], ['Σy', s.y], ['Σy²', s.y2], ['Σxy', s.xy]]) {
          this.#printLine(kk + '=' + this.format.format(v), 'result', false);
        }
        break;
      }
      case 'PRLCD':
        for (const l of this.lcdLines()) this.#printLine(l.label + ' ' + l.text, 'info', false);
        break;
      case 'ADV': this.tape.push({ id: randomID(), text: '', kind: 'separator' }); break;
      default:
        return false;
    }
    return true;
  }

  #arith(y, x, op) {
    if (this.base !== 'dec' && isNum(y) && isNum(x)) {
      const ia = int64(y), ib = int64(x);
      let r;
      switch (op) {
        case '+': r = BigInt.asIntN(64, ia + ib); break;
        case '-': r = BigInt.asIntN(64, ia - ib); break;
        case '*': r = BigInt.asIntN(64, ia * ib); break;
        default:
          if (ib === 0n) throw CalcError.divZero;
          r = BigInt.asIntN(64, ia / ib);
      }
      return Number(wrap36(r));
    }
    if (isNum(y) && isNum(x)) {
      switch (op) {
        case '+': return y + x;
        case '-': return y - x;
        case '*': return y * x;
        default:
          if (x === 0) throw CalcError.divZero;
          return y / x;
      }
    }
    const a = cOf(y), b = cOf(x);
    switch (op) {
      case '+': return a.add(b);
      case '-': return a.sub(b);
      case '*': return a.mul(b);
      default:
        if (b.isZero()) throw CalcError.divZero;
        return a.div(b);
    }
  }

  #roundToDisplay(v) {
    if (v === 0 || !Number.isFinite(v)) return v;
    switch (this.disp) {
      case 'fix': {
        const f = pow10(this.digits);
        return roundHalfAway(v * f) / f;
      }
      case 'sci': case 'eng': {
        const e = Math.floor(Math.log10(Math.abs(v)));
        const f = pow10(this.digits - e);
        return roundHalfAway(v * f) / f;
      }
      default:
        return v;
    }
  }

  static hmsToHours(v) {
    const sign = v < 0 ? -1 : 1;
    const a = Math.abs(v);
    const h = Math.floor(a);
    const rest = (a - h) * 100;
    const m = Math.floor(rest + 1e-9);
    const s = (rest - m) * 100;
    return sign * (h + m / 60 + s / 3600);
  }

  static hoursToHMS(v) {
    const sign = v < 0 ? -1 : 1;
    let a = Math.abs(v);
    let h = Math.floor(a);
    a = (a - h) * 60;
    let m = Math.floor(a + 1e-9);
    let s = (a - m) * 60;
    if (s >= 59.9999999) { s = 0; m += 1; }
    if (m >= 60) { m = 0; h += 1; }
    return sign * (h + m / 100 + s / 10000);
  }

  // MARK: Prompts (STO, RCL, FIX, XEQ …)

  #newPrompt(kind) {
    return { kind, arith: null, digits: '', name: null };
  }

  #promptKey(key) {
    if (!this.prompt) return;
    const p = { ...this.prompt };
    const shifted = this.shift;
    this.shift = false;
    if (key.id === 'shift') { this.shift = !shifted; return; }
    if (!shifted && key.menuIndex !== null && this.#visibleMenuRaw() !== null) {
      this.#pressMenu(key.menuIndex);
      return;
    }
    switch (key.id) {
      case 'exit':
        this.prompt = null;
        return;
      case 'back':
        if (p.name !== null) {
          if (p.name === '') p.name = null; else p.name = dropLast(p.name);
        } else if (p.digits !== '') {
          p.digits = p.digits.slice(0, -1);
        } else if (p.arith !== null) {
          p.arith = null;
        } else {
          this.prompt = null;
          return;
        }
        this.prompt = p;
        return;
      case 'up': case 'down': {
        const rows = this.#promptMenu().length;
        if (rows > 1) this.#promptRow = (this.#promptRow + (key.id === 'down' ? 1 : rows - 1)) % rows;
        return;
      }
      case 'enter':
        if (p.name !== null) { this.#finishPromptName(); return; }
        if (p.digits.length === 1) this.#completePrompt(p, parseInt(p.digits, 10));
        return;
      default:
        break;
    }
    if ((p.kind === 'sto' || p.kind === 'rcl') && p.digits === '' && p.name === null) {
      const ops = { add: '+', sub: '−', mul: '×', div: '÷' };
      const o = ops[key.id];
      if (o) { p.arith = o; this.prompt = p; return; }
    }
    if (key.digit !== null && p.kind !== 'xeq') {
      p.digits += key.digit;
      if (p.digits.length >= 2) {
        this.#completePrompt(p, parseInt(p.digits, 10));
      } else {
        this.prompt = p;
      }
    }
  }

  #completePrompt(p, n) {
    this.prompt = null;
    switch (p.kind) {
      case 'fix': this.disp = 'fix'; this.digits = Math.min(n, 11); break;
      case 'sci': this.disp = 'sci'; this.digits = Math.min(n, 11); break;
      case 'eng': this.disp = 'eng'; this.digits = Math.min(n, 11); break;
      case 'sto': case 'rcl': this.#storeRecall(p, n); break;
      default: break;
    }
  }

  #storeRecall(p, n, name = null) {
    if (p.kind === 'sto') {
      const x = this.stack[0];
      const label = name ?? pad2(n ?? 0);
      if (name !== null) {
        const xr = realOf(x);
        if (xr === null) { this.message = CalcError.type.message; return; }
        if (p.arith !== null) {
          const old = this.vars[name];
          if (old === undefined) { this.message = CalcError.missing.message; return; }
          let r = null;
          try { r = realOf(this.#arith(old, xr, arithOp(p.arith))); } catch { r = null; }
          if (r === null) { this.message = CalcError.divZero.message; return; }
          this.vars[name] = r;
        } else {
          this.vars[name] = xr;
        }
      } else if (n !== null) {
        if (p.arith !== null) {
          try {
            this.regs[n] = this.#check(this.#arith(this.regs[n], x, arithOp(p.arith)));
          } catch (e) {
            if (e instanceof CalcError) this.message = e.message;
            return;
          }
        } else {
          this.regs[n] = x;
        }
      }
      this.liftEnabled = true;
      this.#tapeOp('STO' + (p.arith ?? '') + ' ' + label, null, null);
    } else {
      let v;
      if (name !== null) {
        const val = this.vars[name];
        if (val === undefined) { this.message = CalcError.missing.message; return; }
        v = val;
      } else {
        v = this.regs[n ?? 0];
      }
      if (p.arith !== null) {
        try {
          v = this.#check(this.#arith(this.stack[0], v, arithOp(p.arith)));
        } catch (e) {
          if (e instanceof CalcError) this.message = e.message;
          return;
        }
        this.lastX = this.stack[0];
        this.stack[0] = v;
        this.liftEnabled = true;
      } else {
        this.#push(v);
      }
      this.#tapeOp('RCL' + (p.arith ?? '') + ' ' + (name ?? pad2(n ?? 0)), null, this.stack[0]);
    }
  }

  #finishStoRcl(name) {
    const p = this.prompt;
    if (!p) return;
    this.prompt = null;
    this.#storeRecall(p, null, name);
  }

  #finishPromptName() {
    const p = this.prompt;
    if (!p || p.name === null || p.name === '') { this.prompt = null; return; }
    const n = p.name;
    this.prompt = null;
    switch (p.kind) {
      case 'sto': case 'rcl': this.#storeRecall(p, null, n); break;
      case 'xeq': this.#runXEQ(n); break;
      default: break;
    }
  }

  /// Buchstaben von der Tastatur (ALPHA, Namen bei STO/RCL/XEQ). true = verarbeitet
  typeText(s) {
    const str = String(s);
    if (this.alphaMode) {
      return this.#run(() => {
        if (charCount(this.alpha) < 44) this.alpha += str;
        return true;
      });
    }
    const p = this.prompt;
    if (p && (p.kind === 'sto' || p.kind === 'rcl' || p.kind === 'xeq') && p.digits === '') {
      return this.#run(() => {
        this.prompt = { ...p, name: (p.name ?? '') + str };
        return true;
      });
    }
    return false;
  }

  /// Erwartet der Rechner gerade Text (ALPHA oder Namen)?
  get acceptsText() {
    if (this.alphaMode) return true;
    const p = this.prompt;
    return !!(p && p.digits === '' && (p.kind === 'sto' || p.kind === 'rcl' || p.kind === 'xeq'));
  }

  /// Eingabetaste der Tastatur, wenn Text erwartet wird
  submitText() {
    this.#run(() => {
      if (this.alphaMode) { this.alphaMode = false; return; }
      if (this.prompt && this.prompt.name !== null) this.#finishPromptName();
    });
  }

  #alphaKey(key) {
    switch (key.id) {
      case 'back':
        if (this.alpha === '') this.alphaMode = false; else this.alpha = dropLast(this.alpha);
        break;
      case 'exit': case 'enter':
        this.alphaMode = false;
        break;
      default:
        if (key.digit !== null) this.alpha += key.digit;
        else this.message = 'ALPHA: Buchstaben über die Mac-Tastatur';
    }
  }

  // MARK: XEQ, SOLVER, ∫f(x), Graph

  #startXEQ() {
    this.#finishEntry();
    this.prompt = this.#newPrompt('xeq');
    this.#promptRow = 0;
    if ((this.host?.graphFunctionNames?.() ?? []).length === 0) {
      this.message = 'Name tippen (z. B. SINH) + ⏎';
    }
  }

  #runXEQ(raw) {
    const n = trimSpaces(raw);
    const fns = this.host?.graphFunctionNames?.();
    if (fns && fns.includes(n.split("'").join(''))) {
      this.#evalGraphFunction(n);
      return;
    }
    const aliases = {
      SQRT: 'SQRT', '√': 'SQRT', POL: '→POL', REC: '→REC', TOPOL: '→POL', TOREC: '→REC',
      HMS: '→HMS', HR: '→HR', TODEG: '→DEG', TORAD: '→RAD', GAMMA: 'GAM', FACT: 'N!',
      EXP: 'E^X', SWAP: 'X<>Y', RDN: 'R↓', RUP: 'R↑', LASTX: 'LASTX', PI: 'PI',
      SQ: 'X^2', INV: '1/X', POW: 'Y^X',
    };
    const up = n.toUpperCase();
    const target = Object.hasOwn(aliases, up) ? aliases[up] : up;
    if (this.#execute(target)) return;
    this.message = 'Unbekannt: ' + n;
  }

  #evalGraphFunction(name) {
    const host = this.host;
    if (!host) return;
    this.#unary(name + '(x)', (x) => {
      if (!isNum(x)) throw CalcError.type;
      const r = typeof host.evaluateGraphFunction === 'function' ? host.evaluateGraphFunction(name, x) : null;
      if (typeof r !== 'number' || !Number.isFinite(r)) throw CalcError.invalid;
      return r;
    });
  }

  #solverKey(eq, v) {
    if (this.entry) {
      this.#finishEntry();
      const x = realOf(this.stack[0]);
      if (x === null) { this.message = CalcError.type.message; return; }
      this.vars[v] = x;
      this.liftEnabled = true;
      this.message = v + '=' + this.format.format(x);
      this.#tapeInfo(v + '=' + this.format.format(x));
      return;
    }
    const res = this.host?.solve?.(eq, v) ?? null;
    if (!res) { this.message = 'Formel fehlerhaft'; return; }
    if (typeof res.x !== 'number' || !Number.isFinite(res.x)) { this.message = solveMeldung(res.status); return; }
    this.vars[v] = res.x;
    this.#push(res.x);
    const f = this.format.format(res.x);
    this.message = v + '=' + f + (res.status === SOLVE.root ? ''
      : '  ' + (res.status === SOLVE.extremum ? 'Extremum' : 'Vorzeichenwechsel'));
    this.#tapeInfo('SOLVE ' + v + '=' + f + (res.status === SOLVE.root ? '' : ' (' + solveMeldung(res.status) + ')'));
  }

  #limitKey(name) {
    if (this.entry) {
      this.#finishEntry();
      const x = realOf(this.stack[0]);
      if (x === null) { this.message = CalcError.type.message; return; }
      this.vars[name] = x;
      this.liftEnabled = true;
      this.message = name + '=' + this.format.format(x);
    } else {
      const v = this.vars[name];
      this.message = name + '=' + (v !== undefined ? this.format.format(v) : '–');
    }
  }

  #integrate(fnName) {
    const a = this.vars.LLIM, b = this.vars.ULIM;
    if (a === undefined || b === undefined) { this.message = 'LLIM und ULIM zuerst speichern'; return; }
    const v = this.host?.integrate?.(fnName, a, b) ?? null;
    if (typeof v !== 'number' || !Number.isFinite(v)) { this.message = 'Integral nicht berechenbar'; return; }
    this.#push(v);
    const f = this.format;
    this.message = '∫=' + f.format(v);
    this.#tapeInfo(`∫ ${fnName}(x) dx [${f.format(a)}; ${f.format(b)}] = ` + f.format(v));
  }

  #plotStats() {
    if (!(this.stats.n >= 1)) { this.message = CalcError.stat.message; return; }
    this.host?.plotStatistics?.();
    this.message = 'Messwerte im Graph';
  }

  #openLGS() {
    let n = 3;
    const x = realOf(this.stack[0]);
    if (x !== null && isWhole(x) && x >= 2 && x <= 8) n = x;
    this.host?.openWorkspace?.({ kind: 'lgs', n });
    this.message = `LGS ${n}×${n} im Arbeitsbereich`;
  }

  #openPoly() {
    let n = 4;
    const x = realOf(this.stack[0]);
    if (x !== null && isWhole(x) && x >= 2 && x <= 10) n = x;
    this.host?.openWorkspace?.({ kind: 'polynomial', n });
    this.message = `Polynom Grad ${n} im Arbeitsbereich`;
  }

  /// Werkszustand (Menü „Alles zurücksetzen“)
  resetAll() {
    this.#run(() => {
      this.#clearAll();
      this.tape = [];
      this.angle = 'deg'; this.polar = false; this.cpxRes = false;
      this.disp = 'fix'; this.digits = 4; this.grouping = true;
      this.base = 'dec'; this.fitModel = 'lin';
      this.menuStack = []; this.prompt = null; this.alphaMode = false; this.shift = false;
      this.#undoStack = [];
      this.message = null;
    });
  }

  #clearAll() {
    this.stack = [0, 0, 0, 0];
    this.lastX = 0;
    this.regs = new Array(100).fill(0);
    this.vars = Object.create(null);
    this.stats = new StatSums();
    this.alpha = '';
    this.entry = null;
    this.liftEnabled = true;
    this.message = 'Speicher gelöscht';
  }

  // MARK: Protokoll (Drucker)

  #pad(s) {
    const n = charCount(s);
    return n >= Calculator.tapeWidth ? s : ' '.repeat(Calculator.tapeWidth - n) + s;
  }

  #tapeOp(name, operand, result) {
    if (!this.printOn || this.printMode === 'man') return;
    const line = (operand !== null && operand !== undefined ? operand + ' ' : '') + name;
    this.tape.push({ id: randomID(), text: this.#pad(line), kind: 'op' });
    if (this.printMode === 'trace' && result !== null && result !== undefined) {
      this.tape.push({ id: randomID(), text: this.#pad(this.formatValue(result) + ' ***'), kind: 'result' });
    }
  }

  /// Hinweiszeile im Protokoll (nur wenn der Drucker an ist)
  tapeInfo(s) {
    this.#run(() => this.#tapeInfo(s));
  }

  #tapeInfo(s) {
    if (!this.printOn) return;
    this.tape.push({ id: randomID(), text: s, kind: 'info' });
  }

  #printLine(s, kind, align = true) {
    this.tape.push({ id: randomID(), text: align ? this.#pad(s) : s, kind });
  }

  // MARK: Rückgängig

  #pushUndo() {
    this.#undoStack.push({
      stack: this.stack.slice(), lastX: this.lastX, regs: this.regs.slice(),
      vars: Object.assign(Object.create(null), this.vars), lift: this.liftEnabled,
      entry: this.entry ? { ...this.entry } : null, stats: this.stats.clone(), alpha: this.alpha,
    });
    if (this.#undoStack.length > 200) this.#undoStack.splice(0, this.#undoStack.length - 200);
  }

  get canUndo() { return this.#undoStack.length > 0; }

  undo() {
    this.#run(() => {
      const s = this.#undoStack.pop();
      if (!s) return;
      this.stack = s.stack; this.lastX = s.lastX; this.regs = s.regs; this.vars = s.vars;
      this.liftEnabled = s.lift; this.entry = s.entry; this.stats = s.stats; this.alpha = s.alpha;
      this.prompt = null;
      this.message = 'Rückgängig';
    });
  }

  // MARK: Zwischenablage

  /// Text von X zum Kopieren (wieder einlesbar)
  copyXText() {
    if (this.entry) {
      const v = entryValue(this.entry);
      return v === roundHalfAway(v) && Math.abs(v) < 1e15 ? String(Math.trunc(v) + 0) : Fmt.plain(v, 15);
    }
    const x = this.stack[0];
    if (isNum(x)) {
      let s = Fmt.plain(x, 15);
      if (this.radixComma) s = s.split('.').join(',');
      return s;
    }
    return this.formatValue(x);
  }

  /// Zahl oder konstanten Ausdruck („2π“) in X einfügen; false = kein Zahlenwert
  paste(text) {
    const t = String(text ?? '').trim();
    if (t === '') return false;
    return this.#run(() => {
      let v = Rational.parse(t)?.toNumber() ?? null;
      if (v === null) {
        try { v = evaluateConstant(t, toRad(this.angle)); } catch { v = null; }
      }
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        this.message = 'Kein Zahlenwert in der Zwischenablage';
        return false;
      }
      this.#pushUndo();
      this.#push(v);
      return true;
    });
  }
}

/// Rechenzeichen im Prompt → Operator für arith
function arithOp(c) {
  switch (c) {
    case '+': return '+';
    case '−': return '-';
    case '×': return '*';
    default: return '/';
  }
}

/// Ziffernfolge im Zahlensystem → BigInt (wie Int64(_, radix:), ungültig → 0)
function parseRadix(s, radix) {
  const digits = '0123456789ABCDEF'.slice(0, radix);
  let v = 0n;
  const r = BigInt(radix);
  for (const ch of s.toUpperCase()) {
    const d = digits.indexOf(ch);
    if (d < 0) return 0n;
    v = v * r + BigInt(d);
  }
  // Int64-Grenze: größere Werte gelten wie in Swift als ungültig (→ 0)
  if (v > 0x7FFFFFFFFFFFFFFFn) return 0n;
  return v;
}

// MARK: - Uhr im Display

const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

/// „Mo 28.09.2026  16:05“ (Wochentag ohne Punkt, wie auf einem LCD; Ortszeit)
export function clockText(d) {
  return WEEKDAYS[d.getDay()] + ' ' + pad2(d.getDate()) + '.' + pad2(d.getMonth() + 1) + '.'
    + String(d.getFullYear()).padStart(4, '0') + '  ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

// MARK: - Tastatur (KeyMap)

const K = (id) => Object.freeze({ type: 'key', id });
const S = (id) => Object.freeze({ type: 'shifted', id });
const X = (name) => Object.freeze({ type: 'exec', name });
const HELP = Object.freeze({ type: 'help' });

/// Zeichen → Aktion
const SINGLE = new Map([
  ['0', K('n0')], ['1', K('n1')], ['2', K('n2')], ['3', K('n3')], ['4', K('n4')],
  ['5', K('n5')], ['6', K('n6')], ['7', K('n7')], ['8', K('n8')], ['9', K('n9')],
  ['.', K('dot')], [',', K('dot')],
  ['+', K('add')], ['-', K('sub')], ['*', K('mul')], ['/', K('div')], ['×', K('mul')], ['÷', K('div')],
  ['=', K('enter')],
  ['^', S('inv')], ['ˆ', S('inv')], ['y', S('inv')],
  ['e', K('eex')], ['E', K('eex')],
  ['n', K('chs')], ['_', K('chs')],
  ['x', K('swap')], ['X', K('xeq')],
  ['a', S('swap')],
  ['r', K('rdn')], ['R', X('R↑')],
  ['s', K('sin')], ['S', S('sin')],
  ['c', K('cos')], ['C', S('cos')],
  ['t', K('tan')], ['T', S('tan')],
  ['q', K('sqrt')], ['Q', S('sqrt')], ['w', S('sqrt')],
  ['i', K('inv')],
  ['l', K('ln')], ['L', S('ln')],
  ['g', K('log')], ['G', S('log')],
  ['p', S('rdn')], ['π', S('rdn')],
  ['%', S('rcl')],
  ['!', X('N!')],
  ['m', K('sto')], ['M', K('rcl')], ['v', K('rcl')],
  ['j', S('sto')],
  ['?', HELP],
]);

/// Benannte Tasten des Browsers (KeyboardEvent.key) → Aktion; iOS-Safari meldet teils „UIKeyInput…“
const NAMED = new Map([
  ['Enter', K('enter')],
  ['Backspace', K('back')], ['Delete', K('back')],
  ['Escape', K('exit')], ['Esc', K('exit')], ['UIKeyInputEscape', K('exit')],
  ['Tab', K('shift')],
  ['ArrowUp', K('up')], ['Up', K('up')], ['UIKeyInputUpArrow', K('up')],
  ['ArrowDown', K('down')], ['Down', K('down')], ['UIKeyInputDownArrow', K('down')],
  ['F1', Object.freeze({ type: 'menu', i: 0 })], ['F2', Object.freeze({ type: 'menu', i: 1 })],
  ['F3', Object.freeze({ type: 'menu', i: 2 })], ['F4', Object.freeze({ type: 'menu', i: 3 })],
  ['F5', Object.freeze({ type: 'menu', i: 4 })], ['F6', Object.freeze({ type: 'menu', i: 5 })],
]);

/// Das eine Zeichen einer Taste (oder null)
function singleChar(ev) {
  const s = ev && typeof ev.key === 'string' ? ev.key : '';
  const a = Array.from(s);
  return a.length === 1 ? a[0] : null;
}

/// Tastatur-Ereignis → Aktion: {type:'key', id} | {type:'shifted', id} | {type:'exec', name} | {type:'menu', i}
/// | {type:'help'} | null
export function keyActionForEvent(ev) {
  if (!ev) return null;
  const named = NAMED.get(ev.key);
  if (named) return named;
  const c = singleChar(ev);
  if (c === null) return null;
  return SINGLE.get(c) ?? null;
}

/// Taste an den Rechner verteilen (wie AppModel.route in Swift). true = verarbeitet.
/// flash(keyId) lässt die Taste auf dem Bildschirm kurz aufleuchten (optional).
/// „?“ (Hilfe) ruft calc.host.showHelp() auf, falls vorhanden.
export function routeKey(calc, ev, flash = null) {
  if (!ev || ev.metaKey || ev.ctrlKey || ev.altKey) return false;
  const press = (k) => {
    if (typeof flash === 'function') flash(k);
    calc.press(k);
  };
  const c = singleChar(ev);

  // HEX-Modus: Tasten a–f sind Hex-Ziffern
  if (calc.base === 'hex' && !calc.acceptsText && c !== null) {
    const u = c.toUpperCase();
    if (u.length === 1 && 'ABCDEF'.includes(u)) {
      calc.baseDigit(u);
      return true;
    }
  }

  // Texteingabe (ALPHA, Namen bei STO/RCL/XEQ)
  if (calc.acceptsText) {
    if (ev.key === 'Enter') {
      if ((calc.prompt && calc.prompt.name !== null) || calc.alphaMode) { calc.submitText(); return true; }
    } else if (ev.key === 'Backspace') {
      press('back'); return true;
    } else if (ev.key === 'Escape' || ev.key === 'Esc' || ev.key === 'UIKeyInputEscape') {
      press('exit'); return true;
    } else if (c !== null) {
      const isLetter = /^[\p{L}_']$/u.test(c);
      if (calc.alphaMode && c !== '\n' && c !== '\r' && c !== '\t') {
        return calc.typeText(c);
      }
      if (isLetter || (calc.prompt && calc.prompt.name !== null && /^\p{N}$/u.test(c))) {
        return calc.typeText(c);
      }
    }
  }

  const action = keyActionForEvent(ev);
  if (!action) return false;
  switch (action.type) {
    case 'key': press(action.id); break;
    case 'shifted':
      if (!calc.shift) calc.press('shift');
      press(action.id);
      break;
    case 'exec': calc.execute(action.name); break;
    case 'menu': calc.pressMenu(action.i); break;
    case 'help':
      if (calc.host && typeof calc.host.showHelp === 'function') { calc.host.showHelp(); break; }
      return false;
    default: return false;
  }
  return true;
}

/// Hilfe-Tabelle: [Tasten, Beschreibung] wie KeyMap.chars
export const KEY_HELP = Object.freeze([
  ['0 … 9', 'Ziffern'],
  ['. oder ,', 'Dezimaltrennzeichen'],
  ['+  -  *  /', 'Grundrechenarten'],
  ['⏎  oder  =', 'ENTER'],
  ['⌫', '← (Zeichen löschen / CLX)'],
  ['esc', 'EXIT (Menü verlassen)'],
  ['⇥ Tab', 'Shift (orange Taste)'],
  ['e', 'E (Exponent eingeben)'],
  ['n', '+/− (Vorzeichen)'],
  ['x', 'x≷y'],
  ['a', 'LASTx'],
  ['r   ·   R', 'R↓   ·   R↑'],
  ['↑  ↓', '▲ ▼ (Menüseite / Stack rollen)'],
  ['s  c  t', 'SIN  COS  TAN'],
  ['S  C  T', 'ASIN  ACOS  ATAN'],
  ['q   ·   Q', '√x   ·   x²'],
  ['^  oder  y', 'yˣ'],
  ['i', '1/x'],
  ['l   ·   L', 'LN   ·   eˣ'],
  ['g   ·   G', 'LOG   ·   10ˣ'],
  ['p', 'π'],
  ['%', '%'],
  ['!', 'N! (Fakultät)'],
  ['m   ·   M', 'STO   ·   RCL'],
  ['j', 'COMPLEX (j wie in der E-Technik)'],
  ['X', 'XEQ (Graphfunktionen, Befehlsnamen)'],
  ['F1 … F6', 'Menütasten (Beschriftung unten im Display)'],
  ['⌘Z', 'Rückgängig'],
  ['⌘C  ·  ⌘V', 'X kopieren  ·  Zahl einfügen'],
  ['⌘/', 'Diese Übersicht'],
].map((r) => Object.freeze(r)));

/// Tooltip einer Taste (KeyMap.hint)
export function keyHint(keyId) {
  const key = KEY_BY_ID[keyId];
  if (!key) return '';
  const primary = [];
  const shifted = [];
  for (const [c, a] of SINGLE) {
    if (a.type === 'key' && a.id === keyId) primary.push(c);
    else if (a.type === 'shifted' && a.id === keyId) shifted.push(c);
  }
  switch (keyId) {
    case 'enter': primary.push('⏎'); break;
    case 'back': primary.push('⌫'); break;
    case 'exit': primary.push('esc'); break;
    case 'shift': primary.push('⇥ Tab'); break;
    case 'up': primary.push('↑'); break;
    case 'down': primary.push('↓'); break;
    default: break;
  }
  const name = keyId === 'shift' ? 'Shift' : key.label;
  let t = name;
  if (primary.length > 0) t += '  –  Mac-Taste: ' + primary.sort().join(' ');
  if (key.shifted !== '') {
    t += '\nShift: ' + key.shifted;
    if (shifted.length > 0) t += '  –  Mac-Taste: ' + shifted.sort().join(' ');
  }
  return t;
}
