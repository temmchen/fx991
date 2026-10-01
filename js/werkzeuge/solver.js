// solver.js – Formel-Solver wie beim HP-42S: Formel eingeben (z. B. „P = U*I“), bekannte Größen
// eintragen, gesuchte Größe lösen. Die Werte sind dieselben Variablen wie im Rechner (SOLVER-Menü, ⇧7).
// (Portierung von SolverModel aus SolverView.swift; Knöpfe der Ansicht als Hilfsmethoden)
//
// Formel: { id /*UUID-Text*/, name, text, note }
import { MathError, N, Tokenizer, Parser, Algebra, ParamEnv, Compiler, variables as nodeVariables } from './expression.js';
import { Numerics, SOLVE, solveMeldung } from './numerics.js';
import { Fmt } from './fmt.js';

/// Zufällige Kennung (UUID Version 4, Großbuchstaben wie Swift „uuidString“)
function newID() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') {
    try { return c.randomUUID().toUpperCase(); } catch (e) { /* unsicherer Kontext → Ersatz unten */ }
  }
  const b = [];
  for (let i = 0; i < 16; i++) b.push(Math.floor(Math.random() * 256));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/// Neue Formel { id, name, text, note }
export function solverEquation(name, text, note = '') {
  return { id: newID(), name: String(name), text: String(text), note: String(note) };
}

/// Standardformeln (Kennungen wie in Swift einmal je Programmstart vergeben)
export const DEFAULT_EQUATIONS = Object.freeze([
  solverEquation('OHM', 'U = R*I', 'Ohmsches Gesetz'),
  solverEquation('LEIST', 'P = U*I', 'Elektrische Leistung'),
  solverEquation('PRI', 'P = I^2*R', 'Leistung aus Strom und Widerstand'),
  solverEquation('LEIT', 'R = ρ*l/A', 'Leiterwiderstand (ρ in Ω·mm²/m, l in m, A in mm²)'),
  solverEquation('RPAR', 'R = R_1*R_2/(R_1+R_2)', 'Parallelschaltung zweier Widerstände'),
  solverEquation('TEIL', 'U_2 = U*R_2/(R_1+R_2)', 'Unbelasteter Spannungsteiler'),
  solverEquation('XL', 'X_L = 2*π*f*L', 'Induktiver Blindwiderstand'),
  solverEquation('XC', 'X_C = 1/(2*π*f*C)', 'Kapazitiver Blindwiderstand'),
  solverEquation('RESON', 'f_0 = 1/(2*π*√(L*C))', 'Resonanzfrequenz (Thomson)'),
  solverEquation('Z', 'Z = √(R^2 + (X_L - X_C)^2)', 'Scheinwiderstand RLC-Reihenschaltung'),
  solverEquation('TAU', 'τ = R*C', 'Zeitkonstante RC-Glied'),
  solverEquation('LADE', 'u = U_0*(1 - e^(-t/τ))', 'Kondensator laden'),
  solverEquation('WIRK', 'P = U*I*cos(φ)', 'Wirkleistung (φ im Winkelmodus des Rechners)'),
  solverEquation('DREH', 'P = √3*U*I*cos(φ)', 'Drehstrom-Wirkleistung'),
].map((e) => Object.freeze(e)));

/// Winkelfaktor: 'deg' → π/180, 'grad' → π/200, sonst 1 (Zahl = Faktor selbst)
function angleFactor(angle) {
  if (typeof angle === 'number' && Number.isFinite(angle)) return angle;
  switch (String(angle).toLowerCase()) {
    case 'deg': return Math.PI / 180;
    case 'grad': return Math.PI / 200;
    default: return 1;
  }
}

/// Wert einer Variablen aus Objekt oder Map (nur reelle Zahlen, sonst undefined)
function lookup(vars, name) {
  if (!vars) return undefined;
  const v = vars instanceof Map ? vars.get(name)
    : (Object.prototype.hasOwnProperty.call(vars, name) ? vars[name] : undefined);
  return typeof v === 'number' ? v : undefined;
}

function isEquation(e) {
  return e !== null && typeof e === 'object' && typeof e.name === 'string' && typeof e.text === 'string';
}

export class SolverModel {
  constructor() {
    this.equations = DEFAULT_EQUATIONS.map((e) => ({ ...e }));
    this.selected = null;
    this.status = {};          // Formel-id + Variable → „✓ gelöst“ bzw. Meldung
    this.onChange = null;
  }

  _notify() {
    if (typeof this.onChange === 'function') this.onChange();
  }

  equation(id) {
    return this.equations.find((e) => e.id === id) ?? null;
  }

  /// Formel-Objekt oder Kennung → Formel (unbekannte Kennung → leere Formel)
  _eq(eq) {
    if (typeof eq === 'string') return this.equation(eq) ?? { id: eq, name: '', text: '', note: '' };
    return eq ?? { id: '', name: '', text: '', note: '' };
  }

  /// Linke und rechte Seite; ohne „=“ gilt Term = 0
  parse(eq) {
    const e = this._eq(eq);
    const toks = Tokenizer.tokenize(e.text, 'solver');
    // wie split(separator: .sym("="), omittingEmptySubsequences: false)
    const parts = [[]];
    for (const t of toks) {
      if (t.t === 'sym' && t.c === '=') parts.push([]);
      else parts[parts.length - 1].push(t);
    }
    if (parts.length === 1) return [Parser.parseTokens(parts[0], 'solver'), N.num(0)];
    if (parts.length !== 2) throw new MathError('Nur ein „=“ erlaubt');
    return [Parser.parseTokens(parts[0], 'solver'), Parser.parseTokens(parts[1], 'solver')];
  }

  variables(eq) {
    let l, r;
    try { [l, r] = this.parse(eq); } catch (e) { return []; }
    const out = [];
    for (const v of [...nodeVariables(l), ...nodeVariables(r)]) if (!out.includes(v)) out.push(v);
    return out;
  }

  error(eq) {
    try {
      this.parse(eq);
      return null;
    } catch (e) {
      return e instanceof MathError ? e.message : 'Ungültige Formel';
    }
  }

  /// Gesuchte Größe lösen; vars: Objekt (oder Map) Name → Zahl, angleMode: 'deg' | 'rad' | 'grad'
  /// Rückgabe { x, fx, status } oder null (Formel ungültig)
  solve(eq, unknown, vars, angleMode) {
    let l, r;
    try { [l, r] = this.parse(eq); } catch (e) { return null; }
    const h = Algebra.applyAngle(N.sub(l, r), angleFactor(angleMode));
    const env = new ParamEnv();
    for (const v of this.variables(eq)) if (v !== unknown) env.set(v, lookup(vars, v) ?? 0);
    let f;
    try { f = new Compiler({ variable: unknown, env }).compile(h); } catch (e) { return null; }
    const guess = lookup(vars, unknown) ?? 1;
    return Numerics.solve(f, guess === 0 ? 1 : guess);
  }

  // MARK: Hilfen für die Oberfläche (wie die Knöpfe der SolverView)

  /// Statusmeldung zu einem Ergebnis
  statusText(result) {
    if (!result) return '';
    return result.status === SOLVE.root ? '✓ gelöst' : solveMeldung(result.status);
  }

  /// Lösen wie in der Ansicht: bei endlichem Ergebnis den Wert in vars schreiben, Status merken.
  /// Rückgabe { result, tape /*„SOLVE OHM: I = 5“ oder null*/, status } oder null
  solveInto(eq, unknown, vars, angleMode) {
    const e = this._eq(eq);
    const r = this.solve(e, unknown, vars, angleMode);
    if (!r) return null;
    let tape = null;
    if (Number.isFinite(r.x)) {
      if (vars instanceof Map) vars.set(unknown, r.x); else if (vars) vars[unknown] = r.x;
      tape = `SOLVE ${e.name}: ${unknown} = ${Fmt.num(r.x, 10)}`;
    }
    const status = this.statusText(r);
    this.status[e.id + unknown] = status;
    this._notify();
    return { result: r, tape, status };
  }

  /// „+“: neue Formel „NEU“ anlegen und auswählen
  addEquation() {
    const eq = solverEquation('NEU', 'y = m*x + b', '');
    this.equations = [...this.equations, eq];
    this.selected = eq.id;
    this._notify();
    return eq;
  }

  /// „−“: Formel entfernen, danach die erste auswählen
  removeEquation(id) {
    this.equations = this.equations.filter((e) => e.id !== id);
    this.selected = this.equations.length > 0 ? this.equations[0].id : null;
    this._notify();
  }

  /// „Standardformeln“: fehlende Standardformeln (nach Namen) anhängen
  addDefaults() {
    const add = DEFAULT_EQUATIONS.filter((d) => !this.equations.some((e) => e.name === d.name)).map((d) => ({ ...d }));
    this.equations = [...this.equations, ...add];
    this._notify();
  }

  /// Formel verschieben (Liste umsortieren)
  moveEquation(from, to) {
    if (from < 0 || from >= this.equations.length) return;
    const list = [...this.equations];
    const [e] = list.splice(from, 1);
    list.splice(Math.max(0, Math.min(to, list.length)), 0, e);
    this.equations = list;
    this._notify();
  }

  /// Formel ändern (name, text, note)
  updateEquation(id, patch) {
    const e = this.equation(id);
    if (!e || !patch) return;
    for (const k of ['name', 'text', 'note']) if (typeof patch[k] === 'string') e[k] = patch[k];
    this._notify();
  }

  // MARK: Zustand

  get state() {
    return { equations: this.equations.map((e) => ({ id: e.id, name: e.name, text: e.text, note: e.note ?? '' })), selected: this.selected };
  }

  /// Laden: { equations, selected } oder nur die Formelliste (wie Swift „solver: [SolverEquation]“)
  restore(obj) {
    const list = Array.isArray(obj) ? obj : (obj && Array.isArray(obj.equations) ? obj.equations : null);
    if (!list) throw new Error('Solver-Zustand ungültig');
    this.equations = list.filter(isEquation).map((e) => ({
      id: typeof e.id === 'string' && e.id !== '' ? e.id : newID(),
      name: e.name, text: e.text, note: typeof e.note === 'string' ? e.note : '',
    }));
    const sel = !Array.isArray(obj) && obj ? obj.selected : null;
    this.selected = typeof sel === 'string' && this.equation(sel) ? sel : null;
    this._notify();
  }
}
