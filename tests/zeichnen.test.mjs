// zeichnen.test.mjs – Brücke Casio → Graph: der übersetzte Term liefert im Graphen (RPN42-Modell)
// dieselben Werte wie der Casio-Rechner selbst (Casio-Rangfolge, Grad/Bogenmaß).
import { run, check, near } from './harness.mjs';
import { Rechner } from '../js/rechner.js';
import { tastenfolge } from '../js/tasten.js';
import { parse } from '../js/parser.js';
import * as A from '../js/auswertung.js';
import * as Z from '../js/zahl.js';
import { funktionstext, polynomText, regressionText, enthaeltX } from '../js/zeichnen.js';
import { GraphModel, functionRow } from '../js/werkzeuge/graph.js';

/// Casio-Eingabe aus einer Tastenfolge (ohne =)
function eingabe(folge, vorher = '') {
  const r = new Rechner('de');
  for (const t of tastenfolge(vorher)) r.taste(t);
  for (const t of tastenfolge(folge)) r.taste(t);
  return { r, zeile: r.haupt.eingabe.wurzel };
}

function casioWert(r, zeile, x) {
  const ktx = r.ktx();
  ktx.lokal = { x: Z.D(x) };
  const anw = parse(zeile);
  const k = anw[0].a === 'rel' ? anw[0].r : anw[0];
  return Z.zahl(A.werte(k, ktx));
}

function graphWert(text, x, grad) {
  const g = new GraphModel();
  g.setRows([functionRow('f(x) = ' + text, 0)]);
  if (grad) g.settings.degrees = true;
  return g.evaluate('f', x);
}

function vergleiche(name, folge, xs, { vorher = '', grad = false } = {}) {
  const { r, zeile } = eingabe(folge, vorher);
  let text;
  try {
    text = funktionstext(zeile, r);
  } catch (e) {
    check(false, `${name}: nicht übersetzbar (${e.message})`);
    return;
  }
  for (const x of xs) {
    const soll = casioWert(r, zeile, x);
    const ist = graphWert(text, x, grad);
    check(Math.abs(ist - soll) <= 1e-9 * Math.max(1, Math.abs(soll)), `${name} bei x=${x}: Graph ${ist} ≠ Casio ${soll} (Term „${text}“)`);
  }
}

run('Casio-Eingabe → Graph', () => {
  vergleiche('Parabel', '[x][x²]−2[x]−3', [-2, 0, 1.5, 4]);
  vergleiche('Casio-Rangfolge 1÷2x', '1÷2[x]', [0.5, 4, -3]);
  vergleiche('x÷2x', '[x]÷2[x]', [1, 3]);
  vergleiche('Wurzel und Bruch', '[√][x][▶]+[▫/▫]1[▼][x]', [0.25, 4, 9]);
  vergleiche('sin im Gradmaß', '[sin][x])', [30, 45, 200], { grad: true });
  vergleiche('sin im Bogenmaß', '[sin][x])', [0.5, 2], { vorher: '[SHIFT][MENU]22' });
  vergleiche('Exponent', '2[x^][x][▶]', [-1, 0, 3.5]);
  vergleiche('−x²', '[(−)][x][x²]', [-2, 3]);
  vergleiche('dritte Wurzel', '[SHIFT][x^]3[▶][x]', [8, 27, 2]);
  vergleiche('log₂', '[log▫▫]2[▶][x]', [8, 3]);
  vergleiche('ln', '[ln][x])', [1, 7.5]);
  vergleiche('eˣ', '[SHIFT][ln][x]', [-1, 0.5, 2]);
  vergleiche('Betrag', '[SHIFT][(][x]−2', [0, 5]);
  vergleiche('3x(x+1)', '3[x]([x]+1)', [-2, 0.5]);
  vergleiche('Kehrwert', '[x][x⁻¹]', [0.5, -4]);
  vergleiche('Variable A', '[ALPHA][(−)][x]', [2, -1.5], { vorher: '2.5[STO][(−)]' });
  vergleiche('Ingenieursymbol k', '4.7[OPTN]36[x]', [2]);
  vergleiche('π und Bruch', '[▫/▫][SHIFT][×10ˣ][▼]4[▶][x]', [2]);
  vergleiche('gemischter Bruch', '[SHIFT][▫/▫]1[▶]1[▼]2[▶][x]', [3]);
  vergleiche('×10ˣ', '1.5[×10ˣ][(−)]3[x]', [1000]);
  vergleiche('y = …', '[ALPHA][S⇔D][ALPHA][CALC]2[x]+1', [3]);
  vergleiche('Quadrat einer Summe', '([x]+1)[x²]', [2, -3]);
  vergleiche('Potenz einer Funktion', '[sin][x])[x²]', [1], { vorher: '[SHIFT][MENU]22' });
  vergleiche('Fakultät', '[x][SHIFT][x⁻¹]', [5]);
  check(enthaeltX(eingabe('[▫/▫]1[▼][x]').zeile), 'x im Nenner erkannt');
  check(!enthaeltX(eingabe('2+3').zeile), 'ohne x');
  let fehler = '';
  try { funktionstext(eingabe('[∫][x][▶]0[▶][x]').zeile, new Rechner('de')); } catch (e) { fehler = e.art; }
  check(fehler === 'syntax', 'Integral ist nicht zeichenbar');
});

run('Polynome und Regression', () => {
  const p = polynomText([Z.Q(1n), Z.Q(-2n), Z.Q(-3n)]);
  check(p === 'x^2 - 2*x - 3', 'Polynomtext: ' + p);
  near(graphWert(p, 4, false), 5, 1e-12, 'Polynom im Graph');
  const q = polynomText([Z.Q(-1n, 2n), Z.Q(0n), Z.Q(0n), Z.Q(1n)]);
  near(graphWert(q, 2, false), -3, 1e-12, 'Polynom mit Bruch: ' + q);
  const lin = regressionText('lin', { a: Z.Q(-1n, 20000n), b: Z.Q(427n, 200000n) });
  near(graphWert(lin, 6, false), -0.00005 + 0.002135 * 6, 1e-12, 'Regressionsgerade');
  const ex = regressionText('eexp', { a: Z.D(2), b: Z.D(0.5) });
  near(graphWert(ex, 2, false), 2 * Math.exp(1), 1e-12, 'e-Regression');
  // lesbar wie beim Rechner (a + bx, ohne „+ -“ und ohne überflüssige Nullen/Klammern)
  const lesbar = [
    ['lin', { a: Z.Q(0n), b: Z.Q(2n) }, '2*x', 3, 6],
    ['lin', { a: Z.Q(1n), b: Z.Q(-1n, 2n) }, '1 - 0.5*x', 4, -1],
    ['quad', { a: Z.Q(-3n), b: Z.Q(-2n), c: Z.Q(1n) }, '-3 - 2*x + x^2', 3, 0],
    ['log', { a: Z.Q(1n), b: Z.Q(2n) }, '1 + 2*ln(x)', Math.E, 3],
    ['eexp', { a: Z.Q(3n), b: Z.Q(-1n) }, '3*e^(-x)', 0, 3],
    ['eexp', { a: Z.Q(2n), b: Z.D(0.5) }, '2*e^(0.5*x)', 2, 2 * Math.E],
    ['abexp', { a: Z.Q(2n), b: Z.Q(3n) }, '2*3^x', 2, 18],
    ['pot', { a: Z.Q(1n), b: Z.Q(-2n) }, 'x^(-2)', 2, 0.25],
    ['inv', { a: Z.Q(1n), b: Z.Q(-4n) }, '1 - 4/x', 2, -1],
    ['inv', { a: Z.Q(0n), b: Z.Q(1n) }, '1/x', 4, 0.25],
  ];
  for (const [typ, k, text, x, y] of lesbar) {
    const t = regressionText(typ, k);
    check(t === text, `Regression ${typ}: „${t}“ statt „${text}“`);
    near(graphWert(t, x, false), y, 1e-12, `Regression ${typ} bei x=${x}`);
  }
});

run('SHIFT OPTN zeichnet aus allen passenden Modi', () => {
  const mit = (folge) => {
    const r = new Rechner('de');
    let auftrag = null;
    r.zeichnen = (texte, opt) => { auftrag = { texte, opt }; };
    for (const t of tastenfolge(folge)) r.taste(t);
    return { r, auftrag };
  };
  let a = mit('[x][x²]−2[x]−3[SHIFT][OPTN]').auftrag;
  check(a && a.texte[0] === 'f(x) = x^2-2*x-3' && a.opt.grad === true, 'Berechnungen: ' + JSON.stringify(a));
  a = mit('[x][x²]−2[x]−3=[SHIFT][OPTN]').auftrag;
  check(a && a.texte.length === 1, 'nach = die letzte Rechnung');
  a = mit('[MENU]9[x][x²]=2[x]+3=[SHIFT][OPTN]').auftrag;
  check(a && a.texte.join('|') === 'f(x) = x^2|g(x) = 2*x+3', 'Wertetabelle: ' + JSON.stringify(a));
  a = mit('[MENU][(−)]22 1=2=[(−)]2=[SHIFT][OPTN]').auftrag;
  check(a && a.texte[0] === 'p(x) = x^2 + 2*x - 2', 'Polynom: ' + JSON.stringify(a));
  a = mit('[MENU][(−)]22 1=2=[(−)]2==[SHIFT][OPTN]').auftrag;
  check(a && a.texte[0] === 'p(x) = x^2 + 2*x - 2', 'Polynom aus der Lösungsanzeige');
  a = mit('[MENU][(−)]12 1=2=3=2=3=4=[SHIFT][OPTN]').auftrag;
  check(a && a.texte.length === 2 && a.texte[0].startsWith('g1(x) = '), 'Gleichungssystem: ' + JSON.stringify(a));
  if (a) {
    const g = new GraphModel();
    g.setRows(a.texte.map((t, i) => functionRow(t, i)));
    near(g.evaluate('g1', -1), 2, 1e-12, 'Gerade 1 geht durch die Lösung (−1 | 2)');
    near(g.evaluate('g2', -1), 2, 1e-12, 'Gerade 2 geht durch die Lösung (−1 | 2)');
  }
  a = mit('[MENU]62 1=2=3=[▶][▲][▲][▲]2=4=6=[AC][SHIFT][OPTN]').auftrag;
  check(a && a.opt.punkte && a.opt.punkte.length === 3 && a.texte[0].startsWith('r(x) = '), 'Statistik: ' + JSON.stringify(a));
  a = mit('[MENU][°′″]22 1=2=[(−)]3=[SHIFT][OPTN]').auftrag;
  check(a && a.texte[0] === 'p(x) = x^2 + 2*x - 3', 'Ungleichung');
  const ohne = new Rechner('de');
  for (const t of tastenfolge('[x][x²][SHIFT][OPTN]')) ohne.taste(t);
  check(ohne.ansicht().bild.art === 'qr', 'ohne Graph: QR-Code wie beim Rechner');
});
