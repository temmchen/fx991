// modi.js – Anwendungen mit eigenen Bildschirmen: Gleichungen (A), Ungleichungen (B), Statistik (6),
// Verteilungen (7), Wertetabelle (9), Verhältnisse (D), Matrizen (4) und Vektoren (5).
// Abläufe wie beim fx-991DE X: Typ wählen → Koeffizienten-/Dateneditor → = → Ergebnisse (= blättert).

import * as Z from './zahl.js';
import * as K from './komplex.js';
import * as F from './format.js';
import * as M from './matrix.js';
import * as G from './gleichungen.js';
import * as V from './verteilung.js';
import { Eingabe, klon } from './eingabe.js';
import { parse } from './parser.js';
import { werte } from './auswertung.js';
import { eingabeFuer, variableAus } from './tasten.js';
import { T } from './i18n.js';
import { Menue, inSeiten, Werteingabe, Hinweis } from './bildschirme.js';
import { TYPEN, TYP_FORMEL, STAT_NAMEN } from './statistik.js';

const { Q, D, NULL, EINS } = Z;

/// Darstellung eines Werts in Editoren und Ergebnislisten (exakt in MathO, sonst dezimal)
function form(r, w, dezimal = false) {
  const einst = r.formatEinst();
  if (w === null || w === undefined) return [];
  if (w.t === 'c') return F.komplex(w, dezimal ? { ...einst, io: 'MD' } : einst, einst.komplex === 'polar' ? 'polar' : 'rechtw');
  if (dezimal) return F.dezimal(Z.zahl(w), einst);
  return F.formenReal(w, einst)[0].el;
}

function zellText(r, w) {
  if (w === null || w === undefined) return '';
  if (w.t === 'c') return F.alsText(form(r, w), r.einst.dezimal);
  if (w.t === 'q' && w.d === 1n && Z.zahl(w) < 1e7 && Z.zahl(w) > -1e6) return w.n.toString();
  return F.kurz(Z.zahl(w), 6, r.einst);
}

// MARK: Gitter (Koeffizienten-, Daten- und Matrixeditor)

class Gitter {
  /// werte: Zeilen × Spalten (Real oder null); kopf: Spaltennamen
  constructor(r, { werte, kopf, zeilenNr = false, wachsend = false, maxZeilen = 99, leerWert = NULL, sicht = 3 }) {
    this.r = r;
    this.werte = werte;
    this.kopf = kopf;
    this.zeilenNr = zeilenNr;
    this.wachsend = wachsend;
    this.maxZeilen = maxZeilen;
    this.leerWert = leerWert;
    this.z = 0;
    this.s = 0;
    this.sicht = sicht;
    this.feld = new Werteingabe(r);
    this.geaendert = null; // Rückruf (z, s)
  }

  get zeilen() { return this.werte.length; }
  get spalten() { return this.kopf.length; }

  /// Taste verarbeiten; false, wenn der Besitzer zuständig ist
  taste(k) {
    const erg = this.feld.taste(k);
    if (erg === 'fertig') {
      let w;
      try {
        w = this.feld.wert();
      } catch (e) {
        this.r.zeigeFehler(e, () => {});
        return true;
      }
      this.setze(this.z, this.s, w);
      this.feld.leeren();
      this.weiter();
      return true;
    }
    if (erg) return true;
    switch (k) {
      case 'up': if (this.z > 0) this.z--; return true;
      case 'down':
        if (this.z < this.zeilen - 1) this.z++;
        else if (this.wachsend && this.zeilen < this.maxZeilen && this.werte[this.z].some((x) => x !== null)) { this.werte.push(this.kopf.map(() => null)); this.z++; }
        return true;
      case 'left': if (this.s > 0) this.s--; return true;
      case 'right': if (this.s < this.spalten - 1) this.s++; return true;
      default: return false;
    }
  }

  setze(z, s, w) {
    while (z >= this.werte.length) this.werte.push(this.kopf.map(() => null));
    this.werte[z][s] = w;
    if (this.geaendert) this.geaendert(z, s);
  }

  /// nach = : nach rechts, am Zeilenende in die nächste Zeile (Datenlisten: nach unten)
  weiter() {
    if (this.wachsend) {
      if (this.z + 1 >= this.zeilen && this.zeilen < this.maxZeilen) this.werte.push(this.kopf.map(() => null));
      if (this.z + 1 < this.zeilen) this.z++;
      return;
    }
    if (this.s < this.spalten - 1) this.s++;
    else if (this.z < this.zeilen - 1) { this.z++; this.s = 0; }
  }

  ansicht(titel) {
    const start = Math.max(0, Math.min(this.z - this.sicht + 1, this.zeilen - this.sicht));
    const sichtbar = this.werte.slice(Math.max(0, start), Math.max(0, start) + this.sicht);
    const w = this.werte[this.z] ? this.werte[this.z][this.s] : null;
    return {
      art: 'gitter',
      titel,
      kopf: this.kopf,
      zeilenNr: this.zeilenNr,
      start: Math.max(0, start),
      zeilen: sichtbar.map((reihe) => reihe.map((x) => zellText(this.r, x))),
      auswahl: { z: this.z - Math.max(0, start), s: this.s },
      feld: this.feld.leer ? null : this.feld.ansicht(),
      fuss: w === null || w === undefined ? [] : form(this.r, w),
      hoch: start > 0,
      runter: start + this.sicht < this.zeilen,
    };
  }
}

/// Ergebnisliste zum Durchblättern (Lösungen, Statistikwerte)
class ErgebnisListe {
  constructor(r, eintraege, { zurueck = null, sicht = 1, titel = '' } = {}) {
    this.r = r;
    this.eintraege = eintraege; // [{ name, wert | el, variable? }]
    this.i = 0;
    this.sicht = sicht;
    this.zurueck = zurueck;
    this.titel = titel;
    this.stoWartet = false;
  }
  taste(k, r) {
    if (this.stoWartet) {
      this.stoWartet = false;
      const v = variableAus(k);
      const e = this.eintraege[this.i];
      if (v && e.wert) r.vars[v] = e.wert;
      return;
    }
    if (k === 'sto') { this.stoWartet = true; return; }
    if (k === 'down' || (k === 'eq' && this.sicht === 1)) {
      if (this.i < this.eintraege.length - 1) { this.i++; return; }
      if (k === 'eq') { r.pop(); if (this.zurueck) this.zurueck(r); }
      return;
    }
    if (k === 'up') { if (this.i > 0) this.i--; return; }
    if (k === 'ac' || k === 'eq') { r.pop(); if (this.zurueck) this.zurueck(r); return; }
    if (k === 'sd') { this.dezimal = !this.dezimal; return; }
    if (k === 'menu' || k === 'S:menu') r.globaleTaste(k);
  }
  ansicht(r) {
    const n = this.sicht;
    const start = Math.max(0, Math.min(this.i, this.eintraege.length - n));
    const zeilen = this.eintraege.slice(start, start + n).map((e, j) => ({
      links: e.name,
      el: e.el || (e.text ? [{ k: 'txt', v: e.text }] : form(r, e.wert, this.dezimal || e.dezimal)),
      markiert: n > 1 && start + j === this.i,
    }));
    return {
      art: n === 1 ? 'loesung' : 'liste',
      titel: (n === 1 && this.eintraege[this.i].titel) || this.titel,
      zeilen,
      hoch: n === 1 ? this.i > 0 : start > 0,
      runter: n === 1 ? this.i < this.eintraege.length - 1 : start + n < this.eintraege.length,
    };
  }
}

/// Ganzzahl-Frage (Anzahl, Grad, Zeilen …)
class AuswahlFrage {
  constructor(frage, erlaubt, fertig) {
    this.frage = frage;
    this.erlaubt = erlaubt;
    this.fertig = fertig;
    this.istMenue = true;
  }
  taste(k, r) {
    if (k === 'ac' || k === 'left') { r.pop(); return; }
    if (k === 'menu' || k === 'S:menu') { r.globaleTaste(k); return; }
    if (/^\d$/.test(k) && this.erlaubt.includes(Number(k))) this.fertig(Number(k), r);
  }
  ansicht() {
    return { art: 'text', zeilen: [this.frage, this.erlaubt.length > 1 ? `${this.erlaubt[0]}~${this.erlaubt[this.erlaubt.length - 1]}` : ''], mitte: false };
  }
}

// MARK: Gleichungen (Modus A)

const LGS_NAMEN = ['x', 'y', 'z', 't'];

export class EqnSchirm {
  constructor(r) {
    this.r = r;
    this.gitter = null;
    this.art = null;
    this.n = 0;
    r.push(this.typMenue(r));
  }

  typMenue(r) {
    return new Menue({ seiten: [[
      { text: T('eqn.lgs'), aktion: () => r.push(new AuswahlFrage(T('eqn.unbekannte'), [2, 3, 4], (n) => this.starte('lgs', n))) },
      { text: T('eqn.polynom'), aktion: () => r.push(new AuswahlFrage(T('eqn.grad'), [2, 3, 4], (n) => this.starte('polynom', n))) },
    ]] });
  }

  starte(art, n) {
    const r = this.r;
    r.zurBasis();
    this.art = art;
    this.n = n;
    if (art === 'lgs') {
      this.gitter = new Gitter(r, { werte: Array.from({ length: n }, () => Array(n + 1).fill(NULL)), kopf: [...LGS_NAMEN.slice(0, n), '='], zeilenNr: true });
    } else {
      this.gitter = new Gitter(r, { werte: [Array(n + 1).fill(NULL)], kopf: 'abcde'.slice(0, n + 1).split(''), sicht: 1 });
    }
  }

  form() {
    if (this.art === 'lgs') return null;
    return ['', '', 'ax²+bx+c=0', 'ax³+bx²+cx+d=0', 'ax⁴+bx³+cx²+dx+e=0'][this.n];
  }

  taste(k, r) {
    if (!this.gitter) { if (k === 'menu' || k === 'S:menu') r.globaleTaste(k); else r.push(this.typMenue(r)); return; }
    if (this.gitter.taste(k)) return;
    switch (k) {
      case 'eq': this.loese(r); return;
      case 'ac': this.gitter.werte = this.gitter.werte.map((z) => z.map(() => NULL)); this.gitter.z = 0; this.gitter.s = 0; return;
      case 'optn': r.push(this.typMenue(r)); return;
      case 'menu': case 'S:menu': r.globaleTaste(k); return;
      default:
    }
  }

  loese(r) {
    const w = this.gitter.werte;
    try {
      if (this.art === 'lgs') {
        const l = G.lgs(w);
        if (l.art !== 'eindeutig') { r.push(new Hinweis([T(l.art === 'keine' ? 'eqn.keine' : 'eqn.unendlich')])); return; }
        r.push(new ErgebnisListe(r, l.x.map((x, i) => ({ name: LGS_NAMEN[i] + '=', wert: x }))));
        return;
      }
      const p = G.polynom(w[0], r.einst.eqnKomplex);
      if (p.keineReelle) { r.push(new Hinweis([T('eqn.keinereell')])); return; }
      const einst = r.formatEinst();
      const eintraege = p.loesungen.map((x, i) => ({
        name: p.loesungen.length > 1 ? `x${'₁₂₃₄'[i]}=` : 'x=',
        wert: x,
        el: x.t === 'c' ? F.komplex(x, einst, einst.komplex === 'polar' ? 'polar' : 'rechtw') : null,
      }));
      if (p.extremum) {
        const min = p.extremum.art === 'min';
        eintraege.push({ titel: T(min ? 'eqn.xmin' : 'eqn.xmax'), name: 'x=', wert: p.extremum.x });
        eintraege.push({ titel: T(min ? 'eqn.ymin' : 'eqn.ymax'), name: 'y=', wert: p.extremum.y });
      }
      r.push(new ErgebnisListe(r, eintraege));
    } catch (e) {
      r.zeigeFehler(e, () => {});
    }
  }

  ansicht(r) {
    if (!this.gitter) return { art: 'text', zeilen: [T('app.EQN')], mitte: true };
    const v = this.gitter.ansicht(this.form());
    return v;
  }
}

// MARK: Ungleichungen (Modus B)

const UNGL = ['>', '<', '≥', '≤'];

export class IneqSchirm {
  constructor(r) {
    this.r = r;
    this.gitter = null;
    r.push(this.gradFrage(r));
  }

  gradFrage(r) {
    return new AuswahlFrage(T('eqn.grad'), [2, 3, 4], (n) => {
      const basis = ['', '', 'ax²+bx+c', 'ax³+bx²+cx+d', 'ax⁴+bx³+cx²+dx+e'][n];
      r.push(new Menue({
        titel: T('ineq.typ'),
        seiten: [UNGL.map((rel) => ({ text: basis + rel + '0', aktion: () => this.starte(n, rel) }))],
      }));
    });
  }

  starte(n, rel) {
    this.r.zurBasis();
    this.n = n;
    this.rel = rel;
    this.gitter = new Gitter(this.r, { werte: [Array(n + 1).fill(NULL)], kopf: 'abcde'.slice(0, n + 1).split(''), sicht: 1 });
  }

  taste(k, r) {
    if (!this.gitter) { if (k === 'menu' || k === 'S:menu') r.globaleTaste(k); else r.push(this.gradFrage(r)); return; }
    if (this.gitter.taste(k)) return;
    if (k === 'eq') { this.loese(r); return; }
    if (k === 'ac') { this.gitter.werte = [this.gitter.werte[0].map(() => NULL)]; this.gitter.s = 0; return; }
    if (k === 'optn') { r.push(this.gradFrage(r)); return; }
    if (k === 'menu' || k === 'S:menu') r.globaleTaste(k);
  }

  loese(r) {
    try {
      const u = G.ungleichung(this.gitter.werte[0], this.rel);
      let el;
      if (u.art === 'alle') el = [{ k: 'txt', v: T('ineq.alle') }];
      else if (u.art === 'keine') el = [{ k: 'txt', v: T('ineq.keine') }];
      else {
        el = [];
        const kl = (zu) => (zu ? '≤' : '<');
        u.teile.forEach((t, i) => {
          if (i > 0) el.push({ k: 'txt', v: r.einst.dezimal === ',' ? '; ' : ', ' });
          if (t.punkt) { el.push({ k: 'txt', v: 'x=' }, ...form(r, t.von)); return; }
          if (t.von === null) el.push({ k: 'txt', v: 'x' + kl(t.bisZu) }, ...form(r, t.bis));
          else if (t.bis === null) el.push(...form(r, t.von), { k: 'txt', v: kl(t.vonZu) + 'x' });
          else el.push(...form(r, t.von), { k: 'txt', v: kl(t.vonZu) + 'x' + kl(t.bisZu) }, ...form(r, t.bis));
        });
      }
      r.push(new ErgebnisListe(r, [{ name: '', el }]));
    } catch (e) {
      r.zeigeFehler(e, () => {});
    }
  }

  ansicht() {
    if (!this.gitter) return { art: 'text', zeilen: [T('app.INEQ')], mitte: true };
    const basis = ['', '', 'ax²+bx+c', 'ax³+bx²+cx+d', 'ax⁴+bx³+cx²+dx+e'][this.n];
    return this.gitter.ansicht(basis + this.rel + '0');
  }
}

// MARK: Verhältnisse (Modus D)

export class RatioSchirm {
  constructor(r) {
    this.r = r;
    this.gitter = null;
    r.push(this.typMenue(r));
  }
  typMenue(r) {
    return new Menue({ titel: T('ratio.typ'), seiten: [[
      { text: 'A:B=X:D', aktion: () => this.starte('X:D') },
      { text: 'A:B=C:X', aktion: () => this.starte('C:X') },
    ]] });
  }
  starte(art) {
    this.r.zurBasis();
    this.art = art;
    this.gitter = new Gitter(this.r, { werte: [[EINS, EINS, EINS]], kopf: art === 'X:D' ? ['A', 'B', 'D'] : ['A', 'B', 'C'], sicht: 1 });
  }
  taste(k, r) {
    if (!this.gitter) { if (k === 'menu' || k === 'S:menu') r.globaleTaste(k); else r.push(this.typMenue(r)); return; }
    if (this.gitter.taste(k)) return;
    if (k === 'eq') {
      try {
        const [a, b, c] = this.gitter.werte[0];
        const x = this.art === 'X:D' ? G.verhaeltnis('X:D', a, b, null, c) : G.verhaeltnis('C:X', a, b, c, null);
        r.ans = x;
        r.push(new ErgebnisListe(r, [{ name: 'X=', wert: x }]));
      } catch (e) { r.zeigeFehler(e, () => {}); }
      return;
    }
    if (k === 'ac') { this.gitter.werte = [[EINS, EINS, EINS]]; this.gitter.s = 0; return; }
    if (k === 'optn') { r.push(this.typMenue(r)); return; }
    if (k === 'menu' || k === 'S:menu') r.globaleTaste(k);
  }
  ansicht() {
    if (!this.gitter) return { art: 'text', zeilen: [T('app.RATIO')], mitte: true };
    return this.gitter.ansicht(this.art === 'X:D' ? 'A:B=X:D' : 'A:B=C:X');
  }
}

// MARK: Verteilungen (Modus 7)

const DIST_TYPEN = ['npd', 'ncd', 'inv', 'bpd', 'bcd', 'ppd', 'pcd'];
const DIST_VARS = {
  npd: ['x', 'σ', 'μ'], ncd: ['unten', 'oben', 'σ', 'μ'], inv: ['flaeche', 'σ', 'μ'],
  bpd: ['x', 'N', 'p'], bcd: ['x', 'N', 'p'], ppd: ['x', 'λ'], pcd: ['x', 'λ'],
};
const DIST_STANDARD = { σ: EINS, μ: NULL, unten: NULL, oben: NULL, flaeche: NULL, x: NULL, N: NULL, p: NULL, λ: NULL };

export class DistSchirm {
  constructor(r) {
    this.r = r;
    this.typ = null;
    this.werte = { ...DIST_STANDARD };
    this.i = 0;
    this.feld = new Werteingabe(r);
    this.liste = null; // Gitter bei Listeneingabe
    r.push(this.typMenue(r));
  }

  typMenue(r) {
    const e = (typ) => ({ text: T('dist.' + typ), aktion: () => this.waehle(typ) });
    return new Menue({ seiten: [[e('npd'), e('ncd'), e('inv'), e('bpd')], [e('bcd'), e('ppd'), e('pcd')]] });
  }

  waehle(typ) {
    const r = this.r;
    r.zurBasis();
    this.typ = typ;
    this.i = 0;
    this.liste = null;
    this.phase = 'vars';
    if (['bpd', 'bcd', 'ppd', 'pcd'].includes(typ)) {
      r.push(new Menue({ seiten: [[
        { text: T('dist.liste'), aktion: () => {
          r.zurBasis();
          this.liste = new Gitter(r, { werte: [[null, null]], kopf: ['x', 'P'], zeilenNr: true, wachsend: true, maxZeilen: 45 });
          this.liste.geaendert = () => this.listeGeaendert();
          this.phase = 'liste';
        } },
        { text: T('dist.variable'), aktion: () => { r.zurBasis(); } },
      ]] }));
    }
  }

  variablen() {
    const v = DIST_VARS[this.typ];
    return this.liste ? v.filter((n) => n !== 'x') : v;
  }

  name(n) {
    return { unten: T('dist.unten'), oben: T('dist.oben'), flaeche: T('dist.flaeche') }[n] || n;
  }

  berechne(x) {
    const w = (n) => Z.zahl(this.werte[n]);
    const t = this.typ;
    const pruef = (v) => { if (!Number.isFinite(v)) throw Z.fehler('math'); return v; };
    try {
      switch (t) {
        case 'npd': return pruef(V.normalPD(w('x'), w('σ'), w('μ')));
        case 'ncd': return pruef(V.normalCD(w('unten'), w('oben'), w('σ'), w('μ')));
        case 'inv': return pruef(V.normalInv(w('flaeche'), w('σ'), w('μ')));
        case 'bpd': return pruef(V.binomialPD(x, w('N'), w('p')));
        case 'bcd': return pruef(V.binomialCD(x, w('N'), w('p')));
        case 'ppd': return pruef(V.poissonPD(x, w('λ')));
        case 'pcd': return pruef(V.poissonCD(x, w('λ')));
        default: throw Z.fehler('math');
      }
    } catch (e) {
      if (e instanceof Z.RechenFehler) throw e;
      throw Z.fehler('argument');
    }
  }

  taste(k, r) {
    if (!this.typ) { if (k === 'menu' || k === 'S:menu') r.globaleTaste(k); else r.push(this.typMenue(r)); return; }
    if (k === 'optn') { r.push(this.typMenue(r)); return; }
    if (k === 'menu' || k === 'S:menu') { r.globaleTaste(k); return; }
    if (this.phase === 'liste') {
      if (this.liste.s === 1 && !['up', 'down', 'left', 'right', 'ac'].includes(k)) return;
      if (this.liste.taste(k)) return;
      if (k === 'eq' || k === 'ac') { this.phase = 'vars'; this.i = 0; }
      return;
    }
    // Variableneingabe
    const vars = this.variablen();
    const erg = this.feld.taste(k);
    if (erg === 'fertig') {
      try {
        this.werte[vars[this.i]] = this.feld.wert();
      } catch (e) { r.zeigeFehler(e, () => {}); return; }
      this.feld.leeren();
      if (this.i < vars.length - 1) this.i++;
      return;
    }
    if (erg) return;
    if (k === 'down') { if (this.i < vars.length - 1) this.i++; return; }
    if (k === 'up') { if (this.i > 0) this.i--; return; }
    if (k === 'ac') { if (!this.feld.leer) this.feld.leeren(); else if (this.liste) this.phase = 'liste'; return; }
    if (k === 'eq') this.ausfuehren(r);
  }

  listeGeaendert() {
    this.liste.werte.forEach((z) => { z[1] = null; });
  }

  ausfuehren(r) {
    try {
      if (this.liste) {
        for (const z of this.liste.werte) {
          if (!z[0]) continue;
          try { z[1] = D(this.berechne(Z.zahl(z[0]))); } catch (e) { z[1] = null; }
        }
        this.phase = 'liste';
        this.liste.s = 1;
        return;
      }
      const x = this.werte.x ? Z.zahl(this.werte.x) : 0;
      const p = this.berechne(x);
      const w = D(p);
      r.ans = w;
      const name = this.typ === 'inv' ? 'xInv=' : ['ncd', 'bcd', 'pcd'].includes(this.typ) ? 'P=' : 'p=';
      r.push(new ErgebnisListe(r, [{ name, wert: w, dezimal: true }]));
    } catch (e) {
      r.zeigeFehler(e, () => {});
    }
  }

  ansicht(r) {
    if (!this.typ) return { art: 'text', zeilen: [T('app.DIST')], mitte: true };
    if (this.phase === 'liste') return this.liste.ansicht(T('dist.' + this.typ));
    const einst = r.formatEinst();
    return {
      art: 'abfrage',
      titel: T('dist.' + this.typ),
      zeilen: this.variablen().map((n, i) => ({ links: this.name(n) + ' :', el: F.formenReal(this.werte[n], einst)[0].el, markiert: i === this.i })),
      feld: this.feld.leer ? null : this.feld.ansicht(),
      auswahl: this.i,
    };
  }
}

// MARK: Wertetabelle (Modus 9)

export class TabelleSchirm {
  constructor(r) {
    this.r = r;
    this.phase = 'f';
    this.e = new Eingabe(klon(r.tabelle.f || []));
    this.e.cursorAnsEnde();
    this.bereich = [r.tabelle.start, r.tabelle.ende, r.tabelle.schritt];
    this.i = 0;
    this.feld = new Werteingabe(r);
    this.tabelle = null;
  }

  taste(k, r) {
    if (k === 'menu' || k === 'S:menu') { r.globaleTaste(k); return; }
    if (this.phase === 'f' || this.phase === 'g') { this.funktionTaste(k, r); return; }
    if (this.phase === 'bereich') { this.bereichTaste(k, r); return; }
    this.tabellenTaste(k, r);
  }

  funktionTaste(k, r) {
    if (k === 'eq') {
      if (this.phase === 'f') {
        r.tabelle.f = klon(this.e.wurzel);
        if (r.einst.tabelle === 'fg') {
          this.phase = 'g';
          this.e = new Eingabe(klon(r.tabelle.g || []));
          this.e.cursorAnsEnde();
          return;
        }
      } else r.tabelle.g = klon(this.e.wurzel);
      if (!r.tabelle.f || r.tabelle.f.length === 0) return;
      this.phase = 'bereich';
      this.i = 0;
      return;
    }
    if (k === 'ac') { this.e.leeren(); return; }
    if (k === 'del') { this.e.loeschen(); return; }
    if (k === 'left') { this.e.links(); return; }
    if (k === 'right') { this.e.rechts(); return; }
    if (k === 'up' || k === 'down') {
      if (!this.e.vertikal(k === 'up' ? -1 : 1)) {
        if (k === 'up' && this.phase === 'g') { r.tabelle.g = klon(this.e.wurzel); this.phase = 'f'; this.e = new Eingabe(klon(r.tabelle.f)); this.e.cursorAnsEnde(); }
        else if (k === 'down' && this.phase === 'f' && r.einst.tabelle === 'fg') { r.tabelle.f = klon(this.e.wurzel); this.phase = 'g'; this.e = new Eingabe(klon(r.tabelle.g || [])); this.e.cursorAnsEnde(); }
      }
      return;
    }
    if (k === 'S:del') { this.e.umschliessen = true; return; }
    const a = eingabeFuer(k, 'TABLE', r.linear());
    if (!a) return;
    if (a.el) this.e.einfuegen(a.el);
    else if (a.op) this.e.einfuegen({ k: 'op', v: a.op });
    else if (a.post) this.e.einfuegen({ k: 'post', v: a.post });
    else if (a.T) this.e.schabloneEinfuegen(a.T);
    else if (a.Tpost) this.e.schabloneEinfuegen(a.Tpost);
    else if (a.fn) this.e.einfuegen({ k: 'fn', v: a.fn });
  }

  bereichTaste(k, r) {
    const erg = this.feld.taste(k);
    if (erg === 'fertig') {
      try { this.bereich[this.i] = this.feld.wert(); } catch (e) { r.zeigeFehler(e, () => {}); return; }
      this.feld.leeren();
      if (this.i < 2) this.i++;
      return;
    }
    if (erg) return;
    if (k === 'down') { if (this.i < 2) this.i++; return; }
    if (k === 'up') { if (this.i > 0) this.i--; return; }
    if (k === 'ac') {
      if (!this.feld.leer) { this.feld.leeren(); return; }
      this.phase = 'f';
      this.e = new Eingabe(klon(r.tabelle.f));
      this.e.cursorAnsEnde();
      return;
    }
    if (k === 'eq') this.erzeuge(r);
  }

  /// f und g an der Stelle x
  funktionswert(zeile, x) {
    if (!zeile || zeile.length === 0) return null;
    const ktx = this.r.ktx();
    ktx.lokal = { x };
    try {
      const a = parse(zeile);
      return werte(a[0], ktx);
    } catch (e) {
      return 'ERROR';
    }
  }

  erzeuge(r) {
    const [s, e, h] = this.bereich.map(Z.zahl);
    r.tabelle.start = this.bereich[0];
    r.tabelle.ende = this.bereich[1];
    r.tabelle.schritt = this.bereich[2];
    const mitG = r.einst.tabelle === 'fg' && r.tabelle.g && r.tabelle.g.length > 0;
    const max = mitG ? 30 : 45;
    if (h === 0 || (e - s) / h < 0) { r.zeigeFehler(Z.fehler('range'), () => {}); return; }
    const n = Math.floor((e - s) / h + 1e-9) + 1;
    if (n > max) { r.zeigeFehler(Z.fehler('range'), () => {}); return; }
    const zeilen = [];
    let x = this.bereich[0];
    for (let i = 0; i < n; i++) {
      zeilen.push(this.zeile(x, mitG));
      x = Z.add(x, this.bereich[2]);
    }
    r.vars.x = zeilen[zeilen.length - 1][0];
    this.tabelle = new Gitter(r, { werte: zeilen, kopf: mitG ? ['x', 'f(x)', 'g(x)'] : ['x', 'f(x)'], zeilenNr: true, wachsend: false, maxZeilen: max });
    this.tabelle.geaendert = (z, sp) => { if (sp === 0) this.tabelle.werte[z] = this.zeile(this.tabelle.werte[z][0], mitG); };
    this.mitG = mitG;
    this.phase = 'tabelle';
  }

  zeile(x, mitG) {
    const f = this.funktionswert(this.r.tabelle.f, x);
    const z = [x, f === 'ERROR' ? null : f];
    if (mitG) { const g = this.funktionswert(this.r.tabelle.g, x); z.push(g === 'ERROR' ? null : g); }
    return z;
  }

  tabellenTaste(k, r) {
    const t = this.tabelle;
    // nur die x-Spalte ist bearbeitbar
    if (t.s !== 0 && !['up', 'down', 'left', 'right', 'ac'].includes(k)) return;
    if (k === 'add' || k === 'sub') {
      if (t.feld.leer && t.z > 0 && t.zeilen < t.maxZeilen) {
        // + / −: neue Zeile mit x ± Schritt
        const basis = t.werte[t.z][0];
        const neu = k === 'add' ? Z.add(basis, this.bereich[2]) : Z.sub(basis, this.bereich[2]);
        t.werte.splice(t.z + 1, 0, this.zeile(neu, this.mitG));
        t.z++;
        return;
      }
    }
    if (t.taste(k)) return;
    if (k === 'ac') { this.phase = 'f'; this.e = new Eingabe(klon(r.tabelle.f)); this.e.cursorAnsEnde(); }
  }

  ansicht(r) {
    if (this.phase === 'f' || this.phase === 'g') {
      return {
        art: 'funktion',
        name: this.phase === 'f' ? 'f(x)=' : 'g(x)=',
        eingabe: { zeile: this.e.wurzel, pfad: this.e.pfad, pos: this.e.pos, cursor: true },
      };
    }
    if (this.phase === 'bereich') {
      const einst = r.formatEinst();
      const namen = [T('table.start'), T('table.ende'), T('table.schritt')];
      return {
        art: 'abfrage',
        titel: T('table.bereich'),
        zeilen: this.bereich.map((w, i) => ({ links: namen[i] + ':', el: F.formenReal(w, einst)[0].el, markiert: i === this.i })),
        feld: this.feld.leer ? null : this.feld.ansicht(),
        auswahl: this.i,
      };
    }
    return this.tabelle.ansicht(null);
  }
}

// MARK: Statistik (Modus 6)

export function statTypMenue(r, start = false) {
  const e = (typ) => ({
    text: typ === '1var' ? T('stat.1v') : TYP_FORMEL[typ],
    aktion: () => {
      r.stat.setzeTyp(typ);
      r.zurBasis();
      r.push(new StatEditor(r));
    },
  });
  void start;
  return new Menue({ seiten: inSeiten(TYPEN.map(e), 4) });
}

export class StatEditor {
  constructor(r) {
    this.r = r;
    const st = r.stat;
    const kopf = st.zweiVar ? ['x', 'y'] : ['x'];
    if (r.einst.statFreq) kopf.push('Freq');
    const werte = st.daten.map((d) => kopf.map((k) => (k === 'x' ? d.x : k === 'y' ? d.y : d.f || EINS)));
    werte.push(kopf.map(() => null));
    this.gitter = new Gitter(r, { werte, kopf, zeilenNr: true, wachsend: true, maxZeilen: st.zweiVar ? 80 : 160 });
    this.gitter.geaendert = () => this.uebernehme();
    if (r.einst.statFreq) {
      const alt = this.gitter.setze.bind(this.gitter);
      this.gitter.setze = (z, s, w) => {
        alt(z, s, w);
        const fs = kopf.indexOf('Freq');
        if (s === 0 && this.gitter.werte[z][fs] === null) this.gitter.werte[z][fs] = EINS;
        this.uebernehme();
      };
    }
  }

  uebernehme() {
    const st = this.r.stat;
    const kopf = this.gitter.kopf;
    st.daten = this.gitter.werte
      .filter((z) => z[0] !== null)
      .map((z) => ({ x: z[0], y: kopf.includes('y') ? z[1] : null, f: kopf.includes('Freq') ? z[kopf.indexOf('Freq')] : null }));
    st.geaendert();
  }

  taste(k, r) {
    if (this.gitter.taste(k)) return;
    switch (k) {
      case 'ac': r.pop(); return;
      case 'del': {
        const g = this.gitter;
        if (g.werte.length > 1 && g.z < g.werte.length) {
          g.werte.splice(g.z, 1);
          if (g.z >= g.werte.length) g.z = g.werte.length - 1;
          if (g.werte.length === 0 || g.werte[g.werte.length - 1].some((x) => x !== null)) g.werte.push(g.kopf.map(() => null));
          this.uebernehme();
        }
        return;
      }
      case 'optn': r.push(statEditorOptn(r, this)); return;
      case 'menu': case 'S:menu': r.globaleTaste(k); return;
      default:
    }
  }

  ansicht() {
    return this.gitter.ansicht(this.r.stat.zweiVar ? TYP_FORMEL[this.r.stat.typ] : null);
  }
}

function statErgebnisse(r, art) {
  const st = r.stat;
  let namen;
  if (art === 'reg') namen = st.typ === 'quad' ? ['a', 'b', 'c'] : ['a', 'b', 'r'];
  else if (st.zweiVar) namen = ['xquer', 'sumx', 'sumx2', 'sigx2', 'sigx', 'sx2', 'sx', 'n', 'yquer', 'sumy', 'sumy2', 'sigy2', 'sigy', 'sy2', 'sy', 'sumxy', 'sumx3', 'sumx2y', 'sumx4', 'minx', 'maxx', 'miny', 'maxy'];
  else namen = ['xquer', 'sumx', 'sumx2', 'sigx2', 'sigx', 'sx2', 'sx', 'n', 'minx', 'Q1', 'Med', 'Q3', 'maxx'];
  try {
    const k = st.kennwerte();
    const eintraege = namen.filter((n) => k[n] !== undefined).map((n) => ({ name: STAT_NAMEN[n] + '=', wert: k[n], dezimal: true }));
    const titel = art === 'reg' ? TYP_FORMEL[st.typ] : '';
    r.push(new ErgebnisListe(r, eintraege, { sicht: 4, titel }));
  } catch (e) {
    r.zeigeFehler(e, () => {});
  }
}

function statEditorOptn(r, ed) {
  const st = r.stat;
  const eintraege = [
    { text: T('stat.typ'), aktion: () => { r.menuesSchliessen(); r.pop(); r.push(statTypMenue(r)); } },
    { text: T('stat.editor'), aktion: () => r.push(new Menue({ zurueck: true, seiten: [[
      { text: T('stat.einfuegen'), aktion: () => { r.menuesSchliessen(); const g = ed.gitter; g.werte.splice(g.z, 0, g.kopf.map(() => null)); } },
      { text: T('stat.alleloeschen'), aktion: () => { r.menuesSchliessen(); ed.gitter.werte = [ed.gitter.kopf.map(() => null)]; ed.gitter.z = 0; ed.uebernehme(); } },
    ]] })) },
    { text: T(st.zweiVar ? 'stat.2var' : 'stat.1var'), aktion: () => { r.menuesSchliessen(); statErgebnisse(r, 'kenn'); } },
  ];
  if (st.zweiVar) eintraege.push({ text: T('stat.regber'), aktion: () => { r.menuesSchliessen(); statErgebnisse(r, 'reg'); } });
  return new Menue({ seiten: [eintraege] });
}

export function statOptn(r, rs, einfuegenAus) {
  const st = r.stat;
  const sv = (n) => ({ text: STAT_NAMEN[n], aktion: () => einfuegenAus(r, rs, { k: 'stat', v: n }) });
  const unter = (titel, liste, spalten = 2) => ({ text: titel, aktion: () => r.push(new Menue({ titel, zurueck: true, spalten, seiten: inSeiten(liste, spalten === 2 ? 6 : 4) })) });
  const post = (v, text) => ({ text, aktion: () => einfuegenAus(r, rs, { k: 'post', v }) });
  const fn = (v, text) => ({ text, aktion: () => einfuegenAus(r, rs, { k: 'fn', v }) });
  const seite1 = [
    { text: T('stat.typ'), aktion: () => { r.menuesSchliessen(); r.push(statTypMenue(r)); } },
    { text: T(st.zweiVar ? 'stat.2var' : 'stat.1var'), aktion: () => { r.menuesSchliessen(); statErgebnisse(r, 'kenn'); } },
  ];
  if (st.zweiVar) seite1.push({ text: T('stat.regber'), aktion: () => { r.menuesSchliessen(); statErgebnisse(r, 'reg'); } });
  seite1.push({ text: T('stat.daten'), aktion: () => { r.menuesSchliessen(); r.push(new StatEditor(r)); } });
  const summen = st.zweiVar ? ['sumx', 'sumx2', 'sumy', 'sumy2', 'sumxy', 'sumx3', 'sumx2y', 'sumx4'] : ['sumx', 'sumx2'];
  const vars = st.zweiVar ? ['n', 'xquer', 'sigx2', 'sigx', 'sx2', 'sx', 'yquer', 'sigy2', 'sigy', 'sy2', 'sy'] : ['n', 'xquer', 'sigx2', 'sigx', 'sx2', 'sx'];
  const minmax = st.zweiVar ? ['minx', 'maxx', 'miny', 'maxy'] : ['minx', 'maxx', 'Q1', 'Med', 'Q3'];
  const seite2 = [
    unter(T('stat.summe'), summen.map(sv)),
    unter(T('stat.variable'), vars.map(sv)),
    unter(T('stat.minmax'), minmax.map(sv)),
  ];
  if (st.zweiVar) {
    const reg = st.typ === 'quad'
      ? [sv('a'), sv('b'), sv('c'), post('xhut1', 'x̂₁'), post('xhut2', 'x̂₂'), post('yhut', 'ŷ')]
      : [sv('a'), sv('b'), sv('r'), post('xhut', 'x̂'), post('yhut', 'ŷ')];
    seite2.push(unter(T('stat.regression'), reg));
  } else {
    seite2.push(unter(T('stat.normal'), [fn('P', 'P('), fn('Q', 'Q('), fn('R', 'R('), post('t', '▸t')]));
  }
  return new Menue({ seiten: [seite1, seite2] });
}

// MARK: Matrizen (Modus 4) und Vektoren (Modus 5)

const NAMEN4 = ['A', 'B', 'C', 'D'];

export function matrixWahl(r, art) {
  return new Menue({
    titel: art === 'definieren' ? T('optn.matdef') : T('optn.matbearb'),
    spalten: 1,
    seiten: [NAMEN4.map((n) => {
      const m = r.mat[n];
      return {
        text: `Mat${n}${m ? `  ${m.z}×${m.s}` : ''}`,
        aktion: () => {
          if (art === 'bearbeiten' && m) { r.zurBasis(); r.push(new MatrixEditor(r, n)); return; }
          r.push(new AuswahlFrage(T('mat.zeilen'), [1, 2, 3, 4], (z) => {
            r.push(new AuswahlFrage(T('mat.spalten'), [1, 2, 3, 4], (s) => {
              r.mat[n] = M.nullMatrix(z, s);
              r.zurBasis();
              r.push(new MatrixEditor(r, n));
            }));
          }));
        },
      };
    })],
  });
}

export function vektorWahl(r, art) {
  return new Menue({
    titel: art === 'definieren' ? T('optn.vctdef') : T('optn.vctbearb'),
    seiten: [NAMEN4.map((n) => {
      const v = r.vct[n];
      return {
        text: `Vct${n}${v ? `  ${v.e.length}D` : ''}`,
        aktion: () => {
          if (art === 'bearbeiten' && v) { r.zurBasis(); r.push(new VektorEditor(r, n)); return; }
          r.push(new AuswahlFrage(T('vct.dim'), [2, 3], (d) => {
            r.vct[n] = M.vektor(Array(d).fill(NULL));
            r.zurBasis();
            r.push(new VektorEditor(r, n));
          }));
        },
      };
    })],
  });
}

class MatrixEditor {
  constructor(r, name) {
    this.r = r;
    this.name = name;
    const m = r.mat[name];
    this.gitter = new Gitter(r, { werte: m.e.map((z) => z.slice()), kopf: Array.from({ length: m.s }, (_, i) => String(i + 1)), zeilenNr: true, sicht: 4 });
    this.gitter.geaendert = () => { r.mat[name] = M.matrix(this.gitter.werte.map((z) => z.map((x) => x || NULL))); };
  }
  taste(k, r) {
    if (this.gitter.taste(k)) return;
    if (k === 'ac') { r.pop(); return; }
    if (k === 'optn') { r.pop(); r.haupt.taste('optn', r); return; }
    if (k === 'menu' || k === 'S:menu') r.globaleTaste(k);
  }
  ansicht() { return this.gitter.ansicht('Mat' + this.name); }
}

class VektorEditor {
  constructor(r, name) {
    this.r = r;
    this.name = name;
    const v = r.vct[name];
    this.gitter = new Gitter(r, { werte: [v.e.slice()], kopf: v.e.map((_, i) => String(i + 1)), sicht: 1 });
    this.gitter.geaendert = () => { r.vct[name] = M.vektor(this.gitter.werte[0].map((x) => x || NULL)); };
  }
  taste(k, r) {
    if (this.gitter.taste(k)) return;
    if (k === 'ac') { r.pop(); return; }
    if (k === 'optn') { r.pop(); r.haupt.taste('optn', r); return; }
    if (k === 'menu' || k === 'S:menu') r.globaleTaste(k);
  }
  ansicht() { return this.gitter.ansicht('Vct' + this.name); }
}

export function matrixOptn(r, rs, einfuegenAus) {
  const mat = (n) => ({ text: 'Mat' + n, aktion: () => einfuegenAus(r, rs, { k: 'mat', v: n }) });
  const fn = (v, text) => ({ text, aktion: () => einfuegenAus(r, rs, { k: 'fn', v }) });
  return new Menue({
    spalten: 1,
    seiten: [
      [{ text: T('optn.matdef'), aktion: () => { r.menuesSchliessen(); r.push(matrixWahl(r, 'definieren')); } },
        { text: T('optn.matbearb'), aktion: () => { r.menuesSchliessen(); r.push(matrixWahl(r, 'bearbeiten')); } },
        mat('A'), mat('B')],
      [mat('C'), mat('D'), mat('Ans'), fn('det', T('optn.det'))],
      [fn('Trn', T('optn.trn')), fn('Identity', T('optn.ident')), fn('Ref', T('optn.ref')), fn('Rref', T('optn.rref'))],
    ],
  });
}

export function vektorOptn(r, rs, einfuegenAus) {
  const vct = (n) => ({ text: 'Vct' + n, aktion: () => einfuegenAus(r, rs, { k: 'vct', v: n }) });
  const fn = (v, text) => ({ text, aktion: () => einfuegenAus(r, rs, { k: 'fn', v }) });
  return new Menue({
    seiten: [
      [{ text: T('optn.vctdef'), aktion: () => { r.menuesSchliessen(); r.push(vektorWahl(r, 'definieren')); } },
        { text: T('optn.vctbearb'), aktion: () => { r.menuesSchliessen(); r.push(vektorWahl(r, 'bearbeiten')); } },
        vct('A'), vct('B')],
      [vct('C'), vct('D'), vct('Ans'), { text: T('optn.punkt'), aktion: () => einfuegenAus(r, rs, { k: 'op', v: '·' }, true) }],
      [fn('Angle', T('optn.vwinkel')), fn('UnitV', T('optn.einheitsv'))],
    ],
  });
}

export { K };
