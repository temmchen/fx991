// symbolic.js – symbolische Mathematik für den Reiter „Analysis“:
// Formelausgabe (x², 3x, √x, |x|, Brüche als Koeffizienten), Polynom-Normalform,
// Einsetzen von Funktionen und Parametern sowie Stammfunktionen nach den üblichen Regeln
// (Linearität, Potenzregel, lineare Substitution, e-Funktion, sin/cos, 1/x, ln …).
// Portierung von Symbolic.swift. Knoten wie in expression.js: {k:'num', v}, {k:'v', n}, …
import { N, Algebra, Compiler, containsVar, nodeEquals } from './expression.js';
import { Rational } from './rational.js';
import { Fmt } from './fmt.js';

// MARK: Hilfen (Swift-Semantik)

/// Swift x.rounded(): halb von 0 weg
function rounded(x) { return Math.sign(x) * Math.round(Math.abs(x)); }
/// Swift.max(x, y) (bei NaN im zweiten Argument gewinnt das erste)
function smax(x, y) { return y >= x ? y : x; }
/// 10^k korrekt gerundet (wie Foundation.pow(10, k))
function pow10(k) { return Number('1e' + k); }
/// Swift Int(x) für ganzzahlige Werte (−0 → 0)
function toInt(x) { return Math.trunc(x) + 0; }

function isNum(n) { return n.k === 'num'; }
/// .mul(.num(c), r)?  → [c, r] | null
function numTimes(n) { return n.k === 'mul' && n.a.k === 'num' ? [n.a.v, n.b] : null; }

/// Wert aus Map oder schlichtem Objekt (undefined, wenn nicht vorhanden)
function lookup(table, key) {
  if (!table) return undefined;
  if (table instanceof Map) return table.get(key);
  return Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined;
}

/// Übersetzt einen Term; null statt Ausnahme (wie `try?` in Swift)
function tryCompile(n, variable) {
  try {
    return new Compiler({ variable }).compile(n);
  } catch (e) {
    return null;
  }
}

// MARK: Einsetzen

function substitute(n, name, r) {
  const go = (n) => {
    switch (n.k) {
      case 'num': return n;
      case 'v': return n.n === name ? r : n;
      case 'neg': return N.neg(go(n.a));
      case 'add': return N.add(go(n.a), go(n.b));
      case 'sub': return N.sub(go(n.a), go(n.b));
      case 'mul': return N.mul(go(n.a), go(n.b));
      case 'div': return N.div(go(n.a), go(n.b));
      case 'pow': return N.pow(go(n.a), go(n.b));
      case 'fn': return N.fn(n.f, n.args.map(go));
      case 'user': return N.user(n.n, n.o, go(n.a));
      case 'nd': return N.nd(go(n.a));
      default: return n;
    }
  };
  return go(n);
}

/// Benutzerfunktionen (f(x), f'(x) …) durch ihre Terme ersetzen, Parameter durch Zahlen.
/// defs: Map Name → {node, variable}; params: Objekt (oder Map) Name → Zahl
function inline(n, defs, params, depth = 0) {
  if (!(depth < 12)) return n;
  const go = (n) => {
    switch (n.k) {
      case 'num': return n;
      case 'v': {
        const p = lookup(params, n.n);
        return p !== undefined && p !== null ? N.num(p) : n;
      }
      case 'neg': return N.neg(go(n.a));
      case 'add': return N.add(go(n.a), go(n.b));
      case 'sub': return N.sub(go(n.a), go(n.b));
      case 'mul': return N.mul(go(n.a), go(n.b));
      case 'div': return N.div(go(n.a), go(n.b));
      case 'pow': return N.pow(go(n.a), go(n.b));
      case 'fn': return N.fn(n.f, n.args.map(go));
      case 'nd': return N.nd(go(n.a));
      case 'user': {
        const d = lookup(defs, n.n);
        if (d === undefined || d === null) return N.user(n.n, n.o, go(n.a));
        let body = inline(d.node, defs, params, depth + 1);
        for (let i = 0; i < n.o; i++) body = Algebra.derive(body, d.variable);
        return substitute(body, d.variable, go(n.a));
      }
      default: return n;
    }
  };
  return go(n);
}

// MARK: Polynome

/// Koeffizienten (Index = Potenz), falls der Term ein Polynom in v ist
function polynomial(n, v, maxDegree = 40) {
  if (!containsVar(n, v)) {
    const f = tryCompile(n, '#');
    if (f === null) return null;
    const c = f(0);
    return Number.isFinite(c) ? [c] : null;
  }
  const trim = (p) => {
    const q = p.slice();
    while (q.length > 1 && q[q.length - 1] === 0) q.pop();
    return q;
  };
  const add = (a, b, s) => {
    const r = new Array(Math.max(a.length, b.length)).fill(0);
    a.forEach((x, i) => { r[i] += x; });
    b.forEach((x, i) => { r[i] += s * x; });
    return trim(r);
  };
  const mul = (a, b) => {
    if (!(a.length + b.length - 2 <= maxDegree)) return null;
    const r = new Array(a.length + b.length - 1).fill(0);
    a.forEach((x, i) => { b.forEach((y, j) => { r[i + j] += x * y; }); });
    return trim(r);
  };
  // Wie in Swift: die rekursiven Aufrufe verwenden den Standard-Höchstgrad
  switch (n.k) {
    case 'num': return [n.v];
    case 'v': return n.n === v ? [0, 1] : null;
    case 'neg': {
      const p = polynomial(n.a, v);
      return p === null ? null : p.map((c) => -c);
    }
    case 'add': case 'sub': {
      const p = polynomial(n.a, v);
      if (p === null) return null;
      const q = polynomial(n.b, v);
      if (q === null) return null;
      return add(p, q, n.k === 'add' ? 1 : -1);
    }
    case 'mul': {
      const p = polynomial(n.a, v);
      if (p === null) return null;
      const q = polynomial(n.b, v);
      if (q === null) return null;
      return mul(p, q);
    }
    case 'div': {
      if (containsVar(n.b, v)) return null;
      const p = polynomial(n.a, v);
      if (p === null) return null;
      const q = polynomial(n.b, v);
      if (q === null || q.length !== 1 || q[0] === 0) return null;
      return p.map((c) => c / q[0]);
    }
    case 'pow': {
      if (n.b.k !== 'num') return null;
      const k = n.b.v;
      if (!(k >= 0 && k === rounded(k) && k <= maxDegree)) return null;
      const p = polynomial(n.a, v);
      if (p === null) return null;
      let r = [1];
      for (let i = 0; i < toInt(k); i++) {
        const m = mul(r, p);
        if (m === null) return null;
        r = m;
      }
      return r;
    }
    default:
      return null;
  }
}

function polyNode(c, v) {
  const terms = [];
  for (let k = c.length - 1; k >= 0; k--) {
    const a = c[k];
    if (a === 0) continue;
    const xk = k === 0 ? N.num(1) : (k === 1 ? N.v(v) : N.pow(N.v(v), N.num(k)));
    terms.push(k === 0 ? N.num(a) : (a === 1 ? xk : N.mul(N.num(a), xk)));
  }
  if (terms.length === 0) return N.num(0);
  let n = terms[0];
  for (const t of terms.slice(1)) n = N.add(n, t);
  return n;
}

/// Lineares Argument m·x + q?  → [m, q] | null
function linear(n, v) {
  const p = polynomial(n, v);
  if (p === null || p.length > 2) return null;
  return [p.length === 2 ? p[1] : 0, p[0]];
}

// MARK: Zahlen

/// Koeffizient: ganze Zahl, einfacher Bruch oder Dezimalzahl
function numText(x) {
  if (x === rounded(x) && Math.abs(x) < 1e12) return Fmt.num(x, 0);
  // kurze Dezimalzahl (1,5  0,25  0,125) wie im Unterricht, sonst Bruch (1/3, 5/6)
  for (let k = 1; k <= 3; k++) {
    const s = x * pow10(k);
    if (Math.abs(s - rounded(s)) < 1e-9 * smax(1, Math.abs(s))) return Fmt.num(x, k);
  }
  const r = Rational.approximate(x, 64, 1e-11);
  if (r !== null) return r.text;
  if (Math.abs(x - Math.PI) < 1e-12) return 'π';
  return Fmt.num(x, 6);
}

const SUP = {
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵',
  '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻',
};
function superscript(k) {
  let s = '';
  for (const ch of String(k)) s += SUP[ch] ?? ch;
  return s;
}

/// Polynom als Text: „1/3·x³ − 3/2·x² + 2x − 5“
function polyText(c, v) {
  let s = '';
  for (let k = c.length - 1; k >= 0; k--) {
    const a = c[k];
    if (a === 0) continue;
    const mag = Math.abs(a);
    const coeff = numText(mag);
    let term;
    if (k === 0) {
      term = coeff;
    } else {
      const xk = v + (k > 1 ? superscript(k) : '');
      if (mag === 1) term = xk;
      else if (coeff.includes('/') || coeff.includes('π')) term = coeff + '·' + xk;
      else term = coeff + xk;
    }
    if (s.length === 0) s = (a < 0 ? '−' : '') + term;
    else s += (a < 0 ? ' − ' : ' + ') + term;
  }
  return s.length === 0 ? '0' : s;
}

// MARK: Vereinfachen für die Anzeige

function tidy(n0, v) {
  let n = Algebra.simplify(n0);
  for (let i = 0; i < 4; i++) {
    const m = Algebra.simplify(pass(n));
    if (nodeEquals(m, n)) break;
    n = m;
  }
  return n;
}

function pass(n) {
  switch (n.k) {
    case 'num': case 'v': return n;
    case 'neg': {
      const x = pass(n.a);
      const cx = numTimes(x);
      if (cx) return N.mul(N.num(-cx[0]), cx[1]);
      if (x.k === 'div') return N.div(N.neg(x.a), x.b);
      return N.neg(x);
    }
    case 'add': {
      const x = pass(n.a), y = pass(n.b);
      const cy = numTimes(y);
      if (cy && cy[0] < 0) return N.sub(x, N.mul(N.num(-cy[0]), cy[1]));
      if (y.k === 'num' && y.v < 0) return N.sub(x, N.num(-y.v));
      if (nodeEquals(x, y)) return N.mul(N.num(2), x);
      return N.add(x, y);
    }
    case 'sub': {
      const x = pass(n.a), y = pass(n.b);
      const cy = numTimes(y);
      if (cy && cy[0] < 0) return N.add(x, N.mul(N.num(-cy[0]), cy[1]));
      if (nodeEquals(x, y)) return N.num(0);
      return N.sub(x, y);
    }
    case 'mul': {
      const x = pass(n.a), y = pass(n.b);
      const cx = numTimes(x), cy = numTimes(y);
      // Zahlen zusammenfassen und nach vorn
      if (x.k === 'num' && y.k === 'div' && y.b.k === 'num' && y.b.v !== 0) return N.mul(N.num(x.v / y.b.v), y.a);
      if (x.k === 'num' && cy) return N.mul(N.num(x.v * cy[0]), cy[1]);
      if (cx && y.k === 'num') return N.mul(N.num(cx[0] * y.v), cx[1]);
      if (cx && !isNum(y)) return N.mul(N.num(cx[0]), N.mul(cx[1], y));
      if (cy && !isNum(x)) return N.mul(N.num(cy[0]), N.mul(x, cy[1]));
      if (x.k === 'neg') return N.mul(N.num(-1), N.mul(x.a, y));
      if (y.k === 'neg') return N.mul(N.num(-1), N.mul(x, y.a));
      // gleiche Basen: x·x = x², x²·x = x³
      const [bx, ex] = baseExp(x), [by, ey] = baseExp(y);
      if (nodeEquals(bx, by) && ex.k === 'num' && ey.k === 'num') return N.pow(bx, N.num(ex.v + ey.v));
      return N.mul(x, y);
    }
    case 'div': {
      const x = pass(n.a), y = pass(n.b);
      if (y.k === 'num' && y.v !== 0) {
        const d = y.v;
        const cx = numTimes(x);
        if (cx) return N.mul(N.num(cx[0] / d), cx[1]);
        if (x.k === 'num') return N.num(x.v / d);
        if (x.k === 'neg') return N.mul(N.num(-1 / d), x.a);
        return N.mul(N.num(1 / d), x);
      }
      if (x.k === 'div') return N.div(x.a, N.mul(x.b, y));
      const cy = numTimes(y);
      if (cy && cy[0] !== 0) return N.div(N.mul(N.num(1 / cy[0]), x), cy[1]);
      return N.div(x, y);
    }
    case 'pow': {
      const x = pass(n.a), y = pass(n.b);
      if (x.k === 'pow' && x.b.k === 'num' && y.k === 'num') return N.pow(x.a, N.num(x.b.v * y.v));
      return N.pow(x, y);
    }
    case 'fn': return N.fn(n.f, n.args.map(pass));
    case 'user': return N.user(n.n, n.o, pass(n.a));
    case 'nd': return N.nd(pass(n.a));
    default: return n;
  }
}

function baseExp(n) {
  if (n.k === 'pow') return [n.a, n.b];
  return [n, N.num(1)];
}

// MARK: Ausgabe

/// Formel als lesbarer Text; Polynome in Normalform
function pretty(n0, v = 'x') {
  const n = tidy(n0, v);
  const p = polynomial(n, v);
  if (p !== null && p.length <= 16) return polyText(p, v);
  return render(n, v, 0);
}

/// Präzedenz: 0 Summe, 1 Produkt, 2 Vorzeichen, 3 Potenz, 4 Atom
function render(n, v, need) {
  const wrap = (s, prec) => (prec < need ? '(' + s + ')' : s);
  switch (n.k) {
    case 'num': {
      const c = n.v;
      const s = c < 0 ? '−' + numText(-c) : numText(c);
      return (c < 0 || s.includes('/')) && need > 0 ? '(' + s + ')' : s;
    }
    case 'v':
      return n.n;
    case 'neg':
      return wrap('−' + render(n.a, v, 2), 2);
    case 'add':
      return wrap(render(n.a, v, 0) + ' + ' + render(n.b, v, 0), 0);
    case 'sub':
      return wrap(render(n.a, v, 0) + ' − ' + render(n.b, v, 1), 0);
    case 'mul': {
      if (n.a.k === 'num') {
        const c = n.a.v, b = n.b;
        if (c === -1) return wrap('−' + render(b, v, 2), 2);
        if (c === 1) return render(b, v, need);
        const neg = c < 0;
        const coeff = numText(Math.abs(c));
        const rest = render(b, v, 1);
        const glue = implicitOK(b) && !coeff.includes('/') && !coeff.includes('π') ? '' : '·';
        const body = coeff + glue + (glue.length === 0 ? render(b, v, 3) : rest);
        return wrap((neg ? '−' : '') + body, neg ? 2 : 1);
      }
      return wrap(render(n.a, v, 1) + '·' + render(n.b, v, 1), 1);
    }
    case 'div':
      return wrap(render(n.a, v, 2) + '/' + render(n.b, v, 3), 1);
    case 'pow': {
      const a = n.a, b = n.b;
      if (a.k === 'num' && a.v === Math.E) return wrap('e^' + expo(b, v), 3);
      if (b.k === 'num') {
        const k = b.v;
        if (k === 0.5) return wrap('√' + root(a, v), 3);
        if (k === rounded(k) && Math.abs(k) < 100) return wrap(render(a, v, 4) + superscript(toInt(k)), 3);
      }
      return wrap(render(a, v, 4) + '^' + expo(b, v), 3);
    }
    case 'fn': {
      const args = n.args;
      switch (n.f) {
        case 'abs': return '|' + render(args[0], v, 0) + '|';
        case 'sqrt': return '√' + root(args[0], v);
        case 'exp': return wrap('e^' + expo(args[0], v), 3);
        case 'log': return 'lg(' + render(args[0], v, 0) + ')';
        case 'root': return 'root(' + render(args[0], v, 0) + '; ' + render(args[1], v, 0) + ')';
        case 'min': case 'max': case 'mod':
          return n.f + '(' + args.map((a) => render(a, v, 0)).join('; ') + ')';
        case 'fact': return render(args[0], v, 4) + '!';
        default: return n.f + '(' + render(args[0], v, 0) + ')';
      }
    }
    case 'user':
      return n.n + '′'.repeat(n.o) + '(' + render(n.a, v, 0) + ')';
    case 'nd':
      return 'd/dx[' + render(n.a, v, 0) + ']';
    default:
      return '';
  }
}

function implicitOK(n) {
  switch (n.k) {
    case 'v': return true;
    case 'pow': return n.a.k === 'v' && n.b.k === 'num';
    case 'mul': return implicitOK(n.a) && implicitOK(n.b);
    default: return false;
  }
}

function expo(n, v) {
  if (n.k === 'num' || n.k === 'v') return render(n, v, 4);
  return '(' + render(n, v, 0) + ')';
}

function root(n, v) {
  if (n.k === 'num' || n.k === 'v') return render(n, v, 4);
  return '(' + render(n, v, 0) + ')';
}

/// Wieder einlesbare Form für den Graphen („1.5*x^2 - 3“)
function inputText(n0, v = 'x') {
  const n = tidy(n0, v);
  const num = (c) => Fmt.plain(c);
  const go = (n, need) => {
    const wrap = (s, p) => (p < need ? '(' + s + ')' : s);
    switch (n.k) {
      case 'num': return n.v < 0 ? wrap('-' + num(-n.v), 2) : num(n.v);
      case 'v': return n.n;
      case 'neg': return wrap('-' + go(n.a, 2), 2);
      case 'add': return wrap(go(n.a, 0) + ' + ' + go(n.b, 0), 0);
      case 'sub': return wrap(go(n.a, 0) + ' - ' + go(n.b, 1), 0);
      case 'mul': return wrap(go(n.a, 1) + '*' + go(n.b, 1), 1);
      case 'div': return wrap(go(n.a, 2) + '/' + go(n.b, 3), 1);
      case 'pow': return wrap(go(n.a, 4) + '^' + go(n.b, 4), 3);
      case 'fn':
        if (n.f === 'degsym') return '(' + go(n.args[0], 0) + ')°';
        if (n.f === 'fact') return go(n.args[0], 4) + '!';
        return n.f + '(' + n.args.map((a) => go(a, 0)).join('; ') + ')';
      case 'user': return n.n + "'".repeat(n.o) + '(' + go(n.a, 0) + ')';
      case 'nd': return go(n.a, need);
      default: return '';
    }
  };
  const p = polynomial(n, v);
  if (p !== null && p.length <= 16) {
    let s = '';
    for (let k = p.length - 1; k >= 0; k--) {
      const a = p[k];
      if (a === 0) continue;
      const mag = num(Math.abs(a));
      let t = k === 0 ? mag : (Math.abs(a) === 1 ? '' : mag + '*') + v + (k > 1 ? `^${k}` : '');
      if (s.length === 0) t = (a < 0 ? '-' : '') + t; else t = (a < 0 ? ' - ' : ' + ') + t;
      s += t;
    }
    return s.length === 0 ? '0' : s;
  }
  return go(n, 0);
}

// MARK: Stammfunktion

/// Stammfunktion F mit F' = f (ohne Konstante) oder null, wenn keine Regel passt.
/// Das Ergebnis wird numerisch geprüft.
function antiderivative(f, v) {
  const F = integrate(Algebra.simplify(f), v);
  if (F === null) return null;
  const G = tidy(F, v);
  // Probe: G' = f an mehreren Stellen
  const ff = tryCompile(f, v);
  if (ff === null) return null;
  const dg = tryCompile(Algebra.derive(G, v), v);
  if (dg === null) return null;
  let checked = 0;
  for (const x of [-2.7, -1.3, -0.4, 0.35, 0.8, 1.7, 2.9, 4.2, 6.1]) {
    const a = ff(x), b = dg(x);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    if (Math.abs(a - b) > 1e-6 * (1 + Math.abs(a))) return null;
    checked += 1;
  }
  return checked >= 2 ? G : null;
}

/// lineares m·x + q mit m ≠ 0 → m, sonst null
function slope(n, v) {
  const l = linear(n, v);
  return l !== null && l[0] !== 0 ? l[0] : null;
}

function integrate(n, v) {
  if (!containsVar(n, v)) return N.mul(n, N.v(v));
  const p = polynomial(n, v);
  if (p !== null && p.length <= 41) {
    return polyNode([0].concat(p.map((c, i) => c / (i + 1))), v);
  }
  switch (n.k) {
    case 'add': case 'sub': {
      const A = integrate(n.a, v);
      if (A === null) return null;
      const B = integrate(n.b, v);
      if (B === null) return null;
      return n.k === 'add' ? N.add(A, B) : N.sub(A, B);
    }
    case 'neg': {
      const A = integrate(n.a, v);
      return A === null ? null : N.neg(A);
    }
    case 'mul': {
      const a = n.a, b = n.b;
      if (!containsVar(a, v)) {
        const B = integrate(b, v);
        return B === null ? null : N.mul(a, B);
      }
      if (!containsVar(b, v)) {
        const A = integrate(a, v);
        return A === null ? null : N.mul(b, A);
      }
      return null;
    }
    case 'div': {
      const a = n.a, b = n.b;
      if (!containsVar(b, v)) {
        const A = integrate(a, v);
        return A === null ? null : N.div(A, b);
      }
      if (!containsVar(a, v)) {
        const m = slope(b, v);
        if (m !== null) {
          return N.mul(N.div(a, N.num(m)), N.fn('ln', [N.fn('abs', [b])]));
        }
        if (b.k === 'pow' && b.b.k === 'num') {
          const base = b.a, k = b.b.v;
          const mb = slope(base, v);
          if (mb !== null) {
            if (k === 1) return N.mul(N.div(a, N.num(mb)), N.fn('ln', [N.fn('abs', [base])]));
            return N.mul(N.div(a, N.num(mb * (1 - k))), N.pow(base, N.num(1 - k)));
          }
        }
        if (b.k === 'fn' && b.f === 'sqrt') {
          const ms = slope(b.args[0], v);
          if (ms !== null) {
            return N.mul(N.div(a, N.num(ms / 2)), N.fn('sqrt', [b.args[0]]));
          }
        }
      }
      return null;
    }
    case 'pow': {
      const base = n.a, ex = n.b;
      if (ex.k === 'num') {
        const k = ex.v;
        const m = slope(base, v);
        if (m !== null) {
          if (k === -1) return N.div(N.fn('ln', [N.fn('abs', [base])]), N.num(m));
          return N.div(N.pow(base, N.num(k + 1)), N.num(m * (k + 1)));
        }
      }
      if (!containsVar(base, v)) {
        const m = slope(ex, v);
        if (m !== null && base.k === 'num') {
          const a = base.v;
          if (a === Math.E) return N.div(n, N.num(m));
          if (a > 0 && a !== 1) return N.div(n, N.num(m * Math.log(a)));
        }
      }
      return null;
    }
    case 'fn': {
      const args = n.args;
      if (args.length !== 1) return null;
      const m = slope(args[0], v);
      if (m === null) return null;
      const u = args[0];
      switch (n.f) {
        case 'sin': return N.div(N.neg(N.fn('cos', [u])), N.num(m));
        case 'cos': return N.div(N.fn('sin', [u]), N.num(m));
        case 'tan': return N.div(N.neg(N.fn('ln', [N.fn('abs', [N.fn('cos', [u])])])), N.num(m));
        case 'exp': return N.div(N.fn('exp', [u]), N.num(m));
        case 'sinh': return N.div(N.fn('cosh', [u]), N.num(m));
        case 'cosh': return N.div(N.fn('sinh', [u]), N.num(m));
        case 'sqrt': return N.div(N.mul(N.num(2.0 / 3), N.pow(u, N.num(1.5))), N.num(m));
        case 'cbrt': return N.div(N.mul(N.num(0.75), N.pow(N.fn('cbrt', [u]), N.num(4))), N.num(m));
        case 'ln': return N.div(N.sub(N.mul(u, N.fn('ln', [u])), u), N.num(m));
        default: return null;
      }
    }
    default:
      return null;
  }
}

export const Symbolic = {
  substitute,
  inline,
  polynomial,
  polyNode,
  linear,
  numText,
  superscript,
  polyText,
  tidy,
  pass,
  pretty,
  inputText,
  antiderivative,
};
