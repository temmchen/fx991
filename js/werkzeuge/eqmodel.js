// eqmodel.js – Modell des Reiters „Gleichungen“: lineare Gleichungssysteme (bis 8×8, Gauß-Lösungsweg),
// quadratische, kubische und Polynomgleichungen (exakt + numerisch, komplexe Lösungen) sowie beliebige
// Gleichungen links = rechts (alle Lösungen in einem Intervall).
// (Portierung von EquationsModel aus EquationsView.swift; die Ansicht steht in js/ui/tools-ui.js.
//  Ohne DOM – läuft auch in JavaScriptCore.)
//
// Ergebnisse wie Swift `Result<…, MathError>` → { ok: true, out } | { ok: false, error /*Meldungstext*/ }
//   lgs()          → out = LGS-Ergebnis aus LGSSolver.solve
//   quadratic(), cubicResult(), polynomial() → out = PolyResult aus PolySolver
//   equation()     → out = { solutions: [x…], from, to }
import { MathError, N, Parser, Algebra, Compiler, variables, evaluateConstant } from './expression.js';
import { CurveAnalysis } from './numerics.js';
import { LGSEntry, LGSSolver, PolySolver, PolyText } from './equations.js';
import { Fmt } from './fmt.js';

/// Betriebsarten in der Reihenfolge von Mode.allCases, mit den Titeln des Segmentschalters
export const EQ_MODES = Object.freeze([
  Object.freeze({ id: 'lgs', title: 'Lineares System' }),
  Object.freeze({ id: 'quadratic', title: 'Quadratisch' }),
  Object.freeze({ id: 'cubic', title: 'Kubisch' }),
  Object.freeze({ id: 'polynomial', title: 'Polynom' }),
  Object.freeze({ id: 'equation', title: 'Gleichung' }),
]);
const MODE_IDS = EQ_MODES.map((m) => m.id);

/// Grenzen der Stepper in der Ansicht (LGS 2…8 Gleichungen, Polynom Grad 2…10)
export const LGS_MIN = 2, LGS_MAX = 8, DEGREE_MIN = 2, DEGREE_MAX = 10;

const emptyMatrix = () => Array.from({ length: 8 }, () => new Array(8).fill(''));
const isStringList = (a) => Array.isArray(a) && a.every((s) => typeof s === 'string');
const clampInt = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.trunc(v)));

/// `try? evaluateConstant(t)` – null statt Ausnahme
function tryConstant(t) {
  try {
    return evaluateConstant(t);
  } catch (e) {
    return null;
  }
}

/// Fehlermeldung einer Ausnahme wie `catch let e as MathError … catch { … }` in Swift
function failure(e, fallback) {
  return { ok: false, error: e instanceof MathError ? e.message : fallback };
}

export class EquationsModel {
  constructor() {
    this._mode = 'lgs';
    this._n = 3;
    this._A = emptyMatrix();
    this._b = new Array(8).fill('');
    this._quad = ['1', '-2', '-3'];
    this._cubic = ['1', '-6', '11', '-6'];
    this._degree = 4;
    this._poly = new Array(11).fill('');   // Index = Potenz
    this._lhs = 'e^x';
    this._rhs = '3x';
    this._from = '-5';
    this._to = '5';
    this._showSteps = true;
    /// wird nach jeder Änderung über Setter und Methoden aufgerufen (setzt app.js)
    this.onChange = null;
    this._memo = new Map();
    this._loadExample();
  }

  _notify() {
    if (typeof this.onChange === 'function') this.onChange();
  }

  /// Wert setzen und nur bei echter Änderung melden
  _set(key, v) {
    if (this[key] === v) return;
    this[key] = v;
    this._notify();
  }

  // MARK: Eingaben (wie @Published in Swift: Änderung → onChange)

  get mode() { return this._mode; }
  set mode(v) { if (MODE_IDS.includes(v)) this._set('_mode', v); }

  /// Anzahl der Gleichungen/Unbekannten (2…8)
  get n() { return this._n; }
  set n(v) { if (Number.isFinite(Number(v))) this._set('_n', clampInt(Number(v), LGS_MIN, LGS_MAX)); }

  /// Grad des Polynoms (2…10)
  get degree() { return this._degree; }
  set degree(v) { if (Number.isFinite(Number(v))) this._set('_degree', clampInt(Number(v), DEGREE_MIN, DEGREE_MAX)); }

  get lhs() { return this._lhs; }
  set lhs(v) { this._set('_lhs', String(v ?? '')); }
  get rhs() { return this._rhs; }
  set rhs(v) { this._set('_rhs', String(v ?? '')); }
  get from() { return this._from; }
  set from(v) { this._set('_from', String(v ?? '')); }
  get to() { return this._to; }
  set to(v) { this._set('_to', String(v ?? '')); }

  /// Lösungsweg aufgeklappt (nur Ansicht, nicht im Zustand – wie Swift)
  get showSteps() { return this._showSteps; }
  set showSteps(v) { this._set('_showSteps', !!v); }

  // Felder der Tabellen: lesen über die Listen, ändern über die Methoden (sonst fehlt die Meldung)
  /// Koeffizienten 8 × 8 (Texte)
  get A() { return this._A; }
  set A(v) {
    if (!Array.isArray(v) || v.length !== 8 || !v.every((r) => isStringList(r) && r.length === 8)) return;
    this._A = v.map((r) => r.slice());
    this._notify();
  }
  /// rechte Seiten (8 Texte)
  get b() { return this._b; }
  set b(v) { if (isStringList(v) && v.length === 8) { this._b = v.slice(); this._notify(); } }
  /// a, b, c der quadratischen Gleichung
  get quad() { return this._quad; }
  set quad(v) { if (isStringList(v) && v.length === 3) { this._quad = v.slice(); this._notify(); } }
  /// a, b, c, d der kubischen Gleichung
  get cubic() { return this._cubic; }
  set cubic(v) { if (isStringList(v) && v.length === 4) { this._cubic = v.slice(); this._notify(); } }
  /// Polynom-Koeffizienten, Index = Potenz (11 Texte)
  get poly() { return this._poly; }
  set poly(v) { if (isStringList(v) && v.length === 11) { this._poly = v.slice(); this._notify(); } }

  setA(i, j, s) { this._setCell(this._A[i], j, s); }
  setB(i, s) { this._setCell(this._b, i, s); }
  setQuad(i, s) { this._setCell(this._quad, i, s); }
  setCubic(i, s) { this._setCell(this._cubic, i, s); }
  setPoly(p, s) { this._setCell(this._poly, p, s); }

  _setCell(list, i, s) {
    if (!list || !Number.isInteger(i) || i < 0 || i >= list.length) return;
    const t = String(s ?? '');
    if (list[i] === t) return;
    list[i] = t;
    this._notify();
  }

  // MARK: Knöpfe

  /// „Beispiel“: LGS 2x + y − z = 8 … und Polynom x⁴ − 5x² + 4 (wie loadExample in Swift)
  loadExample() {
    this._loadExample();
    this._notify();
  }

  _loadExample() {
    const ex = [['2', '1', '-1'], ['-3', '-1', '2'], ['-2', '1', '2']];
    const eb = ['8', '-11', '-3'];
    this._A = emptyMatrix();
    this._b = new Array(8).fill('');
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) this._A[i][j] = ex[i][j];
      this._b[i] = eb[i];
    }
    this._n = 3;
    this._poly = new Array(11).fill('');
    this._poly[4] = '1';
    this._poly[2] = '-5';
    this._poly[0] = '4';
  }

  /// „Leeren“: alle Felder des LGS
  clearLGS() {
    this._A = emptyMatrix();
    this._b = new Array(8).fill('');
    this._notify();
  }

  // MARK: Ergebnisse

  lgs() {
    const AA = [];
    const bb = [];
    const names = LGSSolver.variableNames(this._n);
    for (let i = 0; i < this._n; i++) {
      const row = [];
      for (let j = 0; j < this._n; j++) {
        const e = LGSEntry.parse(this._A[i][j]);
        if (e === null) return { ok: false, error: `Zeile ${i + 1}, ${names[j]}: ungültiger Wert „${this._A[i][j]}“` };
        row.push(e);
      }
      AA.push(row);
      const e = LGSEntry.parse(this._b[i]);
      if (e === null) return { ok: false, error: `Zeile ${i + 1}, rechte Seite: ungültiger Wert` };
      bb.push(e);
    }
    if (AA.every((r) => r.every((e) => LGSEntry.toNumber(e) === 0))) return { ok: false, error: 'Bitte Koeffizienten eingeben.' };
    try {
      return { ok: true, out: LGSSolver.solve(AA, bb) };
    } catch (e) {
      return failure(e, 'Ungültige Eingabe');
    }
  }

  /// Texte → Einträge; Fehler mit der Nummer des Koeffizienten
  _entries(list) {
    const out = [];
    for (let i = 0; i < list.length; i++) {
      const e = LGSEntry.parse(list[i]);
      if (e === null) return { ok: false, error: `Koeffizient ${i + 1}: ungültiger Wert „${list[i]}“` };
      out.push(e);
    }
    return { ok: true, out };
  }

  /// Einträge → Polynom-Ergebnis (Ausnahmen des Kerns als Fehlermeldung statt Absturz der Ansicht)
  _polyResult(list, fn) {
    const r = this._entries(list);
    if (!r.ok) return r;
    try {
      return { ok: true, out: fn(r.out) };
    } catch (e) {
      return failure(e, 'Ungültige Eingabe');
    }
  }

  quadratic() {
    return this._polyResult(this._quad, (e) => PolySolver.quadratic(e[0], e[1], e[2]));
  }

  cubicResult() {
    return this._polyResult(this._cubic, (e) =>
      (LGSEntry.toNumber(e[0]) === 0 ? PolySolver.polynomial(e.slice(1)) : PolySolver.polynomial(e)));
  }

  polynomial() {
    const list = [];
    for (let p = this._degree; p >= 0; p--) list.push(this._poly[p]);
    return this._polyResult(list, (e) => PolySolver.polynomial(e));
  }

  /// Beliebige Gleichung links = rechts: alle Lösungen im Intervall [from; to]
  equation() {
    try {
      const l = Parser.parse(this._lhs, 'graph');
      const r = Parser.parse(this._rhs, 'graph');
      const h = N.sub(l, r);
      const other = variables(h).find((v) => v !== 'x');
      if (other !== undefined) return { ok: false, error: `Nur die Variable x ist erlaubt (gefunden: ${other}).` };
      const f = new Compiler({ variable: 'x' }).compile(h);
      const dh = new Compiler({ variable: 'x' }).compile(Algebra.derive(h, 'x'));
      const a = evaluateConstant(this._from), bb = evaluateConstant(this._to);
      if (!(bb > a)) return { ok: false, error: 'Das Intervall muss von klein nach groß gehen.' };
      const vals = [];
      for (let i = 0; i <= 400; i++) {
        const y = f(a + (bb - a) * i / 400);
        if (Number.isFinite(y)) vals.push(y);
      }
      vals.sort((p, q) => p - q);
      const scale = vals.length > 10
        ? Math.max(vals[Math.trunc((vals.length - 1) * 0.95)] - vals[Math.trunc((vals.length - 1) * 0.05)], 1e-12)
        : 1;
      const zs = CurveAnalysis.zeros(f, dh, a, bb, 6000, scale);
      return { ok: true, out: { solutions: zs, from: a, to: bb } };
    } catch (e) {
      return failure(e, 'Ungültige Eingabe');
    }
  }

  /// Ergebnis einer Betriebsart (Standard: die gewählte) mit Zwischenspeicher: rechnet nur neu, wenn sich
  /// die beteiligten Eingaben oder das Dezimaltrennzeichen geändert haben. Das Ergebnis nicht verändern.
  result(mode = this._mode) {
    let key;
    switch (mode) {
      case 'lgs':
        key = [this._n, this._A.slice(0, this._n).map((r) => r.slice(0, this._n)), this._b.slice(0, this._n)];
        break;
      case 'quadratic': key = this._quad; break;
      case 'cubic': key = this._cubic; break;
      case 'polynomial': key = [this._degree, this._poly.slice(0, this._degree + 1)]; break;
      case 'equation': key = [this._lhs, this._rhs, this._from, this._to]; break;
      default: return null;
    }
    const k = JSON.stringify([key, Fmt.comma]);
    const hit = this._memo.get(mode);
    if (hit && hit.key === k) return hit.result;
    let result;
    switch (mode) {
      case 'lgs': result = this.lgs(); break;
      case 'quadratic': result = this.quadratic(); break;
      case 'cubic': result = this.cubicResult(); break;
      case 'polynomial': result = this.polynomial(); break;
      default: result = this.equation(); break;
    }
    this._memo.set(mode, { key: k, result });
    return result;
  }

  // MARK: In den Graph (Knöpfe „Im Graph zeigen“)

  /// Funktionsterme für plot(…) wie in den Panels der Swift-Ansicht; leere Felder zählen als 0
  plotTexts(mode = this._mode) {
    const values = (list) => list.map((s) => tryConstant(s === '' ? '0' : s) ?? 0);
    switch (mode) {
      case 'quadratic': return ['y = ' + PolyText.graphInput(values(this._quad))];
      case 'cubic': return ['y = ' + PolyText.graphInput(values(this._cubic))];
      case 'polynomial': {
        const list = [];
        for (let p = this._degree; p >= 0; p--) list.push(this._poly[p]);
        return ['y = ' + PolyText.graphInput(values(list))];
      }
      case 'equation': return ['y = ' + this._lhs, 'y = ' + this._rhs];
      default: return [];
    }
  }

  // MARK: Rechner → Arbeitsbereich

  /// Wie AppModel.openWorkspace für die Gleichungen: {kind:'lgs', n} | {kind:'quadratic'} | {kind:'cubic'}
  /// | {kind:'polynomial', n}. Rückgabe true, wenn das Ziel die Gleichungen betrifft (dann Reiter zeigen).
  openTarget(target) {
    if (!target || typeof target !== 'object') return false;
    switch (target.kind) {
      case 'lgs':
        this._mode = 'lgs';
        if (Number.isFinite(Number(target.n))) this._n = clampInt(Number(target.n), LGS_MIN, LGS_MAX);
        break;
      case 'quadratic': this._mode = 'quadratic'; break;
      case 'cubic': this._mode = 'cubic'; break;
      case 'polynomial':
        this._mode = 'polynomial';
        if (Number.isFinite(Number(target.n))) this._degree = clampInt(Number(target.n), DEGREE_MIN, DEGREE_MAX);
        break;
      default: return false;
    }
    this._notify();
    return true;
  }

  // MARK: Zustand

  get state() {
    return {
      mode: this._mode, n: this._n, A: this._A.map((r) => r.slice()), b: this._b.slice(),
      quad: this._quad.slice(), cubic: this._cubic.slice(), degree: this._degree, poly: this._poly.slice(),
      lhs: this._lhs, rhs: this._rhs, from: this._from, to: this._to,
    };
  }

  /// Zustand laden. Wie das Decodieren in Swift nur, wenn alle Felder den richtigen Typ haben; sonst Fehler
  /// und nichts wird geändert. Listen mit falscher Länge bleiben wie bisher (Längenprüfungen wie Swift);
  /// n und Grad werden zusätzlich auf den Bereich der Stepper begrenzt.
  restore(s) {
    const ok = s !== null && typeof s === 'object'
      && MODE_IDS.includes(s.mode) && Number.isInteger(s.n) && Number.isInteger(s.degree)
      && Array.isArray(s.A) && s.A.every(isStringList)
      && isStringList(s.b) && isStringList(s.quad) && isStringList(s.cubic) && isStringList(s.poly)
      && ['lhs', 'rhs', 'from', 'to'].every((k) => typeof s[k] === 'string');
    if (!ok) throw new Error('Gleichungen-Zustand ungültig');
    this._mode = s.mode;
    this._n = clampInt(s.n, LGS_MIN, LGS_MAX);
    if (s.A.length === 8 && s.A.every((r) => r.length === 8)) this._A = s.A.map((r) => r.slice());
    if (s.b.length === 8) this._b = s.b.slice();
    if (s.quad.length === 3) this._quad = s.quad.slice();
    if (s.cubic.length === 4) this._cubic = s.cubic.slice();
    this._degree = clampInt(s.degree, DEGREE_MIN, DEGREE_MAX);
    if (s.poly.length === 11) this._poly = s.poly.slice();
    this._lhs = s.lhs;
    this._rhs = s.rhs;
    this._from = s.from;
    this._to = s.to;
    this._notify();
  }

  /// Anfangszustand (wie equations.restore(EquationsModel().state) beim Zurücksetzen)
  reset() {
    this.restore(new EquationsModel().state);
  }
}
