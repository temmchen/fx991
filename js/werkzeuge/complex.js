// complex.js – komplexe Zahlen für den RPN-Rechner (wie beim HP-42S: RECT/POLAR, CPXRES)
// Portierung von Complex.swift. Werte sind unveränderlich gedacht: jede Rechnung liefert ein neues Objekt.

export class Complex {
  constructor(re, im = 0) {
    this.re = re;
    this.im = im;
  }

  /// Aus Polarkoordinaten (Winkel im Bogenmaß)
  static polar(r, phi) {
    return new Complex(r * Math.cos(phi), r * Math.sin(phi));
  }

  /// Zahl oder Complex → Complex (reelle Zahl mit Imaginärteil 0)
  static of(v) {
    return v instanceof Complex ? v : new Complex(v, 0);
  }

  get abs() { return Math.hypot(this.re, this.im); }
  get arg() { return Math.atan2(this.im, this.re); }
  conj() { return new Complex(this.re, -this.im); }
  isFinite() { return Number.isFinite(this.re) && Number.isFinite(this.im); }
  isZero() { return this.re === 0 && this.im === 0; }
  /// Gleichheit wie Swift-Equatable: beide Teile gleich (NaN ist ungleich, −0 gleich 0)
  equals(b) {
    const w = asComplex(b);
    return w !== null && this.re === w.re && this.im === w.im;
  }

  neg() { return new Complex(-this.re, -this.im); }
  add(b) {
    const w = Complex.of(b);
    return new Complex(this.re + w.re, this.im + w.im);
  }
  sub(b) {
    const w = Complex.of(b);
    return new Complex(this.re - w.re, this.im - w.im);
  }
  /// Produkt mit Complex oder reeller Zahl (Double · Complex wie in Swift)
  mul(b) {
    if (typeof b === 'number') return new Complex(this.re * b, this.im * b);
    return new Complex(this.re * b.re - this.im * b.im, this.re * b.im + this.im * b.re);
  }

  /// Division nach Smith (numerisch stabil); durch eine reelle Zahl komponentenweise
  div(b) {
    if (typeof b === 'number') return new Complex(this.re / b, this.im / b);
    const a = this;
    if (Math.abs(b.re) >= Math.abs(b.im)) {
      if (b.re === 0 && b.im === 0) return new Complex(NaN, NaN);
      const r = b.im / b.re;
      const d = b.re + b.im * r;
      return new Complex((a.re + a.im * r) / d, (a.im - a.re * r) / d);
    } else {
      const r = b.re / b.im;
      const d = b.re * r + b.im;
      return new Complex((a.re * r + a.im) / d, (a.im * r - a.re) / d);
    }
  }

  sqrt() {
    if (this.re === 0 && this.im === 0) return Complex.ZERO;
    const r = this.abs;
    const t = Math.sqrt((r + Math.abs(this.re)) / 2);
    if (this.re >= 0) {
      return new Complex(t, this.im / (2 * t));
    } else {
      return new Complex(Math.abs(this.im) / (2 * t), this.im >= 0 ? t : -t);
    }
  }

  exp() {
    const e = Math.exp(this.re);
    if (this.im === 0) return new Complex(e, 0);
    return new Complex(e * Math.cos(this.im), e * Math.sin(this.im));
  }

  log() { return new Complex(Math.log(this.abs), this.arg); }

  /// Potenz z^w; ganzzahlige reelle Exponenten (|n| ≤ 1024) exakt durch Quadrieren
  pow(w0) {
    const w = Complex.of(w0);
    if (w.im === 0 && w.re === swiftRounded(w.re) && Math.abs(w.re) <= 1024) {
      let n = Math.trunc(w.re);
      let base = this;
      if (n < 0) {
        base = Complex.ONE.div(base);
        n = -n;
      }
      let result = Complex.ONE;
      while (n > 0) {
        if ((n & 1) === 1) result = result.mul(base);
        base = base.mul(base);
        n >>= 1;
      }
      return result;
    }
    if (this.isZero()) {
      return w.re > 0 ? Complex.ZERO : new Complex(NaN, NaN);
    }
    return w.mul(this.log()).exp();
  }

  sin() { return new Complex(Math.sin(this.re) * Math.cosh(this.im), Math.cos(this.re) * Math.sinh(this.im)); }
  cos() { return new Complex(Math.cos(this.re) * Math.cosh(this.im), -Math.sin(this.re) * Math.sinh(this.im)); }
  tan() { return this.sin().div(this.cos()); }
  sinh() { return new Complex(Math.sinh(this.re) * Math.cos(this.im), Math.cosh(this.re) * Math.sin(this.im)); }
  cosh() { return new Complex(Math.cosh(this.re) * Math.cos(this.im), Math.sinh(this.re) * Math.sin(this.im)); }
  tanh() { return this.sinh().div(this.cosh()); }

  // asin z = -i · ln(iz + √(1 − z²))
  asin() {
    const iz = Complex.I.mul(this);
    const s = Complex.ONE.sub(this.mul(this)).sqrt();
    return Complex.I.neg().mul(iz.add(s).log());
  }
  // acos z = π/2 − asin z
  acos() { return new Complex(Math.PI / 2, 0).sub(this.asin()); }
  // atan z = (i/2) · [ln(1 − iz) − ln(1 + iz)]
  atan() {
    const iz = Complex.I.mul(this);
    const a = Complex.ONE.sub(iz).log();
    const b = Complex.ONE.add(iz).log();
    return new Complex(0, 0.5).mul(a.sub(b));
  }
  asinh() { return this.add(this.mul(this).add(Complex.ONE).sqrt()).log(); }
  acosh() { return this.add(this.add(Complex.ONE).sqrt().mul(this.sub(Complex.ONE).sqrt())).log(); }
  atanh() { return new Complex(0.5, 0).mul(Complex.ONE.add(this).log().sub(Complex.ONE.sub(this).log())); }

  toString() { return `(${this.re}, ${this.im})`; }
}

/// Swift `rounded()`: halb von der Null weg
function swiftRounded(x) {
  return Math.sign(x) * Math.round(Math.abs(x));
}

function asComplex(b) {
  if (b instanceof Complex) return b;
  if (typeof b === 'number') return new Complex(b, 0);
  return null;
}

Complex.ZERO = Object.freeze(new Complex(0, 0));
Complex.ONE = Object.freeze(new Complex(1, 0));
Complex.I = Object.freeze(new Complex(0, 1));
