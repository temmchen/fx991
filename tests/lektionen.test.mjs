// lektionen.test.mjs – jede Tastenfolge der Lektionen (alle Sprachen) liefert das angegebene Ergebnis,
// und jede Musterlösung der Aufgaben besteht „Prüfen“.
import { run, check } from './harness.mjs';
import { Rechner } from '../js/rechner.js';
import { tastenfolge } from '../js/tasten.js';
import { ALLE } from '../js/inhalt.js';
import { pruefeAufgabe, normText } from '../js/hilfe.js';
import { anzeige } from './rechner.test.mjs';

function tippe(r, folge) {
  for (const t of tastenfolge(folge)) r.taste(t);
}

for (const sprache of ['de', 'en', 'fr']) {
  const lektionen = ALLE[sprache].lektionen;
  if (!lektionen || lektionen.length === 0) continue;
  for (const l of lektionen) {
    run(`Lektion ${sprache}/${l.id}`, () => {
      (l.schritte || []).forEach((s, j) => {
        if (!s.tasten) return;
        const r = new Rechner(sprache);
        tippe(r, l.vorbereitung || '[ON]');
        for (let k = 0; k < j; k++) {
          const v = l.schritte[k];
          if (v.kette && v.tasten) tippe(r, v.tasten);
        }
        tippe(r, s.tasten);
        const text = anzeige(r);
        if (s.ergebnis !== undefined) {
          check(normText(text) === normText(s.ergebnis), `Schritt ${j + 1}: „${text}“ statt „${s.ergebnis}“`);
        } else {
          check(!/ERROR|Time Out/.test(text), `Schritt ${j + 1}: Fehler „${text}“`);
        }
      });
      (l.aufgaben || []).forEach((a, j) => {
        const r = new Rechner(sprache);
        tippe(r, l.vorbereitung || '[ON]');
        if (a.vorbereitung) tippe(r, a.vorbereitung);
        tippe(r, a.loesung);
        const ok = pruefeAufgabe(a, r);
        check(ok === true, `Aufgabe ${j + 1}: Prüfen ergibt ${ok} (Anzeige „${anzeige(r)}“, Ans ${JSON.stringify(r.ans, (k, v) => (typeof v === 'bigint' ? v.toString() : v))})`);
      });
    });
  }
}
