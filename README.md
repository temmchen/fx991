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
- **Hilfe** in drei Sprachen: 17 Lektionen (von „Erste Schritte“ bis „Fehler-Detektiv“, mit
  Beispielen aus der Elektrotechnik), jeweils mit **▶ Vorführen** (die Tasten leuchten nacheinander
  auf) und Aufgaben mit **Prüfen**; Tastenhilfe für jede Taste; Tipps.
- **Beamer**-Modus mit großer Tastenspur, **QR**-Knopf (bildschirmfüllend, auch Taste Q),
  **SHIFT OPTN** zeigt den QR-Code im Display.
- Läuft **offline** (Service Worker). Auf dem iPhone: Safari → Teilen → „Zum Home-Bildschirm“.

Sprache per Knopf oder Adresse: `?lang=de`, `?lang=en`, `?lang=fr`; `?beamer=1`, `?hilfe=1`.

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
| `js/hilfe.js`, `js/inhalt/*.js` | Lektionen, Tastenhilfe, Tipps (de/en/fr) |

Tests (JavaScriptCore, auf jedem Mac vorhanden):

```bash
/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m tests/run.mjs
```

Sie spielen Tastenfolgen am ganzen Rechner ab und prüfen jede Tastenfolge und jede Musterlösung
aller Lektionen in allen drei Sprachen. Bei jeder Veröffentlichung `VERSION` in `sw.js` erhöhen.

---

## Section française

**Simulateur de calculatrice pour la classe**, inspiré de la **CASIO fx-991DE X** (ClassWiz) : même
clavier (jaune = SHIFT, rouge = ALPHA), saisie en écriture naturelle, résultats exacts (fractions,
racines, π) et mêmes priorités de calcul. Calcul algébrique classique (pas de NPI/RPN).
Aide en français, allemand et anglais : 17 leçons avec **▶ Démonstration** et exercices
autocorrigés, aide pour chaque touche, mode **Projecteur**, QR-code. Fonctionne hors ligne.

👉 **https://temmchen.github.io/fx991/?lang=fr**

## English

A **classroom trainer** modelled on the **CASIO fx-991DE X / fx-991EX** (ClassWiz) scientific
calculator: same key layout, natural textbook input, exact results and the same order of operations.
Help in English, German and French with 17 lessons (key-by-key demonstrations, self-checking
exercises), key help, projector mode and QR code. Works offline.

👉 **https://temmchen.github.io/fx991/?lang=en**

---

Ein Lernprojekt von **Tom Bleyer** (LTEtt, Elektrotechnik). Kein Produkt von CASIO.
CASIO, ClassWiz und fx-991 sind Marken der CASIO Computer Co., Ltd.

Lizenz: MIT (siehe [LICENSE](LICENSE)).
