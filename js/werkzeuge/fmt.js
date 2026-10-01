// fmt.js – Zahlformatierung für Tabellen, Beschriftungen und Lösungswege im deutschen Stil
// (Dezimalkomma, echtes Minuszeichen). Portierung von `enum Fmt` aus Rational.swift.
//
// Dazu `CFormat`: exakte Nachbildung von String(format: "%.Nf" / "%.Ne" / "%.Ng") der Swift-Fassung
// (C-printf von macOS). JavaScripts toFixed/toExponential runden Gleichstände „halb nach oben“
// (0.125 → „0.13“), printf dagegen exakt „halb zur geraden Ziffer“ (0.125 → „0.12“); außerdem
// liefert toFixed ab 1e21 die Exponentialschreibweise. Damit Anzeigen Ziffer für Ziffer gleich
// sind, wird der exakte Dezimalwert der Gleitkommazahl mit BigInt bestimmt und daraus gerundet.

// MARK: - exakter Dezimalwert einer Gleitkommazahl

const view = new DataView(new ArrayBuffer(8));

/// Exakte Dezimalziffern von x > 0 (endlich): Wert = d₀,d₁d₂… · 10^e, Ziffern ohne End-Nullen
function exactDigits(x) {
  view.setFloat64(0, x);
  const hi = view.getUint32(0);
  const lo = view.getUint32(4);
  const bexp = (hi >>> 20) & 0x7ff;
  let mant = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
  let e2;
  if (bexp === 0) {
    e2 = -1074;              // subnormal
  } else {
    mant |= 1n << 52n;
    e2 = bexp - 1075;
  }
  let n;
  let scale = 0;
  if (e2 >= 0) {
    n = mant << BigInt(e2);
  } else {
    // m · 2^−k = m · 5^k / 10^k
    n = mant * 5n ** BigInt(-e2);
    scale = -e2;
  }
  let s = n.toString();
  const e = s.length - 1 - scale;
  let end = s.length;
  while (end > 1 && s.charCodeAt(end - 1) === 48) end--;
  s = s.slice(0, end);
  return { d: s, e };
}

/// Behält die ersten k Ziffern von d (k darf ≤ 0 sein) und rundet exakt „halb zur geraden Ziffer“.
/// Ergebnis: ganze Zahl (BigInt) aus den behaltenen Ziffern, ggf. um 1 erhöht.
function roundKept(d, k) {
  let kept = 0n;
  if (k > 0) {
    let t = d.length >= k ? d.slice(0, k) : d + '0'.repeat(k - d.length);
    kept = BigInt(t);
  }
  // nächste Ziffer nach der Schnittstelle
  let next = 0;
  let restNonZero = false;
  if (k >= 0 && k < d.length) {
    next = d.charCodeAt(k) - 48;
    restNonZero = d.length > k + 1;    // d hat keine End-Nullen
  } else if (k < 0) {
    // Schnittstelle liegt vor der ersten Ziffer: Wert < halbe Einheit
    return kept;
  }
  let up = false;
  if (next > 5) up = true;
  else if (next === 5) {
    if (restNonZero) up = true;
    else {
      const last = k > 0 ? (d.length >= k ? d.charCodeAt(k - 1) - 48 : 0) : 0;
      up = (last % 2) === 1;
    }
  }
  return up ? kept + 1n : kept;
}

function special(x) {
  if (Number.isNaN(x)) return 'nan';
  return x > 0 ? 'inf' : '-inf';
}

function isNegative(x) {
  return x < 0 || Object.is(x, -0);
}

/// wie String(format: "%.<p>f", x)
function cfmtF(x, p = 6) {
  if (!Number.isFinite(x)) return special(x);
  const sign = isNegative(x) ? '-' : '';
  const ax = Math.abs(x);
  if (ax === 0) return sign + '0' + (p > 0 ? '.' + '0'.repeat(p) : '');
  const { d, e } = exactDigits(ax);
  // Ziffern bis zur Stelle 10^−p behalten
  const n = roundKept(d, e + p + 1);
  let s = n.toString();
  if (s.length < p + 1) s = '0'.repeat(p + 1 - s.length) + s;
  const intPart = s.slice(0, s.length - p);
  return sign + intPart + (p > 0 ? '.' + s.slice(s.length - p) : '');
}

/// Mantissenziffern (p+1 signifikante) und Zehnerexponent nach exakter Rundung
function sciParts(ax, p) {
  const { d, e } = exactDigits(ax);
  let s = roundKept(d, p + 1).toString();
  let ex = e;
  if (s.length > p + 1) {        // Übertrag 9,99… → 10,0…
    ex += 1;
    s = s.slice(0, p + 1);
  }
  return { s, ex };
}

function expText(ex) {
  const a = Math.abs(ex);
  return (ex < 0 ? '-' : '+') + (a < 10 ? '0' + a : String(a));
}

/// wie String(format: "%.<p>e", x)
function cfmtE(x, p = 6) {
  if (!Number.isFinite(x)) return special(x);
  const sign = isNegative(x) ? '-' : '';
  const ax = Math.abs(x);
  if (ax === 0) return sign + '0' + (p > 0 ? '.' + '0'.repeat(p) : '') + 'e+00';
  const { s, ex } = sciParts(ax, p);
  return sign + s[0] + (p > 0 ? '.' + s.slice(1) : '') + 'e' + expText(ex);
}

function stripZeros(s) {
  if (!s.includes('.')) return s;
  let end = s.length;
  while (s.charCodeAt(end - 1) === 48) end--;
  if (s[end - 1] === '.') end--;
  return s.slice(0, end);
}

/// wie String(format: "%.<p>g", x): kürzeste Form mit p signifikanten Stellen, Nullen am Ende entfernt
function cfmtG(x, p = 6) {
  if (!Number.isFinite(x)) return special(x);
  const P = p === 0 ? 1 : p;
  const sign = isNegative(x) ? '-' : '';
  const ax = Math.abs(x);
  if (ax === 0) return sign + '0';
  const { s, ex } = sciParts(ax, P - 1);
  if (P > ex && ex >= -4) {
    return sign + stripZeros(cfmtF(ax, P - 1 - ex));
  }
  const mant = stripZeros(s[0] + (P > 1 ? '.' + s.slice(1) : ''));
  return sign + mant + 'e' + expText(ex);
}

export const CFormat = { f: cfmtF, e: cfmtE, g: cfmtG };

// MARK: - Fmt

const superDigits = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻',
};

export const Fmt = {
  /// Dezimalkomma (Einstellung „Dezimaltrennzeichen“)
  comma: true,

  /// Hochgestellte Ganzzahl: 2 → „²“, −3 → „⁻³“
  superscript(n) {
    let out = '';
    for (const ch of String(n)) out += superDigits[ch] ?? ch;
    return out;
  },

  /// Zahl mit höchstens `decimals` Nachkommastellen, Nullen am Ende entfernt
  num(x, decimals = 4, trim = true) {
    if (Number.isNaN(x)) return '—';
    if (!Number.isFinite(x)) return x > 0 ? '∞' : '−∞';
    const ax = Math.abs(x);
    if (ax !== 0 && (ax >= 1e10 || ax < pow10(-decimals) * 0.5)) {
      return Fmt.sci(x, Math.max(decimals, 3));
    }
    let s = cfmtF(x, decimals);
    if (trim && s.includes('.')) {
      let end = s.length;
      while (s.charCodeAt(end - 1) === 48) end--;
      if (s[end - 1] === '.') end--;
      s = s.slice(0, end);
    }
    if (s === '-0') s = '0';
    return Fmt.localize(s);
  },

  /// Signifikante Stellen (Konstanten): 8,8541878128·10⁻¹²  ·  96485,33212  ·  299792458
  sig(x, digits = 10) {
    if (Number.isNaN(x)) return '—';
    if (x === 0) return '0';
    const ax = Math.abs(x);
    if (ax >= 1e-4 && ax < 1e10) {
      const decimals = Math.max(0, digits - 1 - Math.floor(Math.log10(ax)));
      return Fmt.num(x, Math.min(decimals, 12));
    }
    return Fmt.sci(x, digits - 1);
  },

  /// wissenschaftlich: 1,234·10⁻⁵
  sci(x, digits = 4) {
    const s = cfmtE(x, digits);   // 1.2340e-05
    const e = s.indexOf('e');
    if (e < 0) return Fmt.localize(s);
    let mant = s.slice(0, e);
    const ex = parseInt(s.slice(e + 1), 10) || 0;
    if (mant.includes('.')) {
      let end = mant.length;
      while (mant.charCodeAt(end - 1) === 48) end--;
      if (mant[end - 1] === '.') end--;
      mant = mant.slice(0, end);
    }
    return Fmt.localize(mant) + '·10' + Fmt.superscript(ex);
  },

  /// „.“ → „,“ (bei Dezimalkomma) und „-“ → „−“
  localize(s) {
    let t = s;
    if (Fmt.comma) t = t.split('.').join(',');
    return t.split('-').join('−');
  },

  /// Punkt in deutscher Schreibweise: (1,5 | −2)
  point(x, y, d = 4) {
    return `(${Fmt.num(x, d)} | ${Fmt.num(y, d)})`;
  },

  /// Zahl so, dass sie wieder eingelesen werden kann (Punkt als Dezimaltrenner)
  plain(x, sig = 12) {
    if (Number.isInteger(x) && Math.abs(x) < 1e15) return String(x);   // String(−0) = „0“ wie Int64
    let s = cfmtG(x, sig);
    if (s.includes('e')) return s;
    if (s.includes('.')) {
      let end = s.length;
      while (s.charCodeAt(end - 1) === 48) end--;
      if (s[end - 1] === '.') end--;
      s = s.slice(0, end);
    }
    return s;
  },
};

/// 10^k für ganzzahlige k, korrekt gerundet (wie pow(10, k) der C-Bibliothek)
function pow10(k) {
  return Number('1e' + k);
}
