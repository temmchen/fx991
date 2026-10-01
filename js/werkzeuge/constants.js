// constants.js – Katalog der gängigsten Konstanten: Physik (CODATA 2018), Elektrotechnik,
// Werkstoffe (Tabellenwerte bei 20 °C), Mathematik und eigene Einträge. Nutzbar im Reiter
// „Konstanten“, am Rechner über CUSTOM (Shift 2) und im Solver („Konstante einsetzen“).
// Portierung von Constants.swift (ohne die SwiftUI-Ansicht; deren Texte stehen in CONSTANT_TEXTS).
import { Fmt } from './fmt.js';

/// Gruppen in der Reihenfolge von PhysConstant.Group.allCases; `menu` = Beschriftung im Rechner-Menü
export const GROUPS = Object.freeze([
  Object.freeze({ id: 'physik', title: 'Physik', menu: 'PHYS' }),
  Object.freeze({ id: 'etechnik', title: 'Elektrotechnik', menu: 'E-TEC' }),
  Object.freeze({ id: 'werkstoffe', title: 'Werkstoffe', menu: 'WERK' }),
  Object.freeze({ id: 'mathe', title: 'Mathematik', menu: 'MATH' }),
  Object.freeze({ id: 'eigene', title: 'Eigene', menu: 'EIGEN' }),
]);

/// Gruppe zu einer Kennung (oder null)
export function groupById(id) {
  return GROUPS.find((g) => g.id === id) ?? null;
}

// MARK: - Kennungen

const MASK64 = (1n << 64n) - 1n;

/// UTF-8-Bytes einer Zeichenkette (ohne TextEncoder, damit es auch in JavaScriptCore läuft)
function utf8(s) {
  const out = [];
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
  }
  return out;
}

function uuidText(bytes) {
  const h = bytes.map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/// Feste Kennung für eingebaute Konstanten (stabil über Programmstarts): zwei FNV-1a-Hashes
/// über die UTF-8-Bytes, als UUID-Text – dieselben Kennungen wie in der Mac-App
export function stableID(s) {
  let h1 = 0xcbf29ce484222325n;
  let h2 = 0x84222325cbf29ce4n;
  for (const b of utf8(s)) {
    h1 = ((h1 ^ BigInt(b)) * 0x100000001b3n) & MASK64;
    h2 = ((h2 ^ BigInt(b)) * 0x1000193n) & MASK64;
  }
  const bytes = new Array(16).fill(0);
  for (let i = 0; i < 8; i++) {
    bytes[i] = Number((h1 >> BigInt(8 * i)) & 0xffn);
    bytes[8 + i] = Number((h2 >> BigInt(8 * i)) & 0xffn);
  }
  return uuidText(bytes);
}

/// Zufällige Kennung (UUID Version 4) für eigene Konstanten
export function randomID() {
  const bytes = [];
  for (let i = 0; i < 16; i++) bytes.push(Math.floor(Math.random() * 256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return uuidText(bytes);
}

/// Eine Konstante: { id, symbol, name, value, unit, group, note }
export function makeConstant(symbol, name, value, unit = '', group, note = '') {
  return { id: stableID(group + '|' + symbol + '|' + name), symbol, name, value, unit, group, note };
}

const C = (symbol, name, value, unit, group, note = '') =>
  Object.freeze(makeConstant(symbol, name, value, unit, group, note));

const SQRT2 = Math.sqrt(2);
const SQRT3 = Math.sqrt(3);
const M_E = Math.E;

export const BUILTIN_CONSTANTS = Object.freeze([
  // Physik – CODATA 2018 (exakt seit der SI-Reform 2019, sonst empfohlene Werte)
  C('c', 'Lichtgeschwindigkeit im Vakuum', 299792458, 'm/s', 'physik', 'exakt'),
  C('e', 'Elementarladung', 1.602176634e-19, 'C', 'physik', 'exakt'),
  C('h', 'Planck-Konstante', 6.62607015e-34, 'J·s', 'physik', 'exakt'),
  C('ħ', 'reduzierte Planck-Konstante h/2π', 1.054571817e-34, 'J·s', 'physik'),
  C('k', 'Boltzmann-Konstante', 1.380649e-23, 'J/K', 'physik', 'exakt'),
  C('Nₐ', 'Avogadro-Konstante', 6.02214076e23, '1/mol', 'physik', 'exakt'),
  C('R', 'molare Gaskonstante', 8.314462618, 'J/(mol·K)', 'physik'),
  C('F', 'Faraday-Konstante', 96485.33212, 'C/mol', 'physik'),
  C('ε₀', 'elektrische Feldkonstante', 8.8541878128e-12, 'F/m', 'physik'),
  C('μ₀', 'magnetische Feldkonstante', 1.25663706212e-6, 'H/m', 'physik'),
  C('Z₀', 'Wellenwiderstand des Vakuums', 376.730313668, 'Ω', 'physik'),
  C('mₑ', 'Elektronenmasse', 9.1093837015e-31, 'kg', 'physik'),
  C('mₚ', 'Protonenmasse', 1.67262192369e-27, 'kg', 'physik'),
  C('mₙ', 'Neutronenmasse', 1.67492749804e-27, 'kg', 'physik'),
  C('u', 'atomare Masseneinheit', 1.66053906660e-27, 'kg', 'physik'),
  C('e/mₑ', 'spezifische Ladung des Elektrons', 1.75882001076e11, 'C/kg', 'physik'),
  C('G', 'Gravitationskonstante', 6.67430e-11, 'm³/(kg·s²)', 'physik'),
  C('gₙ', 'Normfallbeschleunigung', 9.80665, 'm/s²', 'physik', 'exakt'),
  C('σ', 'Stefan-Boltzmann-Konstante', 5.670374419e-8, 'W/(m²·K⁴)', 'physik'),
  C('eV', 'Elektronvolt', 1.602176634e-19, 'J', 'physik', 'exakt'),
  C('Φ₀', 'magnetisches Flussquantum h/2e', 2.067833848e-15, 'Wb', 'physik'),
  C('R_K', 'von-Klitzing-Konstante h/e²', 25812.80745, 'Ω', 'physik'),
  C('K_J', 'Josephson-Konstante 2e/h', 4.835978484e14, 'Hz/V', 'physik'),
  C('T₀', 'Nullpunkt der Celsius-Skala', 273.15, 'K', 'physik', 'exakt'),
  C('p₀', 'Normdruck', 101325, 'Pa', 'physik', 'exakt'),
  C('Vₘ', 'molares Volumen idealer Gase (0 °C, 101,325 kPa)', 22.41396954e-3, 'm³/mol', 'physik'),

  // Elektrotechnik
  C('√2', 'Scheitelfaktor Sinus: Û = √2 · U', SQRT2, '', 'etechnik'),
  C('1/√2', 'Effektivwert/Scheitelwert Sinus', 1 / SQRT2, '', 'etechnik'),
  C('√3', 'Verkettungsfaktor Drehstrom: U = √3 · U_Str', SQRT3, '', 'etechnik'),
  C('1/√3', 'Sternschaltung: U_Str = U/√3', 1 / SQRT3, '', 'etechnik'),
  C('2/π', 'Gleichrichtwert/Scheitelwert Sinus', 2 / Math.PI, '', 'etechnik'),
  C('F_sin', 'Formfaktor Sinus π/(2√2)', Math.PI / (2 * SQRT2), '', 'etechnik'),
  C('ω₅₀', 'Kreisfrequenz bei 50 Hz (2π·50)', 2 * Math.PI * 50, '1/s', 'etechnik'),
  C('ω₆₀', 'Kreisfrequenz bei 60 Hz (2π·60)', 2 * Math.PI * 60, '1/s', 'etechnik'),
  C('f_N', 'Netzfrequenz Europa', 50, 'Hz', 'etechnik'),
  C('T₅₀', 'Periodendauer bei 50 Hz', 0.02, 's', 'etechnik'),
  C('U_N', 'Netzspannung Außenleiter–N', 230, 'V', 'etechnik'),
  C('U_LL', 'Netzspannung Außenleiter–Außenleiter', 400, 'V', 'etechnik'),
  C('Û_N', 'Scheitelwert der Netzspannung 230 V · √2', 230 * SQRT2, 'V', 'etechnik'),
  C('1−1/e', 'Laden: Anteil nach 1 τ (63,2 %)', 1 - 1 / M_E, '', 'etechnik'),
  C('1/e', 'Entladen: Rest nach 1 τ (36,8 %)', 1 / M_E, '', 'etechnik'),
  C('1−e⁻⁵', 'Laden: Anteil nach 5 τ (99,3 %)', 1 - Math.exp(-5), '', 'etechnik'),
  C('kWh', '1 kWh in Joule', 3.6e6, 'J', 'etechnik', 'exakt'),
  C('PS', '1 PS in Watt', 735.49875, 'W', 'etechnik', 'exakt'),

  // Werkstoffe – Tabellenwerte bei 20 °C (Quellen weichen teils leicht voneinander ab)
  C('ρ_Cu', 'spezifischer Widerstand Kupfer', 0.0178, 'Ω·mm²/m', 'werkstoffe', 'Tabellenwert'),
  C('κ_Cu', 'elektrische Leitfähigkeit Kupfer', 56, 'm/(Ω·mm²)', 'werkstoffe', 'Tabellenwert'),
  C('α_Cu', 'Temperaturbeiwert Kupfer', 0.0039, '1/K', 'werkstoffe', 'bei 20 °C'),
  C('ρ_Al', 'spezifischer Widerstand Aluminium', 0.0278, 'Ω·mm²/m', 'werkstoffe', 'Tabellenwert; VDE-Leitungsberechnung oft κ = 35'),
  C('κ_Al', 'elektrische Leitfähigkeit Aluminium', 36, 'm/(Ω·mm²)', 'werkstoffe', 'Tabellenwert; VDE-Leitungsberechnung oft 35'),
  C('α_Al', 'Temperaturbeiwert Aluminium', 0.004, '1/K', 'werkstoffe', 'bei 20 °C'),
  C('ρ_Ag', 'spezifischer Widerstand Silber', 0.016, 'Ω·mm²/m', 'werkstoffe'),
  C('ρ_Fe', 'spezifischer Widerstand Eisen', 0.1, 'Ω·mm²/m', 'werkstoffe', 'Reineisen, Richtwert'),
  C('ρ_W', 'spezifischer Widerstand Wolfram', 0.055, 'Ω·mm²/m', 'werkstoffe'),
  C('ρ_CuNi', 'spezifischer Widerstand Konstantan (CuNi44)', 0.49, 'Ω·mm²/m', 'werkstoffe', 'α ≈ 0'),
  C('d_Cu', 'Dichte Kupfer', 8.96, 'kg/dm³', 'werkstoffe'),
  C('d_Al', 'Dichte Aluminium', 2.70, 'kg/dm³', 'werkstoffe'),
  C('c_W', 'spezifische Wärmekapazität Wasser', 4187, 'J/(kg·K)', 'werkstoffe'),
  C('εr_Luft', 'Permittivitätszahl Luft', 1.0006, '', 'werkstoffe'),
  C('εr_PTFE', 'Permittivitätszahl PTFE (Teflon)', 2.1, '', 'werkstoffe'),
  C('εr_PVC', 'Permittivitätszahl PVC', 3.5, '', 'werkstoffe', 'typisch 3 … 4'),
  C('εr_FR4', 'Permittivitätszahl FR4 (Leiterplatte)', 4.5, '', 'werkstoffe', 'typisch 4,3 … 4,7'),
  C('εr_Glas', 'Permittivitätszahl Glas', 6, '', 'werkstoffe', 'typisch 5 … 10'),
  C('εr_Glim', 'Permittivitätszahl Glimmer', 7, '', 'werkstoffe', 'typisch 5 … 8'),
  C('εr_H₂O', 'Permittivitätszahl Wasser', 80, '', 'werkstoffe', 'bei 20 °C'),

  // Mathematik
  C('π', 'Kreiszahl', Math.PI, '', 'mathe'),
  C('e', 'Eulersche Zahl', M_E, '', 'mathe'),
  C('2π', 'Vollwinkel im Bogenmaß', 2 * Math.PI, '', 'mathe'),
  C('π/2', 'rechter Winkel im Bogenmaß', Math.PI / 2, '', 'mathe'),
  C('ln 2', 'natürlicher Logarithmus von 2 (Halbwertszeit = τ·ln 2)', Math.log(2.0), '', 'mathe'),
  C('ln 10', 'natürlicher Logarithmus von 10', Math.log(10.0), '', 'mathe'),
  C('lg e', 'Zehnerlogarithmus von e', Math.log10(M_E), '', 'mathe'),
  C('φ', 'goldener Schnitt', (1 + Math.sqrt(5)) / 2, '', 'mathe'),
  C('γ', 'Euler-Mascheroni-Konstante', 0.5772156649015329, '', 'mathe'),
  C('°→rad', 'Grad in Bogenmaß (π/180)', Math.PI / 180, '', 'mathe'),
  C('rad→°', 'Bogenmaß in Grad (180/π)', 180 / Math.PI, '', 'mathe'),
]);

// MARK: - Modell

/// Leerraum wie Swifts `.whitespaces` am Anfang und Ende entfernen (Leerzeichen, Tab, Zs)
function trimWhitespace(s) {
  return String(s).replace(/^[\t\p{Zs}]+|[\t\p{Zs}]+$/gu, '');
}

export class ConstantsModel {
  /// eigene Konstanten (Gruppe „eigene“)
  custom = [];
  /// gewählte Gruppe in der Ansicht (null = „Alle“)
  group = null;
  /// Suchtext in der Ansicht
  search = '';
  /// wird nach dem Anlegen, Löschen und Laden eigener Konstanten aufgerufen (setzt app.js)
  onChange = null;

  _notify() {
    if (typeof this.onChange === 'function') this.onChange();
  }

  get all() { return [...BUILTIN_CONSTANTS, ...this.custom]; }

  items(g) {
    return g === 'eigene' ? this.custom : BUILTIN_CONSTANTS.filter((c) => c.group === g);
  }

  /// Liste der Ansicht: Gruppe (null = alle) und Suche in Symbol, Bezeichnung und Einheit
  filtered(group = this.group, search = this.search) {
    let list = group === null || group === undefined ? this.all : this.items(group);
    const q = trimWhitespace(search ?? '').toLowerCase();
    if (q.length > 0) {
      list = list.filter((c) => c.symbol.toLowerCase().includes(q) || c.name.toLowerCase().includes(q)
        || c.unit.toLowerCase().includes(q));
    }
    return list;
  }

  /// Eigene Konstante anlegen (wie „Hinzufügen“ in der Ansicht): Symbol ohne Rand-Leerraum, zufällige
  /// Kennung, danach ist die Gruppe „Eigene“ gewählt. Den Wert liefert der Aufrufer (evaluateConstant).
  /// null, wenn das Symbol leer oder der Wert keine endliche Zahl ist.
  addCustom(symbol, name, value, unit = '') {
    const sym = trimWhitespace(symbol ?? '');
    if (sym.length === 0 || typeof value !== 'number' || !Number.isFinite(value)) return null;
    const c = makeConstant(sym, name ?? '', value, unit ?? '', 'eigene');
    c.id = randomID();
    this.custom.push(c);
    this.group = 'eigene';
    this._notify();
    return c;
  }

  /// Eigene Konstante löschen
  remove(id) {
    const n = this.custom.length;
    this.custom = this.custom.filter((c) => c.id !== id);
    if (this.custom.length !== n) this._notify();
  }

  /// Speicherbarer Zustand (JSON-tauglich)
  get state() {
    return { custom: this.custom.map((c) => ({ ...c })) };
  }

  /// Zustand laden; kaputte Einträge werden übersprungen, der Rest bleibt erhalten
  restore(obj) {
    const list = Array.isArray(obj) ? obj : (obj && Array.isArray(obj.custom) ? obj.custom : []);
    const out = [];
    for (const e of list) {
      if (!e || typeof e.symbol !== 'string' || typeof e.value !== 'number' || !Number.isFinite(e.value)) continue;
      out.push({
        id: typeof e.id === 'string' && e.id ? e.id : randomID(),
        symbol: e.symbol,
        name: typeof e.name === 'string' ? e.name : '',
        value: e.value,
        unit: typeof e.unit === 'string' ? e.unit : '',
        group: 'eigene',
        note: typeof e.note === 'string' ? e.note : '',
      });
    }
    this.custom = out;
    this._notify();
  }
}

// MARK: - Texte und Darstellung wie in der Ansicht (ConstantsView, ConstantRow, ConstantMenu)

export const CONSTANT_TEXTS = Object.freeze({
  all: 'Alle',
  searchPlaceholder: 'Suchen (z. B. ε₀, Kupfer, Ω)',
  emptyCustom: 'Noch keine eigenen Konstanten – unten anlegen.',
  empty: 'Nichts gefunden.',
  customLabel: 'Eigene:',
  customLabelLong: 'Eigene Konstante:',
  fieldSymbol: 'Symbol',
  fieldName: 'Bezeichnung',
  fieldValue: 'Wert (z. B. 1,5e-3 oder 2π)',
  fieldUnit: 'Einheit',
  add: 'Hinzufügen',
  helpPush: 'In den Rechner (Ans)',
  helpCopy: 'Wert kopieren',
  helpDelete: 'Löschen',
  helpMenu: 'Konstante aus dem Katalog einsetzen',
});

/// Symbol mit Tiefstellung zerlegen: „ρ_Cu“ → ['ρ', 'Cu'], „c“ → ['c', null]
export function splitSymbol(symbol) {
  const i = symbol.indexOf('_');
  if (i <= 0 || i === symbol.length - 1) return [symbol, null];
  return [symbol.slice(0, i), symbol.slice(i + 1)];
}

/// Wert in der Liste (11 signifikante Stellen)
export function valueText(c) {
  return Fmt.sig(c.value, 11);
}

/// Eintrag im Menü „Konstante einsetzen“ (Solver)
export function menuText(c) {
  return `${c.symbol}  =  ${Fmt.sig(c.value, 8)} ${c.unit}   (${c.name})`;
}

/// Wert zum Kopieren (wieder einlesbar, 15 Stellen)
export function copyText(c) {
  return Fmt.plain(c.value, 15);
}
