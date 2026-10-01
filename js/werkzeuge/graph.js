// graph.js – Funktionsliste im Desmos-Stil: Zeilen „f(x) = …“, „y = …“, „a = 2“ (Parameter),
// „x = 3“ (senkrechte Gerade), „P(2|3)“ (Punkt). Übersetzt die Zeilen, verwaltet Schieberegler,
// Sichtfenster, Integralfläche, Messwerte und die automatische Kurvenanalyse.
// (Portierung von GraphModel.swift; Kurvenfarben aus Theme.swift → Palette)
//
// Datenformen:
//   Zeile (FunctionRow):  { id, text, color, visible = true, features = true }   – id: UUID-Text
//   Parameter:            params[name] = { value = 1, min = −10, max = 10 }
//   Sichtfenster:         view = { xMin, xMax, yMin, yMax }
//   Integralfläche:       integral = { function, a, b, visible = true } | null
//   Zeilenart (RowKind):  {k:'empty'} {k:'function', name, variable, auto} {k:'parameter', name}
//                         {k:'vertical'} {k:'point', name /*String | null*/} {k:'invalid'}
//   Übersetzte Zeile:     CompiledRow (unten) – f, d1, d2 als (x) => Zahl, point als [x, y]
//
// Anders als in Swift (Werttypen mit didSet) dürfen Oberflächen Zeilen und Einstellungen auch direkt
// ändern (row.text = …, settings.degrees = …): Vor jedem Lesezugriff auf die übersetzten Zeilen wird
// geprüft, ob sich Zeilen oder der Winkelmodus seit dem letzten Übersetzen geändert haben, und dann
// neu übersetzt – das entspricht dem „didSet { recompile() }“ der Swift-Fassung.
import {
  MathError, N, Parser, Algebra, ParamEnv, FunctionBox, Compiler,
  nodeToString, variables, userFunctions, evaluateConstant, characters,
} from './expression.js';
import { Numerics, CurveAnalysis, FEATURE, makeFeature } from './numerics.js';
import { Fmt } from './fmt.js';

// MARK: - Kurvenfarben (Theme.swift → Palette)

/// Kurvenfarben hell (Reihenfolge = Farbfehlsichtigkeits-Sicherung, nicht umsortieren)
export const PALETTE_LIGHT = Object.freeze(['#2A78D6', '#EB6834', '#1BAF7A', '#EDA100', '#E87BA4', '#008300', '#4A3AA7', '#E34948']);
export const PALETTE_DARK = Object.freeze(['#3987E5', '#D95926', '#199E70', '#C98500', '#D55181', '#008300', '#9085E9', '#E66767']);
export const PALETTE_NAMES = Object.freeze(['Blau', 'Orange', 'Türkis', 'Gelb', 'Magenta', 'Grün', 'Violett', 'Rot']);
/// Strichmuster für den Schwarz-Weiß-Druck (je Farbplatz)
export const PALETTE_DASHES = Object.freeze([[], [7, 4], [2, 3], [9, 3, 2, 3], [4, 4], [12, 4], [1.5, 2.5, 6, 2.5], [3, 6]]);

/// Farbe zum Farbplatz i (auch negative oder zu große Plätze werden umgebrochen)
export function paletteColor(i, dark = false) {
  const list = dark ? PALETTE_DARK : PALETTE_LIGHT;
  const n = list.length;
  return list[(((Math.trunc(i) || 0) % n) + n) % n];
}

// MARK: - Hilfen

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

const hasOwn = (o, k) => o !== null && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k);
const isNum = (v) => typeof v === 'number' && !Number.isNaN(v);

/// wie Swift trimmingCharacters(in: .whitespaces): Leerzeichen (Kategorie Zs) und Tabulator, keine Zeilenumbrüche
function trimWS(s) {
  return s.replace(/^[\t\p{Zs}]+|[\t\p{Zs}]+$/gu, '');
}

/// Runden „halb von 0 weg“ wie Swift x.rounded()
function roundHalfAway(x) {
  return Math.sign(x) * Math.round(Math.abs(x));
}

/// Neue Zeile { id, text, color, visible, features }
export function functionRow(text = '', color = 0) {
  return { id: newID(), text: String(text), color, visible: true, features: true };
}

/// Zeile vervollständigen (fehlende Kennung, Sichtbarkeit …); ändert das Objekt selbst
function normalizeRow(r) {
  const row = (r !== null && typeof r === 'object') ? r : { text: r === null || r === undefined ? '' : String(r) };
  if (typeof row.id !== 'string' || row.id === '') row.id = newID();
  if (typeof row.text !== 'string') row.text = row.text === null || row.text === undefined ? '' : String(row.text);
  if (!Number.isInteger(row.color)) row.color = isNum(row.color) ? Math.trunc(row.color) : 0;
  if (typeof row.visible !== 'boolean') row.visible = true;
  if (typeof row.features !== 'boolean') row.features = true;
  return row;
}

function snapshotRows(rows) {
  return rows.map((r) => ({ id: r.id, text: r.text, color: r.color, visible: r.visible, features: r.features }));
}

/// Zeilen gleich wie Swift „FunctionRow: Equatable“ (alle Felder)
function rowsEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
    if (x.id !== y.id || x.text !== y.text || x.color !== y.color || x.visible !== y.visible || x.features !== y.features) return false;
  }
  return true;
}

function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function defaultView() {
  return { xMin: -10, xMax: 10, yMin: -7, yMax: 7 };
}

export function defaultSettings() {
  return { grid: true, features: true, inflections: true, allLabels: false, degrees: false, piAxis: false, decimals: 3, curveNames: true };
}

export function defaultParam() {
  return { value: 1, min: -10, max: 10 };
}

/// Breite und Höhe eines Sichtfensters (Viewport.width/height in Swift)
export function viewWidth(v) { return v.xMax - v.xMin; }
export function viewHeight(v) { return v.yMax - v.yMin; }

/// Standardansicht −10 … 10 mit gleichen Einheiten auf beiden Achsen
function standardViewFor(size) {
  const aspect = size && size.width > 0 ? size.height / size.width : 0.7;
  return { xMin: -10, xMax: 10, yMin: -10 * aspect, yMax: 10 * aspect };
}

// MARK: - Zeilenarten

const KIND = {
  empty: Object.freeze({ k: 'empty' }),
  invalid: Object.freeze({ k: 'invalid' }),
  vertical: Object.freeze({ k: 'vertical' }),
  fn: (name, variable, auto) => ({ k: 'function', name, variable, auto }),
  parameter: (name) => ({ k: 'parameter', name }),
  point: (name) => ({ k: 'point', name }),
};

/// Übersetzte Zeile (CompiledRow in Swift)
export class CompiledRow {
  constructor({ id, kind = KIND.empty, name = '', variable = 'x', color = 0, visible = true, features = true } = {}) {
    this.id = id;
    this.kind = kind;
    this.name = name;
    this.variable = variable;
    this.body = null;        // Syntaxbaum (Funktion, senkrechte Gerade, Punkt)
    this.f = null;
    this.d1 = null;
    this.d2 = null;
    this.exact = true;       // Ableitungen exakt (ohne numerische Ableitung und ohne Benutzerfunktionen)
    this.error = null;
    this.constant = null;    // Wert einer Parameterzeile bzw. x einer senkrechten Geraden
    this.point = null;       // [x, y]
    this.color = color;
    this.visible = visible;
    this.features = features;
    this.params = [];
  }

  get isFunction() { return this.kind.k === 'function' && this.f !== null; }
  /// „f(x)“
  get label() { return `${this.name}(${this.variable})`; }
}

// MARK: - Übersetzen: Muster

const DEF_RE = /^\s*([A-Za-z](?:_?[0-9]+)?)\s*\(\s*([A-Za-zα-ωΑ-Ω])\s*\)\s*=(.*)$/;
const PARAM_RE = /^\s*([A-Za-zα-ωΑ-Ω])\s*=(.*)$/;
const POINT_RE = /^\s*([A-Z][A-Za-z0-9_]*)?\s*\((.*)\)\s*$/;

/// Treffer als Liste (nicht beteiligte Gruppen → „“) oder null
function match(re, s) {
  const m = re.exec(s);
  if (!m) return null;
  return Array.from(m, (g) => (g === undefined ? '' : g));
}

/// Punkt „(2|3)“, „(2; 3)“, „P(2|3)“ – Trennzeichen auf oberster Klammerebene
function splitPoint(inner) {
  const chars = characters(inner);
  let depth = 0;
  const bars = [];
  const semis = [];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (c === '(') depth += 1; else if (c === ')') depth -= 1;
    if (depth === 0) {
      if (c === '|') bars.push(i);
      if (c === ';') semis.push(i);
    }
  }
  let sep;
  if (semis.length === 1) sep = semis[0]; else if (bars.length === 1) sep = bars[0]; else return null;
  return [chars.slice(0, sep).join(''), chars.slice(sep + 1).join('')];
}

function containsND(n) { return nodeToString(n).includes('nd('); }
function containsUser(n) { return userFunctions(n).size > 0; }

// MARK: - Analyseergebnis

/// { perRow: Map Zeilen-id → Feature[], intersections: Feature[], all() }
function makeAnalysis(perRow, intersections) {
  return {
    perRow,
    intersections,
    all() {
      const out = [];
      for (const fs of this.perRow.values()) out.push(...fs);
      return out.concat(this.intersections);
    },
  };
}

// MARK: - Modell

export class GraphModel {
  static AUTO_NAMES = Object.freeze(['f', 'g', 'h', 'p', 'q', 'r', 's', 'u', 'v', 'w', 'k', 'm', 'n', 'l', 'j', 'i', 'o', 'z']);

  constructor() {
    this._rows = [];
    this.params = {};                  // Name → { value, min, max }
    this.view = defaultView();
    this._settings = defaultSettings();
    this.integral = null;
    this.statPoints = [];              // Messwerte [[x, y], …]
    this.selectedFeature = null;
    this.pinned = new Set();

    this._compiled = [];
    this._env = new ParamEnv();
    this._defs = new Map();            // Name → { node, variable }
    this._boxes = new Map();
    this._badNames = new Set();
    this._pointNodes = new Map();      // Zeilen-id → [Knoten x, Knoten y]
    this._revision = 0;
    this._paramRevision = 0;
    this._cache = null;
    this._printCache = null;
    this._snapshot = [];               // Zeilen beim letzten Übersetzen
    this._compiledDegrees = false;

    this._freeParams = [];
    /// Größe der Zeichenfläche am Bildschirm (für das Seitenverhältnis im PDF)
    this.canvasSize = { width: 900, height: 620 };
    this.onChange = null;
  }

  _notify() {
    if (typeof this.onChange === 'function') this.onChange();
  }

  /// Übersetzt neu, wenn Zeilen oder Winkelmodus seit dem letzten Übersetzen geändert wurden
  _sync() {
    if (this._settings.degrees !== this._compiledDegrees || !rowsEqual(this._rows, this._snapshot)) this._recompile();
  }

  // MARK: Zeilen und Einstellungen

  get rows() { return this._rows; }
  set rows(v) { this.setRows(v); }

  /// Zeilen ersetzen und (bei Änderung) neu übersetzen
  setRows(rows) {
    this._rows = Array.isArray(rows) ? rows.map(normalizeRow) : [];
    this._sync();
    this._notify();
  }

  /// Felder einer Zeile ändern (text, color, visible, features)
  updateRow(id, patch) {
    const row = this._rows.find((r) => r.id === id);
    if (!row || !patch) return;
    for (const k of ['text', 'color', 'visible', 'features']) if (hasOwn(patch, k)) row[k] = patch[k];
    normalizeRow(row);
    this._sync();
    this._notify();
  }

  get settings() { return this._settings; }
  set settings(s) {
    const d = defaultSettings();
    const out = {};
    for (const k of Object.keys(d)) out[k] = (s && typeof s[k] === typeof d[k]) ? s[k] : d[k];
    this._settings = out;
    this._sync();
    this._notify();
  }

  /// Einzelne Einstellung ändern (Winkel in Grad → neu übersetzen)
  setSetting(key, value) {
    this._settings[key] = value;
    this._sync();
    this._notify();
  }

  /// Parameter, die in Funktionen vorkommen, aber nicht als Zeile „a = …“ definiert sind
  get freeParams() { this._sync(); return this._freeParams; }

  get angleFactor() { return this._settings.degrees ? Math.PI / 180 : 1; }

  /// Werte der Parameter (für Schieberegler; Funktionen lesen über feste Plätze)
  get env() { this._sync(); return this._env; }

  /// Zähler für Änderungen der Übersetzung bzw. der Parameterwerte (für Oberflächen-Caches)
  get revision() { this._sync(); return this._revision; }
  get paramRevision() { return this._paramRevision; }

  // MARK: Übersetzen

  recompile() {
    this._recompile();
    this._notify();
  }

  _recompile() {
    this._revision += 1;
    this._cache = null;
    this._boxes = new Map();
    this._defs = new Map();
    this._badNames = new Set();
    this._pointNodes = new Map();
    this._snapshot = snapshotRows(this._rows);
    this._compiledDegrees = this._settings.degrees;
    const angleFactor = this.angleFactor;
    const rows = this._rows;
    const newEnv = new ParamEnv();
    const out = [];

    // 1. Namen und Arten bestimmen
    const declared = new Set();
    const paramRows = new Map();
    const pre = [];
    for (const row of rows) {
      const t = trimWS(row.text);
      if (t === '') { pre.push({ kind: KIND.empty, name: '', variable: 'x', bodyText: '' }); continue; }
      let m = match(DEF_RE, t);
      if (m) {
        declared.add(m[1]);
        pre.push({ kind: KIND.fn(m[1], m[2], false), name: m[1], variable: m[2], bodyText: m[3] });
        continue;
      }
      m = match(PARAM_RE, t);
      if (m) {
        const n = m[1];
        if (n === 'y') {
          pre.push({ kind: KIND.fn('', 'x', true), name: '', variable: 'x', bodyText: m[2] });
        } else if (n === 'x') {
          pre.push({ kind: KIND.vertical, name: 'x', variable: 'x', bodyText: m[2] });
        } else {
          pre.push({ kind: KIND.parameter(n), name: n, variable: 'x', bodyText: m[2] });
        }
        continue;
      }
      if (!t.includes('=')) {
        m = match(POINT_RE, t);
        if (m && splitPoint(m[2]) !== null) {
          pre.push({ kind: KIND.point(m[1] === '' ? null : m[1]), name: m[1], variable: 'x', bodyText: m[2] });
          continue;
        }
      }
      pre.push({ kind: KIND.fn('', 'x', true), name: '', variable: 'x', bodyText: t });
    }
    // automatische Namen
    const used = new Set(declared);
    for (let i = 0; i < pre.length; i++) {
      const k = pre[i].kind;
      if (k.k === 'function' && k.auto) {
        const n = GraphModel.AUTO_NAMES.find((c) => !used.has(c)) ?? `f${i + 1}`;
        used.add(n);
        pre[i].name = n;
        pre[i].kind = KIND.fn(n, k.variable, true);
      }
    }
    const fnNames = used;

    // 2. Parameterzeilen auswerten
    for (const p of pre) {
      if (p.kind.k !== 'parameter') continue;
      try {
        const v = evaluateConstant(p.bodyText, angleFactor);
        if (Number.isFinite(v)) paramRows.set(p.kind.name, v);
      } catch (e) { /* kein Zahlenwert */ }
    }

    // 3. Terme zerlegen
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const p = pre[i];
      const c = new CompiledRow({ id: row.id, kind: p.kind, name: p.name, variable: p.variable,
                                  color: row.color, visible: row.visible, features: row.features });
      switch (p.kind.k) {
        case 'empty':
          break;
        case 'function':
          try {
            let node = Parser.parse(p.bodyText, 'graph', fnNames);
            node = Algebra.applyAngle(node, angleFactor);
            c.body = node;
            this._defs.set(c.name, { node, variable: c.variable });
          } catch (e) {
            c.error = e instanceof MathError ? e.message : 'Ungültiger Term';
            c.kind = KIND.invalid;
          }
          break;
        case 'parameter':
          if (paramRows.has(p.kind.name)) c.constant = paramRows.get(p.kind.name);
          else { c.error = 'Wert muss eine Zahl sein'; c.kind = KIND.invalid; }
          break;
        case 'vertical':
          try {
            c.body = Algebra.applyAngle(Parser.parse(p.bodyText, 'graph', fnNames), angleFactor);
          } catch (e) {
            if (e instanceof MathError) c.error = e.message;
            c.kind = KIND.invalid;
          }
          break;
        case 'point': {
          const sp = splitPoint(p.bodyText);
          if (sp) {
            try {
              const na = Algebra.applyAngle(Parser.parse(sp[0], 'graph'), angleFactor);
              const nb = Algebra.applyAngle(Parser.parse(sp[1], 'graph'), angleFactor);
              c.body = N.add(na, N.mul(nb, N.num(0)));   // nur für Parameterliste
              c.point = [0, 0];
              this._pointNodes.set(row.id, [na, nb]);
            } catch (e) {
              if (e instanceof MathError) c.error = e.message;
              c.kind = KIND.invalid;
            }
          }
          break;
        }
        default:
          break;
      }
      out.push(c);
    }

    // 4. Zirkelbezüge
    const state = new Map();   // 1 = in Arbeit, 2 = fertig
    const visit = (n) => {
      if (state.get(n) === 2) return true;
      if (state.get(n) === 1) return false;
      state.set(n, 1);
      const def = this._defs.get(n);
      for (const d of (def ? userFunctions(def.node) : [])) {
        if (!this._defs.has(d)) continue;
        if (!visit(d)) { this._badNames.add(n); state.set(n, 2); return false; }
      }
      state.set(n, 2);
      return true;
    };
    for (const n of this._defs.keys()) visit(n);

    // 5. Parameter sammeln (Reihenfolge des Auftretens)
    const paramOrder = [];
    for (const c of out) {
      if (!c.body) continue;
      for (const v of variables(c.body)) {
        if (v !== c.variable && !fnNames.has(v) && !(c.kind.k === 'vertical' && v === 'x')) {
          if (!paramOrder.includes(v)) paramOrder.push(v);
        }
      }
    }
    for (const n of [...paramRows.keys()].sort()) if (!paramOrder.includes(n)) paramOrder.push(n);
    for (const n of paramOrder) {
      let v = 1;
      if (paramRows.has(n)) v = paramRows.get(n);
      else if (hasOwn(this.params, n) && this.params[n] && isNum(this.params[n].value)) v = this.params[n].value;
      newEnv.slot(n, v);
      newEnv.set(n, v);
    }
    this._env = newEnv;
    const free = paramOrder.filter((n) => !paramRows.has(n));
    if (!arraysEqual(free, this._freeParams)) this._freeParams = free;
    // neue freie Parameter bekommen einen Schieberegler (−10 … 10, Wert 1)
    for (const n of free) if (!hasOwn(this.params, n)) this.params[n] = defaultParam();

    // 6. Übersetzen
    for (const c of out) {
      const body = c.body;
      if (!body) continue;
      c.params = variables(body).filter((v) => v !== c.variable && !fnNames.has(v));
      switch (c.kind.k) {
        case 'function': {
          if (this._badNames.has(c.name)) {
            c.error = 'Zirkelbezug';
            c.kind = KIND.invalid;
            continue;
          }
          const comp = new Compiler({ variable: c.variable, env: this._env, resolver: this });
          try {
            c.f = comp.compile(body);
            const n1 = Algebra.derive(body, c.variable);
            const n2 = Algebra.derive(n1, c.variable);
            c.exact = !containsND(n1) && !containsND(n2) && !containsUser(body);
            c.d1 = comp.compile(n1);
            c.d2 = comp.compile(n2);
          } catch (e) {
            if (e instanceof MathError) c.error = e.message;
            c.kind = KIND.invalid;
          }
          break;
        }
        case 'vertical':
          try {
            const f = new Compiler({ variable: '#', env: this._env, resolver: this }).compile(body);
            c.constant = f(0);
          } catch (e) { /* bleibt ohne Wert */ }
          break;
        default:
          break;
      }
    }
    this._compiled = out;
    this._updatePoints();
  }

  /// Punkte neu berechnen (nach Übersetzen und Schieberegler-Änderungen)
  _updatePoints() {
    for (const c of this._compiled) {
      if (c.kind.k !== 'point') continue;
      const nodes = this._pointNodes.get(c.id);
      if (!nodes) continue;
      const comp = new Compiler({ variable: '#', env: this._env, resolver: this });
      try {
        const fa = comp.compile(nodes[0]);
        const fb = comp.compile(nodes[1]);
        c.point = [fa(0), fb(0)];
      } catch (e) { /* Punkt bleibt */ }
    }
  }

  /// FunctionResolver: f, f', f'' … auf Abruf übersetzen
  box(name, order) {
    const def = this._defs.get(name);
    if (!def) return null;
    const key = `${name}#${order}`;
    const cached = this._boxes.get(key);
    if (cached) return cached;
    const b = new FunctionBox();
    this._boxes.set(key, b);
    if (this._badNames.has(name)) return b;
    let node = def.node;
    for (let i = 0; i < order; i++) node = Algebra.derive(node, def.variable);
    try {
      b.f = new Compiler({ variable: def.variable, env: this._env, resolver: this }).compile(node);
    } catch (e) { /* Box liefert NaN */ }
    return b;
  }

  // MARK: Parameter

  setParam(name, value) {
    this._sync();
    this._env.set(name, value);
    const p = hasOwn(this.params, name) && this.params[name] ? { ...defaultParam(), ...this.params[name] } : defaultParam();
    p.value = value;
    this.params[name] = p;
    this._paramRevision += 1;
    this._cache = null;
    this._updatePoints();
    this._notify();
  }

  /// Parameterzeile „a = 2,5“ per Schieberegler ändern
  setParamRow(id, name, value) {
    const row = this._rows.find((r) => r.id === id);
    if (!row) return;
    row.text = `${name} = ${Fmt.plain(roundHalfAway(value * 1000) / 1000)}`;
    this._sync();
    this._notify();
  }

  // MARK: Zugriff

  get compiled() { this._sync(); return this._compiled; }
  get functions() { return this.compiled.filter((c) => c.isFunction); }
  get functionNames() { return this.functions.map((c) => c.name); }

  /// f(x), f'(x), f''(x) … nach Namen (Striche ' oder ′); null, wenn es die Funktion nicht gibt
  evaluate(name, x) {
    let order = 0;
    let base = '';
    for (const ch of String(name)) {
      if (ch === "'" || ch === '′') order += 1; else base += ch;
    }
    if (!this.compiled.some((c) => c.name === base && c.isFunction)) return null;
    const b = this.box(base, order);
    if (!b) return null;
    return b.f(x);
  }

  /// aktuelle Parameterwerte (Schieberegler und Zeilen „a = …“) als Objekt Name → Zahl
  get paramValues() {
    this._sync();
    const d = {};
    for (const n of this._env.names()) {
      const v = this._env.get(n);
      if (v !== undefined) d[n] = v;
    }
    return d;
  }

  /// Funktionsdefinitionen zum Einsetzen (Analysis): Map Name → { node, variable }
  inlineDefinitions() {
    this._sync();
    const m = new Map();
    for (const [k, v] of this._defs) m.set(k, { node: v.node, variable: v.variable });
    return m;
  }

  /// Zeile hinzufügen; ein bereits vergebener Funktionsname wird durch einen freien ersetzt.
  /// Rückgabe: Name der Funktion im Graph (oder null)
  addFunctionRow(text) {
    let t = trimWS(String(text ?? ''));
    const m = match(DEF_RE, t);
    const compiled = this.compiled;
    if (m && compiled.some((c) => c.name === m[1])) {
      const used = new Set(compiled.map((c) => c.name));
      const base = m[1].slice(0, 1);
      let k = 1;
      let name = base;
      while (used.has(name)) { name = `${base}${k}`; k += 1; }
      t = `${name}(${m[2]}) =` + m[3];
    }
    const id = this.addRow(t);
    const c = this.compiledRow(id);
    return c ? c.name : null;
  }

  compiledRow(id) {
    return this.compiled.find((c) => c.id === id) ?? null;
  }

  // MARK: Analyse (sichtbarer Bereich)

  /// Merkmale aller sichtbaren Funktionen und ihre Schnittpunkte im Sichtfenster (vp = Druck-Sichtfenster)
  analysis(vp = null) {
    this._sync();
    const v = vp ?? this.view;
    const s = this._settings;
    const key = `${this._revision}|${this._paramRevision}|${v.xMin}|${v.xMax}|${v.yMin}|${v.yMax}|${s.inflections}|` +
      this._rows.map((r) => `${r.visible}${r.features}`).join('');
    if (this._cache && this._cache.key === key) return this._cache.value;
    if (vp !== null && this._printCache && this._printCache.key === key) return this._printCache.value;
    const perRow = new Map();
    const fns = this._compiled.filter((c) => c.isFunction && c.visible);
    for (const c of fns) {
      if (!c.features || !c.f) continue;
      const inp = { name: c.name, f: c.f, d1: c.d1, d2: c.d2, exact: c.exact };
      perRow.set(c.id, CurveAnalysis.analyze(inp, v.xMin, v.xMax, v.yMin, v.yMax, 1600, s.inflections));
    }
    let idx = 0;
    const inters = [];
    for (let i = 0; i < fns.length; i++) {
      for (let j = i + 1; j < fns.length; j++) {
        const fa = fns[i].f, fb = fns[j].f;
        if (!fa || !fb) continue;
        const a = { name: fns[i].name, f: fa, d1: fns[i].d1, d2: null, exact: fns[i].exact };
        const b = { name: fns[j].name, f: fb, d1: fns[j].d1, d2: null, exact: fns[j].exact };
        for (const [x, y] of CurveAnalysis.intersections(a, b, v.xMin, v.xMax, v.yMin, v.yMax, 1600)) {
          idx += 1;
          inters.push(makeFeature({ kind: FEATURE.intersection, x, y, fn: fns[i].name, other: fns[j].name, index: idx }));
        }
      }
      // senkrechte Geraden
      for (const c of this._compiled) {
        if (!(c.kind.k === 'vertical' && c.visible)) continue;
        const x0 = c.constant;
        const f = fns[i].f;
        if (x0 === null || !(x0 >= v.xMin) || !(x0 <= v.xMax) || !f) continue;
        const y = f(x0);
        if (Number.isFinite(y)) {
          idx += 1;
          inters.push(makeFeature({ kind: FEATURE.intersection, x: x0, y, fn: fns[i].name, other: `x=${Fmt.num(x0, 3)}`, index: idx }));
        }
      }
    }
    if (idx === 1 && inters.length > 0) inters[0].index = 0;
    const result = makeAnalysis(perRow, inters);
    if (vp === null) this._cache = { key, value: result }; else this._printCache = { key, value: result };
    return result;
  }

  /// „H(1,5 | −2)“
  label(f) {
    return f.shortName + Fmt.point(f.x, f.y, this._settings.decimals);
  }

  // MARK: Sichtfenster (size = { width, height } der Zeichenfläche in Punkten)

  pan(dx, dy, size) {
    if (!size || !(size.width > 0) || !(size.height > 0)) return;
    const v = this.view;
    const ux = viewWidth(v) / size.width, uy = viewHeight(v) / size.height;
    this.view = { xMin: v.xMin - dx * ux, xMax: v.xMax - dx * ux, yMin: v.yMin + dy * uy, yMax: v.yMax + dy * uy };
    this._notify();
  }

  /// Zoomen um den Punkt (px | py) der Zeichenfläche; auch zoom(factor, {x, y}, size)
  zoom(factor, px, py, size) {
    if (px !== null && typeof px === 'object') { size = py; py = px.y; px = px.x; }
    if (!size || !(size.width > 0) || !(size.height > 0)) return;
    const v = this.view;
    const fx = px / size.width, fy = py / size.height;
    const cx = v.xMin + fx * viewWidth(v);
    const cy = v.yMax - fy * viewHeight(v);
    const w = viewWidth(v) * factor, h = viewHeight(v) * factor;
    if (!(w > 1e-12 && w < 1e12 && h > 1e-12 && h < 1e12)) return;
    const xMin = cx - fx * w;
    const yMax = cy + fy * h;
    this.view = { xMin, xMax: xMin + w, yMin: yMax - h, yMax };
    this._notify();
  }

  zoomCenter(factor, size) {
    if (!size) return;
    this.zoom(factor, size.width / 2, size.height / 2, size);
  }

  /// Standardansicht −10 … 10 mit gleichen Einheiten auf beiden Achsen
  standardView(size) {
    this.view = standardViewFor(size);
    this._notify();
  }

  /// Gleiche Einheiten auf beiden Achsen (Mittelpunkt bleibt)
  equalAxes(size) {
    if (!size || !(size.width > 0)) return;
    const v = this.view;
    const cy = (v.yMin + v.yMax) / 2;
    const h = viewWidth(v) * (size.height / size.width);
    this.view = { xMin: v.xMin, xMax: v.xMax, yMin: cy - h / 2, yMax: cy + h / 2 };
    this._notify();
  }

  /// y-Bereich an die sichtbaren Funktionen anpassen
  fitY() {
    const v = this.view;
    const ys = [];
    for (const c of this.compiled) {
      if (!(c.isFunction && c.visible) || !c.f) continue;
      for (let i = 0; i <= 200; i++) {
        const y = c.f(v.xMin + viewWidth(v) * i / 200);
        if (Number.isFinite(y)) ys.push(y);
      }
    }
    if (!(ys.length > 4)) return;
    ys.sort((a, b) => a - b);
    const lo = ys[Math.trunc((ys.length - 1) * 0.03)], hi = ys[Math.trunc((ys.length - 1) * 0.97)];
    let span = hi - lo;
    if (span < 1e-9) span = Math.max(1, Math.abs(hi));
    this.view = { xMin: v.xMin, xMax: v.xMax, yMin: lo - span * 0.12, yMax: hi + span * 0.12 };
    this._notify();
  }

  /// Größenänderung: Maßstab und Mittelpunkt bleiben
  resize(oldSize, newSize) {
    if (!oldSize || !newSize) return;
    if (!(oldSize.width > 10 && oldSize.height > 10 && newSize.width > 10 && newSize.height > 10)) return;
    const v = this.view;
    const ux = viewWidth(v) / oldSize.width, uy = viewHeight(v) / oldSize.height;
    const cx = (v.xMin + v.xMax) / 2, cy = (v.yMin + v.yMax) / 2;
    const w = ux * newSize.width, h = uy * newSize.height;
    this.view = { xMin: cx - w / 2, xMax: cx + w / 2, yMin: cy - h / 2, yMax: cy + h / 2 };
    this._notify();
  }

  center(x, y) {
    const v = this.view;
    const w = viewWidth(v), h = viewHeight(v);
    this.view = { xMin: x - w / 2, xMax: x + w / 2, yMin: y - h / 2, yMax: y + h / 2 };
    this._notify();
  }

  // MARK: Zeilen

  nextColor() {
    const usedColors = this._rows.map((r) => r.color);
    for (let i = 0; i < PALETTE_LIGHT.length; i++) if (!usedColors.includes(i)) return i;
    return this._rows.length % PALETTE_LIGHT.length;
  }

  /// Neue Zeile am Ende; Rückgabe: ihre Kennung
  addRow(text = '') {
    const row = functionRow(text, this.nextColor());
    this._rows = [...this._rows, row];
    this._sync();
    this._notify();
    return row.id;
  }

  removeRow(id) {
    this._rows = this._rows.filter((r) => r.id !== id);
    this._sync();
    this._notify();
  }

  /// Alles entfernen: eine leere Zeile, keine Parameter, Flächen oder Messwerte, Standardansicht
  clearAll() {
    this.integral = null;
    this.statPoints = [];
    this.pinned = new Set();
    this.selectedFeature = null;
    this.params = {};
    this._rows = [functionRow('', 0)];
    this._sync();
    this.view = standardViewFor(this.canvasSize);
    this._notify();
  }

  /// Integral ∫ₐᵇ f(x) dx und Fläche im Graphen einblenden
  integrate(name, a, b) {
    this.integral = { function: name, a, b, visible: true };
    const v = this.integralValue();
    this._notify();
    return v;
  }

  integralValue() {
    this._sync();
    const s = this.integral;
    if (!s) return null;
    const b = this.box(s.function, 0);
    if (!b || !b.f) return null;
    if (!this._compiled.some((c) => c.name === s.function && c.isFunction)) return null;
    const r = Numerics.integrate(b.f, s.a, s.b);
    return Number.isFinite(r.value) ? r.value : null;
  }

  // MARK: Zustand (JSON-tauglich, Felder wie GraphModel.State in Swift)

  get state() {
    const params = {};
    for (const [k, p] of Object.entries(this.params)) {
      if (p && typeof p === 'object') params[k] = { value: p.value, min: p.min, max: p.max };
    }
    const v = this.view;
    const it = this.integral;
    return {
      rows: snapshotRows(this._rows),
      params,
      view: { xMin: v.xMin, xMax: v.xMax, yMin: v.yMin, yMax: v.yMax },
      settings: { ...this._settings },
      integral: it ? { function: it.function, a: it.a, b: it.b, visible: it.visible !== false } : null,
      statPoints: this.statPoints.map((p) => Array.from(p)),
    };
  }

  /// Zustand laden. Ohne Zeilenliste gilt der Zustand als beschädigt: Fehler, nichts wird geändert
  /// (wie Swift, wo das Dekodieren scheitert und der Graph unverändert bleibt).
  restore(obj) {
    if (!obj || typeof obj !== 'object' || !Array.isArray(obj.rows)) throw new Error('Graph-Zustand ungültig');
    const rows = obj.rows.filter((r) => r !== null && typeof r === 'object').map((r) => normalizeRow({
      id: r.id, text: r.text, color: r.color, visible: r.visible, features: r.features,
    }));
    const params = {};
    if (obj.params && typeof obj.params === 'object') {
      for (const [k, p] of Object.entries(obj.params)) {
        if (!p || typeof p !== 'object') continue;
        const d = defaultParam();
        params[k] = { value: isNum(p.value) ? p.value : d.value, min: isNum(p.min) ? p.min : d.min, max: isNum(p.max) ? p.max : d.max };
      }
    }
    let view = defaultView();
    const ov = obj.view;
    if (ov && typeof ov === 'object' && [ov.xMin, ov.xMax, ov.yMin, ov.yMax].every((x) => Number.isFinite(x))) {
      view = { xMin: ov.xMin, xMax: ov.xMax, yMin: ov.yMin, yMax: ov.yMax };
    }
    const d = defaultSettings();
    const settings = {};
    for (const k of Object.keys(d)) {
      settings[k] = (obj.settings && typeof obj.settings[k] === typeof d[k]) ? obj.settings[k] : d[k];
    }
    let integral = null;
    const oi = obj.integral;
    if (oi && typeof oi === 'object' && typeof oi.function === 'string' && isNum(oi.a) && isNum(oi.b)) {
      integral = { function: oi.function, a: oi.a, b: oi.b, visible: oi.visible !== false };
    }
    const statPoints = Array.isArray(obj.statPoints)
      ? obj.statPoints.filter((p) => Array.isArray(p)).map((p) => p.map((x) => (isNum(x) ? x : NaN)))
      : [];

    this.params = params;
    this.view = view;
    this._settings = settings;
    this.integral = integral;
    this.statPoints = statPoints;
    this._rows = rows;
    for (const [n, p] of Object.entries(this.params)) this._env.set(n, p.value);
    this._recompile();
    this._notify();
  }
}
