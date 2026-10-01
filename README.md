# fx-991DE X Trainer

**Übungsrechner für den Unterricht** nach dem Vorbild des wissenschaftlichen Taschenrechners
**CASIO fx-991DE X** (ClassWiz) – im Browser, auf dem Handy (als App installierbar) und am Beamer.
Deutsch, English, Français.

👉 **https://temmchen.github.io/fx991/**

<img src="qr-code.png" alt="QR-Code zur Web-App" width="180">

Die Schülerinnen und Schüler üben genau die Tastenfolgen, die sie auch an ihrem eigenen Rechner
brauchen: gleiche Tastenbelegung (gelb = SHIFT, rot = ALPHA), Eingabe im Lehrbuchformat mit
Schablonen, exakte Ergebnisse (Brüche, Wurzeln, π) und dieselbe Rangfolge der Rechenzeichen
(z. B. 6 ÷ 2(1 + 2) = 1, −3² = −9). Gerechnet wird klassisch algebraisch – kein RPN.

## Inhalt

- **Rechner** mit den Anwendungen des fx-991DE X: Berechnungen, Komplexe Zahlen, Basis-N, Matrizen,
  Vektoren, Statistik (1 Variable, 7 Regressionen), Verteilungen (Normal, Binomial, Poisson),
  Wertetabelle, Gleichungen (LGS bis 4 Unbekannte, Polynome bis Grad 4), Ungleichungen,
  Berechnungen prüfen, Verhältnisse. CALC, SOLVE, ∫, d/dx, Σ, STO/RECALL, M+, ENG,
  Ingenieursymbole, 47 Konstanten (CONST), 40 Umrechnungen (CONV), SETUP wie am Gerät.
  Die Tabellenkalkulation ist nicht enthalten.
- **Werkzeuge wie ein Grafikrechner** (aus der Web-App [RPN42](https://temmchen.github.io/rpn42/)),
  als Reiter unten: **Graph** (Funktionen zeichnen, Nullstellen, Extrema, Wendepunkte, Schnittpunkte,
  Tangente/Normale, Flächen), **Analysis** (Ableitungen, Integrale, Kennwerte der Elektrotechnik),
  **Gleichungen** (LGS bis 8 Unbekannte mit Lösungsweg, Polynome bis Grad 10, beliebige Gleichungen),
  **Solver** (Formeln nach jeder Größe auflösen) und **Ausdruck/PDF**.
  **SHIFT OPTN** am Rechner zeichnet direkt im Graphen – aus Berechnungen (Term mit x), Wertetabelle,
  Gleichungen, Ungleichungen und Statistik (Messpunkte mit Regressionskurve). Werte aus den
  Werkzeugen kommen mit **→ Ans** in den Rechner (ein Punkt in x und y, mehrere Lösungen in A, B, C …).
- **Hilfe** in drei Sprachen: 17 Lektionen (von „Erste Schritte“ bis „Fehler-Detektiv“, mit
  Beispielen aus der Elektrotechnik), jeweils mit **▶ Vorführen** (die Tasten leuchten nacheinander
  auf) und Aufgaben mit **Prüfen**; Tastenhilfe für jede Taste; Werkzeuge; Tipps.
- **Griechisches Alphabet** (Hilfe-Reiter **αβγ**): alle 24 Buchstaben mit Namen und Varianten,
  Lernkarte, Bedeutung in Elektrotechnik, Physik/Mechanik und Mathematik, Konstanten und
  Kennwerte (ε₀, μ₀, ω, ϱ/ϰ/α von Kupfer und Aluminium …) – mit **▶** führt der Rechner vor, wie man
  sie eintippt (CONST). Nach dem Skript „Das griechische Alphabet in der Technik“.
- **Beamer**-Modus mit großer Tastenspur, **QR**-Knopf (bildschirmfüllend, auch Taste Q),
  **hell/dunkel** per Knopf ☀︎ | ☾ (ohne Wahl wie das System).
- Hochformat: ein Bereich mit Reiterleiste; Querformat/Laptop: Rechner links, Hilfe oder Werkzeug rechts.
- Läuft **offline** (Service Worker). Auf dem iPhone: Safari → Teilen → „Zum Home-Bildschirm“.
  Neue Versionen lädt der Trainer im Hintergrund; sie gelten ab dem nächsten Neuladen bzw. Öffnen.

Sprache per Knopf oder Adresse: `?lang=de`, `?lang=en`, `?lang=fr`; `?beamer=1`, `?hilfe=1`,
`?tab=graph|analysis|equations|solver|hilfe`, Funktionen direkt zeichnen: `?f=x^2-4;sin(x)`.
Die Werkzeuge sind derzeit nur auf Deutsch.

## Für Lehrkräfte

Am Beamer: **Beamer** einschalten (große Tastenspur), Lektion öffnen, **▶ Vorführen** – die Klasse sieht
jede Taste aufleuchten und die Folge unten mitlaufen. **Tastenhilfe** erklärt jede Taste beim Antippen
(mit SHIFT/ALPHA davor die Zweitfunktion). Der **QR**-Knopf zeigt den Link für die Handys der Klasse.

Abweichungen vom Original sind möglich (z. B. bei Grenzfällen der exakten Anzeige, bei Rundungen in
der 10. Stelle oder bei sehr großen Datenmengen). Die deutsche Fassung verhält sich wie der fx-991DE X
(Dezimalkomma, Perioden mit Strich), die englische wie der fx-991EX.

## Technik

Reine ES-Module ohne Build und ohne Abhängigkeiten.

| Datei | Aufgabe |
| --- | --- |
| `js/zahl.js` | exakte Zahlen (BigInt-Brüche, Wurzelsummen, Vielfache von π) und Näherungen |
| `js/komplex.js`, `js/matrix.js` | komplexe Zahlen, Matrizen, Vektoren |
| `js/eingabe.js` | Eingabe im Lehrbuchformat: Schablonen, Cursor, DEL/INS/UNDO |
| `js/parser.js`, `js/auswertung.js` | Rangfolge des fx-991DE X, Auswertung, ∫ (Gauß-Kronrod), d/dx, Σ |
| `js/format.js` | Anzeige: Bruch, gemischte Zahl, √-Form, π-Form, Norm/Fix/Sci, ENG, Perioden |
| `js/rechner.js`, `js/modi.js`, `js/bildschirme.js` | Tastenlogik, Menüs, SETUP, alle Anwendungen |
| `js/gleichungen.js`, `js/statistik.js`, `js/verteilung.js`, `js/basisn.js` | Löser und Statistik |
| `js/anzeige.js`, `js/tastatur.js`, `css/app.css` | LCD, Gehäuse, Tastenfeld |
| `js/hilfe.js`, `js/inhalt/*.js` | Lektionen, Tastenhilfe, Werkzeuge, griechisches Alphabet, Tipps (de/en/fr) |
| `js/app.js`, `index.html` | Reiter, Aufteilung links/rechts, Sichern, Offline |
| `js/zeichnen.js` | Brücke Casio → Graph (SHIFT OPTN): Casio-Eingabe als Funktionsterm |
| `js/werkzeuge/`, `css/werkzeuge-*.css` | Graph, Analysis, Gleichungen, Solver, Ausdruck aus RPN42 (siehe `js/werkzeuge/LIESMICH.md`) |

Tests (JavaScriptCore, auf jedem Mac vorhanden):

```bash
/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m tests/run.mjs
```

Sie spielen Tastenfolgen am ganzen Rechner ab und prüfen jede Tastenfolge und jede Musterlösung
aller Lektionen in allen drei Sprachen, die Übersetzung Casio → Graph (gleiche Werte wie der Rechner)
und die Konstanten der αβγ-Seite. Bei jeder Veröffentlichung `VERSION` in `sw.js` erhöhen: der neue
Service Worker lädt alle Dateien und übernimmt sofort (skipWaiting); eine offene Seite lädt selbst neu,
solange noch nichts eingegeben wurde, sonst beim nächsten Verlassen.

---

## Section française

**Simulateur de calculatrice pour la classe**, inspiré de la **CASIO fx-991DE X** (ClassWiz) : même
clavier (jaune = SHIFT, rouge = ALPHA), saisie en écriture naturelle, résultats exacts (fractions,
racines, π) et mêmes priorités de calcul. Calcul algébrique classique (pas de NPI/RPN).
Aide en français, allemand et anglais : 17 leçons avec **▶ Démonstration** et exercices
autocorrigés, aide pour chaque touche, **alphabet grec** (lettres, noms, grandeurs et constantes en
électrotechnique et en physique), mode **Projecteur**, QR-code. Outils comme une calculatrice
graphique : **graphique**, analyse, équations, solveur, impression/PDF – **SHIFT OPTN** trace
directement depuis la calculatrice (outils en allemand pour l’instant). Fonctionne hors ligne.

👉 **https://temmchen.github.io/fx991/?lang=fr**

## English

A **classroom trainer** modelled on the **CASIO fx-991DE X / fx-991EX** (ClassWiz) scientific
calculator: same key layout, natural textbook input, exact results and the same order of operations.
Help in English, German and French with 17 lessons (key-by-key demonstrations, self-checking
exercises), key help, the **Greek alphabet** (letters, names, quantities and constants in electrical
engineering and physics), projector mode and QR code. Graphing-calculator tools: **graph**, analysis,
equations, solver, print/PDF – **SHIFT OPTN** plots straight from the calculator (tools in German
for now). Works offline.

👉 **https://temmchen.github.io/fx991/?lang=en**

---

Ein Lernprojekt von **Tom Bleyer** (LTEtt, Elektrotechnik). Kein Produkt von CASIO.
CASIO, ClassWiz und fx-991 sind Marken der CASIO Computer Co., Ltd.

Lizenz: MIT (siehe [LICENSE](LICENSE)).
