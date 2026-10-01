// bildschirme.js – Bausteine der Rechneranzeige: Menüs (nummeriert, seitenweise wie beim Rechner),
// Hauptmenü, Rückfrage, Hinweis, Fehler, QR-Code und die Werteingabe für Editoren.
// Ein Bildschirm hat taste(k, r) und ansicht(r); r ist der Rechner (rechner.js).

import { Eingabe } from './eingabe.js';
import { parse } from './parser.js';
import { werte } from './auswertung.js';
import { eingabeFuer, HEX_TASTE } from './tasten.js';
import { T } from './i18n.js';
import { RechenFehler } from './zahl.js';

/// Zahl aus einer Ziffern- oder Buchstabentaste (A–D = 10–13 im Hauptmenü)
export function nummer(k) {
  if (/^\d$/.test(k)) return Number(k);
  const id = k.startsWith('A:') ? k.slice(2) : k;
  const buchstabe = HEX_TASTE[id];
  if (buchstabe) return 10 + 'ABCDEF'.indexOf(buchstabe);
  return null;
}

// MARK: Menü

export class Menue {
  /// seiten: [[{ text, aktion(r), markiert? }]]
  constructor({ titel = '', seiten, spalten = 1, zurueck = false, frage = null }) {
    this.titel = titel;
    this.seiten = seiten.filter((s) => s.length > 0);
    this.spalten = spalten;
    this.zurueck = zurueck;
    this.frage = frage;
    this.seite = 0;
    this.istMenue = true;
  }

  taste(k, r) {
    if (k === 'up') { if (this.seite > 0) this.seite--; return; }
    if (k === 'down') { if (this.seite < this.seiten.length - 1) this.seite++; return; }
    if (k === 'ac' || (k === 'left' && this.zurueck)) { r.pop(); return; }
    if (k === 'menu' || k === 'S:menu') { r.globaleTaste(k); return; }
    const n = nummer(k);
    const eintraege = this.seiten[this.seite];
    if (n !== null && n >= 1 && n <= eintraege.length) eintraege[n - 1].aktion(r);
  }

  ansicht() {
    return {
      art: 'menu',
      titel: this.titel,
      frage: this.frage,
      eintraege: this.seiten[this.seite].map((e, i) => ({ nr: String(i + 1), text: e.text, markiert: !!e.markiert })),
      spalten: this.spalten,
      seite: this.seite,
      seiten: this.seiten.length,
      zurueck: this.zurueck,
    };
  }
}

/// Liste in Seiten zu je n Einträgen
export function inSeiten(liste, n = 4) {
  const seiten = [];
  for (let i = 0; i < liste.length; i += n) seiten.push(liste.slice(i, i + n));
  return seiten;
}

// MARK: Hauptmenü

export const APPS = ['COMP', 'CMPLX', 'BASE', 'MAT', 'VCT', 'STAT', 'DIST', 'SHEET', 'TABLE', 'EQN', 'INEQ', 'VERIFY', 'RATIO'];
const APP_NR = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D'];

export class Hauptmenue {
  constructor(r) {
    this.auswahl = Math.max(0, APPS.indexOf(r.modus));
    this.istMenue = true;
  }

  taste(k, r) {
    const spalten = 7; // wie im Raster der Anzeige (anzeige.js: .icons)
    switch (k) {
      case 'left': this.auswahl = (this.auswahl + APPS.length - 1) % APPS.length; return;
      case 'right': this.auswahl = (this.auswahl + 1) % APPS.length; return;
      case 'up': if (this.auswahl >= spalten) this.auswahl -= spalten; return;
      case 'down': if (this.auswahl + spalten < APPS.length) this.auswahl += spalten; return;
      case 'eq': r.setzeModus(APPS[this.auswahl]); return;
      case 'ac': case 'menu': r.pop(); return;
      case 'S:menu': r.globaleTaste(k); return;
      default: {
        const n = nummer(k);
        if (n !== null && n >= 1 && n <= APPS.length) r.setzeModus(APPS[n - 1]);
      }
    }
  }

  ansicht() {
    return {
      art: 'hauptmenu',
      eintraege: APPS.map((a, i) => ({ nr: APP_NR[i], text: T('app.' + a), app: a })),
      auswahl: this.auswahl,
    };
  }
}

// MARK: Rückfrage und Hinweis

export class Frage {
  constructor(text, jaAktion) {
    this.text = text;
    this.ja = jaAktion;
    this.erledigt = false;
  }
  taste(k, r) {
    if (this.erledigt) { if (k === 'ac' || k === 'eq') r.pop(); return; }
    if (k === 'eq') { this.ja(r); this.erledigt = true; return; }
    if (k === 'ac') r.pop();
  }
  ansicht() {
    if (this.erledigt) return { art: 'text', zeilen: [T('fertig.ac')], mitte: true };
    return { art: 'text', zeilen: [this.text, '', T('ja.nein')], mitte: true };
  }
}

export class Hinweis {
  constructor(zeilen, { schliessen = null } = {}) {
    this.zeilen = zeilen;
    this.schliessen = schliessen;
  }
  taste(k, r) {
    if (k === 'ac' || k === 'eq' || k === 'left' || k === 'right') {
      r.pop();
      if (this.schliessen) this.schliessen(r, k);
      return;
    }
    if (k === 'menu' || k === 'S:menu') r.globaleTaste(k);
  }
  ansicht() {
    return { art: 'text', zeilen: this.zeilen, mitte: true };
  }
}

// MARK: Fehler

export class FehlerSchirm {
  /// zurueck(r, taste): Aktion beim Verlassen ('ac' → Eingabe löschen, 'left'/'right' → bearbeiten)
  constructor(art, zurueck) {
    this.art = art;
    this.zurueck = zurueck;
  }
  taste(k, r) {
    if (k === 'ac' || k === 'left' || k === 'right' || k === 'del') {
      r.pop();
      if (this.zurueck) this.zurueck(r, k);
      return;
    }
    if (k === 'menu' || k === 'S:menu') r.globaleTaste(k);
  }
  ansicht() {
    const zeilen = this.art === 'solve'
      ? [T('fehler.solvehinweis'), T('fehler.abbrechen')]
      : [T('fehler.abbrechen'), T('fehler.gehezu')];
    return { art: 'fehler', titel: T('fehler.' + this.art), zeilen };
  }
}

/// Fehlerart aus einer Ausnahme (unerwartete Fehler → Math ERROR, damit nichts hängen bleibt)
export function fehlerArt(e) {
  if (e instanceof RechenFehler) return e.art;
  if (e instanceof RangeError) return 'math';
  if (typeof console !== 'undefined') console.error(e);
  return 'math';
}

// MARK: QR-Code (SHIFT OPTN)

export class QRSchirm {
  taste(k, r) {
    if (k === 'ac' || k === 'S:optn' || k === 'eq') r.pop();
    else if (k === 'menu' || k === 'S:menu') r.globaleTaste(k);
  }
  ansicht() {
    return { art: 'qr', text: T('qr.text') };
  }
}

// MARK: Werteingabe (Editorzellen, CALC, SOLVE)

export class Werteingabe {
  constructor(r) {
    this.r = r;
    this.e = new Eingabe();
  }

  get leer() { return this.e.istLeer(); }

  leeren() { this.e.leeren(); }

  /// Taste verarbeiten: 'fertig' (=), true (verarbeitet) oder false (nicht zuständig)
  taste(k) {
    if (k === 'eq') return this.leer ? false : 'fertig';
    if (k === 'del') { if (this.leer) return false; this.e.loeschen(); return true; }
    if (k === 'S:del') { this.e.umschliessen = true; return true; }
    if (k === 'left') return this.leer ? false : (this.e.links(), true);
    if (k === 'right') return this.leer ? false : (this.e.rechts(), true);
    if ((k === 'up' || k === 'down') && !this.leer) return this.e.vertikal(k === 'up' ? -1 : 1) || false;
    const a = eingabeFuer(k, this.r.modus, this.r.linear());
    if (!a) return false;
    if (a.el) this.e.einfuegen(a.el);
    else if (a.op) this.e.einfuegen({ k: 'op', v: a.op });
    else if (a.post) this.e.einfuegen({ k: 'post', v: a.post });
    else if (a.T) this.e.schabloneEinfuegen(a.T);
    else if (a.Tpost) this.e.schabloneEinfuegen(a.Tpost);
    else if (a.fn) this.e.einfuegen({ k: 'fn', v: a.fn });
    return true;
  }

  /// Wert der Eingabe (Real oder komplex)
  wert() {
    const anw = parse(this.e.wurzel);
    return werte(anw[0], this.r.ktx());
  }

  ansicht() {
    return { zeile: this.e.wurzel, pfad: this.e.pfad, pos: this.e.pos };
  }
}
