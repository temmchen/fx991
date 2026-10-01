// anzeige.js – LCD des Rechners zeichnen (DOM). Natürliche Darstellung (Brüche übereinander,
// Wurzelstrich, Hochzahlen) oder linear (LineI/LineO); Statuszeile, Menüs, Editoren, Listen.

import { STAT_NAMEN } from './statistik.js';
import { KONSTANTEN, UMRECHNUNGEN } from './konstanten.js';
import { T } from './i18n.js';

/// kleines Hilfsmittel: h('div', { class: 'x' }, kinder…)
export function h(tag, attr, ...kinder) {
  const e = document.createElement(tag);
  if (attr) {
    for (const [k, v] of Object.entries(attr)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else e.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const k of kinder.flat()) {
    if (k === null || k === undefined || k === false) continue;
    e.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return e;
}

const FN_NAMEN = {
  asin: 'sin⁻¹', acos: 'cos⁻¹', atan: 'tan⁻¹', asinh: 'sinh⁻¹', acosh: 'cosh⁻¹', atanh: 'tanh⁻¹',
  RanInt: 'RanInt#', Identity: 'Identity', P: 'P', Q: 'Q', R: 'R',
};
const POST_TEXT = { '²': '²', '³': '³', '⁻¹': '⁻¹', '!': '!', '%': '%', '°': '°', r: 'ʳ', g: 'ᵍ', dms: '°', t: '▸t', xhut: 'x̂', yhut: 'ŷ', xhut1: 'x̂₁', xhut2: 'x̂₂', '▸polar': '▸r∠θ', '▸rechtw': '▸a+bi' };
const OP_TEXT = { '+': '+', '-': '−', '×': '×', '÷': '÷', nPr: 'P', nCr: 'C', '∠': '∠', '·': '•', and: ' and ', or: ' or ', xor: ' xor ', xnor: ' xnor ', ':': ':', '=': '=', '≠': '≠', '<': '<', '>': '>', '≤': '≤', '≥': '≥' };

// MARK: Formelsatz

/// Zeichenkontext: Dezimalzeichen, linear, Cursor
class Satz {
  constructor({ dezimal = '.', linear = false, cursor = null, umschliessen = false }) {
    this.dezimal = dezimal;
    this.linear = linear;
    this.cursor = cursor; // { pfad, pos } oder null
    this.umschliessen = umschliessen;
    this.cursorEl = null;
  }

  trennzeichen() { return this.dezimal === ',' ? ';' : ','; }

  /// Zeile zeichnen; pfad: Pfad zu dieser Zeile (für den Cursor)
  zeile(zeile, pfad = [], klasse = 'zeile') {
    const box = h('span', { class: klasse });
    const hatCursor = this.cursor && gleichePfade(this.cursor.pfad, pfad);
    const pos = hatCursor ? this.cursor.pos : -1;
    zeile.forEach((e, i) => {
      if (i === pos) box.append(this.cursorElement());
      box.append(this.element(e, [...pfad, null], i));
    });
    if (pos === zeile.length) box.append(this.cursorElement());
    if (zeile.length === 0 && !hatCursor && pfad.length > 0) box.append(h('span', { class: 'leer' }));
    return box;
  }

  cursorElement() {
    const c = h('span', { class: this.umschliessen ? 'cursor ins' : 'cursor' });
    this.cursorEl = c;
    return c;
  }

  feld(e, pfadBasis, i, s, klasse) {
    const pfad = [...pfadBasis.slice(0, -1), { i, s }];
    return this.zeile(e.s[s], pfad, klasse);
  }

  element(e, pfad, i) {
    switch (e.k) {
      case 'z':
        if (e.v === '.') return h('span', { class: 'z' }, this.dezimal);
        if (e.v === '_') return h('span', { class: 'tsep' });
        return h('span', { class: 'z' }, e.v);
      case 'op':
        if (e.v === ',') return h('span', { class: 'op' }, this.trennzeichen());
        return h('span', { class: 'op' }, OP_TEXT[e.v] || e.v);
      case 'neg': return h('span', { class: 'neg' }, '−');
      case 'minus': return h('span', { class: 'op' }, '−');
      case 'plus': return h('span', { class: 'op' }, '+');
      case '(': return h('span', { class: 'kl' }, '(');
      case ')': return h('span', { class: 'kl' }, ')');
      case 'fn': return h('span', { class: 'fn' }, (FN_NAMEN[e.v] || e.v) + '(');
      case 'var': return h('span', { class: e.v === 'x' || e.v === 'y' ? 'var kursiv' : 'var' }, e.v);
      case 'ans': return h('span', { class: 'fn' }, 'Ans');
      case 'ran': return h('span', { class: 'fn' }, 'Ran#');
      case 'k': {
        if (e.v === 'pi') return h('span', { class: 'konst' }, 'π');
        if (e.v === 'e') return h('span', { class: 'konst kursiv' }, 'e');
        if (e.v === 'i') return h('span', { class: 'konst kursiv' }, 'i');
        const k = KONSTANTEN[e.v];
        return h('span', { class: 'konst fett' }, k ? k.symbol : e.v);
      }
      case 'i': return h('span', { class: 'konst kursiv' }, 'i');
      case 'winkel': return h('span', { class: 'op' }, '∠');
      case 'post': {
        if (e.v.startsWith('eng:')) return h('span', { class: 'eng' }, e.v.slice(4));
        if (e.v.startsWith('conv:')) {
          const u = UMRECHNUNGEN[e.v.slice(5)];
          return h('span', { class: 'conv' }, u ? u.text : e.v);
        }
        const t = POST_TEXT[e.v] || e.v;
        if (e.v === '²' || e.v === '³' || e.v === '⁻¹') return h('span', { class: 'hoch' }, t.replace('²', '2').replace('³', '3').replace('⁻¹', '−1'));
        return h('span', { class: 'post' }, t);
      }
      case 'pre': return h('span', { class: 'pre' }, e.v);
      case 'e10': return h('span', { class: 'e10' }, '×', h('span', { class: 'zehn' }, '10'));
      case 'x10': return h('span', { class: 'x10' }, '×10', h('span', { class: 'hoch' }, e.v.replace('-', '−')));
      case 'eng': return h('span', { class: 'eng' }, e.v);
      case 'gms': return h('span', { class: 'gms' }, e.v === "'" ? '′' : e.v === '"' ? '″' : e.v);
      case 'periode': return h('span', { class: 'periode' }, e.v);
      case 'txt': return h('span', { class: 'txt' }, e.v);
      case 'hoch': return h('span', { class: 'hoch' }, e.v);
      case 'mat': return h('span', { class: 'fn' }, 'Mat' + e.v);
      case 'vct': return h('span', { class: 'fn' }, 'Vct' + e.v);
      case 'stat': return h('span', { class: 'stat' }, STAT_NAMEN[e.v] || e.v);
      case 'T': return this.schablone(e, pfad, i);
      default: return h('span', null, '?');
    }
  }

  schablone(e, pfad, i) {
    const f = (s, kl) => this.feld(e, pfad, i, s, kl || 'zeile');
    if (this.linear) return this.schabloneLinear(e, f);
    switch (e.v) {
      case 'frac': return h('span', { class: 'bruch' }, f(0, 'zaehler'), h('span', { class: 'strich' }), f(1, 'nenner'));
      case 'mixedOut': return h('span', { class: 'bruch klein-gemischt' }, f(0, 'zaehler'), h('span', { class: 'strich' }), f(1, 'nenner'));
      case 'mixed': return h('span', { class: 'gemischt' }, f(0), h('span', { class: 'bruch' }, f(1, 'zaehler'), h('span', { class: 'strich' }), f(2, 'nenner')));
      case 'sqrt': return h('span', { class: 'wurzel' }, h('span', { class: 'haken' }, '√'), f(0, 'radikand'));
      case 'cbrt': return h('span', { class: 'wurzel' }, h('span', { class: 'index' }, '3'), h('span', { class: 'haken' }, '√'), f(0, 'radikand'));
      case 'root': return h('span', { class: 'wurzel' }, f(0, 'index'), h('span', { class: 'haken' }, '√'), f(1, 'radikand'));
      case 'pow': return f(0, 'exponent');
      case 'pow10': return h('span', { class: 'potenz' }, h('span', { class: 'z' }, '10'), f(0, 'exponent'));
      case 'epow': return h('span', { class: 'potenz' }, h('span', { class: 'konst kursiv' }, 'e'), f(0, 'exponent'));
      case 'log': return h('span', { class: 'logb' }, h('span', { class: 'fn' }, 'log'), f(0, 'basis'), h('span', { class: 'kl' }, '('), f(1), h('span', { class: 'kl' }, ')'));
      case 'abs': return h('span', { class: 'betrag' }, f(0));
      case 'int':
        return h('span', { class: 'integral' },
          h('span', { class: 'grenzen' }, f(2, 'oben'), h('span', { class: 'zeichen' }, '∫'), f(1, 'unten')),
          f(0), h('span', { class: 'dx' }, 'd', h('span', { class: 'kursiv' }, 'x')));
      case 'diff':
        return h('span', { class: 'ableitung' },
          h('span', { class: 'bruch d' }, h('span', { class: 'zaehler' }, 'd'), h('span', { class: 'strich' }), h('span', { class: 'nenner' }, 'd', h('span', { class: 'kursiv' }, 'x'))),
          h('span', { class: 'kl' }, '('), f(0), h('span', { class: 'kl' }, ')'),
          h('span', { class: 'stelle' }, h('span', { class: 'senk' }, '|'), h('span', { class: 'unten' }, h('span', { class: 'kursiv' }, 'x'), '=', f(1))));
      case 'sum':
        return h('span', { class: 'summe' },
          h('span', { class: 'grenzen' }, f(2, 'oben'), h('span', { class: 'zeichen' }, 'Σ'), h('span', { class: 'unten' }, h('span', { class: 'kursiv' }, 'x'), '=', f(1))),
          h('span', { class: 'kl' }, '('), f(0), h('span', { class: 'kl' }, ')'));
      case 'period': return h('span', { class: 'periode' }, f(0));
      default: return h('span', null, '?');
    }
  }

  /// LineI: Schablonen als Text (wie beim Rechner ohne natürliches Display)
  schabloneLinear(e, f) {
    const t = (s) => h('span', { class: 'fn' }, s);
    const sep = this.trennzeichen();
    switch (e.v) {
      case 'frac': case 'mixedOut': return h('span', null, f(0), t('⌟'), f(1));
      case 'mixed': return h('span', null, f(0), t('⌟'), f(1), t('⌟'), f(2));
      case 'sqrt': return h('span', null, t('√('), f(0), t(')'));
      case 'cbrt': return h('span', null, t('³√('), f(0), t(')'));
      case 'root': return h('span', null, f(0), t('ˣ√('), f(1), t(')'));
      case 'pow': return h('span', null, t('^('), f(0), t(')'));
      case 'pow10': return h('span', null, t('10^('), f(0), t(')'));
      case 'epow': return h('span', null, t('e^('), f(0), t(')'));
      case 'log': return h('span', null, t('log('), f(0), t(sep), f(1), t(')'));
      case 'abs': return h('span', null, t('Abs('), f(0), t(')'));
      case 'int': return h('span', null, t('∫('), f(0), t(sep), f(1), t(sep), f(2), t(')'));
      case 'diff': return h('span', null, t('d/dx('), f(0), t(sep), f(1), t(')'));
      case 'sum': return h('span', null, t('Σ('), f(0), t(sep), f(1), t(sep), f(2), t(')'));
      case 'period': return h('span', { class: 'periode' }, f(0));
      default: return h('span', null, '?');
    }
  }
}

function gleichePfade(a, b) {
  const bb = b.filter((x) => x !== null);
  if (a.length !== bb.length) return false;
  return a.every((p, j) => p.i === bb[j].i && p.s === bb[j].s);
}

/// Formel zeichnen (für Ergebnisse, Listen, Hilfetexte)
export function formel(el, { dezimal = '.', linear = false } = {}) {
  return new Satz({ dezimal, linear }).zeile(el, [], 'zeile formel');
}

// MARK: Statuszeile

function statuszeile(s) {
  const z = h('div', { class: 'status' });
  const sym = (text, an, klasse = '') => h('span', { class: 'sym ' + klasse + (an ? ' an' : '') }, text);
  z.append(
    sym('S', s.shift, 'kasten'),
    sym('A', s.alpha, 'kasten'),
    sym('M', s.mem),
    sym('STO', s.sto),
    sym('RCL', s.rcl),
    sym(modusKurz(s.modus), !!modusKurz(s.modus)),
    sym(s.winkel, true, 'kasten'),
    sym(s.zahl || 'FIX', !!s.zahl),
    sym('E', s.eng),
    sym(s.komplex || 'i', !!s.komplex),
    sym(s.basis || '', !!s.basis),
    sym('Math', s.math, 'math'),
    sym('▲', s.hoch),
    sym('▼', s.runter),
    sym('Disp', s.disp),
  );
  return z;
}

function modusKurz(m) {
  return { STAT: 'STAT', MAT: 'MAT', VCT: 'VCT', CMPLX: 'CMPLX', DIST: 'DIST', TABLE: 'TABLE', EQN: 'EQN', INEQ: 'INEQ', VERIFY: 'VERIF', RATIO: 'RATIO' }[m] || '';
}

// MARK: Bildschirme

const ICONS = { COMP: '1+2', CMPLX: '𝑖', BASE: '0101', MAT: '[ ]', VCT: '→', STAT: '▁▃▅', DIST: '⌒', SHEET: '▦', TABLE: 'x│y', EQN: 'x²=', INEQ: 'x>', VERIFY: '✓', RATIO: 'a:b' };

/// LCD neu zeichnen
export function zeichneLCD(lcd, ansicht) {
  lcd.replaceChildren();
  if (!ansicht.an) {
    lcd.classList.add('aus');
    return;
  }
  lcd.classList.remove('aus');
  lcd.classList.toggle('klein', ansicht.einst.schrift === 'klein' && ansicht.einst.linear);
  lcd.append(statuszeile(ansicht.status));
  const b = ansicht.bild;
  const opt = { dezimal: ansicht.einst.dezimal, linear: ansicht.einst.linear };
  const flaeche = h('div', { class: 'flaeche art-' + b.art });
  lcd.append(flaeche);
  switch (b.art) {
    case 'rechnen': rechnen(flaeche, b, opt); break;
    case 'menu': menue(flaeche, b); break;
    case 'hauptmenu': hauptmenue(flaeche, b); break;
    case 'fehler':
      flaeche.append(h('div', { class: 'fehlertitel' }, b.titel), ...b.zeilen.map((z) => h('div', { class: 'fehlerzeile' }, z)));
      break;
    case 'text':
      flaeche.classList.toggle('mitte', !!b.mitte);
      b.zeilen.forEach((z) => flaeche.append(h('div', { class: 'textzeile' }, z || ' ')));
      break;
    case 'variablen': case 'liste': case 'loesung': case 'abfrage': case 'solve':
      liste(flaeche, b, opt);
      break;
    case 'gitter': gitter(flaeche, b, opt); break;
    case 'funktion': {
      const s = new Satz({ ...opt, cursor: { pfad: b.eingabe.pfad, pos: b.eingabe.pos } });
      flaeche.append(h('div', { class: 'eingabe' }, h('span', { class: 'fn' }, b.name), s.zeile(b.eingabe.zeile, [])));
      break;
    }
    case 'qr':
      flaeche.append(h('div', { class: 'qr-lcd' }, h('img', { src: 'qr-code.svg', alt: 'QR' }), h('div', { class: 'qr-text' }, b.text)));
      break;
    default:
      flaeche.append(h('div', null, b.art));
  }
}

function rechnen(flaeche, b, opt) {
  const e = b.eingabe;
  const s = new Satz({ ...opt, cursor: e.cursor ? { pfad: e.pfad, pos: e.pos } : null, umschliessen: e.umschliessen });
  const zeile = s.zeile(e.zeile, []);
  if (e.anhang) zeile.append(h('span', { class: 'anhang' }, e.anhang));
  const eingabe = h('div', { class: 'eingabe' + (e.cursor ? ' aktiv' : '') }, zeile);
  flaeche.append(eingabe);
  if (b.ergebnis) {
    const er = b.ergebnis;
    let inhalt;
    if (er.art === 'el') inhalt = new Satz(opt).zeile(er.el, [], 'zeile');
    else if (er.art === 'basen') inhalt = h('div', { class: 'basen' }, ...er.zeilen.map((z) => h('div', null, z)));
    else if (er.art === 'text') inhalt = h('span', { class: 'txt' }, er.text);
    else if (er.art === 'matrix') {
      inhalt = h('span', { class: 'matrix' }, ...er.el.map((reihe) => h('span', { class: 'mreihe' }, ...reihe.map((x) => h('span', { class: 'mzelle' }, new Satz(opt).zeile(x, [], 'zeile'))))));
    }
    flaeche.append(h('div', { class: 'ergebnis' }, inhalt));
  }
  // Cursor sichtbar halten (waagerecht scrollen wie das LCD)
  requestAnimationFrame(() => {
    if (s.cursorEl) {
      const box = eingabe.getBoundingClientRect(), c = s.cursorEl.getBoundingClientRect();
      if (c.right > box.right - 4) eingabe.scrollLeft += c.right - box.right + 12;
      if (c.left < box.left + 2) eingabe.scrollLeft -= box.left - c.left + 12;
    }
  });
}

function menue(flaeche, b) {
  if (b.titel) flaeche.append(h('div', { class: 'menutitel' }, b.titel));
  if (b.frage) flaeche.append(h('div', { class: 'textzeile' }, b.frage));
  const liste = h('div', { class: 'menuliste spalten-' + b.spalten });
  b.eintraege.forEach((e) => liste.append(h('div', { class: 'menueintrag' + (e.markiert ? ' markiert' : '') }, h('span', { class: 'nr' }, e.nr + ':'), h('span', { class: 'mtext' }, e.text))));
  flaeche.append(liste);
  if (b.seiten > 1) {
    const leiste = h('div', { class: 'rollbalken' });
    const knopf = h('div', { class: 'rollknopf' });
    knopf.style.height = 100 / b.seiten + '%';
    knopf.style.top = (100 * b.seite) / b.seiten + '%';
    leiste.append(knopf);
    flaeche.append(leiste);
  }
  if (b.zurueck) flaeche.append(h('div', { class: 'zurueckpfeil' }, '◀'));
}

function hauptmenue(flaeche, b) {
  const sel = b.eintraege[b.auswahl];
  flaeche.append(h('div', { class: 'menutitel' }, sel.nr + ': ' + sel.text));
  const gitter = h('div', { class: 'icons' });
  b.eintraege.forEach((e, i) => gitter.append(h('div', { class: 'icon' + (i === b.auswahl ? ' gewaehlt' : '') }, h('span', { class: 'iconbild' }, ICONS[e.app] || ''), h('span', { class: 'iconnr' }, e.nr))));
  flaeche.append(gitter);
}

function liste(flaeche, b, opt) {
  if (b.art === 'loesung' && b.zeilen.length === 1) {
    // wie beim Rechner: Name oben links, Wert unten rechts
    const z = b.zeilen[0];
    if (b.titel) flaeche.append(h('div', { class: 'menutitel' }, b.titel));
    flaeche.append(h('div', { class: 'eingabe' }, h('span', { class: 'wname' }, z.links)));
    flaeche.append(h('div', { class: 'ergebnis' }, new Satz(opt).zeile(z.el || [], [])));
    return;
  }
  if (b.titel) flaeche.append(h('div', { class: 'menutitel' }, b.titel));
  if (b.gleichung) flaeche.append(h('div', { class: 'gleichung' }, new Satz(opt).zeile(b.gleichung, [])));
  const box = h('div', { class: 'werteliste' });
  b.zeilen.forEach((z) => {
    box.append(h('div', { class: 'wertzeile' + (z.markiert ? ' markiert' : '') }, h('span', { class: 'wname' }, z.links), h('span', { class: 'wwert' }, new Satz(opt).zeile(z.el || [], []))));
  });
  flaeche.append(box);
  if (b.feld) {
    const s = new Satz({ ...opt, cursor: { pfad: b.feld.pfad, pos: b.feld.pos } });
    flaeche.append(h('div', { class: 'feld' }, s.zeile(b.feld.zeile, [])));
  }
}

function gitter(flaeche, b, opt) {
  if (b.titel) flaeche.append(h('div', { class: 'menutitel' }, b.titel));
  const tab = h('table', { class: 'gitter' });
  const kopf = h('tr', null, b.zeilenNr ? h('th', null, '') : null, ...b.kopf.map((k) => h('th', null, k)));
  tab.append(kopf);
  b.zeilen.forEach((reihe, z) => {
    tab.append(h('tr', null,
      b.zeilenNr ? h('th', { class: 'nr' }, String(b.start + z + 1)) : null,
      ...reihe.map((x, s) => h('td', { class: z === b.auswahl.z && s === b.auswahl.s ? 'gewaehlt' : '' }, x.replace('.', opt.dezimal)))));
  });
  flaeche.append(tab);
  const fuss = h('div', { class: 'fuss' });
  if (b.feld) {
    const s = new Satz({ ...opt, cursor: { pfad: b.feld.pfad, pos: b.feld.pos } });
    fuss.append(s.zeile(b.feld.zeile, []));
  } else fuss.append(new Satz(opt).zeile(b.fuss || [], []));
  flaeche.append(fuss);
}

export { T };
