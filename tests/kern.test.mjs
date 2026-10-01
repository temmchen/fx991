// kern.test.mjs – Rechenkern: exakte Zahlen, Formate, Verteilungen, Löser, Basis-N, Statistik.
import { run, check, near } from './harness.mjs';
import * as Z from '../js/zahl.js';
import * as K from '../js/komplex.js';
import * as F from '../js/format.js';
import * as V from '../js/verteilung.js';
import * as G from '../js/gleichungen.js';
import * as B from '../js/basisn.js';
import { Statistik } from '../js/statistik.js';

const { Q, D, P, S } = Z;
const txt = (w, einst = { io: 'MM' }) => F.alsText(F.formenReal(w, { zahl: { art: 'norm', stellen: 1 }, ...einst })[0].el);
const gleich = (ist, soll, name) => check(ist === soll, `${name}: „${ist}“ statt „${soll}“`);

run('Exakte Arithmetik', () => {
  gleich(Z.schluessel(Z.add(Q(1n, 3n), Q(1n, 6n))), 'q1/2', '1/3 + 1/6');
  gleich(txt(Z.wurzel(Q(12n))), '2√3', '√12');
  gleich(txt(Z.wurzel(Q(2n, 3n))), '√6/3', '√(2/3)');
  gleich(txt(Z.mul(Z.wurzel(Q(6n)), Z.wurzel(Q(3n)))), '3√2', '√6·√3');
  gleich(txt(Z.div(Q(1n), Z.add(Z.wurzel(Q(2n)), Z.wurzel(Q(3n))))), '√3-√2', '1/(√2+√3)');
  gleich(txt(Z.wurzel(Z.add(Q(3n), Z.mul(Q(2n), Z.wurzel(Q(2n)))))), '1+√2', '√(3+2√2)');
  gleich(txt(Z.potenz(Q(8n), Q(2n, 3n))), '4', '8^(2/3)');
  gleich(txt(Z.potenz(Q(-8n), Q(1n, 3n))), '-2', '(−8)^(1/3)');
  gleich(txt(Z.nteWurzel(Q(4n), Q(81n))), '3', '⁴√81');
  gleich(txt(Z.logBasis(Q(4n), Q(8n))), '3/2', 'log₄ 8');
  gleich(txt(Z.log10(Q(1n, 1000n))), '-3', 'log 0,001');
  gleich(txt(Z.mul(P(1n, 2n), Q(3n))), '3/2π', '3·π/2');
  gleich(txt(Z.div(P(3n), P(1n))), '3', '3π/π');
  gleich(txt(Z.fakultaet(Q(20n))), '2.432902008×10^18', '20!');
  gleich(txt(Z.nCr(Q(49n), Q(6n))), '13983816', '49 über 6');
  gleich(txt(Z.ausPeriode('0.1', '6')), '1/6', '0,16̄');
  gleich(txt(Z.ausPeriode('1.', '142857')), '8/7', '1,142857̄');
  let fehler = '';
  try { Z.div(Q(1n), Q(0n)); } catch (e) { fehler = e.art; }
  gleich(fehler, 'math', '1/0');
  try { Z.fakultaet(Q(70n)); fehler = ''; } catch (e) { fehler = e.art; }
  gleich(fehler, 'math', '70!');
});

run('Winkelfunktionen', () => {
  gleich(txt(Z.sin(Q(150n), 'D')), '1/2', 'sin 150°');
  gleich(txt(Z.cos(Q(225n), 'D')), '-√2/2', 'cos 225°');
  gleich(txt(Z.sin(Q(18n), 'D')), '(-1+√5)/4', 'sin 18°');
  gleich(txt(Z.cos(Q(36n), 'D')), '(1+√5)/4', 'cos 36°');
  gleich(txt(Z.tan(Q(-15n), 'D')), '-2+√3', 'tan(−15°)');
  gleich(txt(Z.sin(P(5n, 6n), 'R')), '1/2', 'sin 5π/6');
  gleich(txt(Z.cos(Q(100n), 'G')), '0', 'cos 100 gon');
  gleich(txt(Z.asin(Z.wurzel(Q(3n, 4n)), 'R')), '1/3π', 'sin⁻¹(√3/2) rad');
  gleich(txt(Z.atan(Q(-1n), 'D')), '-45', 'tan⁻¹(−1)');
  gleich(txt(Z.winkel(Q(-1n), Q(-1n), 'D')), '-135', 'Winkel (−1, −1)');
  let f = '';
  try { Z.tan(Q(90n), 'D'); } catch (e) { f = e.art; }
  gleich(f, 'math', 'tan 90°');
  near(Z.zahl(Z.sin(Q(1n), 'D')), Math.sin(Math.PI / 180), 1e-15, 'sin 1°');
});

run('Anzeigeformate', () => {
  const norm1 = { io: 'MD', zahl: { art: 'norm', stellen: 1 } };
  const dez = (v, e) => F.alsText(F.dezimal(v, { ...norm1, ...e }));
  gleich(dez(0.01), '0.01', 'Norm 1 Grenze');
  gleich(dez(0.0099), '9.9×10^-3', 'Norm 1 klein');
  gleich(dez(0.0099, { zahl: { art: 'norm', stellen: 2 } }), '0.0099', 'Norm 2');
  gleich(dez(9999999999), '9999999999', '10 Stellen');
  gleich(dez(99999999995), '1×10^11', 'Rundung über 10 Stellen');
  gleich(dez(1 / 3, { zahl: { art: 'fix', stellen: 3 } }), '0.333', 'Fix 3');
  gleich(dez(1234.5, { zahl: { art: 'sci', stellen: 3 } }), '1.23×10^3', 'Sci 3');
  gleich(dez(-2.5e-7), '-2.5×10^-7', 'negativ klein');
  gleich(dez(1234567.891, { tausender: true }), '1 234 567.891', 'Tausendertrennung');
  gleich(txt(Q(1234567n, 89n)), '1234567/89', 'Bruch 10 Stellen');
  gleich(txt(Q(12345678n, 89n)), '138715.4831', 'Bruch zu lang');
  gleich(txt(Q(7n, 4n), { io: 'MM', bruch: 'abc' }), '1 3/4', 'gemischt');
  gleich(F.alsText(F.periodisch(1n, 12n)), '0.08(3)', 'Periode 1/12');
  gleich(F.periodisch(1n, 8n), null, '1/8 bricht ab');
  gleich(F.alsText(F.ingenieurElemente(0.0047, 0, { zahl: { art: 'norm' }, ingenieur: true })), '4.7m', 'Symbol m');
  gleich(F.alsText(F.gms(2.5125, {})), '2°30\'45"', '°′″');
  gleich(F.alsText(F.primfaktoren(Q(360n))), '2^3×3^2×5', 'FACT 360');
  gleich(F.alsText(F.komplex(K.C(Q(3n), Q(-4n)), { io: 'MM' }, 'polar')), '5∠-53.13010235', 'polar');
});

run('Verteilungen', () => {
  near(V.Phi(1.96), 0.9750021048517795, 1e-13, 'Φ(1,96)');
  near(V.Phi(-5), 2.866515718791939e-7, 1e-12, 'Φ(−5)');
  near(V.normalCD(-1, 1, 1, 0), 0.6826894921370859, 1e-13, '±1σ');
  near(V.PhiInv(0.975), 1.959963984540054, 1e-12, 'Φ⁻¹(0,975)');
  near(V.PhiInv(1e-10), -6.361340902404056, 1e-10, 'Φ⁻¹ weit draußen');
  near(V.binomialPD(8, 20, 0.5), 0.1201343536, 1e-9, 'B(20; 0,5; 8)');
  near(V.binomialCD(32, 50, 0.6) - V.binomialCD(19, 50, 0.6), 0.7617504371071058, 1e-12, 'B kumuliert');
  near(V.poissonCD(3, 2.5), 0.7575761331330659, 1e-12, 'Poisson');
  near(V.normalR(8), 6.22096057427178e-16, 1e-10, 'R(8)');
});

run('Gleichungen', () => {
  const l = G.lgs([[Q(2n), Q(1n), Q(-1n), Q(8n)], [Q(-3n), Q(-1n), Q(2n), Q(-11n)], [Q(-2n), Q(1n), Q(2n), Q(-3n)]]);
  gleich(l.x.map((x) => txt(x)).join(','), '2,3,-1', 'LGS 3×3');
  gleich(G.lgs([[Q(1n), Q(1n), Q(1n)], [Q(1n), Q(1n), Q(2n)]]).art, 'keine', 'widersprüchlich');
  const p = G.polynom([Q(1n), Q(0n), Q(-2n), Q(0n)]);
  gleich(p.loesungen.map((x) => txt(x)).join(','), '√2,0,-√2', 'x³ − 2x');
  const q = G.polynom([Q(1n), Q(0n), Q(0n), Q(1n)]);
  gleich(q.loesungen.length, 3, 'x³ + 1: drei Lösungen');
  const r = G.polynom([Q(1n), Q(0n), Q(-5n), Q(0n), Q(4n)]);
  gleich(r.loesungen.map((x) => txt(x)).join(','), '2,1,-1,-2', 'Quartik');
  const u = G.ungleichung([Q(1n), Q(-3n), Q(0n), Q(1n)], '>');
  check(u.art === 'intervalle' && u.teile.length === 2, 'kubische Ungleichung: zwei Intervalle');
  near(G.newton((x) => Math.cos(x) - x, 1).x, 0.7390851332151607, 1e-12, 'Newton cos x = x');
  gleich(txt(G.verhaeltnis('X:D', Q(3n), Q(8n), null, Q(12n))), '9/2', '3:8 = X:12');
});

run('Basis-N und Statistik', () => {
  gleich(B.formatBasis(B.literal('FFFFFFFF', 'HEX'), 'DEC')[0], '-1', 'FFFFFFFF = −1');
  gleich(B.formatBasis(-1n, 'BIN').join('/'), '1111 1111 1111 1111/1111 1111 1111 1111', '−1 binär');
  let f = '';
  try { B.literal('2147483648', 'DEC'); } catch (e) { f = e.art; }
  gleich(f, 'math', 'Überlauf DEC');
  const st = new Statistik('1var');
  st.daten = [1, 2, 2, 3, 3, 3, 4, 4, 5].map((x) => ({ x: Q(BigInt(x)) }));
  const k = st.kennwerte();
  gleich(txt(k.xquer), '3', 'x̄');
  gleich(txt(k.Med), '3', 'Median');
  gleich(txt(k.Q1), '2', 'Q1');
  gleich(txt(k.Q3), '4', 'Q3');
  const reg = new Statistik('log');
  reg.daten = [[20, 3150], [110, 7310], [200, 8800], [290, 9310]].map(([x, y]) => ({ x: Q(BigInt(x)), y: Q(BigInt(y)) }));
  const kr = reg.kennwerte();
  near(Z.zahl(kr.a), -3857.984, 1e-6, 'log-Regression a (Handbuch)');
  near(Z.zahl(kr.b), 2357.532, 1e-6, 'log-Regression b');
  near(Z.zahl(kr.r), 0.998, 1e-3, 'log-Regression r');
  near(Z.zahl(reg.schaetz('yhut', Q(160n))), 8106.898, 1e-6, 'ŷ(160)');
});
