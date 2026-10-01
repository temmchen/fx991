// inhalt/griechisch.js – Hilfe-Reiter „αβγ“: das griechische Alphabet mit den Namen der Buchstaben,
// Verwendung in Elektrotechnik, Physik/Mechanik und Mathematik sowie Konstanten und Kennwerte.
// Nach dem Skript „Das griechische Alphabet in der Technik / L’alphabet grec dans les sciences et la
// technique“ von Tom Bleyer (Latex/education.lu/02_Mathematik/ABC_grec), Englisch übersetzt, ergänzt um
// Φ, Θ, Δ, μ, σ, ν und die Konstanten. Werkstoffwerte wie in RPN42 (Tabellenwerte bei 20 °C).
// Zahlen mit Punkt und ×10^n (die Hilfe zeigt sie mit dem Dezimalzeichen des Rechners);
// tasten: Tastenfolge (Format von tasten.js), nach der Vorbereitung STANDARD ausgeführt – der Wert steht danach in Ans.

const NB = ' ';   // geschütztes Leerzeichen der französischen Typografie (vor : ; ? ! und in « »)

/// Grundzustand wie bei den Lektionen: Berechnungen, MathE/MathA, Gradmaß, Norm 1, Ingenieursymbole aus
export const STANDARD = '[MENU]1[SHIFT][MENU]11[SHIFT][MENU]21[SHIFT][MENU]331[SHIFT][MENU]42[AC]';

/// Die 24 Buchstaben: groß, klein, Variante (andere Schreibweise des Kleinbuchstabens), Name
const n = (de, en, fr) => ({ de, en, fr });
export const ALPHABET = [
  { gross: 'Α', klein: 'α', variante: '', name: n('Alpha', 'Alpha', 'alpha') },
  { gross: 'Β', klein: 'β', variante: '', name: n('Beta', 'Beta', 'bêta') },
  { gross: 'Γ', klein: 'γ', variante: '', name: n('Gamma', 'Gamma', 'gamma') },
  { gross: 'Δ', klein: 'δ', variante: '', name: n('Delta', 'Delta', 'delta') },
  { gross: 'Ε', klein: 'ε', variante: 'ϵ', name: n('Epsilon', 'Epsilon', 'epsilon') },
  { gross: 'Ζ', klein: 'ζ', variante: '', name: n('Zeta', 'Zeta', 'zêta') },
  { gross: 'Η', klein: 'η', variante: '', name: n('Eta', 'Eta', 'êta') },
  { gross: 'Θ', klein: 'θ', variante: 'ϑ', name: n('Theta', 'Theta', 'thêta') },
  { gross: 'Ι', klein: 'ι', variante: '', name: n('Iota', 'Iota', 'iota') },
  { gross: 'Κ', klein: 'κ', variante: 'ϰ', name: n('Kappa', 'Kappa', 'kappa') },
  { gross: 'Λ', klein: 'λ', variante: '', name: n('Lambda', 'Lambda', 'lambda') },
  { gross: 'Μ', klein: 'μ', variante: '', name: n('My (gesprochen „mü“)', 'Mu', `mu (prononcé «${NB}mû${NB}»)`) },
  { gross: 'Ν', klein: 'ν', variante: '', name: n('Ny (gesprochen „nü“)', 'Nu', `nu (prononcé «${NB}nû${NB}»)`) },
  { gross: 'Ξ', klein: 'ξ', variante: '', name: n('Xi', 'Xi', 'xi') },
  { gross: 'Ο', klein: 'ο', variante: '', name: n('Omikron', 'Omicron', 'omicron') },
  { gross: 'Π', klein: 'π', variante: '', name: n('Pi', 'Pi', 'pi') },
  { gross: 'Ρ', klein: 'ρ', variante: 'ϱ', name: n('Rho', 'Rho', 'rhô') },
  { gross: 'Σ', klein: 'σ', variante: '', name: n('Sigma', 'Sigma', 'sigma') },
  { gross: 'Τ', klein: 'τ', variante: '', name: n('Tau', 'Tau', 'tau') },
  { gross: 'Υ', klein: 'υ', variante: '', name: n('Ypsilon', 'Upsilon', 'upsilon') },
  { gross: 'Φ', klein: 'φ', variante: 'ϕ', name: n('Phi', 'Phi', 'phi') },
  { gross: 'Χ', klein: 'χ', variante: '', name: n('Chi', 'Chi', 'chi') },
  { gross: 'Ψ', klein: 'ψ', variante: '', name: n('Psi', 'Psi', 'psi') },
  { gross: 'Ω', klein: 'ω', variante: '', name: n('Omega', 'Omega', 'oméga') },
];

/// Name eines Zeichens (auch Varianten, z. B. ϱ → Rho) in der Sprache s
export function buchstabenName(zeichen, s) {
  const z = String(zeichen).charAt(0);
  const b = ALPHABET.find((x) => x.gross === z || x.klein === z || x.variante === z);
  if (!b) return '';
  return (b.name[s] || b.name.de).replace(/ \(.*\)$/, '');
}

// Einträge: zeichen, bedeutung (de/en/fr), formel (HTML, optional, auch je Sprache), einheit (optional)
const e = (zeichen, bedeutung, formel = '', einheit = '') => ({ zeichen, bedeutung, formel, einheit });

export const ETECHNIK = [
  e('α', n('Temperaturkoeffizient (Temperaturbeiwert) des Widerstands', 'Temperature coefficient of resistance', 'Coefficient de température de la résistance'),
    'R<sub>ϑ</sub> = R<sub>20</sub> · (1 + α · Δϑ)', '1/K'),
  e('β', n('Stromverstärkungsfaktor (Transistor)', 'Current gain (transistor)', 'Facteur de gain en courant (transistor)'),
    'β = I<sub>C</sub> / I<sub>B</sub>'),
  e('δ', n('Verlustwinkel – tan δ ist der Verlustfaktor (Kondensator, Isolierstoff)', 'Loss angle – tan δ is the dissipation factor (capacitor, insulation)',
    `Angle de pertes – tan δ est le facteur de pertes (condensateur, isolant)`)),
  e('ε', n('Permittivität (Dielektrizitätskonstante)', 'Permittivity (dielectric constant)', 'Permittivité (constante diélectrique)'),
    'ε = ε<sub>0</sub> · ε<sub>r</sub>', 'F/m'),
  e('λ', n('Wellenlänge', 'Wavelength', 'Longueur d’onde'), 'λ = c / f', 'm'),
  e('μ', n('magnetische Permeabilität', 'Magnetic permeability', 'Perméabilité magnétique'), 'μ = μ<sub>0</sub> · μ<sub>r</sub>', 'H/m'),
  e('ω', n('Kreisfrequenz (f: Frequenz)', 'Angular frequency (f: frequency)', `Pulsation (f${NB}: fréquence)`), 'ω = 2π · f', '1/s'),
  e('φ', n('Phasenwinkel zwischen Spannung und Strom – cos φ ist der Leistungsfaktor', 'Phase angle between voltage and current – cos φ is the power factor',
    `Déphasage entre tension et courant – cos φ est le facteur de puissance`), '', '°'),
  e('ϑ', n('Temperatur oder Winkel (Variante von θ)', 'Temperature or angle (variant of θ)', 'Température ou angle (variante de θ)'), '', '°C'),
  e('ϰ', n('spezifische Leitfähigkeit (Kehrwert des spezifischen Widerstands)', 'Conductivity (reciprocal of resistivity)', 'Conductivité (inverse de la résistivité)'),
    'ϰ = 1 / ϱ', 'm/(Ω·mm²)'),
  e('ϱ', n('spezifischer elektrischer Widerstand', 'Electrical resistivity', 'Résistivité électrique'), 'R = ϱ · l / A', 'Ω·mm²/m'),
  e('τ', n('Zeitkonstante, z. B. beim Kondensator', 'Time constant, e.g. of a capacitor', 'Constante de temps (p. ex. d’un condensateur)'), 'τ = R · C', 's'),
  e('π', n('Kreiszahl', 'Pi (circle constant)', 'Constante circulaire (nombre pi)'), 'π = 3.14159…'),
  e('Ω', n('Einheit des elektrischen Widerstands (Ohm)', 'Unit of electrical resistance (ohm)', 'Unité de résistance électrique (ohm)')),
  e('Φ', n('magnetischer Fluss', 'Magnetic flux', 'Flux magnétique'), 'Φ = B · A', 'Wb = V·s'),
  e('Θ', n('elektrische Durchflutung (N: Windungszahl)', 'Magnetomotive force (N: number of turns)', `Force magnétomotrice (N${NB}: nombre de spires)`), 'Θ = I · N', 'A'),
  e('Δ', n('Änderung, Differenz (ΔU, Δϑ) – im Drehstromnetz: Dreieckschaltung', 'Change, difference (ΔU, Δϑ) – in three-phase systems: delta connection',
    `Variation, différence (ΔU, Δϑ) – en triphasé${NB}: couplage triangle`)),
];

export const PHYSIK = [
  e('ω', n('Winkelgeschwindigkeit (n: Drehzahl)', 'Angular velocity (n: rotational speed)', `Vitesse angulaire (n${NB}: vitesse de rotation)`), 'ω = 2π · n', '1/s'),
  e('θ', n('Winkel (Mechanik, Optik)', 'Angle (mechanics, optics)', 'Angle (mécanique, optique)'), '', '°'),
  e('ρ', n('Dichte', 'Density', 'Masse volumique'), 'ρ = m / V', 'kg/m³'),
  e('η', n('Wirkungsgrad', 'Efficiency', 'Rendement'),
    n('η = P<sub>ab</sub> / P<sub>zu</sub>', 'η = P<sub>out</sub> / P<sub>in</sub>', 'η = P<sub>utile</sub> / P<sub>absorbée</sub>')),
  e('ξ', n('Dämpfungsfaktor', 'Damping factor', 'Facteur d’amortissement')),
  e('ψ', n('Wellenfunktion (Quantenmechanik)', 'Wave function (quantum mechanics)', 'Fonction d’onde (mécanique quantique)')),
  e('μ', n('Reibungszahl', 'Coefficient of friction', 'Coefficient de frottement'),
    n('F<sub>R</sub> = μ · F<sub>N</sub>', 'F<sub>f</sub> = μ · F<sub>N</sub>', 'F<sub>f</sub> = μ · F<sub>N</sub>')),
  e('σ', n('mechanische Spannung', 'Mechanical stress', 'Contrainte mécanique'), 'σ = F / A', 'N/mm²'),
  e('ν', n('Frequenz, z. B. von Licht (h: Planck-Konstante)', 'Frequency, e.g. of light (h: Planck constant)', `Fréquence, p. ex. de la lumière (h${NB}: constante de Planck)`), 'E = h · ν', 'Hz'),
];

export const MATHE = [
  e('α, β, γ', n('Winkel, z. B. im Dreieck', 'Angles, e.g. in a triangle', 'Angles, p. ex. dans un triangle')),
  e('Σ', n('Summenzeichen', 'Summation sign', 'Signe somme'), 'Σ a<sub>i</sub> = a<sub>1</sub> + a<sub>2</sub> + … + a<sub>n</sub>'),
  e('Π', n('Produktzeichen', 'Product sign', 'Signe produit'), 'Π a<sub>i</sub> = a<sub>1</sub> · a<sub>2</sub> · … · a<sub>n</sub>'),
  e('Δ', n('Differenz, Änderung – Steigung einer Geraden', 'Difference, change – slope of a line', 'Différence, variation – pente d’une droite'), 'm = Δy / Δx'),
];

// Konstanten und Kennwerte: zeichen (HTML), bedeutung, wert (Punkt, ×10^n), einheit, tasten (Casio), zahl (Sollwert für Tests)
const k = (zeichen, bedeutung, wert, einheit, tasten = '', zahl = null) => ({ zeichen, bedeutung, wert, einheit, tasten, zahl });

export const KONSTANTEN = [
  k('π', n('Kreiszahl', 'Pi', 'Nombre pi'), '3.141592654', '', '[SHIFT][×10ˣ]=[S⇔D]', Math.PI),
  k('ε<sub>0</sub>', n('elektrische Feldkonstante', 'Electric constant (vacuum permittivity)', 'Permittivité du vide'),
    '8.8541878128×10^-12', 'F/m', '[SHIFT]714=', 8.8541878128e-12),
  k('μ<sub>0</sub>', n('magnetische Feldkonstante', 'Magnetic constant (vacuum permeability)', 'Perméabilité du vide'),
    '1.25663706212×10^-6', 'H/m', '[SHIFT]715=', 1.25663706212e-6),
  k('ω', n('Kreisfrequenz im 50-Hz-Netz (2π · 50 Hz)', 'Angular frequency of the 50 Hz mains (2π · 50 Hz)', 'Pulsation du réseau 50 Hz (2π · 50 Hz)'),
    '314.1592654', '1/s', '2[SHIFT][×10ˣ]×50=[S⇔D]', 100 * Math.PI),
  k('ϱ<sub>Cu</sub>', n('spezifischer Widerstand von Kupfer (20 °C)', 'Resistivity of copper (20 °C)', 'Résistivité du cuivre (20 °C)'), '0.0178', 'Ω·mm²/m'),
  k('ϰ<sub>Cu</sub>', n('Leitfähigkeit von Kupfer', 'Conductivity of copper', 'Conductivité du cuivre'), '56', 'm/(Ω·mm²)'),
  k('α<sub>Cu</sub>', n('Temperaturbeiwert von Kupfer', 'Temperature coefficient of copper', 'Coefficient de température du cuivre'), '0.0039', '1/K'),
  k('ϱ<sub>Al</sub>', n('spezifischer Widerstand von Aluminium (20 °C)', 'Resistivity of aluminium (20 °C)', 'Résistivité de l’aluminium (20 °C)'), '0.0278', 'Ω·mm²/m'),
  k('ϰ<sub>Al</sub>', n('Leitfähigkeit von Aluminium', 'Conductivity of aluminium', 'Conductivité de l’aluminium'), '36', 'm/(Ω·mm²)'),
  k('α<sub>Al</sub>', n('Temperaturbeiwert von Aluminium', 'Temperature coefficient of aluminium', 'Coefficient de température de l’aluminium'), '0.004', '1/K'),
  k('ε<sub>r</sub>', n('Permittivitätszahl: Luft ≈ 1; PVC ≈ 3.5; Glas ≈ 6; Wasser ≈ 80', 'Relative permittivity: air ≈ 1, PVC ≈ 3.5, glass ≈ 6, water ≈ 80',
    `Permittivité relative${NB}: air ≈ 1${NB}; PVC ≈ 3.5${NB}; verre ≈ 6${NB}; eau ≈ 80`), '', ''),
  k('ρ<sub>H₂O</sub>', n('Dichte von Wasser', 'Density of water', 'Masse volumique de l’eau'), '1000', 'kg/m³'),
  k('σ', n('Stefan-Boltzmann-Konstante', 'Stefan–Boltzmann constant', 'Constante de Stefan-Boltzmann'),
    '5.670374419×10^-8', 'W/(m²·K⁴)', '[SHIFT]749=', 5.670374419e-8),
  k('Φ<sub>0</sub>', n('magnetisches Flussquant', 'Magnetic flux quantum', 'Quantum de flux magnétique'),
    '2.067833848×10^-15', 'Wb', '[SHIFT]724=', 2.067833848e-15),
  k('μ<sub>B</sub>', n('Bohrsches Magneton', 'Bohr magneton', 'Magnéton de Bohr'),
    '9.2740100783×10^-24', 'J/T', '[SHIFT]722=', 9.2740100783e-24),
  k('α', n('Feinstrukturkonstante (≈ 1/137)', 'Fine-structure constant (≈ 1/137)', 'Constante de structure fine (≈ 1/137)'),
    '7.2973525693×10^-3', '', '[SHIFT]736=', 7.2973525693e-3),
  k('λ<sub>C</sub>', n('Compton-Wellenlänge des Elektrons', 'Compton wavelength of the electron', 'Longueur d’onde de Compton de l’électron'),
    '2.42631023867×10^-12', 'm', '[SHIFT]738=', 2.42631023867e-12),
];

/// Texte der Seite
export const TEXTE = {
  de: {
    titel: 'Das griechische Alphabet in der Technik',
    intro: 'Das griechische Alphabet besteht aus 24 Buchstaben und ist die Grundlage vieler mathematischer und naturwissenschaftlicher Schreibweisen. In der Technik werden griechische Buchstaben verwendet, um Größen, Konstanten und Winkel eindeutig zu kennzeichnen.',
    alphabet: 'Das Alphabet',
    legende: 'Großbuchstabe, Kleinbuchstabe und – klein daneben – eine andere Schreibweise (Variante).',
    lernkarte: 'Lernkarte: Wie heißt dieser Buchstabe?',
    zeigen: 'Name zeigen',
    weiter: 'Nächster',
    etechnik: 'Elektrotechnik',
    physik: 'Physik und Mechanik',
    mathe: 'Mathematik',
    konstanten: 'Konstanten und Kennwerte',
    konstantenIntro: 'Mit <b>▶</b> führt der Rechner vor, wie du den Wert eintippst – Naturkonstanten findest du unter <b>CONST</b> (SHIFT 7). Werkstoffwerte sind Tabellenwerte bei 20 °C.',
    achtung: 'Derselbe Buchstabe kann je nach Fach etwas anderes bedeuten: <b>α</b> ist in der Elektrotechnik der Temperaturbeiwert, in der Geometrie ein Winkel und in der Atomphysik die Feinstrukturkonstante. Achte immer auf die Einheit und den Zusammenhang.',
    zusammenfassung: 'Das griechische Alphabet ist ein zentraler Bestandteil der technischen Symbolik. Seine Buchstaben stehen für Größen, Konstanten und Winkel in Elektrotechnik, Physik und Mechanik. Varianten wie ϑ, φ und ε verbessern die Lesbarkeit und Eindeutigkeit.',
    quelle: 'Nach dem Skript „Das griechische Alphabet in der Technik“ von Tom Bleyer.',
  },
  en: {
    titel: 'The Greek alphabet in engineering',
    intro: 'The Greek alphabet has 24 letters and is the basis of many notations in mathematics and science. In engineering, Greek letters are used to label quantities, constants and angles unambiguously.',
    alphabet: 'The alphabet',
    legende: 'Capital letter, small letter and – smaller, next to it – another way of writing it (variant).',
    lernkarte: 'Flashcard: what is this letter called?',
    zeigen: 'Show name',
    weiter: 'Next',
    etechnik: 'Electrical engineering',
    physik: 'Physics and mechanics',
    mathe: 'Mathematics',
    konstanten: 'Constants and characteristic values',
    konstantenIntro: 'With <b>▶</b> the calculator shows how to enter the value – physical constants are under <b>CONST</b> (SHIFT 7). Material values are table values at 20 °C.',
    achtung: 'The same letter can mean different things in different subjects: <b>α</b> is the temperature coefficient in electrical engineering, an angle in geometry and the fine-structure constant in atomic physics. Always look at the unit and the context.',
    zusammenfassung: 'The Greek alphabet is a central part of technical notation. Its letters stand for quantities, constants and angles in electrical engineering, physics and mechanics. Variants such as ϑ, φ and ε make formulas easier to read and unambiguous.',
    quelle: 'Based on the handout “Das griechische Alphabet in der Technik” by Tom Bleyer.',
  },
  fr: {
    titel: 'L’alphabet grec dans les sciences et la technique',
    intro: 'L’alphabet grec comporte 24 lettres et sert de base à de nombreuses notations en mathématiques et en sciences. En technique, on emploie des lettres grecques pour désigner clairement des grandeurs, des constantes et des angles.',
    alphabet: 'L’alphabet',
    legende: 'Majuscule, minuscule et – en petit à côté – une autre graphie (variante).',
    lernkarte: `Carte mémoire${NB}: comment s’appelle cette lettre${NB}?`,
    zeigen: 'Afficher le nom',
    weiter: 'Suivante',
    etechnik: 'Électrotechnique',
    physik: 'Physique et mécanique',
    mathe: 'Mathématiques',
    konstanten: 'Constantes et valeurs caractéristiques',
    konstantenIntro: `Avec <b>▶</b>, la calculatrice montre comment saisir la valeur – les constantes physiques se trouvent sous <b>CONST</b> (SHIFT 7). Les valeurs des matériaux sont des valeurs de tableau à 20 °C.`,
    achtung: `Une même lettre peut avoir un autre sens selon la matière${NB}: <b>α</b> est le coefficient de température en électrotechnique, un angle en géométrie et la constante de structure fine en physique atomique. Fais toujours attention à l’unité et au contexte.`,
    zusammenfassung: 'L’alphabet grec est un élément central de la symbolique technique. Ses lettres représentent des grandeurs, des constantes et des angles en électrotechnique, en physique et en mécanique. Des variantes comme ϑ, φ et ε améliorent la lisibilité et la précision des notations.',
    quelle: `D’après le document «${NB}L’alphabet grec dans les sciences et la technique${NB}» de Tom Bleyer.`,
  },
};
