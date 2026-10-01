// analysis.js – Reiter „Analysis“: Ableitungen f′, f″, f‴ als Formel, Werte und Tangente/Normale
// an einer Stelle; Integral: Stammfunktion, bestimmtes Integral, Flächeninhalt (auch zwischen zwei
// Graphen) und die Kennwerte der Elektrotechnik: Mittelwert, Gleichrichtwert, Effektivwert,
// Scheitelwert, Form- und Scheitelfaktor.
// (Portierung von AnalysisView.swift → AnalysisModel; die Ansicht selbst steht in js/ui/tools-ui.js)
//
// Datenformen (Swift-Tupel → Arrays):
//   out.values   = [[„f(1)“, Wert], [„f′(1)“, Wert], [„f″(1)“, Wert]]
//   out.tangent  = [m, b] | null        (t(x) = m·x + b)
//   out.normal   = [m, b] | null
//   out.pieces   = [[von, bis, Teilintegral], …]
//   Optionale Swift-Werte (Double?, String?) → Zahl bzw. Text oder null
import { MathError, N, Parser, Algebra, Compiler, variables, evaluateConstant, characters } from './expression.js';
import { Numerics, CurveAnalysis } from './numerics.js';
import { Symbolic } from './symbolic.js';
import { Fmt } from './fmt.js';

// MARK: - Hilfen (Swift-Semantik)

/// Swift.max(x, y): bei Gleichstand bzw. NaN im ersten Argument gewinnt y, bei NaN im zweiten x
function smax(x, y) { return y >= x ? y : x; }
/// Swift.min(x, y)
function smin(x, y) { return y < x ? y : x; }
/// Swift.max(x, y, z)
function smax3(x, y, z) { return smax(smax(x, y), z); }

/// wie Swift trimmingCharacters(in: .whitespaces): Leerzeichen (Kategorie Zs) und Tabulator, keine Zeilenumbrüche
function trimWS(s) {
  return String(s).replace(/^[\t\p{Zs}]+|[\t\p{Zs}]+$/gu, '');
}

/// Texte gleich wie Swift „==“ (kanonische Äquivalenz: „é“ als ein Zeichen = „e“ + Akzent)
function sameText(a, b) {
  return a === b || a.normalize('NFD') === b.normalize('NFD');
}

/// Übersetzen wie `try? comp.compile(n)` – null statt Ausnahme
function tryCompile(comp, n) {
  try {
    return comp.compile(n);
  } catch (e) {
    return null;
  }
}

/// `try? evaluateConstant(t)` – null statt Ausnahme
function tryConstant(t) {
  try {
    return evaluateConstant(String(t ?? ''));
  } catch (e) {
    return null;
  }
}

/// Größter bzw. kleinster Wert einer Liste wie Swift `max()`/`min()` (null bei leerer Liste)
function listMax(a) {
  if (a.length === 0) return null;
  let m = a[0];
  for (let i = 1; i < a.length; i++) if (m < a[i]) m = a[i];
  return m;
}
function listMin(a) {
  if (a.length === 0) return null;
  let m = a[0];
  for (let i = 1; i < a.length; i++) if (a[i] < m) m = a[i];
  return m;
}

/// Ausgabe mit den Anfangswerten von `Output` in Swift
function emptyOutput() {
  return {
    name: 'f',
    variable: 'x',
    source: null,
    fPretty: '',
    derivs: [],
    derivInput: [],
    notes: [],
    x0: null,
    values: [],
    tangent: null,
    normal: null,
    F: null,
    FInput: null,
    aVal: null,
    bVal: null,
    integral: null,
    exact: null,
    pole: false,
    zeros: [],
    pieces: [],
    area: null,
    gName: null,
    mean: null,
    rectified: null,
    rms: null,
    peak: null,
  };
}

const DEF_RE = /^\s*([A-Za-z](?:_?[0-9]+)?)\s*\(\s*([A-Za-zα-ωΑ-Ω])\s*\)\s*=(.*)$/;

const FIELDS = ['text', 'x0', 'a', 'b', 'g'];
const DEFAULTS = Object.freeze({ text: 'f(x) = 0.5x^3 - 3x + 1', x0: '1', a: '0', b: '2', g: '' });

// MARK: - Modell

export class AnalysisModel {
  constructor() {
    this._text = DEFAULTS.text;
    this._x0 = DEFAULTS.x0;
    this._a = DEFAULTS.a;
    this._b = DEFAULTS.b;
    this._g = DEFAULTS.g;
    /// wird nach jeder Änderung eines Eingabefelds aufgerufen (setzt app.js)
    this.onChange = null;
    this._cache = null;
  }

  // Eingabefelder (wie @Published in Swift: Änderung → onChange)
  get text() { return this._text; }
  set text(v) { this._set('_text', v); }
  get x0() { return this._x0; }
  set x0(v) { this._set('_x0', v); }
  get a() { return this._a; }
  set a(v) { this._set('_a', v); }
  get b() { return this._b; }
  set b(v) { this._set('_b', v); }
  get g() { return this._g; }
  set g(v) { this._set('_g', v); }

  _set(key, v) {
    const s = v === null || v === undefined ? '' : String(v);
    if (this[key] === s) return;
    this[key] = s;
    this._notify();
  }

  _notify() {
    if (typeof this.onChange === 'function') this.onChange();
  }

  /// Name, Variable und Term aus „f(x) = …“, „y = …“ oder „…“ → [name, variable | null, term]
  static split(t) {
    const s = trimWS(t ?? '');
    const m = DEF_RE.exec(s);
    if (m) return [m[1], m[2], m[3] ?? ''];
    // „y = …“ (auch „y  = …“): zwischen „y“ und dem ersten „=“ nur Leerraum
    const chars = characters(s);
    if (chars.length > 0 && chars[0] === 'y') {
      const eq = chars.indexOf('=');
      if (eq >= 1 && trimWS(chars.slice(1, eq).join('')) === '') {
        return ['f', 'x', chars.slice(eq + 1).join('')];
      }
    }
    return ['f', null, s];
  }

  /// Alle Ausgaben des Reiters → { ok: true, out } | { ok: false, error }  (error: Meldungstext)
  compute(graph) {
    try {
      return { ok: true, out: this._compute(graph) };
    } catch (e) {
      if (e instanceof MathError) return { ok: false, error: e.message };
      return { ok: false, error: 'Ungültiger Term' };
    }
  }

  /// Wie compute, aber mit Zwischenspeicher: rechnet nur neu, wenn sich Eingaben, Graph-Zeilen,
  /// Parameterwerte, Winkelmodus oder das Dezimaltrennzeichen geändert haben (für refresh() der Oberfläche).
  /// Das gelieferte Ergebnis nicht verändern.
  cachedCompute(graph) {
    let key = null;
    try {
      key = JSON.stringify([this._text, this._x0, this._a, this._b, this._g, graph.revision,
        graph.paramValues, graph.angleFactor, Fmt.comma]);
    } catch (e) {
      key = null;
    }
    if (key !== null && this._cache && this._cache.graph === graph && this._cache.key === key) return this._cache.result;
    const result = this.compute(graph);
    this._cache = key === null ? null : { graph, key, result };
    return result;
  }

  _compute(graph) {
    const out = emptyOutput();
    const [name, varOpt, bodyText] = AnalysisModel.split(this._text);
    out.name = name;
    if (trimWS(bodyText) === '') throw new MathError('Bitte einen Funktionsterm eingeben.');
    const fnNames = new Set(graph.functionNames);
    const others = new Set(fnNames);
    others.delete(name);
    let node = Parser.parse(bodyText, 'graph', others);
    const vars = variables(node);
    const v = varOpt ?? (vars.includes('x') || !vars.includes('t') ? 'x' : 't');
    out.variable = v;
    const src = graph.functions.find((c) => c.name === name);
    if (src) {
      const row = graph.rows.find((r) => r.id === src.id);
      if (sameText(trimWS(this._text), row ? trimWS(row.text) : '')) out.source = name;
    }
    node = Algebra.applyAngle(node, graph.angleFactor);
    const params = Object.assign(Object.create(null), graph.paramValues);
    delete params[v];
    const has = (k) => params[k] !== undefined && params[k] !== null;
    const usedParams = vars.filter((p) => has(p) && p !== v);
    if (usedParams.length > 0) {
      out.notes.push('Parameter aus dem Graph eingesetzt: ' + usedParams.map((p) => `${p} = ${Fmt.num(params[p], 4)}`).join(', '));
    }
    const defs = graph.inlineDefinitions();
    node = Symbolic.inline(node, defs, params);
    const unknown = variables(node).filter((u) => u !== v);
    if (unknown.length > 0) {
      out.notes.push('Unbekannt, mit 1 angenommen: ' + unknown.join(', '));
      for (const u of unknown) node = Symbolic.substitute(node, u, N.num(1));
    }
    const comp = new Compiler({ variable: v });
    const n1 = Algebra.derive(node, v), n2 = Algebra.derive(n1, v), n3 = Algebra.derive(n2, v);
    const f = tryCompile(comp, node), d1 = tryCompile(comp, n1), d2 = tryCompile(comp, n2);
    if (f === null || d1 === null || d2 === null || tryCompile(comp, n3) === null) {
      throw new MathError('Term kann nicht ausgewertet werden');
    }
    out.fPretty = Symbolic.pretty(node, v);
    out.derivs = [n1, n2, n3].map((n) => Symbolic.pretty(n, v));
    out.derivInput = [n1, n2].map((n) => Symbolic.inputText(n, v));

    // Stelle x₀ (Rundungsrauschen wie 6·10⁻¹² am Scheitel → 0)
    const local = (g, x) => {
      const y = g(x);
      const h = 1e-3 * smax(Math.abs(x), 1e-9);
      const ref = smax3(Math.abs(g(x - h)), Math.abs(g(x + h)), Math.abs(y));
      return Number.isFinite(y) && Math.abs(y) < 1e-9 * ref ? 0 : y;
    };
    const x0 = tryConstant(this._x0);
    if (x0 !== null && Number.isFinite(x0)) {
      out.x0 = x0;
      const y0 = local(f, x0), m = local(d1, x0);
      const xt = Fmt.num(x0, 6);
      out.values = [[`${name}(${xt})`, y0], [`${name}′(${xt})`, m], [`${name}″(${xt})`, local(d2, x0)]];
      if (Number.isFinite(y0) && Number.isFinite(m)) {
        out.tangent = [m, y0 - m * x0];
        if (m !== 0) out.normal = [-1 / m, y0 + x0 / m];
      }
    }

    // Stammfunktion
    const F = Symbolic.antiderivative(node, v);
    if (F !== null) {
      out.F = Symbolic.pretty(F, v);
      out.FInput = Symbolic.inputText(F, v);
      const fa = tryConstant(this._a), fb = tryConstant(this._b);
      const Ff = fa !== null && fb !== null ? tryCompile(comp, F) : null;
      if (Ff !== null) {
        const e = Ff(fb) - Ff(fa);
        if (Number.isFinite(e)) out.exact = e;
      }
    }

    // bestimmtes Integral, Fläche, Kennwerte
    const av = tryConstant(this._a), bv = tryConstant(this._b);
    if (av === null || bv === null || !Number.isFinite(av) || !Number.isFinite(bv) || av === bv) return out;
    const lo = smin(av, bv), hi = smax(av, bv);
    out.aVal = av;
    out.bVal = bv;
    const samples = [];
    for (let i = 0; i <= 600; i++) {
      const y = f(lo + (hi - lo) * i / 600);
      if (!Number.isFinite(y)) out.pole = true; else samples.push(Math.abs(y));
    }
    samples.sort((p, q) => p - q);
    if (samples.length > 0) {
      const med = samples[Math.floor(samples.length / 2)], mx = samples[samples.length - 1];
      if (mx > 1e7 * smax(med, 1e-12)) out.pole = true;
    }
    const I = Numerics.integrate(f, av, bv);
    out.integral = Number.isFinite(I.value) ? I.value : null;
    if (out.pole) out.exact = null;

    // zweite Funktion für Fläche zwischen Graphen
    let h = f;
    let dh = d1;
    if (trimWS(this._g) !== '') {
      const [gn, , gBody] = AnalysisModel.split(this._g);
      let gNode0 = null;
      try {
        gNode0 = Parser.parse(gBody, 'graph', fnNames);
      } catch (e) {
        gNode0 = null;
      }
      if (gNode0 !== null) {
        let gNode = Algebra.applyAngle(gNode0, graph.angleFactor);
        gNode = Symbolic.inline(gNode, defs, params);
        const gf = tryCompile(comp, gNode);
        let gd = null;
        if (gf !== null) {
          try {
            gd = comp.compile(Algebra.derive(gNode, v));
          } catch (e) {
            gd = null;
          }
        }
        if (gf !== null && gd !== null) {
          h = (x) => f(x) - gf(x);
          dh = (x) => d1(x) - gd(x);
          out.gName = gn === 'f' && AnalysisModel.split(this._g)[1] === null ? 'g' : gn;
        }
      } else {
        out.notes.push('Zweite Funktion ungültig – Fläche mit der x-Achse berechnet');
      }
    }
    const ys = [];
    for (let i = 0; i <= 300; i++) {
      const y = h(lo + (hi - lo) * i / 300);
      if (Number.isFinite(y)) ys.push(y);
    }
    const yScale = smax((listMax(ys) ?? 1) - (listMin(ys) ?? 0), 1e-12);
    const zs = CurveAnalysis.zeros(h, dh, lo, hi, 3000, yScale)
      .filter((z) => z > lo + 1e-12 * (hi - lo) && z < hi - 1e-12 * (hi - lo));
    out.zeros = zs;
    const cuts = [lo, ...zs, hi];
    let area = 0;
    for (let i = 0; i < cuts.length - 1; i++) {
      const p = Numerics.integrate(h, cuts[i], cuts[i + 1]).value;
      out.pieces.push([cuts[i], cuts[i + 1], p]);
      area += Math.abs(p);
    }
    out.area = Number.isFinite(area) ? area : null;
    // Integral ≈ 0 bei symmetrischen Flächen (Sinus über eine Periode)
    if (out.integral !== null && area > 0 && Math.abs(out.integral) < 1e-12 * area) out.integral = 0;
    if (out.exact !== null && area > 0 && Math.abs(out.exact) < 1e-12 * area) out.exact = 0;

    // Kennwerte (nur für f selbst)
    const T = hi - lo;
    const absInt = zeroCuts(f, d1, lo, hi).reduce((s, c) => s + Math.abs(Numerics.integrate(f, c[0], c[1]).value), 0);
    const sq = Numerics.integrate((x) => { const y = f(x); return y * y; }, lo, hi).value;
    const Ival = out.integral ?? I.value;
    out.mean = Number.isFinite(Ival / (bv - av)) ? Ival / (bv - av) : null;
    out.rectified = Number.isFinite(absInt / T) ? absInt / T : null;
    out.rms = sq >= 0 && Number.isFinite(sq / T) ? Math.sqrt(sq / T) : null;
    let peakX = lo, peak = 0;
    for (let i = 0; i <= 2000; i++) {
      const x = lo + T * i / 2000;
      const y = Math.abs(f(x));
      if (Number.isFinite(y) && y > peak) { peak = y; peakX = x; }
    }
    const refined = CurveAnalysis.goldenMin((x) => -Math.abs(f(x)), smax(lo, peakX - T / 2000), smin(hi, peakX + T / 2000));
    peak = smax(peak, Math.abs(f(refined)));
    out.peak = Number.isFinite(peak) ? peak : null;
    return out;
  }

  /// Zustand zum Sichern (JSON-tauglich)
  get state() {
    return { text: this._text, x0: this._x0, a: this._a, b: this._b, g: this._g };
  }

  /// Zustand laden. Wie das Decodieren in Swift nur, wenn alle fünf Felder Texte sind; sonst Fehler
  /// und nichts wird geändert (wie GraphModel.restore und SolverModel.restore).
  restore(s) {
    if (s === null || typeof s !== 'object' || FIELDS.some((k) => typeof s[k] !== 'string')) {
      throw new Error('Analysis-Zustand ungültig');
    }
    const changed = FIELDS.some((k) => this['_' + k] !== s[k]);
    for (const k of FIELDS) this['_' + k] = s[k];
    if (changed) this._notify();
  }

  /// Anfangszustand (wie analysis.restore(AnalysisModel().state) beim Zurücksetzen)
  reset() {
    this.restore({ ...DEFAULTS });
  }

  // MARK: Texte der Ansicht (AnalysisView.swift)

  /// Geradengleichung für die Anzeige: „2x − 2“, „−x + 1“, „1/2·x“, „3“ (wie line(_:_:_:) in Swift)
  static line(m, b, v) {
    let mt = Math.abs(m) === 1 ? (m < 0 ? '−' : '') : Symbolic.numText(m).replaceAll('-', '−');
    if (mt.includes('/')) mt += '·';
    let s = mt + v;
    if (m === 0) s = '';
    if (b !== 0 || s === '') {
      const bt = Symbolic.numText(Math.abs(b));
      s += s === '' ? (b < 0 ? '−' + bt : bt) : (b < 0 ? ' − ' + bt : ' + ' + bt);
    }
    return s;
  }

  /// Graph-Eingabe für Tangente/Normale: „t(x) = 2*x - 2“ (Knopf „Im Graph“)
  static plotLine(fname, m, b) {
    return `${fname}(x) = ` + Fmt.plain(m) + '*x ' + (b < 0 ? '- ' : '+ ') + Fmt.plain(Math.abs(b));
  }
}

/// Teilintervalle zwischen den Nullstellen von f in [lo, hi] → [[von, bis], …]
function zeroCuts(f, d, lo, hi) {
  const ys = [];
  for (let i = 0; i <= 300; i++) {
    const y = f(lo + (hi - lo) * i / 300);
    if (Number.isFinite(y)) ys.push(y);
  }
  const scale = smax((listMax(ys) ?? 1) - (listMin(ys) ?? 0), 1e-12);
  const zs = CurveAnalysis.zeros(f, d, lo, hi, 3000, scale).filter((z) => z > lo && z < hi);
  const cuts = [lo, ...zs, hi];
  const out = [];
  for (let i = 0; i < cuts.length - 1; i++) out.push([cuts[i], cuts[i + 1]]);
  return out;
}

/// Standardwerte der Eingabefelder (wie AnalysisModel() in Swift)
export const ANALYSIS_DEFAULTS = DEFAULTS;
