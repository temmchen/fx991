// tastatur.js – Gehäuse und Tastenfeld in der Aufmachung des fx-991DE X (Entwurfsgröße 400 × 880 px,
// wird als Ganzes skaliert). Beschriftung über den Tasten: gelb = SHIFT, rot = ALPHA,
// blau = Basis-N, lila = Komplex.

import { h } from './anzeige.js';
import { TASTEN } from './tasten.js';

// MARK: Symbole auf Tasten (HTML)

const kb = (voll = true, klein = false) => `<span class="kb${voll ? ' voll' : ''}${klein ? ' klein' : ''}"></span>`;
const x = '<span class="kursivx">x</span>';
const hk = (s) => `<span class="hk">${s}</span>`;
const tk = (s) => `<span class="tk">${s}</span>`;
const bruch = (a, b) => `<span class="kbruch">${a}<span class="kstrich"></span>${b}</span>`;

/// Kappe (Hauptbeschriftung) und Beschriftungen darüber: [links/SHIFT, rechts/ALPHA] als HTML
const BESCHRIFTUNG = {
  shift: { kappe: '', oben: ['<span class="s">SHIFT</span>'] },
  alpha: { kappe: '', oben: ['<span class="a">ALPHA</span>'] },
  menu: { kappe: '', oben: ['<span class="w">MENU</span>&nbsp;<span class="s">SETUP</span>'] },
  on: { kappe: '', oben: ['<span class="w">ON</span>'] },
  optn: { kappe: 'OPTN', oben: ['<span class="s">QR</span>'] },
  calc: { kappe: 'CALC', oben: ['<span class="s">SOLVE</span>', '<span class="a">=</span>'] },
  int: { kappe: `∫${hk(kb(false, true))}${kb(true)}`, oben: [`<span class="s">d/d<i>x</i>${kb(true, true)}</span>`, '<span class="a">:</span>'] },
  x: { kappe: x, oben: [`<span class="s">Σ${kb(true, true)}</span>`] },
  frac: { kappe: bruch(kb(), kb()), oben: [`<span class="s">${kb(true, true)}${bruch(kb(true, true), kb(true, true))}</span>`] },
  sqrt: { kappe: `√${kb()}`, oben: [`<span class="s">${hk('3')}√${kb(true, true)}</span>`, `<span class="a"><span class="periode-sym">${kb(true, true)}</span></span>`] },
  sq: { kappe: `${x}${hk('2')}`, oben: [`<span class="s"><i>x</i>³</span>`, '<span class="b">DEC</span>'] },
  pow: { kappe: `${x}${hk(kb())}`, oben: [`<span class="s">${kb(true, true)}√${kb(true, true)}</span>`, '<span class="b">HEX</span>'] },
  log: { kappe: `log${tk(kb())}${kb(false)}`, oben: [`<span class="s">10${hk(kb(true, true))}</span>`, '<span class="b">BIN</span>'] },
  ln: { kappe: 'ln', oben: [`<span class="s"><i>e</i>${hk(kb(true, true))}</span>`, '<span class="b">OCT</span>'] },
  neg: { kappe: '(−)', oben: ['<span class="s">log</span>', '<span class="klammer"><span class="a">A</span></span>'] },
  dms: { kappe: '°&thinsp;′&thinsp;″', oben: ['<span class="s">FACT</span>', '<span class="klammer"><span class="a">B</span></span>'] },
  inv: { kappe: `${x}${hk('−1')}`, oben: ['<span class="s"><i>x</i>!</span>', '<span class="klammer"><span class="a">C</span></span>'] },
  sin: { kappe: 'sin', oben: ['<span class="s">sin⁻¹</span>', '<span class="klammer"><span class="a">D</span></span>'] },
  cos: { kappe: 'cos', oben: ['<span class="s">cos⁻¹</span>', '<span class="klammer"><span class="a">E</span></span>'] },
  tan: { kappe: 'tan', oben: ['<span class="s">tan⁻¹</span>', '<span class="klammer"><span class="a">F</span></span>'] },
  sto: { kappe: 'STO', oben: ['<span class="s">RECALL</span>'] },
  eng: { kappe: 'ENG', oben: ['<span class="klammer lila"><span class="k">∠</span></span>', '<span class="s">←</span>', '<span class="k"><i>i</i></span>'] },
  lpar: { kappe: '(', oben: ['<span class="s">Abs</span>'] },
  rpar: { kappe: ')', oben: ['<span class="s" data-trenner>,</span>', '<span class="a"><i>x</i></span>'] },
  sd: { kappe: 'S⇔D', oben: [`<span class="s klein">a<sup>b</sup>⁄<sub>c</sub>⇔<sup>d</sup>⁄<sub>c</sub></span>`, '<span class="a"><i>y</i></span>'] },
  mplus: { kappe: 'M+', oben: ['<span class="s">M−</span>', '<span class="a">M</span>'] },
  7: { kappe: '7', oben: ['<span class="s">CONST</span>'] },
  8: { kappe: '8', oben: ['<span class="s">CONV</span>'] },
  9: { kappe: '9', oben: ['<span class="s">RESET</span>'] },
  del: { kappe: 'DEL', oben: ['<span class="s">INS</span>', '<span class="a">UNDO</span>'] },
  ac: { kappe: 'AC', oben: ['<span class="s">OFF</span>'] },
  4: { kappe: '4', oben: [] },
  5: { kappe: '5', oben: [] },
  6: { kappe: '6', oben: [] },
  mul: { kappe: '×', oben: ['<span class="s">nPr</span>'] },
  div: { kappe: '÷', oben: ['<span class="s">nCr</span>'] },
  1: { kappe: '1', oben: [] },
  2: { kappe: '2', oben: [] },
  3: { kappe: '3', oben: [] },
  add: { kappe: '+', oben: ['<span class="s">Pol</span>'] },
  sub: { kappe: '−', oben: ['<span class="s">Rec</span>'] },
  0: { kappe: '0', oben: ['<span class="s">Rnd</span>'] },
  dot: { kappe: '<span data-dezimal>.</span>', oben: ['<span class="s klein">Ran#</span>', '<span class="a klein">RanInt</span>'] },
  exp: { kappe: `×10${hk('<i>x</i>')}`, oben: ['<span class="s">π</span>', '<span class="a"><i>e</i></span>'] },
  ans: { kappe: 'Ans', oben: ['<span class="s">%</span>'] },
  eq: { kappe: '=', oben: ['<span class="s">≈</span>'] },
  up: { kappe: '▲' }, down: { kappe: '▼' }, left: { kappe: '◀' }, right: { kappe: '▶' },
};

// MARK: Lage der Tasten (relativ zum Tastenbereich, 352 × 538)
// Funktionstasten 52 breit im Abstand 60 (8 px Lücke), Reihen alle 56 px (24 px für die Beschriftung);
// Zifferntasten 63 breit im Abstand 72,25, Reihen alle 62 px.

function lage() {
  const L = {};
  // SHIFT, ALPHA, MENU, ON: flache Rechtecktasten in den Spalten der Funktionstasten darunter
  L.shift = { x: 0, y: 12, w: 52, h: 30, art: 'system' };
  L.alpha = { x: 60, y: 12, w: 52, h: 30, art: 'system' };
  L.menu = { x: 240, y: 12, w: 52, h: 30, art: 'system' };
  L.on = { x: 300, y: 12, w: 52, h: 30, art: 'system' };
  // Steuerkreuz (Fläche 117…235 × 0…90)
  L.up = { x: 150, y: 0, w: 52, h: 30, art: 'pfeil' };
  L.down = { x: 150, y: 60, w: 52, h: 30, art: 'pfeil' };
  L.left = { x: 117, y: 24, w: 36, h: 42, art: 'pfeil' };
  L.right = { x: 199, y: 24, w: 36, h: 42, art: 'pfeil' };
  L.optn = { x: 0, y: 68, w: 52, h: 32, art: 'funktion' };
  L.calc = { x: 60, y: 68, w: 52, h: 32, art: 'funktion' };
  L.int = { x: 240, y: 68, w: 52, h: 32, art: 'funktion' };
  L.x = { x: 300, y: 68, w: 52, h: 32, art: 'funktion' };
  const reihen = [
    ['frac', 'sqrt', 'sq', 'pow', 'log', 'ln'],
    ['neg', 'dms', 'inv', 'sin', 'cos', 'tan'],
    ['sto', 'eng', 'lpar', 'rpar', 'sd', 'mplus'],
  ];
  reihen.forEach((reihe, j) => reihe.forEach((id, i) => {
    L[id] = { x: i * 60, y: 126 + j * 56, w: 52, h: 32, art: 'funktion' };
  }));
  const zahlen = [
    ['7', '8', '9', 'del', 'ac'],
    ['4', '5', '6', 'mul', 'div'],
    ['1', '2', '3', 'add', 'sub'],
    ['0', 'dot', 'exp', 'ans', 'eq'],
  ];
  zahlen.forEach((reihe, j) => reihe.forEach((id, i) => {
    L[id] = { x: i * 72.25, y: 311 + j * 62, w: 63, h: 41, art: id === 'del' || id === 'ac' ? 'blau' : 'zahl' };
  }));
  return L;
}

export const LAGE = lage();

// MARK: Aufbau

/// Gehäuse bauen; tasteGedrueckt(id) wird bei jedem Tastendruck aufgerufen
export function baueGeraet(container, tasteGedrueckt) {
  const geraet = h('div', { class: 'geraet', role: 'application', 'aria-label': 'fx-991DE X Trainer' });
  const kopf = h('div', { class: 'kopf' },
    h('div', { class: 'name' }, 'Tom Bleyer'),
    h('div', { class: 'modell' }, 'fx-991DE X'),
    h('div', { class: 'linie' }, 'TRAINER'),
    h('div', { class: 'solar', 'aria-hidden': 'true' }));
  const lcd = h('div', { class: 'lcd', 'aria-live': 'polite' });
  const rahmen = h('div', { class: 'lcd-rahmen' }, lcd);
  const tasten = h('div', { class: 'tasten' });
  tasten.append(h('div', { class: 'kreuz', 'aria-hidden': 'true' }));
  const knoepfe = {};
  for (const [id, l] of Object.entries(LAGE)) {
    const b = BESCHRIFTUNG[id] || { kappe: id };
    const knopf = h('button', { class: 'taste ' + l.art, 'data-k': id, type: 'button', 'aria-label': ariaName(id) });
    knopf.style.cssText = `left:${l.x}px;top:${l.y}px;width:${l.w}px;height:${l.h}px`;
    const kappe = h('span', { class: 'kappe' });
    kappe.innerHTML = b.kappe;
    knopf.append(kappe);
    knopf.addEventListener('click', (ev) => {
      ev.preventDefault();
      tasteGedrueckt(id);
    });
    tasten.append(knopf);
    knoepfe[id] = knopf;
    if (b.oben && b.oben.length) {
      const besch = h('div', { class: 'beschr' });
      // Beschriftung so breit wie die Taste (+2 px): zwischen den Beschriftungen benachbarter Tasten bleibt
      // eine Lücke (sonst lesen sich z. B. „HEX“ und „10■“ als ein Wort); 4 px Luft über der Taste
      const breite = l.art === 'system' ? 80 : l.w + 2;
      const versatz = 16;
      besch.style.cssText = `left:${l.x + l.w / 2 - breite / 2}px;top:${l.y - versatz}px;width:${breite}px;justify-content:${b.oben.length === 1 ? 'center' : 'space-between'}`;
      besch.innerHTML = b.oben.map((s, i) => (b.oben.length === 3 && i === 1 ? `<span class="mitte">${s}</span>` : `<span>${s}</span>`)).join('');
      tasten.append(besch);
    }
  }
  geraet.append(kopf, rahmen, tasten);
  container.append(geraet);
  return { geraet, lcd, knoepfe };
}

/// Dezimalzeichen auf der Punkttaste und Trennzeichen über „)“ anpassen
export function setzeDezimal(geraet, dezimal) {
  geraet.querySelectorAll('[data-dezimal]').forEach((e) => { e.textContent = dezimal; });
  geraet.querySelectorAll('[data-trenner]').forEach((e) => { e.textContent = dezimal === ',' ? ';' : ','; });
}

const ARIA = {
  shift: 'SHIFT', alpha: 'ALPHA', menu: 'MENU', on: 'ON', up: 'up', down: 'down', left: 'left', right: 'right',
  optn: 'OPTN', calc: 'CALC', int: 'integral', x: 'x', frac: 'fraction', sqrt: 'square root', sq: 'x squared', pow: 'power',
  log: 'log', ln: 'ln', neg: 'negative', dms: 'degrees minutes seconds', inv: 'reciprocal', sin: 'sin', cos: 'cos', tan: 'tan',
  sto: 'STO', eng: 'ENG', lpar: 'open parenthesis', rpar: 'close parenthesis', sd: 'S to D', mplus: 'M plus',
  del: 'DEL', ac: 'AC', mul: 'times', div: 'divide', add: 'plus', sub: 'minus', dot: 'decimal point', exp: 'times ten to the', ans: 'Ans', eq: 'equals',
};
function ariaName(id) {
  return ARIA[id] || id;
}

/// Mini-Tastenkappe (Tastenspur, Lektionen): id → Element
export function miniKappe(id, { mitShift = null } = {}) {
  const l = LAGE[id] || { art: 'funktion' };
  const b = BESCHRIFTUNG[id] || { kappe: id };
  const k = h('span', { class: 'kappe-mini ' + l.art });
  if (id === 'shift') k.textContent = 'SHIFT';
  else if (id === 'alpha') k.textContent = 'ALPHA';
  else if (id === 'menu') k.textContent = 'MENU';
  else if (id === 'on') k.textContent = 'ON';
  else k.innerHTML = b.kappe;
  if (mitShift) {
    // Zweitfunktion als Text (gelb nach SHIFT, rot nach ALPHA)
    const t = TASTEN[id] || {};
    const text = mitShift === 'S' ? t.shift : t.alpha;
    if (text) k.append(h('span', { class: mitShift === 'S' ? 's' : 'a' }, text));
  }
  return k;
}
