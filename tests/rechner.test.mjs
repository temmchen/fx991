// rechner.test.mjs – Tastenfolgen wie am echten Rechner → angezeigtes Ergebnis.
import { run, check } from './harness.mjs';
import { Rechner } from '../js/rechner.js';
import { tastenfolge } from '../js/tasten.js';
import { alsText } from '../js/format.js';

/// Text der aktuellen Anzeige (Ergebnis, Fehler, Lösung …)
export function anzeige(r) {
  const v = r.ansicht();
  if (!v.an) return 'AUS';
  const b = v.bild;
  const dz = r.einst.dezimal;
  switch (b.art) {
    case 'rechnen':
      if (!b.ergebnis) return 'EINGABE';
      if (b.ergebnis.art === 'el') return alsText(b.ergebnis.el, dz);
      if (b.ergebnis.art === 'basen') return b.ergebnis.zeilen.join('/');
      if (b.ergebnis.art === 'text') return b.ergebnis.text;
      if (b.ergebnis.art === 'matrix') return '[' + b.ergebnis.el.map((z) => z.map((e) => alsText(e, dz)).join(',')).join(';') + ']';
      return '?';
    case 'fehler': return b.titel;
    case 'loesung': case 'solve': case 'liste':
      return b.zeilen.map((z) => z.links + alsText(z.el, dz)).join(';');
    case 'text': return b.zeilen.filter(Boolean).join(' | ');
    case 'menu': return 'MENU:' + b.eintraege.map((e) => e.text).join(',');
    default: return b.art.toUpperCase();
  }
}

export function tippe(r, folge) {
  for (const t of tastenfolge(folge)) r.taste(t);
  return anzeige(r);
}

function rechne(folge, sprache = 'en') {
  const r = new Rechner(sprache);
  return tippe(r, folge);
}

function gleich(ist, soll, name) {
  check(ist === soll, `${name}: „${ist}“ statt „${soll}“`);
}

run('Grundrechnen und Lehrbuchformat', () => {
  gleich(rechne('[▫/▫]1[▼]3[▶]+[▫/▫]1[▼]4='), '7/12', 'Brüche addieren');
  gleich(rechne('1[▫/▫]3[▶]+1[▫/▫]4='), '7/12', 'Zahl vor der Bruchtaste wird Zähler');
  gleich(rechne('[√]8='), '2√2', 'Wurzel teilweise ziehen');
  gleich(rechne('6÷2(1+2)='), '1', 'Multiplikation ohne Zeichen bindet stärker');
  gleich(rechne('[(−)]2[x²]='), '-4', '−2² = −4');
  gleich(rechne('([(−)]2)[x²]='), '4', '(−2)² = 4');
  gleich(rechne('0.5+0.25='), '3/4', 'Dezimalzahlen als Bruch');
  gleich(rechne('1.2345678='), '1.2345678', 'langer Bruch → Dezimalzahl');
  gleich(rechne('2[×10ˣ]3='), '2000', '×10ˣ');
  gleich(rechne('8[x^][▫/▫]1[▼]3='), '2', 'gebrochener Exponent');
  gleich(rechne('[SHIFT][x^]3[▶]8='), '2', 'n-te Wurzel');
  gleich(rechne('2[x^]10='), '1024', 'Potenz');
  gleich(rechne('2[x^]40='), '1.099511628×10^12', 'große Zahl');
  gleich(rechne('[SHIFT][▫/▫]1[▶]1[▼]2[▶]+[▫/▫]2[▼]3='), '13/6', 'gemischter Bruch');
  gleich(rechne('[SHIFT][▫/▫]1[▶]1[▼]2[▶]+[▫/▫]2[▼]3=[SHIFT][S⇔D]'), '2 1/6', 'a b/c ⇔ d/c');
  gleich(rechne('1÷3=[S⇔D]'), '0.3333333333', 'S⇔D');
  gleich(rechne('2÷3[SHIFT]='), '0.6666666667', '≈');
  gleich(rechne('1÷([√]3[▶]+1)='), '(-1+√3)/2', 'Nenner rational machen');
  gleich(rechne('[SHIFT][×10ˣ]÷6='), '1/6π', 'π-Form');
  gleich(rechne('1÷0='), 'Math ERROR', 'Division durch 0');
  gleich(rechne('2+×3='), 'Syntax ERROR', 'Syntaxfehler');
  gleich(rechne('5[SHIFT][x⁻¹]='), '120', 'Fakultät');
  gleich(rechne('10[SHIFT][÷]4='), '210', 'nCr');
  gleich(rechne('10[SHIFT][×]4='), '5040', 'nPr');
  gleich(rechne('150×20[SHIFT][Ans]='), '30', 'Prozent');
  gleich(rechne('660÷880[SHIFT][Ans]='), '75', 'Prozentsatz');
  gleich(rechne('3+3[ALPHA][∫]3×3='), '6', 'Mehrfachanweisung 1');
  gleich(rechne('3+3[ALPHA][∫]3×3=='), '9', 'Mehrfachanweisung 2');
});

run('Funktionen und Winkel', () => {
  gleich(rechne('[sin]30)='), '1/2', 'sin 30°');
  gleich(rechne('[sin]30)=[S⇔D]'), '0.5', 'sin 30° dezimal');
  gleich(rechne('[sin]15)='), '(√6-√2)/4', 'sin 15°');
  gleich(rechne('[tan]75)='), '2+√3', 'tan 75°');
  gleich(rechne('[SHIFT][sin]0.5)='), '30', 'sin⁻¹');
  gleich(rechne('[SHIFT][cos][▫/▫][√]2[▶][▼]2[▶])='), '45', 'cos⁻¹ √2/2');
  gleich(rechne('[SHIFT][MENU]22[cos][SHIFT][×10ˣ])='), '-1', 'cos π im Bogenmaß');
  gleich(rechne('[SHIFT][MENU]22[SHIFT][cos]0)='), '1/2π', 'cos⁻¹ 0 im Bogenmaß');
  gleich(rechne('[log▫▫]2[▶]16='), '4', 'log₂ 16');
  gleich(rechne('[SHIFT][(−)]1000)='), '3', 'log 1000');
  gleich(rechne('[ln]1)='), '0', 'ln 1');
  gleich(rechne('[SHIFT][+]2[SHIFT][)]2)='), 'r=2√2, θ=45', 'Pol');
  gleich(rechne('[SHIFT][−]2[SHIFT][)]60)='), 'x=1, y=√3', 'Rec');
  gleich(rechne('[SHIFT][(]2−7[▶]×2='), '10', 'Betrag');
  gleich(rechne('2[°′″]20[°′″]30[°′″]+0[°′″]9[°′″]30[°′″]='), '2°30\'0"', 'Grad-Minuten-Sekunden');
  gleich(rechne('2.5=[°′″]'), '2°30\'0"', 'Dezimal → °′″');
  gleich(rechne('[OPTN]2 2'), 'EINGABE', 'OPTN Winkeleinheit');
});

run('Analysis', () => {
  gleich(rechne('[∫][x][x²][▶]1[▶]5='), '124/3', 'Integral');
  gleich(rechne('[SHIFT][∫][x][x²][▶]3='), '6', 'Ableitung');
  gleich(rechne('[SHIFT][x][x]+1[▶]1[▶]5='), '20', 'Summe');
  gleich(rechne('[SHIFT][MENU]22[SHIFT][∫][sin][x])[▶][SHIFT][×10ˣ]÷2='), '0', 'Ableitung von sin bei π/2');
});

run('Speicher, Ans, Verlauf', () => {
  const r = new Rechner('en');
  gleich(tippe(r, '3+5[STO][(−)]'), '8', 'STO A');
  gleich(tippe(r, '[ALPHA][(−)]×10='), '80', 'A verwenden');
  gleich(tippe(r, '0[STO][M+]'), '0', 'M löschen');
  gleich(tippe(r, '10×5[M+]'), '50', 'M+');
  gleich(tippe(r, '10+5[SHIFT][M+]'), '15', 'M−');
  gleich(tippe(r, '[ALPHA][M+]='), '35', 'M abrufen');
  gleich(tippe(r, '5='), '5', 'Startwert');
  gleich(tippe(r, '+1='), '6', 'Ans automatisch');
  gleich(tippe(r, '='), '7', '= wiederholt');
  gleich(tippe(r, '='), '8', '= wiederholt nochmals');
  gleich(tippe(r, '2+2=3+3=[▲]'), '4', 'Verlauf ▲');
  gleich(tippe(r, '4×3+2=[◀][DEL]−7=') , '5', 'Replay bearbeiten');
  gleich(tippe(r, '1234=[ENG]'), '1.234×10^3', 'ENG');
  gleich(tippe(r, '[ENG]'), '1234×10^0', 'ENG nochmals');
  gleich(tippe(r, '[SHIFT][ENG]'), '1.234×10^3', 'ENG ←');
  gleich(tippe(r, '[SHIFT][ENG]'), '0.001234×10^6', 'ENG ← nochmals');
  gleich(tippe(r, '1014=[SHIFT][°′″]'), '2×3×13^2', 'Primfaktoren');
  gleich(tippe(r, '3=[▫/▫]4='), '3/4', 'Bruchtaste nach Ergebnis: Ans wird Zähler');
});

run('CALC und SOLVE', () => {
  const r = new Rechner('en');
  gleich(tippe(r, '3[ALPHA][(−)]+[ALPHA][°′″][CALC]5=10='), '25', 'CALC');
  gleich(tippe(r, '[CALC]1=1='), '4', 'CALC erneut');
  const s = new Rechner('en');
  gleich(tippe(s, '[x][x²]−2[SHIFT][CALC]1=='), 'x=1.414213562;L−R=0', 'SOLVE');
  const t = new Rechner('en');
  gleich(tippe(t, '[x][x²][ALPHA][CALC]9[SHIFT][CALC][(−)]5=='), 'x=-3;L−R=0', 'SOLVE mit Startwert');
});

run('Einstellungen', () => {
  gleich(rechne('[SHIFT][MENU]12[SHIFT][MENU]313 10÷3×3='), '10.000', 'Fix 3 (DecimalO)');
  gleich(rechne('[SHIFT][MENU]12[SHIFT][MENU]313 [SHIFT]0 10÷3)×3='), '9.999', 'Rnd mit Fix 3');
  gleich(rechne('[SHIFT][MENU]313 100÷7[SHIFT]='), '14.286', 'Fix 3 mit ≈');
  gleich(rechne('[SHIFT][MENU]12 1÷4='), '0.25', 'MathI/DecimalO');
  gleich(rechne('[SHIFT][MENU]12 1÷4=[S⇔D]'), '1/4', 'DecimalO → Bruch');
  gleich(rechne('[SHIFT][MENU]41 999[OPTN]36+25[OPTN]36='), '1.024M', 'Ingenieursymbole');
  gleich(rechne('1÷200='), '1/200', 'Bruch');
  gleich(rechne('1÷200[SHIFT]='), '5×10^-3', 'Norm 1');
  gleich(rechne('[SHIFT][MENU]332 1÷200[SHIFT]='), '0.005', 'Norm 2');
});

run('Deutsche Fassung (Komma, Periode)', () => {
  gleich(rechne('1÷3=', 'de'), '1/3', 'Bruch');
  gleich(rechne('1÷3=[S⇔D]', 'de'), '0,(3)', 'Periode');
  gleich(rechne('1÷3=[S⇔D][S⇔D]', 'de'), '0,3333333333', 'Dezimal');
  gleich(rechne('0.1[ALPHA][√]6=', 'de'), '1/6', 'Periode eingeben');
});

run('Konstanten und Umrechnungen', () => {
  gleich(rechne('[SHIFT]713='), '299792458', 'c₀');
  gleich(rechne('5[SHIFT]812='), '250/127', 'cm → in');
  gleich(rechne('100[SHIFT]891='), '340/9', '°F → °C');
  gleich(rechne('[SHIFT]751='), '9.80665', 'g');
  gleich(rechne('25[SHIFT]892='), '77', '°C → °F');
});

run('Komplexe Zahlen', () => {
  gleich(rechne('[MENU]2(1+[ENG])[x^]4[▶]+(1−[ENG])[x²]='), '-4-2i', '(1+i)⁴+(1−i)²');
  gleich(rechne('[MENU]2 2[SHIFT][ENG]45='), '√2+√2i', 'Polarform eingeben');
  gleich(rechne('[MENU]2 1+[ENG][OPTN][▼]1='), '√2∠45', '▸r∠θ');
  gleich(rechne('[MENU]2 [√][(−)]4='), '2i', '√−4');
  gleich(rechne('[MENU]2 [SHIFT][(]3+4[ENG]='), '5', 'Betrag');
  gleich(rechne('[MENU]2 (3+4[ENG])÷(1−2[ENG])='), '-1+2i', 'Division');
});

run('Gleichungen, Ungleichungen, Verhältnisse', () => {
  gleich(rechne('[MENU][(−)]12 1=2=3=2=3=4=='), 'x=-1', 'LGS x');
  gleich(rechne('[MENU][(−)]12 1=2=3=2=3=4==='), 'y=2', 'LGS y');
  gleich(rechne('[MENU][(−)]22 1=2=[(−)]2=='), 'x₁=-1+√3', 'quadratisch x1');
  gleich(rechne('[MENU][(−)]22 1=2=[(−)]2==='), 'x₂=-1-√3', 'quadratisch x2');
  gleich(rechne('[MENU][(−)]22 1=2=[(−)]2===='), 'x=-1', 'Scheitel x');
  gleich(rechne('[MENU][(−)]22 1=2=[(−)]2====='), 'y=-3', 'Scheitel y');
  gleich(rechne('[MENU][(−)]22 1=0=1=='), 'x₁=i', 'komplexe Lösung');
  gleich(rechne('[MENU][(−)]23 1=[(−)]6=11=[(−)]6=='), 'x₁=3', 'kubisch');
  gleich(rechne('[MENU][(−)]12 1=1=2=2=2=4=='), 'Infinite Solution', 'unendlich viele');
  gleich(rechne('[MENU][°′″]22 1=2=[(−)]3=='), '-3<x<1', 'Ungleichung');
  gleich(rechne('[MENU][°′″]21 1=0=0=='), 'x<0, 0<x', 'x² > 0');
  gleich(rechne('[MENU][sin]1 3=8=12=='), 'X=9/2', 'Verhältnis');
});

run('Basis-N, Prüfen', () => {
  gleich(rechne('[MENU]3[log]11+1='), '0000 0000 0000 0000/0000 0000 0000 0100', 'binär');
  gleich(rechne('[MENU]3 15×37=[x^]'), '0000022B', 'nach HEX');
  gleich(rechne('[MENU]3[log]1010[OPTN]1 1100='), '0000 0000 0000 0000/0000 0000 0000 1000', 'and');
  gleich(rechne('[MENU][x⁻¹] 2+3[OPTN]1 5='), 'TRUE', 'Prüfen wahr');
  gleich(rechne('[MENU][x⁻¹] 2+3[OPTN]1 6='), 'FALSE', 'Prüfen falsch');
});

run('Statistik und Verteilungen', () => {
  gleich(rechne('[MENU]6 1 1=2=3=4=[AC][ALPHA][(−)]'), 'EINGABE', 'Daten eingeben');
  const r = new Rechner('en');
  tippe(r, '[MENU]6 1 1=2=3=4=[AC]');
  gleich(tippe(r, '[OPTN][▼]21='), '4', 'n');
  gleich(tippe(r, '[OPTN][▼]22='), '5/2', 'x̄');
  const s = new Rechner('en');
  tippe(s, '[MENU]6 2 1=2=3=[▶][▲][▲]2=4=6=[AC]');
  gleich(tippe(s, '[OPTN][▼]42='), '2', 'Regression b');
  gleich(tippe(s, '[OPTN][▼]43='), '1', 'Korrelation r');
  gleich(rechne('[MENU]7 1 36=2=35=='), 'p=0.1760326634', 'Normal-Dichte');
  gleich(rechne('[MENU]7 4 2 8=20=0.5=='), 'p=0.1201343536', 'Binomial-Dichte');
  gleich(rechne('[MENU]7 3 0.5=1=0=='), 'xInv=0', 'invers normal');
});

run('Matrizen und Wertetabelle', () => {
  const r = new Rechner('en');
  tippe(r, '[MENU]4 1 2 2 2=1=1=1=[AC]');
  gleich(tippe(r, '[OPTN][▼]4[OPTN]3)='), '1', 'det(MatA)');
  gleich(tippe(r, '[OPTN]3[x⁻¹]='), '[1,-1;-1,2]', 'MatA⁻¹');
  const t = new Rechner('en');
  tippe(t, '[MENU]9[x][x²]==[(−)]1=1=0.5==');
  const v = t.ansicht().bild;
  check(v.art === 'gitter' && v.zeilen[0][0] === '-1' && v.zeilen[0][1] === '1', 'Wertetabelle erste Zeile: ' + JSON.stringify(v.zeilen && v.zeilen[0]));
});
