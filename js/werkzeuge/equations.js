// equations.js – Gleichungslöser: lineare Gleichungssysteme (Gauß mit Lösungsweg in Brüchen),
// quadratische, kubische und Polynomgleichungen (exakte Formen, Linearfaktoren, komplexe Lösungen).
// Portierung von Equations.swift. Swift rechnete mit Int64 und Überlaufprüfung (mulO/addO); hier
// rechnen Rational und die ganzzahligen Zeilenumformungen mit BigInt. Das Größenlimit aus rational.js
// (mehr als 40 Dezimalstellen) zählt wie ein Überlauf: dann null und Rückfall auf Dezimalzahlen wie in Swift.
import { Rational, gcd, lcm } from './rational.js';
import { Fmt } from './fmt.js';
import { Numerics, subscripted } from './numerics.js';
import { Complex } from './complex.js';
import { evaluateConstant } from './expression.js';

// MARK: - Ganzzahl-Hilfen (BigInt mit Größenlimit statt Int64-Überlaufprüfung)

/// Beträge ab 10^40 gelten wie in rational.js als Überlauf
const LIMIT = 10n ** 40n;
/// Größte Int64-Zahl (für die Stellen, an denen Swift ausdrücklich mit Int rechnete)
const INT64_MAX = (1n << 63n) - 1n;

function babs(v) { return v < 0n ? -v : v; }

/// Produkt oder null bei „Überlauf“ (wie mulO)
function mulO(a, b) {
  const r = a * b;
  return babs(r) >= LIMIT ? null : r;
}
/// Summe oder null bei „Überlauf“ (wie addO)
function addO(a, b) {
  const r = a + b;
  return babs(r) >= LIMIT ? null : r;
}

/// Swift „Rational < Rational“ vergleicht über Double
function less(a, b) { return a.toNumber() < b.toNumber(); }
/// Sortierfunktion aus einem „kleiner als“-Prädikat
function byLess(lt) { return (a, b) => (lt(a, b) ? -1 : (lt(b, a) ? 1 : 0)); }
/// Swift.max(x, y)
function smax(x, y) { return y >= x ? y : x; }

/// Leerraum wie Swifts `.whitespaces` am Anfang und Ende entfernen (Leerzeichen, Tab, Zs)
function trimWhitespace(s) {
  return s.replace(/^[\t\p{Zs}]+|[\t\p{Zs}]+$/gu, '');
}

// MARK: - Eingabewert: exakt (Bruch) oder Näherung

/// Ein Eintrag ist {exact: Rational} oder {approx: Zahl}
export const LGSEntry = {
  exact(r) { return { exact: r }; },
  approx(d) { return { approx: d }; },

  /// Zahlenwert (Swift „double“)
  toNumber(e) {
    return LGSEntry.rational(e) !== null ? e.exact.toNumber() : e.approx;
  },
  /// Bruch oder null (Swift „rational“)
  rational(e) {
    return e && e.exact instanceof Rational ? e.exact : null;
  },
  /// Gleichheit wie Swift-Equatable
  equals(a, b) {
    const ra = LGSEntry.rational(a), rb = LGSEntry.rational(b);
    if (ra !== null || rb !== null) return ra !== null && rb !== null && ra.equals(rb);
    return a.approx === b.approx;
  },

  /// Leeres Feld = 0; „1/3“, „2,5“ exakt; sonst Term („sqrt(2)“, „2π“) als Näherung
  parse(s) {
    const t = trimWhitespace(String(s ?? ''));
    if (t.length === 0) return { exact: Rational.ZERO };
    const r = Rational.parse(t);
    if (r !== null) return { exact: r };
    try {
      const v = evaluateConstant(t);
      if (Number.isFinite(v)) return { approx: v };
    } catch (e) {
      // kein gültiger Term
    }
    return null;
  },
};

// MARK: - Affiner Ausdruck c + Σ kᵢ·tᵢ (Parameterdarstellung)

export class Affine {
  constructor(c, k) {
    this.c = c;   // Rational
    this.k = k;   // [Rational]
  }

  static constant(r, params) { return new Affine(r, new Array(params).fill(Rational.ZERO)); }
  static param(i, params) {
    const k = new Array(params).fill(Rational.ZERO);
    k[i] = Rational.ONE;
    return new Affine(Rational.ZERO, k);
  }
  /// self + o·f  oder null bei Überlauf
  adding(o, f) {
    const t = o.c.mul(f);
    if (t === null) return null;
    const nc = this.c.add(t);
    if (nc === null) return null;
    const nk = this.k.slice();
    for (let i = 0; i < this.k.length; i++) {
      const tt = o.k[i].mul(f);
      if (tt === null) return null;
      const s = nk[i].add(tt);
      if (s === null) return null;
      nk[i] = s;
    }
    return new Affine(nc, nk);
  }
  /// self / d  oder null
  divided(d) {
    const nc = this.c.div(d);
    if (nc === null) return null;
    const nk = [];
    for (const v of this.k) {
      const q = v.div(d);
      if (q === null) return null;
      nk.push(q);
    }
    return new Affine(nc, nk);
  }
  text(names) {
    let s = '';
    if (!this.c.isZero() || this.k.every((v) => v.isZero())) s = this.c.text;
    this.k.forEach((v, i) => {
      if (v.isZero()) return;
      const a = v.abs();
      const coeff = a.equals(Rational.ONE) ? '' : a.text + '·';
      if (s.length === 0) {
        s = (v.num < 0n ? '−' : '') + coeff + names[i];
      } else {
        s += (v.num < 0n ? ' − ' : ' + ') + coeff + names[i];
      }
    });
    return s;
  }
}

// MARK: - Lineare Gleichungssysteme

// Ergebnis: { kind: 'unique'|'none'|'infinite', exact, summary, steps: [{ops, matrix}],
//             backSubstitution, solutionLines, values, detText }
function lgsResult(kind, exact, summary, steps, backSubstitution, solutionLines, values, detText) {
  return { kind, exact, summary, steps, backSubstitution, solutionLines, values, detText };
}

const PARAM_NAMES = ['t', 's', 'r', 'u', 'v', 'w', 'p', 'q'];

function fmtR(M) { return M.map((r) => r.map((v) => v.text)); }

function z(i) { return 'Z' + subscripted(i + 1); }

function variableNames(n) {
  if (n <= 3) return ['x', 'y', 'z'].slice(0, n);
  const out = [];
  for (let i = 1; i <= n; i++) out.push('x' + subscripted(i));
  return out;
}

function solve(A, b) {
  const n = A.length;
  const names = variableNames(n);
  const allExact = A.every((row) => row.every((e) => LGSEntry.rational(e) !== null))
    && b.every((e) => LGSEntry.rational(e) !== null);
  if (allExact) {
    const M = [];
    for (let r = 0; r < n; r++) M.push(A[r].map((e) => e.exact).concat([b[r].exact]));
    const res = solveExact(M, names);
    if (res !== null) return res;
  }
  const M = [];
  for (let r = 0; r < n; r++) M.push(A[r].map((e) => LGSEntry.toNumber(e)).concat([LGSEntry.toNumber(b[r])]));
  return solveApprox(M, names);
}

// Zeile als Gleichung: „3x − 2y + z = 5“
function equationText(row, names) {
  let s = '';
  for (let j = 0; j < row.length - 1; j++) {
    const a = row[j];
    if (a.isZero()) continue;
    const absA = a.abs();
    const coeff = absA.equals(Rational.ONE) ? '' : absA.text;
    if (s.length === 0) {
      s = (a.num < 0n ? '−' : '') + coeff + names[j];
    } else {
      s += (a.num < 0n ? ' − ' : ' + ') + coeff + names[j];
    }
  }
  if (s.length === 0) s = '0';
  return s + ' = ' + row[row.length - 1].text;
}

/// ggT aller Zähler einer Zeile (BigInt, 0n bei Nullzeile)
function rowGcd(row) {
  return row.reduce((g, v) => gcd(g, v.num), 0n);
}

// Exakt, ganzzahlig („Z₂ ← 2·Z₂ − 3·Z₁“) wie im Unterricht
function solveExact(M0, names) {
  const n = M0.length;
  const M = M0.map((r) => r.slice());
  const steps = [{ ops: ['Ausgangssystem'], matrix: fmtR(M) }];

  // 1. Brüche beseitigen und Zeilen kürzen
  let ops = [];
  for (let r = 0; r < n; r++) {
    let l = 1n;
    for (const v of M[r]) {
      const nl = lcm(l, v.den);
      if (nl === null) return null;
      l = nl;
    }
    if (l > 1n) {
      const row = [];
      for (const v of M[r]) {
        const p = v.mul(l);
        if (p === null) return null;
        row.push(p);
      }
      M[r] = row;
      ops.push(`${z(r)} · ${l}  (Brüche beseitigen)`);
    }
    const g = rowGcd(M[r]);
    if (g > 1n) {
      M[r] = M[r].map((v) => new Rational(v.num / g));
      ops.push(`${z(r)} : ${g}  (kürzen)`);
    }
  }
  if (ops.length > 0) steps.push({ ops, matrix: fmtR(M) });

  // 2. Vorwärtselimination (Stufenform)
  const pivotCols = [];
  let row = 0;
  for (let col = 0; col < n; col++) {
    if (!(row < n)) break;
    let best = null;
    for (let r = row; r < n; r++) {
      if (M[r][col].isZero()) continue;
      if (best !== null) {
        if (less(M[r][col].abs(), M[best][col].abs())) best = r;
      } else {
        best = r;
      }
    }
    if (best === null) continue;
    const p = best;
    ops = [];
    if (p !== row) {
      [M[p], M[row]] = [M[row], M[p]];
      ops.push(`${z(row)} ↔ ${z(p)}`);
    }
    const a = M[row][col].num;
    for (let r = row + 1; r < n; r++) {
      if (M[r][col].isZero()) continue;
      const c = M[r][col].num;
      const g = gcd(a, c);
      let alpha = a / g, beta = c / g;
      if (alpha < 0n) { alpha = -alpha; beta = -beta; }
      let newRow = [];
      for (let j = 0; j <= n; j++) {
        const t1 = mulO(alpha, M[r][j].num), t2 = mulO(beta, M[row][j].num);
        if (t1 === null || t2 === null) return null;
        const v = addO(t1, -t2);
        if (v === null) return null;
        newRow.push(new Rational(v));
      }
      let text = alpha === 1n ? z(r) : `${alpha}·${z(r)}`;
      const bAbs = babs(beta);
      text += (beta > 0n ? ' − ' : ' + ') + (bAbs === 1n ? z(row) : `${bAbs}·${z(row)}`);
      const gRow = rowGcd(newRow);
      if (gRow > 1n) {
        newRow = newRow.map((v) => new Rational(v.num / gRow));
        text += `   dann : ${gRow}`;
      }
      M[r] = newRow;
      ops.push(`${z(r)} ← ` + text);
    }
    if (ops.length > 0) steps.push({ ops, matrix: fmtR(M) });
    pivotCols.push(col);
    row += 1;
  }
  const rank = pivotCols.length;
  const det = exactDeterminant(M0.map((r) => r.slice(0, r.length - 1)));
  const detText = det !== null
    ? `det A = ${det.text}`
    : `det A ≈ ${Fmt.num(approxDeterminant(M0.map((r) => r.slice(0, r.length - 1).map((v) => v.toNumber()))), 6)}`;

  // 3. Widerspruch?
  for (let r = rank; r < n; r++) {
    if (M[r][n].isZero()) continue;
    return lgsResult('none', true,
      `Keine Lösung: ${z(r)} lautet 0 = ${M[r][n].text} – ein Widerspruch.`,
      steps, [], ['L = { }  (leere Lösungsmenge)'], [], detText);
  }

  // 4. Rückwärtseinsetzen
  const free = [];
  for (let j = 0; j < n; j++) if (!pivotCols.includes(j)) free.push(j);
  const params = free.length;
  const pNames = PARAM_NAMES.slice(0, Math.max(params, 1));
  const values = new Array(n).fill(null);
  const back = [];
  free.forEach((j, k) => {
    values[j] = Affine.param(k, params);
    back.push(`${names[j]} = ${pNames[k]}  (frei wählbar)`);
  });
  for (let i = rank - 1; i >= 0; i--) {
    const pc = pivotCols[i];
    let sum = Affine.constant(M[i][n], params);
    const known = [];
    for (let j = pc + 1; j < n; j++) {
      if (M[i][j].isZero()) continue;
      const vj = values[j];
      if (vj === null) return null;
      const s = sum.adding(vj, M[i][j].neg());
      if (s === null) return null;
      sum = s;
      known.push(`${names[j]} = ${vj.text(pNames)}`);
    }
    const v = sum.divided(M[i][pc]);
    if (v === null) return null;
    values[pc] = v;
    let line = `${z(i)}: ${equationText(M[i], names)}`;
    if (known.length > 0) line += ',  mit ' + known.join(', ');
    line += `   ⇒   ${names[pc]} = ${v.text(pNames)}`;
    back.push(line);
  }

  const lines = [];
  const nums = [];
  for (let j = 0; j < n; j++) {
    const v = values[j];
    if (v === null) return null;
    let s = `${names[j]} = ${v.text(pNames)}`;
    if (params === 0) {
      nums.push(v.c.toNumber());
      if (!v.c.isInteger()) s += `  ≈ ${Fmt.num(v.c.toNumber(), 6)}`;
    }
    lines.push(s);
  }
  if (params === 0) {
    return lgsResult('unique', true, 'Genau eine Lösung.', steps, back, lines, nums, detText);
  }
  return lgsResult('infinite', true,
    `Unendlich viele Lösungen (${params} Parameter, Rang ${rank}).`,
    steps, back, lines, [], detText);
}

function exactDeterminant(A0) {
  const A = A0.map((r) => r.slice());
  const n = A.length;
  let det = Rational.ONE;
  for (let col = 0; col < n; col++) {
    let p = -1;
    for (let r = col; r < n; r++) {
      if (!A[r][col].isZero()) { p = r; break; }
    }
    if (p < 0) return Rational.ZERO;
    if (p !== col) {
      [A[p], A[col]] = [A[col], A[p]];
      det = det.neg();
    }
    const d = det.mul(A[col][col]);
    if (d === null) return null;
    det = d;
    for (let r = col + 1; r < n; r++) {
      if (A[r][col].isZero()) continue;
      const f = A[r][col].div(A[col][col]);
      if (f === null) return null;
      for (let j = col; j < n; j++) {
        const t = A[col][j].mul(f);
        if (t === null) return null;
        const v = A[r][j].sub(t);
        if (v === null) return null;
        A[r][j] = v;
      }
    }
  }
  return det;
}

function approxDeterminant(A0) {
  const A = A0.map((r) => r.slice());
  const n = A.length;
  let det = 1.0;
  for (let col = 0; col < n; col++) {
    let p = col;
    for (let r = col; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[p][col])) p = r;
    if (A[p][col] === 0) return 0;
    if (p !== col) { [A[p], A[col]] = [A[col], A[p]]; det = -det; }
    det *= A[col][col];
    for (let r = col + 1; r < n; r++) {
      const f = A[r][col] / A[col][col];
      for (let j = col; j < n; j++) A[r][j] -= f * A[col][j];
    }
  }
  return det;
}

// Näherung mit Spaltenpivotsuche (für Dezimalzahlen und Terme wie √2)
function solveApprox(M0, names) {
  const n = M0.length;
  const M = M0.map((r) => r.slice());
  const fmtM = (X) => X.map((r) => r.map((v) => Fmt.num(v, 4)));
  const steps = [{ ops: ['Ausgangssystem (Dezimalzahlen)'], matrix: fmtM(M) }];
  let maxAbs = 0.0;
  for (const r of M) for (const v of r) maxAbs = smax(maxAbs, Math.abs(v));
  const tol = 1e-11 * smax(maxAbs, 1e-300) * n;
  const pivotCols = [];
  let row = 0;
  for (let col = 0; col < n; col++) {
    if (!(row < n)) break;
    let p = row;
    for (let r = row; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[p][col])) p = r;
    if (Math.abs(M[p][col]) <= tol) {
      for (let r = row; r < n; r++) M[r][col] = 0;
      continue;
    }
    const ops = [];
    if (p !== row) {
      [M[p], M[row]] = [M[row], M[p]];
      ops.push(`${z(row)} ↔ ${z(p)}`);
    }
    for (let r = row + 1; r < n; r++) {
      if (M[r][col] === 0) continue;
      const f = M[r][col] / M[row][col];
      for (let j = col; j <= n; j++) M[r][j] -= f * M[row][j];
      M[r][col] = 0;
      ops.push(`${z(r)} ← ${z(r)} ` + (f >= 0 ? '− ' : '+ ') + Fmt.num(Math.abs(f), 4) + '·' + z(row));
    }
    if (ops.length > 0) steps.push({ ops, matrix: fmtM(M) });
    pivotCols.push(col);
    row += 1;
  }
  for (let r = row; r < n; r++) for (let j = 0; j < n; j++) if (Math.abs(M[r][j]) <= tol) M[r][j] = 0;
  const rank = pivotCols.length;
  const det = approxDeterminant(M0.map((r) => r.slice(0, r.length - 1)));
  const detText = `det A ≈ ${Fmt.num(det, 6)}`;
  const rhsTol = 1e-9 * smax(maxAbs, 1);
  for (let r = rank; r < n; r++) {
    if (!(Math.abs(M[r][n]) > rhsTol)) continue;
    return lgsResult('none', false,
      `Keine Lösung: ${z(r)} lautet 0 = ${Fmt.num(M[r][n], 4)} – ein Widerspruch.`,
      steps, [], ['L = { }  (leere Lösungsmenge)'], [], detText);
  }
  const free = [];
  for (let j = 0; j < n; j++) if (!pivotCols.includes(j)) free.push(j);
  const params = free.length;
  const pNames = PARAM_NAMES.slice(0, Math.max(params, 1));
  // Werte als [Konstante, Koeffizienten]
  const vals = new Array(n).fill(null);
  const back = [];
  free.forEach((j, k) => {
    const kk = new Array(params).fill(0);
    kk[k] = 1;
    vals[j] = [0, kk];
    back.push(`${names[j]} = ${pNames[k]}  (frei wählbar)`);
  });
  const affText = (v) => {
    let s = '';
    if (Math.abs(v[0]) > 1e-14 || v[1].every((a) => Math.abs(a) < 1e-14)) s = Fmt.num(v[0], 6);
    v[1].forEach((a, i) => {
      if (!(Math.abs(a) > 1e-14)) return;
      const c = Math.abs(Math.abs(a) - 1) < 1e-14 ? '' : Fmt.num(Math.abs(a), 6) + '·';
      if (s.length === 0) s = (a < 0 ? '−' : '') + c + pNames[i];
      else s += (a < 0 ? ' − ' : ' + ') + c + pNames[i];
    });
    return s;
  };
  for (let i = rank - 1; i >= 0; i--) {
    const pc = pivotCols[i];
    let c0 = M[i][n];
    const kk = new Array(params).fill(0);
    for (let j = pc + 1; j < n; j++) {
      if (M[i][j] === 0) continue;
      const vj = vals[j];
      if (vj !== null) {
        c0 -= M[i][j] * vj[0];
        for (let q = 0; q < params; q++) kk[q] -= M[i][j] * vj[1][q];
      }
    }
    const v = [c0 / M[i][pc], kk.map((x) => x / M[i][pc])];
    vals[pc] = v;
    back.push(`${z(i)} ⇒ ${names[pc]} = ${affText(v)}`);
  }
  const lines = [];
  const nums = [];
  for (let j = 0; j < n; j++) {
    const v = vals[j] ?? [0, new Array(params).fill(0)];
    let s = `${names[j]} = ${affText(v)}`;
    if (params === 0) {
      nums.push(v[0]);
      const r = Rational.approximate(v[0], 1000, 1e-10);
      if (r !== null && !r.isInteger()) s += `  (= ${r.text}?)`;
    }
    lines.push(s);
  }
  if (params === 0) {
    return lgsResult('unique', false, 'Genau eine Lösung (numerisch).', steps, back, lines, nums, detText);
  }
  return lgsResult('infinite', false,
    `Unendlich viele Lösungen (${params} Parameter, Rang ${rank}).`,
    steps, back, lines, [], detText);
}

export const LGSSolver = {
  variableNames,
  paramNames: PARAM_NAMES,
  solve,
  equationText,
  solveExact,
  exactDeterminant,
  approxDeterminant,
  solveApprox,
};

// MARK: - Polynome

/// „2x³ − 6x² + 11x − 6“ aus Koeffizienten (höchster Grad zuerst)
function polyGeneric(c, neg, isOne, isZero, variable = 'x') {
  const n = c.length - 1;
  let s = '';
  c.forEach((coeff, i) => {
    if (isZero[i]) return;
    const power = n - i;
    let term = '';
    if (power === 0) {
      term = coeff;
    } else {
      term = isOne[i] ? '' : coeff;
      term += variable + (power > 1 ? Fmt.superscript(power) : '');
    }
    if (s.length === 0) {
      s = (neg[i] ? '−' : '') + term;
    } else {
      s += (neg[i] ? ' − ' : ' + ') + term;
    }
  });
  return s.length === 0 ? '0' : s;
}

function fromRationals(c, variable = 'x') {
  return polyGeneric(c.map((r) => r.abs().text), c.map((r) => r.num < 0n), c.map((r) => r.abs().equals(Rational.ONE)),
    c.map((r) => r.isZero()), variable);
}

function fromNumbers(c, variable = 'x', decimals = 4) {
  return polyGeneric(c.map((x) => Fmt.num(Math.abs(x), decimals)), c.map((x) => x < 0), c.map((x) => Math.abs(x) === 1),
    c.map((x) => x === 0), variable);
}

/// Eingabe für den Graphen („2*x^3-6*x^2+11*x-6“)
function graphInput(c) {
  const n = c.length - 1;
  let s = '';
  c.forEach((a, i) => {
    if (a === 0) return;
    const p = n - i;
    const mag = Fmt.plain(Math.abs(a));
    let term = p === 0 ? mag : (Math.abs(a) === 1 ? '' : mag + '*') + 'x' + (p > 1 ? `^${p}` : '');
    if (s.length === 0) term = (a < 0 ? '-' : '') + term; else term = (a < 0 ? ' - ' : ' + ') + term;
    s += term;
  });
  return s.length === 0 ? '0' : s;
}

export const PolyText = {
  poly: polyGeneric,
  fromRationals,
  fromNumbers,
  graphInput,
};

// PolyResult: { degree, polyText, roots: Complex[], rootLines, exactLines, infoLines, realRoots,
//               vertex: [x, y] | null }
function polyResult(degree, polyText) {
  return { degree, polyText, roots: [], rootLines: [], exactLines: [], infoLines: [], realRoots: [], vertex: null };
}

const sub = subscripted;

/// Zerlegt m > 0 in k²·r mit quadratfreiem r → [k, r] (Zahl oder BigInt, wie m)
function squareFactor(m) {
  if (typeof m === 'bigint') {
    if (m <= 1_000_000_000_000n) {
      const [k, r] = squareFactor(Number(m));
      return [BigInt(k), BigInt(r)];
    }
    return squareFactorBig(m);
  }
  if (m > 1e12) {
    const [k, r] = squareFactorBig(BigInt(m));
    return [Number(k), Number(r)];
  }
  // wie Swift: Quadrate d² herausziehen, solange d² ≤ r
  let k = 1, r = m, d = 2;
  while (d * d <= r) {
    while (r % (d * d) === 0) { r /= d * d; k *= d; }
    d += 1;
  }
  return [k, r];
}

/// Dieselbe (eindeutige) Zerlegung k²·r für große m, aber mit Probedivision nur bis ∛m:
/// danach hat der Rest höchstens zwei Primfaktoren – er ist ein Quadrat p² oder quadratfrei.
/// (Swifts Schleife bis √m wäre bei großen Primzahlen zu langsam.)
function squareFactorBig(m) {
  let k = 1n, r = 1n, rest = m, d = 2n;
  while (d * d * d <= rest) {
    if (rest % d === 0n) {
      let e = 0;
      while (rest % d === 0n) { rest /= d; e += 1; }
      for (let i = 0; i < Math.floor(e / 2); i++) k *= d;
      if (e % 2 === 1) r *= d;
    }
    d += 1n;
  }
  if (rest > 1n) {
    const s = isqrt(rest);
    if (s * s === rest) k *= s; else r *= rest;
  }
  return [k, r];
}

/// Ganzzahlige Quadratwurzel (abgerundet) einer BigInt-Zahl ≥ 0 (Newton)
function isqrt(n) {
  if (n < 2n) return n;
  let x = BigInt(Math.floor(Math.sqrt(Number(n))));
  while (x * x > n) x -= 1n;
  while ((x + 1n) * (x + 1n) <= n) x += 1n;
  return x;
}

/// Exakte Lösungsformel einer quadratischen Gleichung mit rationalen Koeffizienten
/// Rückgabe: {lines, rational} (Zeilen und ggf. rationale Nullstellen) oder null
function exactQuadratic(a, b, c) {
  const bb = b.mul(b);
  const ac = a.mul(c);
  const ac4 = ac === null ? null : ac.mul(4);
  const D = bb === null || ac4 === null ? null : bb.sub(ac4);
  const a2 = a.mul(2);
  const nb = b.neg();
  const xs = a2 === null ? null : nb.div(a2);
  if (bb === null || ac === null || ac4 === null || D === null || a2 === null || xs === null) return null;
  const lines = [`D = b² − 4ac = ${D.text}`];
  if (D.isZero()) {
    lines.push(`x₁ = x₂ = ${xs.text}  (doppelte Lösung)`);
    return { lines, rational: [xs, xs] };
  }
  // Swift: m = |D.num|·D.den als Int (Überlauf → keine exakte Form)
  const m = babs(D.num) * D.den;
  if (m > INT64_MAX) return { lines, rational: [] };
  const [k, r] = squareFactor(m);
  // √|D| = k·√r / D.den ;  x = xs ± k√r / (D.den·2|a|)
  const denom = a2.abs().mul(D.den);
  const kRat = Rational.make(k, 1n);
  const cRat = denom === null || kRat === null ? null : kRat.div(denom);
  if (cRat === null) return { lines, rational: [] };
  if (D.num > 0n && r === 1n) {
    const x1 = xs.sub(cRat), x2 = xs.add(cRat);
    if (x1 === null || x2 === null) return { lines, rational: [] };
    const kd = Rational.make(k, D.den);
    lines.push(`√D = ${k === 1n && D.den === 1n ? '1' : (kd !== null ? kd.text : '')}  (rational)`);
    lines.push(`x₁ = ${x1.text},  x₂ = ${x2.text}`);
    return { lines, rational: [x1, x2].sort(byLess(less)) };
  }
  // gemeinsamer Nenner
  const S = lcm(xs.den, cRat.den);
  if (S === null) return { lines, rational: [] };
  let P = mulO(xs.num, S / xs.den), Q = mulO(cRat.num, S / cRat.den);
  if (P === null || Q === null) return { lines, rational: [] };
  let SS = S;
  const g = gcd(gcd(P, Q), SS);
  if (g > 1n) { P /= g; Q /= g; SS /= g; }
  let rootText = r === 1n ? '' : `√${r}`;
  if (D.num < 0n) rootText += (rootText.length === 0 ? 'i' : '·i');
  const qPart = (Q === 1n ? '' : `${Q}`) + rootText;
  let numer;
  if (P === 0n) {
    numer = '±' + qPart;
    lines.push('x₁,₂ = ' + (SS === 1n ? numer : numer + `/${SS}`));
  } else {
    numer = (P < 0n ? `−${-P}` : `${P}`) + ' ± ' + qPart;
    lines.push('x₁,₂ = ' + (SS === 1n ? numer : '(' + numer + `)/${SS}`));
  }
  return { lines, rational: [] };
}

/// Quadratische Gleichung a·x² + b·x + c = 0 (Einträge wie LGSEntry)
function quadratic(a, b, c, decimals = 6) {
  const ad = LGSEntry.toNumber(a), bd = LGSEntry.toNumber(b), cd = LGSEntry.toNumber(c);
  const coeffs = [ad, bd, cd];
  const res = polyResult(2, '');
  const exactCoeffs = [a, b, c].map((e) => LGSEntry.rational(e)).filter((r) => r !== null);
  const isExact = exactCoeffs.length === 3;
  res.polyText = (isExact ? fromRationals(exactCoeffs) : fromNumbers(coeffs)) + ' = 0';
  if (ad === 0) {
    res.degree = 1;
    if (bd === 0) {
      res.rootLines = [cd === 0 ? 'Jede Zahl ist Lösung (0 = 0).' : 'Keine Lösung (Widerspruch).'];
      return res;
    }
    const x = -cd / bd;
    res.roots = [new Complex(x, 0)];
    res.realRoots = [x];
    res.infoLines = ['a = 0: lineare Gleichung bx + c = 0'];
    const r = isExact ? exactCoeffs[2].neg().div(exactCoeffs[1]) : null;
    if (r !== null) {
      res.rootLines = [`x = ${r.text}` + (r.isInteger() ? '' : `  ≈ ${Fmt.num(x, decimals)}`)];
    } else {
      res.rootLines = [`x = ${Fmt.num(x, decimals)}`];
    }
    return res;
  }
  const D = bd * bd - 4 * ad * cd;
  const roots = Numerics.quadraticRoots(ad, bd, cd);
  res.roots = roots;
  const xs = -bd / (2 * ad), ys = cd - bd * bd / (4 * ad);
  res.vertex = [xs, ys];
  if (D > 0) {
    res.infoLines.push(`D = ${Fmt.num(D, decimals)} > 0: zwei verschiedene reelle Lösungen`);
    res.rootLines = [`x₁ = ${Fmt.num(roots[0].re, decimals)}`, `x₂ = ${Fmt.num(roots[1].re, decimals)}`];
    res.realRoots = [roots[0].re, roots[1].re];
  } else if (D === 0) {
    res.infoLines.push('D = 0: eine doppelte reelle Lösung');
    res.rootLines = [`x₁ = x₂ = ${Fmt.num(xs, decimals)}`];
    res.realRoots = [xs];
  } else {
    res.infoLines.push(`D = ${Fmt.num(D, decimals)} < 0: keine reelle Lösung, zwei komplexe`);
    const re = Fmt.num(roots[0].re, decimals), im = Fmt.num(Math.abs(roots[0].im), decimals);
    res.rootLines = [`x₁ = ${re} + ${im}·i`, `x₂ = ${re} − ${im}·i`];
  }
  const ex = isExact ? exactQuadratic(exactCoeffs[0], exactCoeffs[1], exactCoeffs[2]) : null;
  if (ex !== null) {
    res.exactLines = ex.lines;
    // Scheitelpunkt exakt
    const [qa, qb, qc] = exactCoeffs;
    const a2 = qa.mul(2);
    const nb = qb.neg();
    const xv = a2 === null ? null : nb.div(a2);
    const bb = qb.mul(qb);
    const a4 = qa.mul(4);
    const t = bb === null || a4 === null ? null : bb.div(a4);
    const yv = t === null ? null : qc.sub(t);
    if (xv !== null && yv !== null) {
      res.infoLines.push(`Scheitelpunkt S(${xv.text} | ${yv.text})`);
      const aText = qa.equals(Rational.ONE) ? '' : (qa.equals(new Rational(-1n)) ? '−' : qa.text + '·');
      const xPart = xv.isZero() ? 'x²' : '(x ' + (xv.num > 0n ? `− ${xv.text}` : `+ ${xv.abs().text}`) + ')²';
      const yPart = yv.isZero() ? '' : (yv.num > 0n ? ` + ${yv.text}` : ` − ${yv.abs().text}`);
      res.infoLines.push(`Scheitelpunktform: y = ${aText}${xPart}${yPart}`);
      if (ex.rational.length === 2) {
        const f = ex.rational.map((r) =>
          r.isZero() ? 'x' : '(x ' + (r.num > 0n ? `− ${r.text}` : `+ ${r.abs().text}`) + ')');
        const factor = f[0] === f[1] ? f[0] + '²' : f[0] + '·' + f[1];
        res.infoLines.push(`Linearfaktoren: ${aText}${factor}`);
      }
      const s = qb.neg().div(qa), p = qc.div(qa);
      if (s !== null && p !== null) {
        res.infoLines.push(`Vieta: x₁ + x₂ = ${s.text},  x₁ · x₂ = ${p.text}`);
      }
    }
  } else {
    res.infoLines.push(`Scheitelpunkt S${Fmt.point(xs, ys, decimals)}`);
  }
  return res;
}

// MARK: Rationale Nullstellen (Satz über rationale Nullstellen) und Polynomdivision

function hornerExact(c, x) {
  let r = Rational.ZERO;
  for (const a of c) {
    const t = r.mul(x);
    if (t === null) return null;
    const s = t.add(a);
    if (s === null) return null;
    r = s;
  }
  return r;
}

/// Division durch (x − r): Koeffizienten des Quotienten
function deflateExact(c, r) {
  const out = [];
  let acc = Rational.ZERO;
  for (const a of c.slice(0, c.length - 1)) {
    const t = acc.mul(r);
    if (t === null) return null;
    const s = t.add(a);
    if (s === null) return null;
    acc = s;
    out.push(acc);
  }
  return out;
}

/// Positive Teiler von |n| (Zahl oder BigInt; Ergebnis als Zahlen), leer bei 0 oder |n| > 10¹²
function divisors(n) {
  const big = typeof n === 'bigint' ? babs(n) : BigInt(Math.abs(n));
  if (!(big > 0n && big <= 1_000_000_000_000n)) return [];
  const m = Number(big);
  const ds = [];
  let i = 1;
  while (i * i <= m) {
    if (m % i === 0) {
      ds.push(i);
      if (i !== m / i) ds.push(m / i);
    }
    i += 1;
    if (ds.length > 2000) break;
  }
  return ds.sort((a, b) => a - b);
}

/// Findet alle rationalen Nullstellen (mit Vielfachheit); Rest = verbleibender Faktor
/// → {roots, rest, steps} | null
function rationalRoots(c0) {
  const c = c0.slice();
  while (c.length > 1 && c[0].isZero()) c.shift();
  const roots = [];
  const steps = [];
  while (c.length > 1 && c[c.length - 1].isZero()) {
    roots.push(Rational.ZERO);
    c.pop();
    steps.push('x ausklammern ⇒ Nullstelle x = 0');
  }
  // ganzzahlig machen
  let l = 1n;
  for (const v of c) {
    const nl = lcm(l, v.den);
    if (nl === null) return null;
    l = nl;
  }
  const ints = [];
  for (const v of c) {
    const p = v.mul(l);
    if (p === null || !p.isInteger()) return null;
    ints.push(p.num);
  }
  let poly = ints.map((v) => new Rational(v));
  let found = true;
  while (found && poly.length > 2) {
    found = false;
    const lead = poly[0].num, last = poly[poly.length - 1].num;
    if (last === 0n) break;
    const ps = divisors(last), qs = divisors(lead);
    if (ps.length === 0 || qs.length === 0) break;
    const seen = new Map();
    for (const p of ps) {
      for (const q of qs) {
        for (const r of [new Rational(p, q), new Rational(-p, q)]) {
          if (!seen.has(r.key())) seen.set(r.key(), r);
        }
      }
    }
    const cands = Array.from(seen.values()).sort(byLess((x, y) => {
      const ax = x.abs().toNumber(), ay = y.abs().toNumber();
      return ax < ay || (ax === ay && x.num < y.num);
    }));
    for (const r of cands) {
      const v = hornerExact(poly, r);
      if (v === null || !v.isZero()) continue;
      const q = deflateExact(poly, r);
      if (q === null) continue;
      steps.push(`Probieren: p(${r.text}) = 0  ⇒  Polynomdivision: (${fromRationals(poly)}) : (x ${r.num >= 0n ? '−' : '+'} ${r.abs().text}) = ${fromRationals(q)}`);
      roots.push(r);
      poly = q;
      found = true;
      break;
    }
  }
  // letzter Linearfaktor
  if (poly.length === 2) {
    const r = poly[1].neg().div(poly[0]);
    if (r !== null) {
      roots.push(r);
      poly = [poly[0]];
    }
  }
  return { roots: roots.sort(byLess(less)), rest: poly, steps };
}

/// Polynom beliebigen Grades (kubisch mit Cardano-Hinweisen); Einträge wie LGSEntry, höchster Grad zuerst
function polynomial(entries, decimals = 6) {
  const e = entries.slice();
  while (e.length > 1 && LGSEntry.toNumber(e[0]) === 0) e.shift();
  const c = e.map((x) => LGSEntry.toNumber(x));
  const degree = c.length - 1;
  if (degree === 2) return quadratic(e[0], e[1], e[2], decimals);
  const exact = e.map((x) => LGSEntry.rational(x)).filter((r) => r !== null);
  const isExact = exact.length === e.length;
  const res = polyResult(degree, (isExact ? fromRationals(exact) : fromNumbers(c)) + ' = 0');
  if (degree < 1) {
    res.rootLines = [c[0] === 0 ? 'Jede Zahl ist Lösung.' : 'Keine Lösung.'];
    return res;
  }
  const roots = Numerics.polyRoots(c);
  res.roots = roots;

  // exakte rationale Nullstellen
  let rationals = [];
  const rr = isExact ? rationalRoots(exact) : null;
  if (rr !== null) {
    rationals = rr.roots.slice();
    res.exactLines.push(...rr.steps);
    if (rr.rest.length === 3) {
      const q = exactQuadratic(rr.rest[0], rr.rest[1], rr.rest[2]);
      if (q !== null) {
        res.exactLines.push(`Restfaktor ${fromRationals(rr.rest)} = 0:`);
        res.exactLines.push(...q.lines.map((s) => '   ' + s));
        rationals.push(...q.rational);
      }
    }
    if (rationals.length > 0) {
      const factors = [];
      const counts = new Map();   // Schlüssel → {r, n}
      for (const r of rationals) {
        const k = r.key();
        if (counts.has(k)) counts.get(k).n += 1; else counts.set(k, { r, n: 1 });
      }
      const keys = Array.from(counts.values()).sort(byLess((x, y) => less(x.r, y.r)));
      for (const { r, n } of keys) {
        const f = r.isZero() ? 'x' : '(x ' + (r.num > 0n ? `− ${r.text}` : `+ ${r.abs().text}`) + ')';
        factors.push(n > 1 ? f + Fmt.superscript(n) : f);
      }
      let restText = '';
      const lead = exact[0];
      let restPoly;
      if (rationals.length === degree) {
        restPoly = [lead];
      } else {
        // Rest = Polynom / Π(x − r): nur anzeigen, wenn nicht trivial
        let p = exact;
        for (const r of rationals) {
          const q = deflateExact(p, r);
          if (q !== null) p = q;
        }
        restPoly = p;
      }
      if (restPoly.length === 1) {
        const a = restPoly[0];
        restText = a.equals(Rational.ONE) ? '' : (a.equals(new Rational(-1n)) ? '−' : a.text + '·');
        res.exactLines.push(`Linearfaktoren: ${restText}` + factors.join('·'));
      } else {
        res.exactLines.push('Zerlegung: ' + factors.join('·') + `·(${fromRationals(restPoly)})`);
      }
    }
  }

  // Nullstellen zusammenfassen (Vielfachheit)
  let idx = 1;
  let i = 0;
  const real = roots.filter((w) => w.im === 0).map((w) => w.re);
  res.realRoots = [];
  while (i < real.length) {
    let j = i;
    while (j + 1 < real.length && Math.abs(real[j + 1] - real[i]) <= 1e-7 * smax(1, Math.abs(real[i]))) j += 1;
    const m = j - i + 1;
    let sum = 0;
    for (let q = i; q <= j; q++) sum += real[q];
    let x = sum / m;
    let text = Fmt.num(x, decimals);
    const r = rationals.find((w) => Math.abs(w.toNumber() - x) <= 1e-7 * smax(1, Math.abs(x)));
    if (r !== undefined) {
      x = r.toNumber();
      if (!r.isInteger()) text = r.text + '  ≈ ' + Fmt.num(x, decimals); else text = r.text;
    }
    let label;
    if (m === 1) {
      label = `x${sub(idx)}`;
    } else {
      const parts = [];
      for (let q = idx; q <= idx + m - 1; q++) parts.push(`x${sub(q)}`);
      label = parts.join(' = ');
    }
    const mult = m === 2 ? '  (doppelt)' : (m === 3 ? '  (dreifach)' : (m > 3 ? `  (${m}-fach)` : ''));
    res.rootLines.push(`${label} = ${text}${mult}`);
    res.realRoots.push(x);
    idx += m;
    i = j + 1;
  }
  const cpx = roots.filter((w) => w.im > 0);
  for (const w of cpx) {
    res.rootLines.push(`x${sub(idx)},${sub(idx + 1)} = ${Fmt.num(w.re, decimals)} ± ${Fmt.num(w.im, decimals)}·i`);
    idx += 2;
  }
  if (real.length === 0) res.infoLines.push('Keine reelle Lösung.');

  if (degree === 3) {
    const [a, b, cc, d] = c;
    const p = (3 * a * cc - b * b) / (3 * a * a);
    const q = (2 * b * b * b - 9 * a * b * cc + 27 * a * a * d) / (27 * a * a * a);
    const D = (q / 2) * (q / 2) + (p / 3) * (p / 3) * (p / 3);
    res.infoLines.push(`Reduzierte Form (x = t − b/3a): t³ + p·t + q = 0 mit p = ${Fmt.num(p, decimals)}, q = ${Fmt.num(q, decimals)}`);
    const scale = smax(smax(Math.abs(q * q / 4), Math.abs(p * p * p / 27)), 1e-300);
    if (Math.abs(D) <= 1e-12 * scale) {
      res.infoLines.push('Cardano-Diskriminante D = (q/2)² + (p/3)³ = 0: mehrfache reelle Lösung');
    } else if (D > 0) {
      res.infoLines.push(`D = ${Fmt.num(D, decimals)} > 0: eine reelle und zwei komplexe Lösungen`);
    } else {
      res.infoLines.push(`D = ${Fmt.num(D, decimals)} < 0: drei verschiedene reelle Lösungen (casus irreducibilis)`);
    }
  }
  return res;
}

export const PolySolver = {
  squareFactor,
  exactQuadratic,
  quadratic,
  hornerExact,
  deflateExact,
  divisors,
  rationalRoots,
  polynomial,
};
