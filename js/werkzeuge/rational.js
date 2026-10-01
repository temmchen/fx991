// rational.js – exakte Brüche für Lösungswege mit Brüchen (LGS, quadratische Gleichungen, Polynome).
// Portierung von `struct Rational` aus Rational.swift. Swift rechnete mit Int64 und Überlaufprüfung;
// hier rechnet Rational exakt mit BigInt. Damit Brüche nicht ausufern, gilt ein Größenlimit:
// hat Zähler oder Nenner mehr als 40 Dezimalstellen, zählt das wie ein Überlauf in Swift –
// die Operation liefert null und der Aufrufer fällt auf Dezimalzahlen zurück.

/// Zähler/Nenner ab 10^40 (also mit mehr als 40 Stellen) gelten als Überlauf
const LIMIT = 10n ** 40n;
const INT64_MAX = (1n << 63n) - 1n;
const INT64_MIN = -(1n << 63n);

function babs(v) { return v < 0n ? -v : v; }
function tooBig(v) { return babs(v) >= LIMIT; }

/// ggT; Zahlen oder BigInt (ist einer der Werte ein BigInt, rechnet ggT mit BigInt), immer ≥ 0
export function gcd(a, b) {
  if (typeof a === 'bigint' || typeof b === 'bigint') {
    let x = babs(BigInt(a));
    let y = babs(BigInt(b));
    while (y !== 0n) [x, y] = [y, x % y];
    return x;
  }
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) [x, y] = [y, x % y];
  return x;
}

/// kgV; null bei „Überlauf“ (Zahl: nicht mehr exakt darstellbar, BigInt: Größenlimit)
export function lcm(a, b) {
  if (typeof a === 'bigint' || typeof b === 'bigint') {
    const x = BigInt(a);
    const y = BigInt(b);
    if (x === 0n || y === 0n) return 0n;
    const r = babs(x) / gcd(x, y) * babs(y);
    return tooBig(r) ? null : r;
  }
  if (a === 0 || b === 0) return 0;
  const r = Math.abs(a) / gcd(a, b) * Math.abs(b);
  return Number.isSafeInteger(r) ? r : null;
}

/// Ganzzahl (Zahl oder BigInt) → BigInt; wirft bei nicht ganzzahligen Zahlen
function toBig(v) {
  if (typeof v === 'bigint') return v;
  if (typeof v === 'number' && Number.isInteger(v)) return BigInt(v);
  throw new TypeError(`Rational: keine Ganzzahl: ${v}`);
}

/// Exakter Bruch einer endlichen Gleitkommazahl (Zweierbruch) oder null
function fromDouble(x) {
  if (!Number.isFinite(x)) return null;
  if (Number.isInteger(x)) return Rational.make(BigInt(x), 1n);
  let den = 1n;
  let v = x;
  // Mit 2 multiplizieren ist exakt, bis v ganzzahlig ist (höchstens 1074 Schritte)
  while (!Number.isInteger(v)) {
    v *= 2;
    den *= 2n;
  }
  return Rational.make(BigInt(v), den);
}

/// Operand (Rational, Ganzzahl, BigInt oder Gleitkommazahl) → Rational | null
function operand(o) {
  if (o instanceof Rational) return o;
  if (typeof o === 'bigint') return new Rational(o, 1n);
  if (typeof o === 'number') return Number.isInteger(o) ? new Rational(BigInt(o), 1n) : fromDouble(o);
  return null;
}

export class Rational {
  #num;
  #den;   // immer > 0

  /// Gekürzter Bruch num/den; wirft bei den = 0
  constructor(num, den = 1n) {
    let n = toBig(num);
    let d = toBig(den);
    if (d === 0n) throw new RangeError('Rational: Nenner 0');
    if (n === 0n) {
      this.#num = 0n;
      this.#den = 1n;
      return;
    }
    const g = gcd(n, d);
    n /= g;
    d /= g;
    if (d < 0n) { n = -n; d = -d; }
    this.#num = n;
    this.#den = d;
  }

  /// Wie Swifts `init?(_:_:)`: null bei Nenner 0 oder wenn das Größenlimit überschritten ist
  static make(num, den = 1n) {
    const d = toBig(den);
    if (d === 0n) return null;
    const r = new Rational(num, d);
    return tooBig(r.#num) || tooBig(r.#den) ? null : r;
  }

  get num() { return this.#num; }
  get den() { return this.#den; }

  toNumber() { return Number(this.#num) / Number(this.#den); }
  isZero() { return this.#num === 0n; }
  isInteger() { return this.#den === 1n; }
  abs() { return this.#num < 0n ? new Rational(-this.#num, this.#den) : this; }
  neg() { return new Rational(-this.#num, this.#den); }
  signum() { return this.#num > 0n ? 1 : (this.#num < 0n ? -1 : 0); }

  // MARK: Rechnen (null = Überlauf bzw. Division durch 0)

  add(o) {
    const b = operand(o);
    if (b === null) return null;
    return Rational.make(this.#num * b.#den + b.#num * this.#den, this.#den * b.#den);
  }
  sub(o) {
    const b = operand(o);
    if (b === null) return null;
    return this.add(b.neg());
  }
  mul(o) {
    const b = operand(o);
    if (b === null) return null;
    if (this.#num === 0n || b.#num === 0n) return Rational.ZERO;
    return Rational.make(this.#num * b.#num, this.#den * b.#den);
  }
  div(o) {
    const b = operand(o);
    if (b === null || b.#num === 0n) return null;
    return Rational.make(this.#num * b.#den, this.#den * b.#num);
  }

  /// Vergleich −1 / 0 / 1 (exakt über Kreuzprodukt)
  cmp(o) {
    const b = operand(o);
    if (b === null) {
      // nicht exakt darstellbarer Vergleichswert (z. B. 1e-300): über Gleitkommazahlen vergleichen
      const v = this.toNumber(), x = Number(o);
      return v > x ? 1 : (v < x ? -1 : 0);
    }
    const t = this.#num * b.#den - b.#num * this.#den;
    return t > 0n ? 1 : (t < 0n ? -1 : 0);
  }
  equals(o) {
    const b = o instanceof Rational ? o : (typeof o === 'number' || typeof o === 'bigint' ? operand(o) : null);
    return b !== null && this.#num === b.#num && this.#den === b.#den;
  }
  /// Schlüssel für Map/Set (gleiche Brüche → gleicher Schlüssel)
  key() { return `${this.#num}/${this.#den}`; }

  // MARK: Einlesen

  /// „3“, „-2,5“, „1/3“, „0.125“, „1e-3“, „−7/4“
  static parse(raw) {
    if (raw === null || raw === undefined) return null;
    const s = trimWhitespace(String(raw))
      .split('−').join('-')
      .split(',').join('.')
      .split(' ').join('');
    if (s.length === 0) return null;
    const slash = s.indexOf('/');
    if (slash >= 0) {
      const ra = parseDecimal(s.slice(0, slash));
      const rb = parseDecimal(s.slice(slash + 1));
      if (ra === null || rb === null || rb.isZero()) return null;
      return ra.div(rb);
    }
    return parseDecimal(s);
  }

  /// Kettenbruch-Näherung (nur wenn sehr genau), z. B. 0.3333333333 → 1/3
  static approximate(x, maxDen = 1000, tol = 1e-9) {
    if (!Number.isFinite(x) || !(Math.abs(x) < 1e12)) return null;
    let h0 = 0n, h1 = 1n, k0 = 1n, k1 = 0n;
    let r = x;
    for (let i = 0; i < 40; i++) {
      const a = Math.floor(r);
      if (!(Math.abs(a) < 1e12)) break;
      const ai = BigInt(a);
      // Überlaufprüfung wie Int64 in Swift (mulO/addO)
      const t1 = ai * h1, t2 = ai * k1;
      const h2 = t1 + h0, k2 = t2 + k0;
      if (!inInt64(t1) || !inInt64(h2) || !inInt64(t2) || !inInt64(k2)) break;
      if (k2 > maxDen) break;
      h0 = h1; h1 = h2; k0 = k1; k1 = k2;
      if (Math.abs(Number(h1) / Number(k1) - x) <= tol * Math.max(1, Math.abs(x))) return Rational.make(h1, k1);
      const f = r - a;
      if (f < 1e-15) break;
      r = 1 / f;
    }
    return null;
  }

  // MARK: Ausgabe

  /// „−3/4“, „5“ (echtes Minuszeichen)
  get text() {
    const a = babs(this.#num);
    const s = this.#den === 1n ? `${a}` : `${a}/${this.#den}`;
    return this.#num < 0n ? '−' + s : s;
  }
  toString() { return this.text; }

  // MARK: Swift-Namen (Aliase für eine wörtliche Portierung)

  get double() { return this.toNumber(); }
  get negated() { return this.neg(); }
  adding(o) { return this.add(o); }
  subtracting(o) { return this.sub(o); }
  multiplying(o) { return this.mul(o); }
  dividing(o) { return this.div(o); }
}

Rational.ZERO = new Rational(0n);
Rational.ONE = new Rational(1n);

function inInt64(v) { return v >= INT64_MIN && v <= INT64_MAX; }

/// Leerraum wie Swifts `.whitespaces` am Anfang und Ende entfernen (Leerzeichen, Tab, Zs)
function trimWhitespace(s) {
  return s.replace(/^[\t\p{Zs}]+|[\t\p{Zs}]+$/gu, '');
}

function parseDecimal(s0) {
  let s = s0;
  let neg = false;
  if (s.startsWith('-')) { neg = true; s = s.slice(1); } else if (s.startsWith('+')) { s = s.slice(1); }
  let exp = 0;
  const e = s.search(/[eE]/);
  if (e >= 0) {
    const evText = s.slice(e + 1);
    if (!/^[+-]?[0-9]+$/.test(evText)) return null;
    const ev = parseInt(evText, 10);
    if (!(Math.abs(ev) < 30)) return null;
    exp = ev;
    s = s.slice(0, e);
  }
  const parts = s.split('.');
  if (parts.length > 2) return null;
  const intPart = parts[0];
  const fracPart = parts.length === 2 ? parts[1] : '';
  const all = intPart + fracPart;
  if (all.length === 0 || !/^[0-9]+$/.test(all)) return null;
  const trimmed = all.replace(/^0+/, '');
  if (trimmed.length > 17) return null;
  let n = trimmed.length === 0 ? 0n : BigInt(trimmed);
  let scale = fracPart.length - exp;
  let d = 1n;
  while (scale > 0) { d *= 10n; scale -= 1; }
  while (scale < 0) { n *= 10n; scale += 1; }
  return Rational.make(neg ? -n : n, d);
}
