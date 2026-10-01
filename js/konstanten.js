// konstanten.js – Naturkonstanten (SHIFT 7, CONST) und Einheitenumrechnungen (SHIFT 8, CONV).
// Gleiche Gliederung wie beim Rechner: 47 Konstanten in 6 Gruppen, 40 Umrechnungen in 9 Gruppen.
// Werte nach CODATA 2018 (h, e, k, Nₐ, c₀ exakt); Umrechnungen nach NIST SP 811.

import { ausExponentText, Q } from './zahl.js';

// [Kennung, Symbol, Wert, Einheit, Name DE, Name EN, Name FR]
const K = [
  // 1 Universell
  ['h', 'h', '6.62607015e-34', 'J·s', 'Planck-Konstante', 'Planck constant', 'constante de Planck'],
  ['hq', 'ħ', '1.054571817e-34', 'J·s', 'reduzierte Planck-Konstante', 'reduced Planck constant', 'constante de Planck réduite'],
  ['c0', 'c₀', '299792458', 'm/s', 'Lichtgeschwindigkeit im Vakuum', 'speed of light in vacuum', 'vitesse de la lumière dans le vide'],
  ['eps0', 'ε₀', '8.8541878128e-12', 'F/m', 'elektrische Feldkonstante', 'vacuum electric permittivity', 'permittivité du vide'],
  ['mu0', 'μ₀', '1.25663706212e-6', 'N/A²', 'magnetische Feldkonstante', 'vacuum magnetic permeability', 'perméabilité du vide'],
  ['Z0', 'Z₀', '376.730313668', 'Ω', 'Wellenwiderstand des Vakuums', 'characteristic impedance of vacuum', 'impédance caractéristique du vide'],
  ['G', 'G', '6.67430e-11', 'm³/(kg·s²)', 'Gravitationskonstante', 'Newtonian constant of gravitation', 'constante gravitationnelle'],
  ['lP', 'lₚ', '1.616255e-35', 'm', 'Planck-Länge', 'Planck length', 'longueur de Planck'],
  ['tP', 'tₚ', '5.391247e-44', 's', 'Planck-Zeit', 'Planck time', 'temps de Planck'],
  // 2 Elektromagnetisch
  ['muN', 'μN', '5.0507837461e-27', 'J/T', 'Kernmagneton', 'nuclear magneton', 'magnéton nucléaire'],
  ['muB', 'μB', '9.2740100783e-24', 'J/T', 'Bohrsches Magneton', 'Bohr magneton', 'magnéton de Bohr'],
  ['qe', 'e', '1.602176634e-19', 'C', 'Elementarladung', 'elementary charge', 'charge élémentaire'],
  ['Phi0', 'Φ₀', '2.067833848e-15', 'Wb', 'magnetisches Flussquant', 'magnetic flux quantum', 'quantum de flux magnétique'],
  ['G0', 'G₀', '7.748091729e-5', 'S', 'Leitwertquant', 'conductance quantum', 'quantum de conductance'],
  ['KJ', 'K_J', '4.835978484e14', 'Hz/V', 'Josephson-Konstante', 'Josephson constant', 'constante de Josephson'],
  ['RK', 'R_K', '25812.80745', 'Ω', 'von-Klitzing-Konstante', 'von Klitzing constant', 'constante de von Klitzing'],
  // 3 Atom- und Kernphysik
  ['mp', 'mₚ', '1.67262192369e-27', 'kg', 'Protonenmasse', 'proton mass', 'masse du proton'],
  ['mn', 'mₙ', '1.67492749804e-27', 'kg', 'Neutronenmasse', 'neutron mass', 'masse du neutron'],
  ['me', 'mₑ', '9.1093837015e-31', 'kg', 'Elektronenmasse', 'electron mass', "masse de l'électron"],
  ['mmu', 'mμ', '1.883531627e-28', 'kg', 'Myonenmasse', 'muon mass', 'masse du muon'],
  ['a0', 'a₀', '5.29177210903e-11', 'm', 'Bohrscher Radius', 'Bohr radius', 'rayon de Bohr'],
  ['alpha', 'α', '7.2973525693e-3', '', 'Feinstrukturkonstante', 'fine-structure constant', 'constante de structure fine'],
  ['re', 'rₑ', '2.8179403262e-15', 'm', 'klassischer Elektronenradius', 'classical electron radius', "rayon classique de l'électron"],
  ['lamC', 'λc', '2.42631023867e-12', 'm', 'Compton-Wellenlänge', 'Compton wavelength', 'longueur d’onde de Compton'],
  ['gamp', 'γₚ', '2.6752218744e8', '1/(s·T)', 'gyromagnetisches Verhältnis des Protons', 'proton gyromagnetic ratio', 'rapport gyromagnétique du proton'],
  ['lamCp', 'λcp', '1.32140985539e-15', 'm', 'Compton-Wellenlänge des Protons', 'proton Compton wavelength', 'longueur d’onde de Compton du proton'],
  ['lamCn', 'λcn', '1.31959090581e-15', 'm', 'Compton-Wellenlänge des Neutrons', 'neutron Compton wavelength', 'longueur d’onde de Compton du neutron'],
  ['Rinf', 'R∞', '10973731.568160', '1/m', 'Rydberg-Konstante', 'Rydberg constant', 'constante de Rydberg'],
  ['mup', 'μₚ', '1.41060679736e-26', 'J/T', 'magnetisches Moment des Protons', 'proton magnetic moment', 'moment magnétique du proton'],
  ['mue', 'μₑ', '-9.2847647043e-24', 'J/T', 'magnetisches Moment des Elektrons', 'electron magnetic moment', "moment magnétique de l'électron"],
  ['mun', 'μₙ', '-9.6623651e-27', 'J/T', 'magnetisches Moment des Neutrons', 'neutron magnetic moment', 'moment magnétique du neutron'],
  ['mumu', 'μμ', '-4.49044830e-26', 'J/T', 'magnetisches Moment des Myons', 'muon magnetic moment', 'moment magnétique du muon'],
  ['mtau', 'mτ', '3.16754e-27', 'kg', 'Tauonenmasse', 'tau mass', 'masse du tau'],
  // 4 Physikalische Chemie
  ['u', 'u', '1.66053906660e-27', 'kg', 'atomare Masseneinheit', 'atomic mass constant', 'unité de masse atomique'],
  ['F', 'F', '96485.33212', 'C/mol', 'Faraday-Konstante', 'Faraday constant', 'constante de Faraday'],
  ['NA', 'Nₐ', '6.02214076e23', '1/mol', 'Avogadro-Konstante', 'Avogadro constant', "constante d'Avogadro"],
  ['k', 'k', '1.380649e-23', 'J/K', 'Boltzmann-Konstante', 'Boltzmann constant', 'constante de Boltzmann'],
  ['Vm', 'Vm', '22.41396954e-3', 'm³/mol', 'molares Volumen (273,15 K; 101,325 kPa)', 'molar volume (273.15 K, 101.325 kPa)', 'volume molaire (273,15 K ; 101,325 kPa)'],
  ['R', 'R', '8.314462618', 'J/(mol·K)', 'universelle Gaskonstante', 'molar gas constant', 'constante des gaz parfaits'],
  ['c1', 'c₁', '3.741771852e-16', 'W·m²', 'erste Strahlungskonstante', 'first radiation constant', 'première constante de rayonnement'],
  ['c2', 'c₂', '1.438776877e-2', 'm·K', 'zweite Strahlungskonstante', 'second radiation constant', 'deuxième constante de rayonnement'],
  ['sigma', 'σ', '5.670374419e-8', 'W/(m²·K⁴)', 'Stefan-Boltzmann-Konstante', 'Stefan–Boltzmann constant', 'constante de Stefan-Boltzmann'],
  // 5 Festgelegte Werte
  ['g', 'g', '9.80665', 'm/s²', 'Normfallbeschleunigung', 'standard acceleration of gravity', 'accélération normale de la pesanteur'],
  ['atm', 'atm', '101325', 'Pa', 'Normatmosphäre', 'standard atmosphere', 'atmosphère normale'],
  ['RK90', 'R_K-90', '25812.807', 'Ω', 'konventioneller Wert von R_K', 'conventional value of R_K', 'valeur conventionnelle de R_K'],
  ['KJ90', 'K_J-90', '4.835979e14', 'Hz/V', 'konventioneller Wert von K_J', 'conventional value of K_J', 'valeur conventionnelle de K_J'],
  // 6 Sonstige
  ['t', 't', '273.15', 'K', 'Celsius-Temperatur (Nullpunkt)', 'Celsius temperature (zero point)', 'température Celsius (zéro)'],
];

export const KONSTANTEN_GRUPPEN = [
  { de: 'Universell', en: 'Universal', fr: 'Universelles', ids: K.slice(0, 9).map((k) => k[0]) },
  { de: 'Elektromagnetisch', en: 'Electromagnetic', fr: 'Électromagnétiques', ids: K.slice(9, 16).map((k) => k[0]) },
  { de: 'Atom- & Kernphysik', en: 'Atomic & Nuclear', fr: 'Atomiques & nucléaires', ids: K.slice(16, 33).map((k) => k[0]) },
  { de: 'Physikal. Chemie', en: 'Physico-Chem', fr: 'Physico-chimiques', ids: K.slice(33, 42).map((k) => k[0]) },
  { de: 'Festgelegte Werte', en: 'Adopted Values', fr: 'Valeurs adoptées', ids: K.slice(42, 46).map((k) => k[0]) },
  { de: 'Sonstige', en: 'Other', fr: 'Autres', ids: K.slice(46).map((k) => k[0]) },
];

export const KONSTANTEN = {};
for (const [id, symbol, wert, einheit, de, en, fr] of K) {
  KONSTANTEN[id] = { id, symbol, text: wert, einheit, name: { de, en, fr }, wert: null };
}

/// Wert einer Konstante (exakter Dezimalbruch, beim ersten Zugriff berechnet)
export function konstantenWert(id) {
  const k = KONSTANTEN[id];
  if (!k) return null;
  if (!k.wert) k.wert = ausExponentText(k.text);
  return k.wert;
}

// MARK: Umrechnungen

// [Kennung, von, nach, Faktor (als Text) | Funktion]
const U = [
  // Länge
  ['in-cm', 'in', 'cm', '2.54'], ['cm-in', 'cm', 'in', '/2.54'],
  ['ft-m', 'ft', 'm', '0.3048'], ['m-ft', 'm', 'ft', '/0.3048'],
  ['yd-m', 'yd', 'm', '0.9144'], ['m-yd', 'm', 'yd', '/0.9144'],
  ['mile-km', 'mile', 'km', '1.609344'], ['km-mile', 'km', 'mile', '/1.609344'],
  ['nmile-m', 'n mile', 'm', '1852'], ['m-nmile', 'm', 'n mile', '/1852'],
  ['pc-km', 'pc', 'km', '3.0856775814913673e13'], ['km-pc', 'km', 'pc', '/3.0856775814913673e13'],
  // Fläche
  ['acre-m2', 'acre', 'm²', '4046.8564224'], ['m2-acre', 'm²', 'acre', '/4046.8564224'],
  // Volumen
  ['galus-L', 'gal(US)', 'L', '3.785411784'], ['L-galus', 'L', 'gal(US)', '/3.785411784'],
  ['galuk-L', 'gal(UK)', 'L', '4.54609'], ['L-galuk', 'L', 'gal(UK)', '/4.54609'],
  // Masse
  ['oz-g', 'oz', 'g', '28.349523125'], ['g-oz', 'g', 'oz', '/28.349523125'],
  ['lb-kg', 'lb', 'kg', '0.45359237'], ['kg-lb', 'kg', 'lb', '/0.45359237'],
  // Geschwindigkeit
  ['kmh-ms', 'km/h', 'm/s', '/3.6'], ['ms-kmh', 'm/s', 'km/h', '3.6'],
  // Druck
  ['atm-Pa', 'atm', 'Pa', '101325'], ['Pa-atm', 'Pa', 'atm', '/101325'],
  ['mmHg-Pa', 'mmHg', 'Pa', '133.322387415'], ['Pa-mmHg', 'Pa', 'mmHg', '/133.322387415'],
  ['kgfcm2-Pa', 'kgf/cm²', 'Pa', '98066.5'], ['Pa-kgfcm2', 'Pa', 'kgf/cm²', '/98066.5'],
  ['psi-kPa', 'lbf/in²', 'kPa', '6.894757293168361'], ['kPa-psi', 'kPa', 'lbf/in²', '/6.894757293168361'],
  // Energie
  ['kgfm-J', 'kgf·m', 'J', '9.80665'], ['J-kgfm', 'J', 'kgf·m', '/9.80665'],
  ['J-cal', 'J', 'cal', '/4.1855'], ['cal-J', 'cal', 'J', '4.1855'],
  // Leistung
  ['hp-kW', 'hp', 'kW', '0.745699872'], ['kW-hp', 'kW', 'hp', '/0.745699872'],
  // Temperatur
  ['F-C', '°F', '°C', 'F→C'], ['C-F', '°C', '°F', 'C→F'],
];

export const UMRECHNUNG_GRUPPEN = [
  { de: 'Länge', en: 'Length', fr: 'Longueur', ids: U.slice(0, 12).map((u) => u[0]) },
  { de: 'Fläche', en: 'Area', fr: 'Surface', ids: U.slice(12, 14).map((u) => u[0]) },
  { de: 'Volumen', en: 'Volume', fr: 'Volume', ids: U.slice(14, 18).map((u) => u[0]) },
  { de: 'Masse', en: 'Mass', fr: 'Masse', ids: U.slice(18, 22).map((u) => u[0]) },
  { de: 'Geschwindigkeit', en: 'Velocity', fr: 'Vitesse', ids: U.slice(22, 24).map((u) => u[0]) },
  { de: 'Druck', en: 'Pressure', fr: 'Pression', ids: U.slice(24, 32).map((u) => u[0]) },
  { de: 'Energie', en: 'Energy', fr: 'Énergie', ids: U.slice(32, 36).map((u) => u[0]) },
  { de: 'Leistung', en: 'Power', fr: 'Puissance', ids: U.slice(36, 38).map((u) => u[0]) },
  { de: 'Temperatur', en: 'Temperature', fr: 'Température', ids: U.slice(38, 40).map((u) => u[0]) },
];

export const UMRECHNUNGEN = {};
for (const [id, von, nach, faktor] of U) UMRECHNUNGEN[id] = { id, von, nach, faktor, text: `${von}▸${nach}` };

/// Umrechnung anwenden (mit add/mul/div aus zahl.js, damit exakte Werte exakt bleiben)
export function umrechnen(id, x, Z) {
  const u = UMRECHNUNGEN[id];
  if (!u) throw Z.fehler('syntax');
  if (u.faktor === 'F→C') return Z.mul(Z.sub(x, Q(32n)), Q(5n, 9n));
  if (u.faktor === 'C→F') return Z.add(Z.mul(x, Q(9n, 5n)), Q(32n));
  if (u.faktor.startsWith('/')) return Z.div(x, ausExponentText(u.faktor.slice(1)));
  return Z.mul(x, ausExponentText(u.faktor));
}

// MARK: Ingenieursymbole (OPTN → Ingenieursymbol)

export const PRAEFIXE = [
  ['m', -3], ['μ', -6], ['n', -9], ['p', -12], ['f', -15],
  ['k', 3], ['M', 6], ['G', 9], ['T', 12], ['P', 15], ['E', 18],
];
export const PRAEFIX_EXPONENT = Object.fromEntries(PRAEFIXE);
