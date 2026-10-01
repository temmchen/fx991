// werkzeuge.test.mjs – Hilfe-Reiter „Werkzeuge“ (alle Sprachen), Oberflächentexte der Reiter, Module der
// Werkzeuge ohne DOM ladbar, Aussagen der Hilfe (Beispiele im Graphen, Gleichung 2^x = 10, Tabellenbereich).
import { run, check, near } from './harness.mjs';
import { Rechner } from '../js/rechner.js';
import { tastenfolge } from '../js/tasten.js';
import { inhalt, ALLE } from '../js/inhalt.js';
import { GraphModel, functionRow } from '../js/werkzeuge/graph.js';
import { EquationsModel } from '../js/werkzeuge/eqmodel.js';

const SPRACHEN = ['de', 'en', 'fr'];
const TABS = ['graph', 'analysis', 'equations', 'solver'];

run('Oberflächentexte vollständig', () => {
  const schluessel = Object.keys(ALLE.de.ui);
  for (const s of ['en', 'fr']) {
    const fehlt = schluessel.filter((k) => !(k in ALLE[s].ui));
    check(fehlt.length === 0, `${s}: es fehlen ${fehlt.join(', ')}`);
  }
  for (const s of SPRACHEN) {
    for (const k of ['tabRechner', 'tabGraph', 'tabAnalysis', 'tabGleichungen', 'tabSolver', 'tabHilfe', 'werkzeuge', 'inAns', 'inXY']) {
      check(typeof ALLE[s].ui[k] === 'string' && ALLE[s].ui[k] !== '', `${s}: ui.${k}`);
    }
  }
});

run('Hilfe „Werkzeuge“: Abschnitte, Vorführung SHIFT OPTN, Beispiele', () => {
  for (const s of SPRACHEN) {
    const w = inhalt(s).werkzeuge;
    check(w && w.titel && w.intro && w.beispielKnopf, `${s}: Kopf der Werkzeug-Seite`);
    check(w.abschnitte.length === ALLE.de.werkzeuge.abschnitte.length, `${s}: gleich viele Abschnitte wie Deutsch`);
    w.abschnitte.forEach((a, i) => {
      const name = `${s} Abschnitt ${i + 1} (${a.titel})`;
      check(a.titel && a.text, name + ': Titel und Text');
      if (a.tab) check(TABS.includes(a.tab) && a.knopf, name + ': Reiter und Knopf');
      if (a.aktion) check(['drucken', 'zuruecksetzen'].includes(a.aktion) && a.knopf, name + ': Aktion');
      const de = ALLE.de.werkzeuge.abschnitte[i];
      check((a.tab || null) === (de.tab || null) && (a.aktion || null) === (de.aktion || null), name + ': wie Deutsch');
      if (a.tasten) {
        const r = new Rechner(s);
        let auftrag = null;
        r.zeichnen = (texte, opt) => { auftrag = { texte, opt }; };
        for (const id of tastenfolge(a.vorbereitung || '[ON]')) r.taste(id);
        for (const id of tastenfolge(a.tasten)) r.taste(id);
        check(auftrag && auftrag.texte.length === 1 && auftrag.texte[0] === 'f(x) = x^2-2*x-3', name + ': SHIFT OPTN zeichnet ' + JSON.stringify(auftrag));
        check(auftrag && auftrag.opt.grad === true, name + ': Gradmaß nach der Vorbereitung');
      }
      if (a.beispiel) {
        const g = new GraphModel();
        g.setRows(a.beispiel.map((t, k) => functionRow(t, k)));
        near(g.evaluate('f', 3), 0, 1e-12, name + ': f(3) = 0');
        near(g.evaluate('f', -1), 0, 1e-12, name + ': f(−1) = 0');
        near(g.evaluate('g', 1), 3, 1e-12, name + ': g(1) = 3');
      }
    });
  }
});

run('Werkzeuge: Aussagen der Hilfe', () => {
  const eq = new EquationsModel();
  eq.mode = 'equation';
  eq.lhs = '2^x';
  eq.rhs = '10';
  const res = eq.result();
  check(res.ok && res.out.solutions.length === 1, 'Gleichung 2^x = 10 lösbar: ' + JSON.stringify(res));
  if (res.ok) near(res.out.solutions[0], Math.log2(10), 1e-9, '2^x = 10 → x = log₂ 10');

  // Wertetabelle: nach dem Berechnen zeichnet SHIFT OPTN im Bereich Start … Ende
  const r = new Rechner('de');
  let auftrag = null;
  r.zeichnen = (texte, opt) => { auftrag = { texte, opt }; };
  for (const id of tastenfolge('[MENU]9[x][x²]=2[x]+3=[(−)]2=2=1==')) r.taste(id);
  check(r.ansicht().bild.art === 'gitter', 'Tabelle wird angezeigt: ' + r.ansicht().bild.art);
  for (const id of tastenfolge('[SHIFT][OPTN]')) r.taste(id);
  check(auftrag && JSON.stringify(auftrag.opt.bereich) === '[-2,2]', 'Bereich der Tabelle: ' + JSON.stringify(auftrag));
  // vor dem Berechnen: kein Bereich (der Graph behält sein Sichtfenster)
  const r2 = new Rechner('de');
  let a2 = null;
  r2.zeichnen = (texte, opt) => { a2 = { texte, opt }; };
  for (const id of tastenfolge('[MENU]9[x][x²][SHIFT][OPTN]')) r2.taste(id);
  check(a2 && a2.texte[0] === 'f(x) = x^2' && a2.opt.bereich === undefined, 'ohne Tabelle kein Bereich: ' + JSON.stringify(a2));
});

// Oberflächen der Werkzeuge: ohne DOM auf oberster Ebene ladbar (Syntax, Importe, Pfade)
for (const p of ['../js/werkzeuge/ui/graph-ui.js', '../js/werkzeuge/ui/tools-ui.js', '../js/werkzeuge/ui/print-ui.js']) {
  let ok = true, msg = '';
  try {
    const m = await import(p);
    ok = Object.keys(m).some((k) => k.startsWith('mount'));
    if (!ok) msg = 'keine mount-Funktion';
  } catch (e) { ok = false; msg = e.message; }
  run(`Modul ${p.split('/').pop()} ladbar`, () => check(ok, msg));
}
