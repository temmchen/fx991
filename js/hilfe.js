// hilfe.js – Hilfe-Panel: Lektionen mit Vorführen/Üben/Prüfen, Tastenhilfe, Tipps, Über.
// Inhalte (dreisprachig) kommen aus inhalt.js; Tastenfolgen im Format von tasten.js („[SHIFT][sin]0.5=“).

import { h, formel } from './anzeige.js';
import { tastenfolge, TASTEN } from './tasten.js';
import { miniKappe, LAGE } from './tastatur.js';
import { inhalt, uiText } from './inhalt.js';
import { alsText } from './format.js';
import * as Z from './zahl.js';

const FORTSCHRITT = 'fx991.fortschritt';

function ladeFortschritt() {
  try { return JSON.parse(localStorage.getItem(FORTSCHRITT) || '{}'); } catch (e) { return {}; }
}
function sichereFortschritt(f) {
  try { localStorage.setItem(FORTSCHRITT, JSON.stringify(f)); } catch (e) { /* ohne Speichern */ }
}

/// Text mit einfacher Auszeichnung → DOM: **fett**, `Code`, [Tasten]{…}
function absatz(text, tag = 'p') {
  const e = h(tag);
  e.innerHTML = text;
  return e;
}

/// Tastenfolge als Reihe von Mini-Tasten (SHIFT/ALPHA mit Zweitfunktion)
export function tastenReihe(folge) {
  const reihe = h('span', { class: 'tastenreihe' });
  let ids;
  try { ids = tastenfolge(folge); } catch (e) { reihe.append(folge); return reihe; }
  ids.forEach((id, i) => {
    const vorher = ids[i - 1];
    const mod = vorher === 'shift' ? 'S' : vorher === 'alpha' ? 'A' : null;
    reihe.append(miniKappe(id, { mitShift: mod }));
  });
  return reihe;
}

export class Hilfe {
  constructor(box, { rechner, spiele, sprache, schliessen, zeichne, vorVorfuehrung }) {
    this.box = box;
    this.r = rechner;
    this.spiele = spiele;
    this.sprache = sprache;
    this.schliessen = schliessen;
    this.zeichne = zeichne;
    this.vorVorfuehrung = vorVorfuehrung || (() => {});
    this.reiter = 'lektionen';
    this.lektion = null;  // Index der offenen Lektion
    this.fortschritt = ladeFortschritt();
    this.aktiveAufgabe = null;
    this.baue();
  }

  t(k) { return uiText(this.sprache, k); }
  get daten() { return inhalt(this.sprache); }

  setzeSprache(s) {
    this.sprache = s;
    this.baue();
  }

  zeigeReiter(r) {
    this.reiter = r;
    this.baue();
  }

  baue() {
    const kopf = h('div', { class: 'hilfe-kopf' });
    for (const [id, k] of [['lektionen', 'ui.lektionen'], ['tasten', 'ui.tasten'], ['tipps', 'ui.tipps'], ['ueber', 'ui.ueber']]) {
      const b = h('button', { type: 'button', class: 'reiter' + (this.reiter === id ? ' an' : '') }, this.t(k));
      b.addEventListener('click', () => { this.reiter = id; if (id === 'lektionen') this.lektion = null; this.baue(); });
      kopf.append(b);
    }
    const zu = h('button', { type: 'button', class: 'schliessen', 'aria-label': this.t('ui.schliessen') }, '×');
    zu.addEventListener('click', () => this.schliessen());
    kopf.append(zu);
    this.inhalt = h('div', { class: 'hilfe-inhalt' });
    this.box.replaceChildren(kopf, this.inhalt);
    if (this.reiter === 'lektionen') {
      if (this.lektion === null) this.lektionsListe(); else this.zeigeLektion(this.lektion);
    } else if (this.reiter === 'tasten') this.tastenSeite();
    else if (this.reiter === 'tipps') this.tippsSeite();
    else this.ueberSeite();
  }

  // MARK: Lektionen

  lektionsListe() {
    const d = this.daten;
    this.inhalt.append(h('h2', null, this.t('ui.lektionenTitel')), absatz(this.t('ui.lektionenIntro')));
    let gruppe = null;
    let liste = null;
    d.lektionen.forEach((l, i) => {
      if (l.gruppe !== gruppe) {
        gruppe = l.gruppe;
        this.inhalt.append(h('div', { class: 'gruppe-titel' }, gruppe));
        liste = h('ol', { class: 'lektionsliste' });
        this.inhalt.append(liste);
      }
      const geloest = (l.aufgaben || []).filter((a, j) => this.fortschritt[`${l.id}.${j}`]).length;
      const gesamt = (l.aufgaben || []).length;
      const b = h('button', { type: 'button' },
        h('span', { class: 'lnr' }, String(i + 1)),
        h('span', null, h('span', { class: 'ltitel' }, l.titel), h('span', { class: 'lkurz' }, l.kurz)),
        h('span', { class: 'lstand' }, gesamt ? `${geloest}/${gesamt}` : ''));
      b.addEventListener('click', () => { this.lektion = i; this.baue(); this.inhalt.scrollTop = 0; });
      liste.append(h('li', null, b));
    });
  }

  zeigeLektion(i) {
    const l = this.daten.lektionen[i];
    if (!l) { this.lektion = null; this.lektionsListe(); return; }
    const c = this.inhalt;
    const zurueck = h('button', { type: 'button', class: 'knopf klein' }, '◀ ' + this.t('ui.uebersicht'));
    zurueck.addEventListener('click', () => { this.lektion = null; this.baue(); });
    c.append(zurueck, h('h2', null, `${i + 1}. ${l.titel}`));
    if (l.einleitung) c.append(absatz(l.einleitung));
    (l.schritte || []).forEach((s, j) => c.append(this.schritt(l, s, j)));
    if (l.merke) {
      const m = h('div', { class: 'hinweisbox' });
      m.innerHTML = `<strong>${this.t('ui.merke')}</strong> ${l.merke}`;
      c.append(m);
    }
    if (l.falle) {
      const f = h('div', { class: 'hinweisbox falle' });
      f.innerHTML = `<strong>${this.t('ui.falle')}</strong> ${l.falle}`;
      c.append(f);
    }
    if ((l.aufgaben || []).length) {
      c.append(h('h3', null, this.t('ui.aufgaben')));
      c.append(absatz(this.t('ui.aufgabenIntro'), 'p'));
      l.aufgaben.forEach((a, j) => c.append(this.aufgabe(l, a, j)));
    }
    const nav = h('div', { class: 'navzeile' });
    if (i > 0) {
      const v = h('button', { type: 'button', class: 'knopf' }, '◀ ' + this.daten.lektionen[i - 1].titel);
      v.addEventListener('click', () => { this.lektion = i - 1; this.baue(); this.inhalt.scrollTop = 0; });
      nav.append(v);
    } else nav.append(h('span'));
    if (i < this.daten.lektionen.length - 1) {
      const n = h('button', { type: 'button', class: 'knopf' }, this.daten.lektionen[i + 1].titel + ' ▶');
      n.addEventListener('click', () => { this.lektion = i + 1; this.baue(); this.inhalt.scrollTop = 0; });
      nav.append(n);
    }
    c.append(nav);
  }

  schritt(l, s, j) {
    const box = h('div', { class: 'schritt' });
    box.append(absatz(s.text, 'div'));
    if (s.tasten) {
      box.append(tastenReihe(s.tasten));
      const akt = h('div', { class: 'aktionen' });
      const vor = h('button', { type: 'button', class: 'knopf haupt klein' }, '▶ ' + this.t('ui.vorfuehren'));
      vor.addEventListener('click', () => this.vorfuehren(l, j));
      akt.append(vor);
      if (s.ergebnis) {
        const erw = h('span', { class: 'erwartet' }, this.t('ui.anzeige') + ' ');
        erw.append(this.zeigeText(s.ergebnis));
        akt.append(erw);
      }
      box.append(akt);
    }
    return box;
  }

  /// Ergebnistext für die Anzeige: Dezimalzeichen wie eingestellt, ×10ⁿ hochgestellt, Periode mit Strich
  zeigeText(t) {
    let s = t;
    if (this.r.einst.dezimal === ',') s = s.replace(/(\d)\.(\d|\()/g, '$1,$2').replace(/, θ/g, '; θ').replace(/, y=/g, '; y=');
    const span = h('span', { class: 'ausgabe' });
    const esc = (x) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    span.innerHTML = esc(s)
      .replace(/×10\^(-?\d+)/g, (m, e) => `×10<sup>${e.replace('-', '−')}</sup>`)
      .replace(/([.,]\d*)\((\d+)\)/g, '$1<span style="text-decoration:overline">$2</span>')
      .replace(/;L−R=/g, ' · L−R=').replace(/;/g, '; ');
    return span;
  }

  /// Schritt vorführen: vorher die Vorbereitung der Lektion und alle früheren Schritte stumm ausführen
  async vorfuehren(l, j) {
    this.vorVorfuehrung();
    const s = l.schritte[j];
    if (s.neu !== false) {
      // definierter Anfangszustand: Lektion-Vorbereitung + vorangehende Schritte ohne Animation
      for (const id of tastenfolge(l.vorbereitung || '[ON]')) this.r.taste(id);
      for (let k = 0; k < j; k++) {
        const v = l.schritte[k];
        if (v.tasten && v.kette) for (const id of tastenfolge(v.tasten)) this.r.taste(id);
      }
      this.zeichne();
    }
    await this.spiele(tastenfolge(s.tasten));
  }

  aufgabe(l, a, j) {
    const schluessel = `${l.id}.${j}`;
    const box = h('div', { class: 'aufgabe' + (this.fortschritt[schluessel] ? ' geloest' : '') });
    const kopf = h('div');
    kopf.innerHTML = `<span class="anr">${j + 1}.</span>${a.text}`;
    box.append(kopf);
    const akt = h('div', { class: 'aktionen' });
    const pruef = h('button', { type: 'button', class: 'knopf haupt klein' }, this.t('ui.pruefen'));
    const tipp = h('button', { type: 'button', class: 'knopf klein' }, this.t('ui.tipp'));
    const loes = h('button', { type: 'button', class: 'knopf klein' }, this.t('ui.loesungsweg'));
    akt.append(pruef);
    if (a.hinweis) akt.append(tipp);
    akt.append(loes);
    box.append(akt);
    const rueck = h('div', { class: 'rueckmeldung' });
    box.append(rueck);
    const extra = h('div');
    box.append(extra);
    pruef.addEventListener('click', () => {
      const ok = this.pruefe(a);
      rueck.className = 'rueckmeldung ' + (ok === true ? 'richtig' : 'falsch');
      rueck.textContent = ok === true ? this.t('ui.richtig') : ok === null ? this.t('ui.keinErgebnis') : this.t('ui.nochNicht');
      if (ok === true) {
        this.fortschritt[schluessel] = true;
        sichereFortschritt(this.fortschritt);
        box.classList.add('geloest');
      }
    });
    tipp.addEventListener('click', () => {
      extra.replaceChildren(absatz(a.hinweis, 'div'));
    });
    loes.addEventListener('click', () => {
      extra.replaceChildren();
      if (a.loesungText) extra.append(absatz(a.loesungText, 'div'));
      extra.append(tastenReihe(a.loesung));
      const vor = h('button', { type: 'button', class: 'knopf klein' }, '▶ ' + this.t('ui.vorfuehren'));
      vor.addEventListener('click', async () => {
        this.vorVorfuehrung();
        for (const id of tastenfolge(l.vorbereitung || '[ON]')) this.r.taste(id);
        if (a.vorbereitung) for (const id of tastenfolge(a.vorbereitung)) this.r.taste(id);
        this.zeichne();
        await this.spiele(tastenfolge(a.loesung));
      });
      extra.append(h('div', { class: 'aktionen' }, vor));
      if (a.anzeige || a.wert !== undefined) {
        extra.append(h('div', { class: 'erwartet' }, this.t('ui.ergebnis') + ' ', this.zeigeText(a.anzeige || String(a.wertText || a.wert))));
      }
    });
    return box;
  }

  /// Aufgabe prüfen: true (richtig), false, null (kein Ergebnis)
  pruefe(a) {
    return pruefeAufgabe(a, this.r);
  }

  nachTaste() {
    // Platz für automatische Rückmeldungen (derzeit über „Prüfen“)
  }

  // MARK: Tastenhilfe

  tastenSeite(fokus = null) {
    const c = this.inhalt;
    c.append(h('h2', null, this.t('ui.tastenTitel')), absatz(this.t('ui.tastenIntro')));
    const uebersicht = h('div', { class: 'tastenuebersicht' });
    for (const id of Object.keys(LAGE)) {
      const b = h('button', { type: 'button', 'aria-label': id }, miniKappe(id));
      b.addEventListener('click', () => this.zeigeTaste(id, null));
      uebersicht.append(b);
    }
    c.append(uebersicht);
    this.karte = h('div');
    c.append(this.karte);
    if (fokus) this.zeigeTaste(fokus.id, fokus.mod);
  }

  zeigeTaste(id, mod) {
    if (this.reiter !== 'tasten' || !this.karte) {
      this.reiter = 'tasten';
      this.baue();
    }
    const info = (this.daten.tasten || {})[id] || {};
    const k = h('div', { class: 'tastenkarte' });
    const kopf = h('div', { class: 'tk-kopf' }, miniKappe(id), h('strong', null, info.name || TASTEN[id]?.haupt || id));
    k.append(kopf);
    const dl = h('dl');
    const zeile = (klasse, titel, text) => {
      if (!text) return;
      dl.append(h('dt', { class: klasse }, titel));
      const dd = h('dd');
      dd.innerHTML = text;
      dl.append(dd);
    };
    zeile('', this.t('ui.taste'), info.haupt);
    zeile('s', 'SHIFT', info.shift);
    zeile('a', 'ALPHA', info.alpha);
    zeile('', this.t('ui.weitere'), info.extra);
    k.append(dl);
    if (mod) {
      const hinweis = h('p', { class: 'gedaempft' }, (mod === 'shift' ? 'SHIFT' : 'ALPHA') + ' → ' + (mod === 'shift' ? (TASTEN[id]?.shift || '—') : (TASTEN[id]?.alpha || '—')));
      k.prepend(hinweis);
    }
    this.karte.replaceChildren(k);
    k.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  // MARK: Tipps und Über

  tippsSeite() {
    const c = this.inhalt;
    c.append(h('h2', null, this.t('ui.tippsTitel')));
    for (const t of this.daten.tipps || []) {
      const box = h('div', { class: 'schritt' });
      box.append(h('strong', null, t.titel));
      box.append(absatz(t.text, 'div'));
      if (t.tasten) box.append(tastenReihe(t.tasten));
      c.append(box);
    }
  }

  ueberSeite() {
    const c = this.inhalt;
    const d = this.daten;
    const box = h('div');
    box.innerHTML = d.ueber || '';
    c.append(box);
    const qr = h('img', { src: 'qr-code.svg', alt: 'QR', style: 'width:180px;height:180px;image-rendering:pixelated;background:#fff;padding:8px;border-radius:8px;margin:8px 0' });
    c.append(qr);
  }
}

/// Texte vergleichbar machen (Dezimalkomma, Trennzeichen, Minuszeichen, Leerzeichen)
export function normText(t) {
  return t.replace(/; /g, ', ').replace(/,(?=[\d(])/g, '.').replace(/\s/g, '').replace(/−/g, '-');
}

/// Aufgabe prüfen (ohne Oberfläche, auch für Tests): true, false oder null (kein Ergebnis)
export function pruefeAufgabe(a, r) {
  const v = r.ansicht();
  if (!v.an || !v.bild) return null;
  if (a.anzeige) {
    const text = aktuellerText(v);
    if (text === null) return null;
    return normText(text) === normText(a.anzeige);
  }
  if (a.wert !== undefined) {
    const w0 = a.variable ? r.vars[a.variable] : r.ans;
    if (!w0) return null;
    if (w0.t === 'c') return false;
    const w = Z.zahl(w0);
    const tol = a.tol !== undefined ? a.tol : 1e-9;
    return Math.abs(w - a.wert) <= tol * Math.max(1, Math.abs(a.wert));
  }
  return null;
}

/// angezeigtes Ergebnis als Text (für „Prüfen“)
export function aktuellerText(v) {
  const b = v.bild;
  if (b.art === 'rechnen' && b.ergebnis) {
    if (b.ergebnis.art === 'el') return alsText(b.ergebnis.el);
    if (b.ergebnis.art === 'basen') return b.ergebnis.zeilen.join(' ');
    if (b.ergebnis.art === 'text') return b.ergebnis.text;
  }
  if (b.art === 'loesung' || b.art === 'solve') return b.zeilen.map((z) => z.links + alsText(z.el || [])).join(';');
  return null;
}

export { formel };
