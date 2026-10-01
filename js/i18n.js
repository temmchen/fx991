// i18n.js – Texte der Rechneranzeige (Menüs, Setup, Meldungen) auf Deutsch, Englisch und Französisch.
// Deutsch folgt dem fx-991DE X, Englisch dem fx-991EX; Französisch ist eine eigene Übersetzung.

let sprache = 'de';

export function setzeSprache(s) {
  if (s === 'de' || s === 'en' || s === 'fr') sprache = s;
}
export const aktuelleSprache = () => sprache;

/// T('schluessel') → Text in der aktuellen Sprache (Fallback Deutsch, dann Schlüssel)
export function T(k) {
  const e = TEXTE[k];
  if (!e) return k;
  return e[sprache] ?? e.de ?? k;
}

/// Text in einer bestimmten Sprache
export const TS = (k, s) => (TEXTE[k] ? TEXTE[k][s] ?? TEXTE[k].de : k);

const t = (de, en, fr) => ({ de, en, fr: fr ?? en });

const TEXTE = {
  // Hauptmenü
  'app.COMP': t('Berechnungen', 'Calculate', 'Calculs'),
  'app.CMPLX': t('Komplexe Zahlen', 'Complex', 'Complexes'),
  'app.BASE': t('Basis-N', 'Base-N', 'Base N'),
  'app.MAT': t('Matrizen', 'Matrix', 'Matrices'),
  'app.VCT': t('Vektoren', 'Vector', 'Vecteurs'),
  'app.STAT': t('Statistik', 'Statistics', 'Statistiques'),
  'app.DIST': t('Verteilungen', 'Distribution', 'Distributions'),
  'app.SHEET': t('Tabellenkalk.', 'Spreadsheet', 'Tableur'),
  'app.TABLE': t('Wertetabelle', 'Table', 'Tableau'),
  'app.EQN': t('Gleichungen', 'Equation/Func', 'Équations'),
  'app.INEQ': t('Ungleichungen', 'Inequality', 'Inéquations'),
  'app.VERIFY': t('Berechn. prüfen', 'Verify', 'Vérification'),
  'app.RATIO': t('Verhältnisse', 'Ratio', 'Proportions'),

  // Setup
  'setup.titel': t('SETUP', 'SETUP', 'CONFIGURATION'),
  'setup.io': t('Eingabe/Ausgabe', 'Input/Output', 'Entrée/Sortie'),
  'setup.winkel': t('Winkeleinheit', 'Angle Unit', "Unité d'angle"),
  'setup.zahl': t('Zahlenformat', 'Number Format', 'Format nombre'),
  'setup.ingenieur': t('Ingenieursymbol', 'Engineer Symbol', 'Symbole ingénieur'),
  'setup.bruch': t('Bruchergebnis', 'Fraction Result', 'Résultat fraction'),
  'setup.komplex': t('Komplex', 'Complex', 'Complexe'),
  'setup.statistik': t('Statistik', 'Statistics', 'Statistiques'),
  'setup.sheet': t('Tabellenkalk.', 'Spreadsheet', 'Tableur'),
  'setup.eqn': t('Gleichung/Funkt.', 'Equation/Func', 'Équation/Fonct.'),
  'setup.tabelle': t('Wertetabelle', 'Table', 'Tableau'),
  'setup.dezimal': t('Dezimalzeichen', 'Decimal Mark', 'Séparateur déc.'),
  'setup.tausender': t('Tausender-Trennz.', 'Digit Separator', 'Sép. des milliers'),
  'setup.schrift': t('Mehrzeil.-Schrift', 'MultiLine Font', 'Police multiligne'),
  'setup.sprache': t('Sprache', 'Language', 'Langue'),
  'io.MM': t('MathE/MathA', 'MathI/MathO', 'MathE/MathS'),
  'io.MD': t('MathE/DezimalA', 'MathI/DecimalO', 'MathE/DécimalS'),
  'io.LL': t('LinE/LinA', 'LineI/LineO', 'LinE/LinS'),
  'io.LD': t('LinE/DezimalA', 'LineI/DecimalO', 'LinE/DécimalS'),
  'winkel.D': t('Gradmaß (D)', 'Degree (D)', 'Degré (D)'),
  'winkel.R': t('Bogenmaß (R)', 'Radian (R)', 'Radian (R)'),
  'winkel.G': t('Neugrad (G)', 'Gradian (G)', 'Grade (G)'),
  'ein': t('Ein', 'On', 'Oui'),
  'aus': t('Aus', 'Off', 'Non'),
  'dezimal.punkt': t('Punkt', 'Dot', 'Point'),
  'dezimal.komma': t('Komma', 'Comma', 'Virgule'),
  'schrift.normal': t('Normale Schrift', 'Normal Font', 'Police normale'),
  'schrift.klein': t('Kleine Schrift', 'Small Font', 'Petite police'),
  'statfreq.titel': t('Häufigkeit', 'Frequency', 'Effectifs'),
  'eqnkomplex.titel': t('Komplexe Lösungen', 'Complex Roots', 'Racines complexes'),
  'sheet.info': t('Nicht im Übungsrechner', 'Not in this trainer', 'Absent du simulateur'),
  'fix.frage': t('Fix 0~9?', 'Fix 0~9?', 'Fix 0~9 ?'),
  'sci.frage': t('Sci 0~9?', 'Sci 0~9?', 'Sci 0~9 ?'),
  'norm.frage': t('Norm 1~2?', 'Norm 1~2?', 'Norm 1~2 ?'),

  // OPTN Berechnungen
  'optn.hyp': t('Hyperbolische Fkt.', 'Hyperbolic Func', 'Fonct. hyperbol.'),
  'optn.winkel': t('Winkeleinheit', 'Angle Unit', "Unité d'angle"),
  'optn.ingenieur': t('Ingenieursymbol', 'Engineer Symbol', 'Symbole ingénieur'),
  // OPTN Komplex
  'optn.arg': t('Argument', 'Argument', 'Argument'),
  'optn.konj': t('Konjugierte', 'Conjugate', 'Conjugué'),
  'optn.re': t('Realteil', 'Real Part', 'Partie réelle'),
  'optn.im': t('Imaginärteil', 'Imaginary Part', 'Partie imaginaire'),
  'optn.polar': t('Polarform ▸r∠θ', 'Polar Coord ▸r∠θ', 'Forme polaire ▸r∠θ'),
  'optn.rechtw': t('Normalform ▸a+bi', 'Rectangular ▸a+bi', 'Forme algébr. ▸a+bi'),
  // OPTN Basis-N
  'optn.dez': t('Dezimal (d)', 'Decimal (d)', 'Décimal (d)'),
  'optn.hex': t('Hexadezimal (h)', 'Hexadecimal (h)', 'Hexadécimal (h)'),
  'optn.bin': t('Binär (b)', 'Binary (b)', 'Binaire (b)'),
  'optn.okt': t('Oktal (o)', 'Octal (o)', 'Octal (o)'),
  // OPTN Matrizen / Vektoren
  'optn.matdef': t('Matrix definieren', 'Define Matrix', 'Définir matrice'),
  'optn.matbearb': t('Matrix bearbeiten', 'Edit Matrix', 'Modifier matrice'),
  'optn.det': t('Determinante', 'Determinant', 'Déterminant'),
  'optn.trn': t('Transposition', 'Transposition', 'Transposée'),
  'optn.ident': t('Einheitsmatrix', 'Identity', 'Matrice identité'),
  'optn.ref': t('Zeilenstufenform', 'Row Echelon Form', 'Forme échelonnée'),
  'optn.rref': t('Red. Zeilenstufenf.', 'Reduced Row Ech.', 'Éch. réduite'),
  'optn.vctdef': t('Vektor definieren', 'Define Vector', 'Définir vecteur'),
  'optn.vctbearb': t('Vektor bearbeiten', 'Edit Vector', 'Modifier vecteur'),
  'optn.punkt': t('Skalarprodukt', 'Dot Product', 'Produit scalaire'),
  'optn.vwinkel': t('Winkel', 'Angle', 'Angle'),
  'optn.einheitsv': t('Einheitsvektor', 'Unit Vector', 'Vecteur unitaire'),
  'mat.zeilen': t('Zeilen?', 'Rows?', 'Lignes ?'),
  'mat.spalten': t('Spalten?', 'Columns?', 'Colonnes ?'),
  'vct.dim': t('Dimension?', 'Dimension?', 'Dimension ?'),
  'mat.wahl': t('Welche Matrix?', 'Which matrix?', 'Quelle matrice ?'),
  'vct.wahl': t('Welcher Vektor?', 'Which vector?', 'Quel vecteur ?'),
  'leer': t('Leer', 'None', 'Vide'),
  // OPTN Statistik
  'stat.typ': t('Typ auswählen', 'Select Type', 'Choisir le type'),
  'stat.daten': t('Daten', 'Data', 'Données'),
  'stat.editor': t('Editor', 'Editor', 'Éditeur'),
  'stat.1var': t('1-Var-Berechnung', '1-Variable Calc', 'Calcul 1 variable'),
  'stat.2var': t('2-Var-Berechnung', '2-Variable Calc', 'Calcul 2 variables'),
  'stat.regber': t('Regressionsberechn.', 'Regression Calc', 'Calcul régression'),
  'stat.summe': t('Summation', 'Summation', 'Sommes'),
  'stat.variable': t('Variable', 'Variable', 'Variables'),
  'stat.minmax': t('Min/Max', 'Min/Max', 'Min/Max'),
  'stat.regression': t('Regression', 'Regression', 'Régression'),
  'stat.normal': t('Normalverteilung', 'Norm Dist', 'Loi normale'),
  'stat.einfuegen': t('Zeile einfügen', 'Insert Row', 'Insérer ligne'),
  'stat.alleloeschen': t('Alles löschen', 'Delete All', 'Tout effacer'),
  'stat.1v': t('1-Variable', '1-Variable', '1 variable'),
  // OPTN Prüfen
  'verify.wahr': t('Wahr', 'TRUE', 'VRAI'),
  'verify.falsch': t('Falsch', 'FALSE', 'FAUX'),

  // Gleichungen
  'eqn.lgs': t('Gleichungssystem', 'Simul Equation', 'Système linéaire'),
  'eqn.polynom': t('Polynom', 'Polynomial', 'Polynôme'),
  'eqn.unbekannte': t('Anzahl der Unbekannten?', 'Number of Unknowns?', "Nombre d'inconnues ?"),
  'eqn.grad': t('Grad?', 'Degree?', 'Degré ?'),
  'eqn.keine': t('Keine Lösung', 'No Solution', 'Pas de solution'),
  'eqn.unendlich': t('Unendlich viele Lösungen', 'Infinite Solution', 'Infinité de solutions'),
  'eqn.keinereell': t('Keine reelle Lösung', 'No Real Roots', 'Pas de racine réelle'),
  'eqn.xmin': t('x-Wert Min', 'x-Value Minimum', 'x du minimum'),
  'eqn.ymin': t('y-Wert Min', 'y-Value Minimum', 'y du minimum'),
  'eqn.xmax': t('x-Wert Max', 'x-Value Maximum', 'x du maximum'),
  'eqn.ymax': t('y-Wert Max', 'y-Value Maximum', 'y du maximum'),
  'ineq.alle': t('Alle reellen Zahlen', 'All Real Numbers', 'Tous les réels'),
  'ineq.keine': t('Keine Lösung', 'No Solution', 'Pas de solution'),
  'ineq.typ': t('Ungleichungstyp?', 'Inequality Type?', "Type d'inéquation ?"),

  // Wertetabelle
  'table.bereich': t('Tabellenbereich', 'Table Range', 'Plage du tableau'),
  'table.start': t('Start', 'Start', 'Début'),
  'table.ende': t('Ende', 'End', 'Fin'),
  'table.schritt': t('Schritt', 'Step', 'Pas'),

  // Verteilungen
  'dist.npd': t('Normal-Dichte', 'Normal PD', 'Normale densité'),
  'dist.ncd': t('Normal-Vert.', 'Normal CD', 'Normale cumulée'),
  'dist.inv': t('Invers Normal', 'Inverse Normal', 'Normale inverse'),
  'dist.bpd': t('Binomial-Dichte', 'Binomial PD', 'Binomiale P(X=x)'),
  'dist.bcd': t('Binomial-Vert.', 'Binomial CD', 'Binomiale P(X≤x)'),
  'dist.ppd': t('Poisson-Dichte', 'Poisson PD', 'Poisson P(X=x)'),
  'dist.pcd': t('Poisson-Vert.', 'Poisson CD', 'Poisson P(X≤x)'),
  'dist.liste': t('Liste', 'List', 'Liste'),
  'dist.variable': t('Variable', 'Variable', 'Variable'),
  'dist.unten': t('Untere', 'Lower', 'Inf'),
  'dist.oben': t('Obere', 'Upper', 'Sup'),
  'dist.flaeche': t('Fläche', 'Area', 'Aire'),

  // Verhältnisse
  'ratio.typ': t('Typ auswählen', 'Select Type', 'Choisir le type'),

  // Zurücksetzen
  'reset.einst': t('Einstellungen', 'Setup Data', 'Réglages'),
  'reset.speicher': t('Variablen/Speicher', 'Variable/Memory', 'Variables/Mémoire'),
  'reset.alles': t('Alles initialisieren', 'Initialize All', 'Tout initialiser'),
  'reset.frage.einst': t('Einstellungen zurücksetzen?', 'Reset Setup?', 'Réinitialiser les réglages ?'),
  'reset.frage.speicher': t('Variablen/Speicher löschen?', 'Clear Variable/Memory?', 'Effacer variables/mémoire ?'),
  'reset.frage.alles': t('Alles initialisieren?', 'Initialize All?', 'Tout initialiser ?'),
  'ja.nein': t('Ja:[=]  Nein:[AC]', 'Yes:[=]  Cancel:[AC]', 'Oui:[=]  Non:[AC]'),
  'fertig.ac': t('Fertig!  Drücken Sie [AC]', 'Done!  Press [AC]', 'Terminé !  Appuyez sur [AC]'),

  // Fehler
  'fehler.math': t('Math ERROR', 'Math ERROR', 'Math ERROR'),
  'fehler.syntax': t('Syntax ERROR', 'Syntax ERROR', 'Syntax ERROR'),
  'fehler.argument': t('Argument ERROR', 'Argument ERROR', 'Argument ERROR'),
  'fehler.stack': t('Stack ERROR', 'Stack ERROR', 'Stack ERROR'),
  'fehler.dimension': t('Dimension ERROR', 'Dimension ERROR', 'Dimension ERROR'),
  'fehler.variable': t('Variable ERROR', 'Variable ERROR', 'Variable ERROR'),
  'fehler.range': t('Range ERROR', 'Range ERROR', 'Range ERROR'),
  'fehler.zeit': t('Time Out', 'Time Out', 'Time Out'),
  'fehler.solve': t('Kann nicht lösen', "Can't Solve", 'Pas de solution'),
  'fehler.abbrechen': t('[AC] :Abbrechen', '[AC] :Cancel', '[AC] :Annuler'),
  'fehler.gehezu': t('[◀][▶]:Gehe zu', '[◀][▶]:Goto', '[◀][▶]:Aller à'),
  'fehler.solvehinweis': t('Anderen Startwert versuchen', 'Try another initial value', 'Essayer une autre valeur initiale'),

  // CALC / SOLVE / RECALL
  'solve.lr': t('L−R=', 'L−R=', 'G−D='),
  'solve.loesen': t('Lösen nach:', 'Solve for:', 'Résoudre pour :'),
  'recall.titel': t('Variablen abrufen', 'Recall', 'Rappel'),
  'qr.text': t('Zum Übungsrechner', 'Open the trainer', 'Vers le simulateur'),
  'menu.zurueck': t('◀ zurück', '◀ back', '◀ retour'),
};
