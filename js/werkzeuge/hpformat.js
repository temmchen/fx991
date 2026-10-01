// hpformat.js – Zahlendarstellung wie beim HP-42S: FIX / SCI / ENG / ALL, Radix „.“ oder „,“,
// Tausendergruppen, komplexe Zahlen (RECT „3 i4“, POLAR „5 ∠53,13“), HEX/OCT/BIN mit 36 Bit.
// Portierung von HPFormat.swift. Die 36-Bit-Logik rechnet mit BigInt (JS-Bitoperatoren haben nur 32 Bit).
import { Complex } from './complex.js';
import { CFormat } from './fmt.js';

/// Winkelmodus (AngleMode in Swift)
export const ANGLE = { deg: 'deg', rad: 'rad', grad: 'grad' };

/// Faktor Winkeleinheit → Bogenmaß
export function toRad(angleMode) {
  switch (String(angleMode).toLowerCase()) {
    case 'deg': return Math.PI / 180;
    case 'grad': return Math.PI / 200;
    default: return 1;          // 'rad'
  }
}

/// Anzeigename des Winkelmodus: „DEG“, „RAD“, „GRAD“
export function angleName(angleMode) {
  return String(angleMode).toUpperCase();
}

/// Anzeigemodus (DispMode in Swift)
export const DISP = { fix: 'fix', sci: 'sci', eng: 'eng', all: 'all' };

/// Zahlensystem (BaseMode in Swift): Schlüssel = Modusname, Wert = Radix
export const BASE = { dec: 10, hex: 16, oct: 8, bin: 2 };

/// Anzeigename des Zahlensystems: „DEC“, „HEX“, „OCT“, „BIN“
export function baseName(base) {
  return String(base).toUpperCase();
}

// MARK: Zahlensysteme (36 Bit, Zweierkomplement wie beim HP-42S)

export const WORD_MASK = (1n << 36n) - 1n;

/// Ganzzahl im gewählten Zahlensystem (Großbuchstaben); negative Werte als 36-Bit-Zweierkomplement.
/// null, wenn x keine Ganzzahl ist oder |x| ≥ 2^35.
export function baseString(x, base) {
  const radix = typeof base === 'number' ? base : BASE[base];
  if (!radix) return null;
  if (!Number.isFinite(x) || !Number.isInteger(x) || Math.abs(x) >= 34359738368) return null;   // < 2^35
  let v = BigInt(x);
  if (v < 0n) v = v & WORD_MASK;
  return v.toString(radix).toUpperCase();
}

/// 36-Bit-Wert (mit Vorzeichen) aus einer Ganzzahl. BigInt → BigInt, Zahl → Zahl.
export function wrap36(v) {
  const isNum = typeof v === 'number';
  let w = (isNum ? BigInt(Math.trunc(v)) : v) & WORD_MASK;
  if ((w & (1n << 35n)) !== 0n) w -= 1n << 36n;
  return isNum ? Number(w) : w;
}

// MARK: Formatierer

export class HPFormat {
  constructor({ mode = 'fix', digits = 4, comma = true, grouping = true } = {}) {
    this.mode = mode;
    this.digits = digits;
    this.comma = comma;
    this.grouping = grouping;
  }

  get #radix() { return this.comma ? ',' : '.'; }
  get #groupSep() { return this.comma ? '.' : ','; }

  /// Reelle Zahl im eingestellten Modus. Mit einem Complex-Wert wie formatComplex(z, polar, angleMode).
  format(x, polar = false, angleMode = 'deg') {
    if (x instanceof Complex) return this.formatComplex(x, polar, angleMode);
    if (Number.isNaN(x)) return 'NaN';
    if (!Number.isFinite(x)) return x > 0 ? '9,99999999999E499' : '-9,99999999999E499';
    switch (this.mode) {
      case 'sci': return this.#sci(x, this.digits);
      case 'eng': return this.#eng(x);
      case 'all': return this.#all(x);
      default: return this.#fix(x);
    }
  }

  #group(intPart) {
    if (!this.grouping || intPart.length <= 3) return intPart;
    const sep = this.#groupSep;
    let out = '';
    const n = intPart.length;
    for (let i = 0; i < n; i++) {
      // i-te Ziffer von rechts: vor jeder dritten ein Trennzeichen
      if (i > 0 && i % 3 === 0) out = sep + out;
      out = intPart[n - 1 - i] + out;
    }
    return out;
  }

  #assemble(neg, intPart, frac, trailingRadix = false) {
    let s = (neg ? '-' : '') + this.#group(intPart);
    if (frac !== null && frac !== undefined && frac.length > 0) s += this.#radix + frac;
    else if (trailingRadix) s += this.#radix;
    return s;
  }

  #fix(x) {
    const n = this.digits;
    if (x === 0) return this.#assemble(false, '0', '0'.repeat(n), true);
    const ax = Math.abs(x);
    let intDigits = ax >= 1 ? Math.floor(Math.log10(ax)) + 1 : 1;
    if (intDigits > 12) return this.#sci(x, n);
    let decimals = Math.min(n, 12 - intDigits);
    let s = CFormat.f(ax, decimals);
    // Übertrag beim Runden (999,99995 → 1000,0000)
    const dot = s.indexOf('.');
    intDigits = dot >= 0 ? dot : s.length;
    if (intDigits > 12) return this.#sci(x, n);
    if (intDigits + decimals > 12) {
      decimals = Math.max(0, 12 - intDigits);
      s = CFormat.f(ax, decimals);
    }
    if (Number(s) === 0) return this.#sci(x, n);   // zu klein für FIX
    const parts = s.split('.');
    return this.#assemble(x < 0, parts[0], parts.length > 1 ? parts[1] : null, true);
  }

  /// Mantisse und Exponent mit `sig` signifikanten Stellen
  #mantExp(x, sig) {
    const s = CFormat.e(Math.abs(x), Math.max(sig - 1, 0));
    const e = s.indexOf('e');
    if (e < 0) return [s, 0];
    return [s.slice(0, e), parseInt(s.slice(e + 1), 10) || 0];
  }

  #sci(x, n) {
    const radix = this.#radix;
    if (x === 0) return (n > 0 ? '0' + radix + '0'.repeat(n) : '0' + radix) + 'E0';
    const [m, e] = this.#mantExp(x, Math.min(n, 11) + 1);
    let mant = m.split('.').join(radix);
    if (!mant.includes(radix)) mant += radix;
    return (x < 0 ? '-' : '') + mant + 'E' + e;
  }

  #eng(x) {
    const radix = this.#radix;
    const n = Math.min(this.digits, 11);
    if (x === 0) return this.#sci(0, n);
    const [m, e] = this.#mantExp(x, n + 1);
    const e3 = e - (((e % 3) + 3) % 3);
    const mantVal = (Number(m) || 0) * Math.pow(10, e - e3);
    const decimals = Math.max(0, n - (e - e3));
    const ms = CFormat.f(mantVal, decimals);
    let mant = ms.split('.').join(radix);
    if (!mant.includes(radix)) mant += radix;
    return (x < 0 ? '-' : '') + mant + 'E' + e3;
  }

  #all(x) {
    const radix = this.#radix;
    if (x === 0) return '0';
    const [m, e] = this.#mantExp(x, 12);
    let digitsOnly = m.split('.').join('');
    while (digitsOnly.length > 1 && digitsOnly.endsWith('0')) digitsOnly = digitsOnly.slice(0, -1);
    if (e >= 0 && e < 12) {
      const intLen = e + 1;
      let intPart = digitsOnly;
      let frac = '';
      if (digitsOnly.length > intLen) {
        intPart = digitsOnly.slice(0, intLen);
        frac = digitsOnly.slice(intLen);
      } else {
        intPart = digitsOnly + '0'.repeat(intLen - digitsOnly.length);
      }
      return this.#assemble(x < 0, intPart, frac);
    }
    if (e < 0 && (-e - 1) + digitsOnly.length <= 12) {
      const frac = '0'.repeat(-e - 1) + digitsOnly;
      return this.#assemble(x < 0, '0', frac);
    }
    let mant = digitsOnly.slice(0, 1);
    if (digitsOnly.length > 1) mant += radix + digitsOnly.slice(1); else mant += radix;
    return (x < 0 ? '-' : '') + mant + 'E' + e;
  }

  // MARK: komplexe Zahlen

  /// RECT „3,0000 i4,0000“ bzw. „3,0000 -i4,0000“, POLAR „5,0000 ∠53,1301“ (Winkel im Winkelmodus)
  formatComplex(z, polar = false, angleMode = 'deg') {
    if (polar) {
      const r = z.abs;
      const phi = z.arg / toRad(angleMode);
      return this.format(r) + ' ∠' + this.format(phi);
    }
    const im = z.im;
    const imText = this.format(Math.abs(im));
    return this.format(z.re) + ((im < 0 || Object.is(im, -0)) ? ' -i' : ' i') + imText;
  }
}

// Swift-Namen als statische Mitglieder (HPFormat.baseString, HPFormat.wrap36, HPFormat.wordMask)
HPFormat.baseString = baseString;
HPFormat.wrap36 = wrap36;
HPFormat.wordMask = WORD_MASK;
