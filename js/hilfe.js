// hilfe.js – Hilfe-Reiter: Lektionen mit Vorführen/Üben/Prüfen, Tastenhilfe, Werkzeuge (Graph & Co.),
// Tipps, Über.
// Inhalte (dreisprachig) kommen aus inhalt.js; Tastenfolgen im Format von tasten.js („[SHIFT][sin]0.5=“).

import { h, formel } from './anzeige.js';
import { tastenfolge, TASTEN } from './tasten.js';
import { miniKappe, LAGE } from './tastatur.js';
import { inhalt, uiText } from './inhalt.js';
import { alsText } from './format.js';
import * as Z from './zahl.js';
import * as GR from './inhalt/griechisch.js';

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
  constructor(box, { rechner, spiele, sprache, schliessen, zeichne, vorVorfuehrung, werkzeuge }) {
    this.box = box;
    this.r = rechner;
    this.spiele = spiele;
    this.sprache = sprache;
    this.schliessen = schliessen;
    this.zeichne = zeichne;
    this.vorVorfuehrung = vorVorfuehrung || (() => {});
    // Reiter-Werkzeuge der App (app.js): { oeffne(tab), beispiel(texte), drucken(), zuruecksetzen() }
    this.werkzeuge = werkzeuge || null;
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
    const reiter = [['lektionen', 'ui.lektionen'], ['tasten', 'ui.tasten']];
    if (this.werkzeuge) reiter.push(['werkzeuge', 'ui.werkzeuge']);
    reiter.push(['griechisch', 'ui.griechisch'], ['tipps', 'ui.tipps'], ['ueber', 'ui.ueber']);
    if (!reiter.some(([id]) => id === this.reiter)) this.reiter = 'lektionen';
    for (const [id, k] of reiter) {
      const b = h('button', { type: 'button', class: 'reiter' + (this.reiter === id ? ' an' : '') }, this.t(k));
      if (id === 'griechisch') { b.title = this.t('ui.griechischTitel'); b.setAttribute('aria-label', this.t('ui.griechischTitel')); }
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
    else if (this.reiter === 'werkzeuge') this.werkzeugSeite();
    else if (this.reiter === 'griechisch') this.griechischSeite();
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
    const k = this.tastenKarte(id, mod);
    this.karte.replaceChildren(k);
    k.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  /// Erklärung einer Taste als Karte (Reiter „Tasten“ oder Blatt über dem Rechner)
  tastenKarte(id, mod) {
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
    return k;
  }

  // MARK: Werkzeuge (Graph, Analysis, Gleichungen, Solver aus RPN42)

  werkzeugSeite() {
    const c = this.inhalt;
    const w = this.daten.werkzeuge;
    if (!w || !this.werkzeuge) return;
    c.append(h('h2', null, w.titel), absatz(w.intro));
    for (const a of w.abschnitte) {
      const box = h('div', { class: 'schritt werkzeug' });
      box.append(h('strong', null, a.titel), absatz(a.text, 'div'));
      if (a.tasten) box.append(tastenReihe(a.tasten));
      const akt = h('div', { class: 'aktionen' });
      if (a.tasten) {
        const vor = h('button', { type: 'button', class: 'knopf haupt klein' }, '▶ ' + this.t('ui.vorfuehren'));
        vor.addEventListener('click', async () => {
          this.vorVorfuehrung();
          for (const id of tastenfolge(a.vorbereitung || '[ON]')) this.r.taste(id);
          this.zeichne();
          await this.spiele(tastenfolge(a.tasten));
        });
        akt.append(vor);
      }
      if (a.beispiel) {
        const b = h('button', { type: 'button', class: 'knopf klein' }, w.beispielKnopf);
        b.addEventListener('click', () => this.werkzeuge.beispiel(a.beispiel));
        akt.append(b);
      }
      if (a.tab) {
        const b = h('button', { type: 'button', class: 'knopf klein' }, a.knopf + ' ▶');
        b.addEventListener('click', () => this.werkzeuge.oeffne(a.tab));
        akt.append(b);
      }
      if (a.aktion === 'drucken' || a.aktion === 'zuruecksetzen') {
        const b = h('button', { type: 'button', class: 'knopf klein' + (a.aktion === 'drucken' ? ' haupt' : '') }, a.knopf);
        b.addEventListener('click', () => (a.aktion === 'drucken' ? this.werkzeuge.drucken() : this.werkzeuge.zuruecksetzen()));
        akt.append(b);
      }
      if (akt.childElementCount) box.append(akt);
      c.append(box);
    }
  }

  // MARK: Griechisches Alphabet (nach Toms Skript; Daten in inhalt/griechisch.js)

  griechischSeite() {
    const c = this.inhalt;
    const s = this.sprache;
    const tx = GR.TEXTE[s] || GR.TEXTE.de;
    const text = (v) => (v && typeof v === 'object' ? (v[s] || v.de) : (v || ''));
    // Zahlen mit dem Dezimalzeichen des Rechners, ×10^n hochgestellt
    const dez = (v) => {
      const t0 = this.r.einst.dezimal === ',' ? String(v).replace(/(\d)\.(\d)/g, '$1,$2') : String(v);
      return t0.replace(/×10\^(-?\d+)/g, (m, e) => `×10<sup>${e.replace('-', '−')}</sup>`);
    };
    const html = (tag, klasse, inhalt) => {
      const x = h(tag, klasse ? { class: klasse } : null);
      x.innerHTML = dez(inhalt);
      return x;
    };

    c.append(h('h2', null, tx.titel), absatz(tx.intro));

    // Alphabet: groß, klein, Variante, Name
    c.append(h('h3', null, tx.alphabet));
    const raster = h('div', { class: 'gk-raster' });
    for (const b of GR.ALPHABET) {
      raster.append(h('div', { class: 'gk-karte' },
        h('div', { class: 'gk-zeichen', lang: 'el' }, b.gross, h('span', { class: 'gk-klein' }, b.klein),
          b.variante ? h('span', { class: 'gk-variante' }, b.variante) : null),
        this.gkName(text(b.name))));
    }
    c.append(raster, h('p', { class: 'gedaempft' }, tx.legende));

    // Lernkarte
    c.append(h('h3', null, tx.lernkarte));
    const karte = h('div', { class: 'gk-lernkarte' });
    c.append(karte);
    this.lernkarte(karte, tx);

    // Verwendung in Elektrotechnik, Physik/Mechanik, Mathematik
    const zeile = (zeichenHtml, name, bedeutung, unten) => {
      const symbol = h('div', { class: 'gk-symbol' });
      const lang = zeichenHtml.replace(/<[^>]+>/g, '').length > 3;   // „α, β, γ“
      symbol.append(html('span', 'gk-gross' + (lang ? ' gk-mehrere' : ''), zeichenHtml), h('span', { class: 'gk-buchstabe' }, name));
      return h('div', { class: 'gk-zeile' }, symbol, h('div', null, html('div', 'gk-bedeutung', bedeutung), ...unten));
    };
    for (const [liste, titel] of [[GR.ETECHNIK, tx.etechnik], [GR.PHYSIK, tx.physik], [GR.MATHE, tx.mathe]]) {
      c.append(h('h3', null, titel));
      const box = h('div', { class: 'gk-liste' });
      for (const x of liste) {
        const name = x.zeichen.split(', ').map((z) => GR.buchstabenName(z, s)).join(', ');
        const teile = [];
        if (x.formel) teile.push(`<span class="gk-f">${text(x.formel)}</span>`);
        if (x.einheit) teile.push(`[${x.zeichen}] = ${x.einheit}`);
        box.append(zeile(x.zeichen, name, text(x.bedeutung), teile.length ? [html('div', 'gk-formel', teile.join('<span class="gk-trenner">·</span>'))] : []));
      }
      c.append(box);
    }

    // Konstanten und Kennwerte, mit Vorführung am Rechner
    c.append(h('h3', null, tx.konstanten), absatz(tx.konstantenIntro));
    const box = h('div', { class: 'gk-liste' });
    for (const x of GR.KONSTANTEN) {
      const unten = [];
      if (x.wert) unten.push(html('div', 'gk-wert', x.wert + (x.einheit ? ` ${x.einheit}` : '')));
      if (x.tasten) {
        const akt = h('div', { class: 'gk-casio' }, tastenReihe(x.tasten));
        const vor = h('button', { type: 'button', class: 'knopf haupt klein', 'aria-label': this.t('ui.vorfuehren') }, '▶');
        vor.addEventListener('click', async () => {
          this.vorVorfuehrung();
          for (const id of tastenfolge(GR.STANDARD)) this.r.taste(id);
          this.zeichne();
          await this.spiele(tastenfolge(x.tasten));
        });
        akt.append(vor);
        unten.push(akt);
      }
      box.append(zeile(x.zeichen, GR.buchstabenName(x.zeichen, s), text(x.bedeutung), unten));
    }
    c.append(box);

    const achtung = h('div', { class: 'hinweisbox falle' });
    achtung.innerHTML = `<strong>${this.t('ui.falle')}</strong> ${tx.achtung}`;
    const merke = h('div', { class: 'hinweisbox' });
    merke.innerHTML = `<strong>${this.t('ui.merke')}</strong> ${tx.zusammenfassung}`;
    c.append(achtung, merke, h('p', { class: 'gedaempft' }, tx.quelle));
  }

  /// Name eines Buchstabens; ein Aussprachehinweis in Klammern („My (gesprochen „mü“)“) klein darunter
  gkName(name) {
    const m = /^(.*?) \((.*)\)$/.exec(name);
    return h('div', { class: 'gk-name' }, m ? m[1] : name, m ? h('span', { class: 'gk-aussprache' }, m[2]) : null);
  }

  /// Lernkarte: zufälliger Buchstabe (meist klein), Name auf Tipp
  lernkarte(box, tx) {
    const A = GR.ALPHABET;
    const q = this.karteZustand || (this.karteZustand = { i: Math.floor(Math.random() * A.length), gross: false, offen: false });
    const b = A[q.i];
    const aufdecken = () => { q.offen = true; this.lernkarte(box, tx); };
    const zeichen = h('button', { type: 'button', class: 'gk-lk-zeichen', lang: 'el', 'aria-label': tx.zeigen }, q.gross ? b.gross : b.klein);
    zeichen.addEventListener('click', aufdecken);
    const name = h('div', { class: 'gk-lk-name' + (q.offen ? '' : ' verdeckt') }, q.offen ? (b.name[this.sprache] || b.name.de) : '?');
    const zeigen = h('button', { type: 'button', class: 'knopf klein' }, tx.zeigen);
    zeigen.addEventListener('click', aufdecken);
    if (q.offen) zeigen.disabled = true;
    const weiter = h('button', { type: 'button', class: 'knopf haupt klein' }, tx.weiter + ' ▶');
    weiter.addEventListener('click', () => {
      let i = q.i;
      while (i === q.i) i = Math.floor(Math.random() * A.length);
      Object.assign(q, { i, gross: Math.random() < 0.3, offen: false });
      this.lernkarte(box, tx);
    });
    box.replaceChildren(zeichen, name, h('div', { class: 'aktionen' }, zeigen, weiter));
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
