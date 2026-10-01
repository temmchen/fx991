// run.mjs – alle Tests: /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -m tests/run.mjs
import { results, report } from './harness.mjs';

const files = [
  './kern.test.mjs',      // zahl, format, parser, auswertung
  './rechner.test.mjs',   // Tastenfolgen am ganzen Rechner
  './lektionen.test.mjs', // alle Tastenfolgen der Hilfe/Lektionen
  './zeichnen.test.mjs',  // Brücke Casio → Graph (Werkzeuge aus RPN42)
  './werkzeuge.test.mjs', // Hilfe „Werkzeuge“, Reitertexte, Werkzeug-Module
  './griechisch.test.mjs', // Hilfe „αβγ“: Alphabet, Fachgebiete, Konstanten am Rechner
];

for (const f of files) {
  try {
    await import(f);
  } catch (e) {
    results.fail.push(`[${f}] nicht ladbar: ${e && e.message ? e.message : e}`);
  }
}
const ok = report();
if (!ok && typeof quit === 'function') quit(1);
