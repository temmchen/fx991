# Werkzeuge aus RPN42

Graph, Analysis, Gleichungen, Solver und Ausdruck/PDF stammen unverändert aus der RPN42-Web-App
(Repo temmchen/rpn42, Stand eb5a6a7 vom 30.09.2026; Doku dort: ARCHITEKTUR.md, OBERFLAECHE.md).
Kern-Module in diesem Ordner, Oberflächen in `ui/`, Stile in `css/werkzeuge-*.css`.

Angepasst für den fx-991 Trainer (bei einem Abgleich mit RPN42 erneut anwenden):

- `ui/graph-ui.js`: Speicherschlüssel `fx991.graph.ui` statt `rpn42.graph.ui` (beide Apps liegen auf
  temmchen.github.io und teilen sich localStorage); PNG-Name `fx991-Graph.png`.
- `ui/print-ui.js`: Standardtitel, Kopf- und Fußzeile „fx-991DE X Trainer“; Zurück-Knopf mit
  `ctx.zurueckText` (Hilfe statt „Mehr“); Stylesheet `css/werkzeuge-print.css` (eine Ebene tiefer).
- `ui/tools-ui.js`, `constants.js`: „→ X“/„in den Stack“ → „→ Ans“/„in den Rechner (A, B, …)“
  (der Casio hat keinen Stack; app.js legt einen Wert in Ans, mehrere auf einmal in A, B, C …).
- `ui/common.js`: Standardtitel beim Teilen.
- `css/werkzeuge-app.css` = `css/app.css` von RPN42 mit Casio-Farben (Akzent blau, Rechner-Reiter dunkel).

Die Brücke zum Casio-Rechner steht in `js/zeichnen.js` (Casio-Eingabe → Funktionsterm, SHIFT OPTN)
und in `js/app.js` (ctx: push → Ans, plot, Solver-Variablen).
