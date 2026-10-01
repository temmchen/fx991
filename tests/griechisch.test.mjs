// griechisch.test.mjs – Hilfe-Reiter „αβγ“: Alphabet vollständig (Namen in drei Sprachen), Einträge der
// Fachgebiete übersetzt, jede Tastenfolge der Konstanten liefert am Rechner den angegebenen Wert.
import { run, check, near } from './harness.mjs';
import { Rechner } from '../js/rechner.js';
import { tastenfolge } from '../js/tasten.js';
import * as Z from '../js/zahl.js';
import { ALLE } from '../js/inhalt.js';
import { ALPHABET, ETECHNIK, PHYSIK, MATHE, KONSTANTEN, TEXTE, STANDARD, buchstabenName } from '../js/inhalt/griechisch.js';

const SPRACHEN = ['de', 'en', 'fr'];

run('Griechisches Alphabet', () => {
  check(ALPHABET.length === 24, '24 Buchstaben: ' + ALPHABET.length);
  const gross = ALPHABET.map((b) => b.gross).join('');
  const klein = ALPHABET.map((b) => b.klein).join('');
  check(gross === 'ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ', 'Großbuchstaben in der richtigen Reihenfolge: ' + gross);
  check(klein === 'αβγδεζηθικλμνξοπρστυφχψω', 'Kleinbuchstaben in der richtigen Reihenfolge: ' + klein);
  for (const b of ALPHABET) {
    for (const s of SPRACHEN) check(typeof b.name[s] === 'string' && b.name[s].length >= 2, `${b.klein}: Name ${s}`);
  }
  check(ALPHABET.filter((b) => b.variante).map((b) => b.variante).join('') === 'ϵϑϰϱϕ', 'Varianten ε θ κ ρ φ');
  check(buchstabenName('ϱ', 'de') === 'Rho' && buchstabenName('ϑ', 'fr') === 'thêta', 'Namen auch für Varianten');
  check(buchstabenName('μ', 'de') === 'My' && buchstabenName('ν', 'en') === 'Nu', 'Name ohne Aussprachehinweis');
  check(buchstabenName('ε<sub>0</sub>', 'de') === 'Epsilon', 'Name eines Symbols mit Index');
});

run('Griechisch: Fachgebiete und Texte', () => {
  for (const [name, liste] of [['Elektrotechnik', ETECHNIK], ['Physik', PHYSIK], ['Mathematik', MATHE]]) {
    check(liste.length >= 4, name + ': Einträge');
    for (const x of liste) {
      for (const z of x.zeichen.split(', ')) check(buchstabenName(z, 'de') !== '', `${name}: ${z} ist ein griechischer Buchstabe`);
      for (const s of SPRACHEN) {
        check(typeof x.bedeutung[s] === 'string' && x.bedeutung[s] !== '', `${name} ${x.zeichen}: Bedeutung ${s}`);
        if (x.formel && typeof x.formel === 'object') check(typeof x.formel[s] === 'string', `${name} ${x.zeichen}: Formel ${s}`);
      }
    }
  }
  const schluessel = Object.keys(TEXTE.de);
  for (const s of SPRACHEN) {
    for (const k of schluessel) check(typeof TEXTE[s][k] === 'string' && TEXTE[s][k] !== '', `Text ${k} (${s})`);
    check(ALLE[s].ui.griechisch === 'αβγ' && ALLE[s].ui.griechischTitel, `Reiter „αβγ“ (${s})`);
  }
});

run('Griechisch: Konstanten am Rechner', () => {
  for (const x of KONSTANTEN) {
    for (const s of SPRACHEN) check(x.bedeutung[s], `${x.zeichen}: Bedeutung ${s}`);
    if (x.wert && x.zahl !== null) {
      const w = Number(x.wert.replace('×10^', 'e'));
      near(w, x.zahl, 1e-9 * Math.abs(x.zahl), `${x.zeichen}: angezeigter Wert ${x.wert}`);
    }
    if (!x.tasten) continue;
    for (const s of SPRACHEN) {
      const r = new Rechner(s);
      for (const id of tastenfolge(STANDARD)) r.taste(id);
      for (const id of tastenfolge(x.tasten)) r.taste(id);
      const v = r.ans ? Z.zahl(r.ans) : NaN;
      check(Math.abs(v - x.zahl) <= 1e-9 * Math.abs(x.zahl), `${x.zeichen} (${s}): ${x.tasten} → Ans = ${v}, erwartet ${x.zahl}`);
    }
  }
});
