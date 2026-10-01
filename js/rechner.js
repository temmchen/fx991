// rechner.js – Der Rechner: Zustand, Tastenverarbeitung und Rechenbildschirm (Modi Berechnungen,
// Komplex, Basis-N, Matrizen, Vektoren, Statistik-Rechnen, Berechnungen prüfen).
// Bedienung wie beim fx-991DE X: SHIFT/ALPHA, Ans wird nach einem Ergebnis automatisch vorangestellt,
// ◀/▶ bearbeitet die letzte Rechnung, ▲/▼ blättert im Verlauf, = wiederholt die letzte Rechnung.

import { Eingabe, klon } from './eingabe.js';
import { parse, variablenIn } from './parser.js';
import * as A from './auswertung.js';
import * as F from './format.js';
import * as Z from './zahl.js';
import * as K from './komplex.js';
import * as B from './basisn.js';
import { T, setzeSprache } from './i18n.js';
import { KONSTANTEN, KONSTANTEN_GRUPPEN, UMRECHNUNGEN, UMRECHNUNG_GRUPPEN, PRAEFIXE } from './konstanten.js';
import { eingabeFuer, variableAus, HEX_TASTE } from './tasten.js';
import { Menue, inSeiten, Hauptmenue, Frage, Hinweis, FehlerSchirm, fehlerArt, QRSchirm, Werteingabe } from './bildschirme.js';
import { Statistik, STAT_NAMEN } from './statistik.js';
import { newton } from './gleichungen.js';
import * as Modi from './modi.js';

const { Q, NULL } = Z;

export const MODELL = { de: { dezimal: ',', periode: true }, en: { dezimal: '.', periode: false }, fr: { dezimal: ',', periode: true } };

export function standardEinstellungen(sprache = 'de') {
  return {
    io: 'MM', winkel: 'D', zahl: { art: 'norm', stellen: 1 }, ingenieur: false, bruch: 'dc', komplex: 'rechtw',
    statFreq: false, eqnKomplex: true, tabelle: 'fg', tausender: false, schrift: 'normal',
    sprache, ...MODELL[sprache],
  };
}

const VARIABLEN = ['A', 'B', 'C', 'D', 'E', 'F', 'M', 'x', 'y'];

// MARK: Rechner

export class Rechner {
  constructor(sprache = 'de') {
    this.einst = standardEinstellungen(sprache);
    setzeSprache(sprache);
    this.an = true;
    this.shift = false;
    this.alpha = false;
    this.allesLoeschen();
    this.setzeModus('COMP');
    this.beiAenderung = null; // Rückruf zum Sichern (app.js)
    this.beiTaste = null;     // Rückruf für Lektionen (Taste, Rechner)
  }

  allesLoeschen() {
    this.vars = Object.fromEntries(VARIABLEN.map((v) => [v, NULL]));
    this.ans = NULL;
    this.ansBasis = 0n;
    this.mat = {};
    this.vct = {};
    this.stat = new Statistik('1var');
    this.basis = 'DEC';
    this.tabelle = { f: [], g: [], start: Q(1n), ende: Q(5n), schritt: Q(1n) };
  }

  // MARK: Bildschirmstapel

  get oben() {
    return this.stapel.length ? this.stapel[this.stapel.length - 1] : this.haupt;
  }
  push(s) { this.stapel.push(s); }
  pop() { this.stapel.pop(); }
  /// alle Menüs schließen
  menuesSchliessen() {
    while (this.stapel.length && this.stapel[this.stapel.length - 1].istMenue) this.stapel.pop();
  }
  zurBasis() { this.stapel = []; }

  // MARK: Einstellungen

  linear() { return this.einst.io === 'LL' || this.einst.io === 'LD'; }

  /// Einstellungen für format.js
  formatEinst() {
    return { ...this.einst, winkel: this.einst.winkel };
  }

  setzeSprache(s) {
    this.einst.sprache = s;
    Object.assign(this.einst, MODELL[s]);
    setzeSprache(s);
  }

  ktx() {
    return A.kontext({
      modus: this.modus,
      winkel: this.einst.winkel,
      vars: this.vars,
      ans: this.ans,
      format: this.einst.zahl,
      mat: this.mat,
      vct: this.vct,
      stat: this.modus === 'STAT' ? this.stat : null,
      zuweisen: (n, w) => { this.vars[n] = w; },
    });
  }

  // MARK: Modi

  setzeModus(m) {
    this.modus = m;
    this.stapel = [];
    this.verlauf = [];
    this.haupt = new RechenSchirm(this);
    switch (m) {
      case 'MAT': this.push(Modi.matrixWahl(this, 'definieren')); break;
      case 'VCT': this.push(Modi.vektorWahl(this, 'definieren')); break;
      case 'STAT': this.push(Modi.statTypMenue(this, true)); break;
      case 'DIST': this.haupt = new Modi.DistSchirm(this); break;
      case 'TABLE': this.haupt = new Modi.TabelleSchirm(this); break;
      case 'EQN': this.haupt = new Modi.EqnSchirm(this); break;
      case 'INEQ': this.haupt = new Modi.IneqSchirm(this); break;
      case 'RATIO': this.haupt = new Modi.RatioSchirm(this); break;
      case 'SHEET': this.haupt = new Hinweis([T('app.SHEET'), '', T('sheet.info')]); this.haupt.taste = (k, r) => { if (k === 'menu' || k === 'S:menu') r.globaleTaste(k); }; break;
      default: break;
    }
  }

  // MARK: Tasten

  taste(id) {
    if (this.beiTaste) this.beiTaste(id, this);
    if (!this.an) {
      if (id === 'on') { this.an = true; this.setzeModus(this.modus); }
      return;
    }
    if (id === 'shift') { this.shift = !this.shift; this.alpha = false; return; }
    if (id === 'alpha') { this.alpha = !this.alpha; this.shift = false; return; }
    let k = id;
    if (this.shift) k = 'S:' + id;
    else if (this.alpha) k = 'A:' + id;
    this.shift = false;
    this.alpha = false;
    if (id === 'on') { this.setzeModus(this.modus); return; }
    if (k === 'S:ac') { this.an = false; return; }
    try {
      this.oben.taste(k, this);
    } catch (e) {
      this.zeigeFehler(e, null);
    }
    if (this.beiAenderung) this.beiAenderung(this);
  }

  /// Tasten, die überall gelten (MENU, SETUP)
  globaleTaste(k) {
    if (k === 'menu') { this.zurBasis(); this.push(new Hauptmenue(this)); }
    else if (k === 'S:menu') { this.zurBasis(); this.push(setupMenue(this)); }
  }

  zeigeFehler(e, zurueck) {
    this.push(new FehlerSchirm(fehlerArt(e), zurueck));
  }

  // MARK: Ansicht

  ansicht() {
    if (!this.an) return { an: false };
    const bild = this.oben.ansicht(this);
    const s = this.oben;
    const rs = this.haupt instanceof RechenSchirm ? this.haupt : null;
    return {
      an: true,
      status: {
        shift: this.shift,
        alpha: this.alpha,
        mem: !Z.istNull(K.istKomplex(this.vars.M) ? this.vars.M.re : this.vars.M) || (K.istKomplex(this.vars.M) && !Z.istNull(this.vars.M.im)),
        sto: !!(rs && rs.stoWartet && s === rs),
        rcl: s instanceof RecallSchirm,
        modus: this.modus,
        winkel: this.einst.winkel,
        zahl: this.einst.zahl.art === 'fix' ? 'FIX' : this.einst.zahl.art === 'sci' ? 'SCI' : null,
        math: !this.linear(),
        eng: this.einst.ingenieur,
        komplex: this.modus === 'CMPLX' || this.modus === 'EQN' ? (this.einst.komplex === 'polar' ? '∠' : 'i') : null,
        hoch: !!bild.hoch,
        runter: !!bild.runter,
        disp: !!bild.disp,
        basis: this.modus === 'BASE' ? this.basis : null,
      },
      bild,
      einst: { dezimal: this.einst.dezimal, linear: this.linear(), schrift: this.einst.schrift },
    };
  }

  // MARK: Sichern

  zustand() {
    return serialisiere({
      einst: this.einst, modus: this.modus, vars: this.vars, ans: this.ans, mat: this.mat, vct: this.vct,
      stat: { typ: this.stat.typ, daten: this.stat.daten }, basis: this.basis,
      tabelle: this.tabelle,
    });
  }

  ladeZustand(text) {
    try {
      const z = deserialisiere(text);
      if (z.einst) Object.assign(this.einst, z.einst);
      setzeSprache(this.einst.sprache);
      if (z.vars) Object.assign(this.vars, z.vars);
      if (z.ans) this.ans = z.ans;
      if (z.mat) this.mat = z.mat;
      if (z.vct) this.vct = z.vct;
      if (z.stat) { this.stat = new Statistik(z.stat.typ); this.stat.daten = z.stat.daten || []; }
      if (z.basis) this.basis = z.basis;
      if (z.tabelle) this.tabelle = z.tabelle;
      this.setzeModus(z.modus && z.modus !== 'SHEET' ? z.modus : 'COMP');
    } catch (e) {
      // kaputter Speicherstand: Voreinstellungen behalten
    }
  }
}

// MARK: Sichern von Werten (BigInt → Text)

export function serialisiere(x) {
  return JSON.stringify(x, (k, v) => (typeof v === 'bigint' ? { $b: v.toString() } : v));
}
export function deserialisiere(text) {
  return JSON.parse(text, (k, v) => (v && typeof v === 'object' && typeof v.$b === 'string' ? BigInt(v.$b) : v));
}

// MARK: Rechenbildschirm

export class RechenSchirm {
  constructor(r) {
    this.r = r;
    this.eingabe = new Eingabe();
    this.ergebnis = null;
    this.zustand = 'eingabe'; // 'eingabe' | 'ergebnis'
    this.letzteZeile = null;
    this.verlaufPos = null;
    this.mehrfach = null;
    this.undo = null;
    this.stoWartet = false;
    this.anhang = null;
    this.calcDaten = null;
  }

  // MARK: Tasten

  taste(k, r) {
    if (this.stoWartet) {
      this.stoWartet = false;
      const v = variableAus(k);
      if (v) this.speichere(v, r);
      return;
    }
    switch (k) {
      case 'menu': case 'S:menu': r.globaleTaste(k); return;
      case 'optn': r.push(optnMenue(r, this)); return;
      case 'S:optn': r.push(new QRSchirm()); return;
      case 'S:7': if (r.modus !== 'BASE') r.push(constMenue(r, this)); return;
      case 'S:8': if (r.modus !== 'BASE') r.push(convMenue(r, this)); return;
      case 'S:9': r.push(resetMenue(r)); return;
      case 'ac': this.ac(); return;
      case 'eq': this.gleich(r, false); return;
      case 'S:eq': this.gleich(r, true); return;
      case 'del': this.del(); return;
      case 'S:del': if (this.zustand === 'eingabe' && !r.linear()) this.eingabe.umschliessen = true; return;
      case 'A:del': this.rueckgaengig(); return;
      case 'left': case 'right': this.pfeilSeitlich(k); return;
      case 'up': case 'down': this.pfeilVertikal(k, r); return;
      case 'sto': if (r.modus !== 'VERIFY') this.stoWartet = true; return;
      case 'S:sto': if (r.modus !== 'BASE') r.push(new RecallSchirm(this)); return;
      case 'mplus': this.mPlus(r, false); return;
      case 'S:mplus': this.mPlus(r, true); return;
      case 'calc': this.calc(r); return;
      case 'S:calc': this.solve(r); return;
      case 'sd': this.sd(r); return;
      case 'S:sd': this.bruchTyp(r); return;
      case 'S:dms': this.fakt(r); return;
      default: break;
    }
    if (r.modus !== 'CMPLX' && (k === 'eng' || k === 'S:eng')) { this.eng(r, k === 'eng'); return; }
    if (k === 'dms' && this.zustand === 'ergebnis') { this.gmsUmschalten(r); return; }
    if (r.modus === 'BASE') { this.basisTaste(k, r); return; }
    const a = eingabeFuer(k, r.modus, r.linear());
    if (a) this.einfuegen(a);
  }

  /// Basis-N: Zahlsystemtasten, Hexziffern, gesperrte Funktionen
  basisTaste(k, r) {
    const wechsel = { sq: 'DEC', pow: 'HEX', log: 'BIN', ln: 'OCT' }[k];
    if (wechsel) {
      r.basis = wechsel;
      if (this.zustand === 'ergebnis' && this.ergebnis && this.ergebnis.art === 'basen') {
        this.ergebnis = { ...this.ergebnis, zeilen: B.formatBasis(this.ergebnis.v, wechsel) };
      }
      return;
    }
    if (HEX_TASTE[k]) {
      if (r.basis === 'HEX') this.einfuegen({ el: { k: 'z', v: HEX_TASTE[k] } });
      return;
    }
    if (/^\d$/.test(k)) {
      const max = { DEC: 9, HEX: 9, OCT: 7, BIN: 1 }[r.basis];
      if (Number(k) <= max) this.einfuegen({ el: { k: 'z', v: k } });
      return;
    }
    const erlaubt = ['add', 'sub', 'mul', 'div', 'lpar', 'rpar', 'ans', 'A:int'];
    if (k.startsWith('A:') && variableAus(k)) { this.einfuegen({ el: { k: 'var', v: variableAus(k) } }); return; }
    if (k === 'neg') return;
    if (erlaubt.includes(k)) {
      const a = eingabeFuer(k, r.modus, true);
      if (a) this.einfuegen(a);
    }
  }

  // MARK: Eingabe

  neueEingabe() {
    this.eingabe = new Eingabe();
    this.zustand = 'eingabe';
    this.ergebnis = null;
    this.verlaufPos = null;
    this.mehrfach = null;
    this.anhang = null;
    this.calcDaten = null;
  }

  merkeUndo() {
    this.undo = { vorher: this.eingabe.zustand(), nachher: null };
  }

  einfuegen(a) {
    const fortsetzung = !!(a.op || a.post || a.Tpost);
    if (this.zustand === 'ergebnis') {
      const mitAns = fortsetzung && this.ergebnis && this.ergebnis.ansFaehig;
      this.neueEingabe();
      if (mitAns) this.eingabe.einfuegen({ k: 'ans' });
    }
    this.merkeUndo();
    const e = this.eingabe;
    if (a.el) e.einfuegen(a.el);
    else if (a.op) e.einfuegen({ k: 'op', v: a.op });
    else if (a.post) e.einfuegen({ k: 'post', v: a.post });
    else if (a.T) e.schabloneEinfuegen(a.T);
    else if (a.Tpost) e.schabloneEinfuegen(a.Tpost);
    else if (a.fn) e.einfuegen({ k: 'fn', v: a.fn });
    this.undo.nachher = e.zustand();
  }

  /// Elemente aus Menüs (OPTN, CONST, CONV) einfügen
  einfuegenElement(el, fortsetzung = false) {
    if (el.k === 'post') this.einfuegen({ post: el.v });
    else if (el.k === 'op' && fortsetzung) this.einfuegen({ op: el.v });
    else this.einfuegen({ el });
  }

  rueckgaengig() {
    if (!this.undo || this.zustand !== 'eingabe') return;
    const { vorher, nachher } = this.undo;
    const jetzt = this.eingabe.zustand();
    if (nachher && JSON.stringify(jetzt) === JSON.stringify(nachher)) {
      this.eingabe.setzeZustand(vorher);
    } else {
      this.eingabe.setzeZustand(nachher || vorher);
    }
    this.undo = { vorher: nachher || vorher, nachher: vorher };
  }

  ac() {
    this.neueEingabe();
    this.stoWartet = false;
  }

  del() {
    if (this.zustand === 'ergebnis') { this.bearbeiten(true); return; }
    this.merkeUndo();
    this.eingabe.loeschen();
    this.undo.nachher = this.eingabe.zustand();
  }

  /// letzte (bzw. im Verlauf gezeigte) Rechnung wieder bearbeiten
  bearbeiten(ansEnde) {
    let zeile = this.letzteZeile;
    if (this.verlaufPos !== null) zeile = this.r.verlauf[this.verlaufPos].zeile;
    if (!zeile) { this.neueEingabe(); return; }
    this.eingabe = new Eingabe(klon(zeile));
    if (ansEnde) this.eingabe.cursorAnsEnde(); else this.eingabe.cursorAnDenAnfang();
    this.zustand = 'eingabe';
    this.ergebnis = null;
    this.verlaufPos = null;
    this.mehrfach = null;
    this.anhang = null;
  }

  pfeilSeitlich(k) {
    if (this.zustand === 'ergebnis') { this.bearbeiten(k === 'left'); return; }
    if (k === 'left') this.eingabe.links(); else this.eingabe.rechts();
  }

  pfeilVertikal(k, r) {
    const hoch = k === 'up';
    if (this.zustand === 'eingabe' && !this.eingabe.istLeer()) {
      this.eingabe.vertikal(hoch ? -1 : 1);
      return;
    }
    // Verlauf
    const v = r.verlauf;
    if (v.length === 0) return;
    let pos = this.verlaufPos;
    if (pos === null) pos = this.zustand === 'ergebnis' ? v.length - 1 : v.length;
    pos += hoch ? -1 : 1;
    if (pos < 0 || pos >= v.length) return;
    this.verlaufPos = pos;
    const eintrag = v[pos];
    this.zustand = 'ergebnis';
    this.ergebnis = eintrag.ergebnis;
    this.letzteZeile = eintrag.zeile;
    this.anhang = eintrag.anhang || null;
    this.mehrfach = null;
  }

  // MARK: Rechnen

  gleich(r, naeherung) {
    if (this.zustand === 'ergebnis') {
      if (this.mehrfach) { this.naechsteAnweisung(r); return; }
      if (this.calcDaten) { this.calc(r); return; }
      if (!this.letzteZeile) return;
      // = wiederholt die letzte Rechnung (mit neuem Ans)
      this.eingabe = new Eingabe(klon(this.letzteZeile));
      this.zustand = 'eingabe';
    }
    if (this.eingabe.istLeer()) return;
    this.berechne(r, naeherung);
  }

  berechne(r, naeherung) {
    const zeile = klon(this.eingabe.wurzel);
    let anweisungen;
    try {
      anweisungen = parse(zeile);
      if (r.modus !== 'VERIFY' && anweisungen.some((a) => a.a === 'rel')) throw Z.fehler('syntax');
    } catch (e) {
      this.letzteZeile = zeile;
      r.zeigeFehler(e, (rr, taste) => this.nachFehler(taste));
      return;
    }
    this.letzteZeile = zeile;
    this.verlaufPos = null;
    this.anhang = null;
    this.mehrfach = anweisungen.length > 1 ? { liste: anweisungen, i: 0, naeherung, zeile } : null;
    this.fuehreAus(r, anweisungen[0], naeherung);
  }

  naechsteAnweisung(r) {
    const m = this.mehrfach;
    m.i++;
    if (m.i >= m.liste.length) { this.mehrfach = null; return; }
    this.fuehreAus(r, m.liste[m.i], m.naeherung);
  }

  fuehreAus(r, knoten, naeherung) {
    try {
      const w = werteAus(r, knoten);
      setzeAns(r, w);
      this.ergebnis = ergebnisAnzeige(r, w, knoten, naeherung);
      this.zustand = 'ergebnis';
      const fertig = !this.mehrfach || this.mehrfach.i === this.mehrfach.liste.length - 1;
      if (this.mehrfach) this.ergebnis.disp = !fertig;
      if (fertig) {
        r.verlauf.push({ zeile: this.letzteZeile, ergebnis: this.ergebnis, anhang: this.anhang });
        if (r.verlauf.length > 30) r.verlauf.shift();
      }
    } catch (e) {
      this.mehrfach = null;
      r.zeigeFehler(e, (rr, taste) => this.nachFehler(taste));
    }
  }

  nachFehler(taste) {
    if (taste === 'ac') { this.neueEingabe(); return; }
    // ◀/▶: zur Eingabe zurück (Cursor am Ende)
    const zeile = this.letzteZeile || this.eingabe.wurzel;
    this.eingabe = new Eingabe(klon(zeile));
    this.eingabe.cursorAnsEnde();
    this.zustand = 'eingabe';
    this.ergebnis = null;
  }

  /// Wert aus Eingabe (falls vorhanden) oder dem angezeigten Ergebnis
  aktuellerWert(r, mitAnzeige = true) {
    if (this.zustand === 'eingabe' && !this.eingabe.istLeer()) {
      const zeile = klon(this.eingabe.wurzel);
      const anw = parse(zeile);
      if (anw.length !== 1 || anw[0].a === 'rel') throw Z.fehler('syntax');
      const w = werteAus(r, anw[0]);
      if (mitAnzeige) this.letzteZeile = zeile;
      return { w, knoten: anw[0] };
    }
    if (this.zustand === 'ergebnis' && this.ergebnis) return { w: this.ergebnis.wert, knoten: null };
    return null;
  }

  // MARK: STO, M+, RECALL

  speichere(v, r) {
    try {
      const a = this.aktuellerWert(r);
      const w = a ? a.w : r.ans;
      if (!A.istReal(w) && w.t !== 'c' && w.t !== 'basen') throw Z.fehler('syntax');
      if (w.t === 'basen') {
        r.vars[v] = Q(w.v);
      } else r.vars[v] = w;
      setzeAns(r, w);
      if (!a || !a.knoten) this.letzteZeile = [{ k: 'ans' }];
      this.anhang = '→' + v;
      this.ergebnis = ergebnisAnzeige(r, w, a ? a.knoten : null, false);
      this.ergebnis.ansFaehig = true;
      this.zustand = 'ergebnis';
      this.mehrfach = null;
    } catch (e) {
      r.zeigeFehler(e, (rr, taste) => this.nachFehler(taste));
    }
  }

  mPlus(r, minus) {
    if (r.modus === 'BASE' || r.modus === 'MAT' || r.modus === 'VCT' || r.modus === 'VERIFY') return;
    try {
      const a = this.aktuellerWert(r);
      if (!a) return;
      const w = a.w;
      if (!A.istReal(w) && w.t !== 'c') throw Z.fehler('syntax');
      r.vars.M = minus ? A.plus(r.vars.M, w, true) : A.plus(r.vars.M, w);
      setzeAns(r, w);
      if (!a.knoten) this.letzteZeile = [{ k: 'ans' }];
      this.anhang = minus ? 'M−' : 'M+';
      this.ergebnis = ergebnisAnzeige(r, w, a.knoten, false);
      this.zustand = 'ergebnis';
    } catch (e) {
      r.zeigeFehler(e, (rr, taste) => this.nachFehler(taste));
    }
  }

  // MARK: Ergebnisdarstellung umschalten

  sd(r) {
    if (this.zustand === 'eingabe') {
      if (this.eingabe.istLeer()) return;
      this.berechne(r, false);
      if (this.zustand !== 'ergebnis') return;
    }
    const e = this.ergebnis;
    if (!e || !e.formen) return;
    if (e.spezial) { e.spezial = null; return; }
    if (e.formen.length > 1) e.index = (e.index + 1) % e.formen.length;
  }

  bruchTyp(r) {
    if (this.zustand !== 'ergebnis' || !this.ergebnis || !A.istReal(this.ergebnis.wert)) return;
    const e = this.ergebnis;
    const gemischtJetzt = e.spezial && e.spezial.art === 'bruch' ? e.spezial.gemischt : r.einst.bruch === 'abc';
    const el = F.bruchUmschalten(e.wert, r.formatEinst(), gemischtJetzt);
    if (el) e.spezial = { art: 'bruch', el, gemischt: !gemischtJetzt };
  }

  eng(r, rechts) {
    if (r.modus === 'BASE') return;
    if (this.zustand === 'eingabe') {
      if (this.eingabe.istLeer()) return;
      this.berechne(r, false);
      if (this.zustand !== 'ergebnis') return;
    }
    const e = this.ergebnis;
    if (!e || !A.istReal(e.wert)) return;
    const v = Z.zahl(e.wert);
    const basis = F.ingenieurBasis(v);
    let exp;
    if (e.spezial && e.spezial.art === 'eng') exp = e.spezial.exp + (rechts ? -3 : 3);
    else exp = basis;
    const versch = (basis - exp) / 3;
    const el = F.ingenieurElemente(v, versch, { ...r.formatEinst(), ingenieur: r.einst.ingenieur });
    if (el) e.spezial = { art: 'eng', exp, el };
  }

  gmsUmschalten(r) {
    const e = this.ergebnis;
    if (!e || !A.istReal(e.wert)) return;
    if (e.spezial && e.spezial.art === 'gms') { e.spezial = null; return; }
    const el = F.gms(Z.zahl(e.wert), r.formatEinst());
    if (el) e.spezial = { art: 'gms', el };
  }

  fakt(r) {
    if (r.modus !== 'COMP') return;
    if (this.zustand === 'eingabe') {
      if (this.eingabe.istLeer()) return;
      this.berechne(r, false);
      if (this.zustand !== 'ergebnis') return;
    }
    const e = this.ergebnis;
    if (!e) return;
    if (e.spezial && e.spezial.art === 'fakt') { e.spezial = null; return; }
    const el = F.primfaktoren(e.wert);
    if (!el) { r.zeigeFehler(Z.fehler('math'), () => {}); return; }
    e.spezial = { art: 'fakt', el };
  }

  // MARK: CALC und SOLVE

  calc(r) {
    if (!['COMP', 'CMPLX'].includes(r.modus)) return;
    const zeile = this.zustand === 'eingabe' && !this.eingabe.istLeer() ? klon(this.eingabe.wurzel) : (this.calcDaten ? this.calcDaten.zeile : this.letzteZeile);
    if (!zeile || zeile.length === 0) return;
    let anw;
    try { anw = parse(zeile); } catch (e) { r.zeigeFehler(e, (rr, t) => this.nachFehler(t)); return; }
    let vars = variablenIn(zeile);
    // Zuweisung „y = …“: y wird berechnet, nicht abgefragt
    const ziel = anw.length === 1 && anw[0].a === 'rel' && anw[0].op === '=' && anw[0].l.a === 'var' ? anw[0].l.n : null;
    if (ziel) vars = vars.filter((v, i) => !(v === ziel && i === 0));
    this.letzteZeile = zeile;
    this.calcDaten = { zeile, vars, anw, ziel };
    if (vars.length === 0) { this.calcErgebnis(r); return; }
    r.push(new CalcSchirm(this, vars));
  }

  calcErgebnis(r) {
    const d = this.calcDaten;
    try {
      let w;
      for (const a of d.anw) {
        if (a.a === 'rel') {
          if (a.op !== '=' || a.l.a !== 'var') throw Z.fehler('syntax');
          w = A.werte(a.r, r.ktx());
          r.vars[a.l.n] = w;
        } else w = werteAus(r, a);
      }
      setzeAns(r, w);
      this.eingabe = new Eingabe(klon(d.zeile));
      this.ergebnis = ergebnisAnzeige(r, w, d.anw[d.anw.length - 1], false);
      this.zustand = 'ergebnis';
      this.anhang = null;
    } catch (e) {
      r.zeigeFehler(e, (rr, taste) => this.nachFehler(taste));
    }
  }

  solve(r) {
    if (r.modus !== 'COMP') return;
    const zeile = this.zustand === 'eingabe' && !this.eingabe.istLeer() ? klon(this.eingabe.wurzel) : this.letzteZeile;
    if (!zeile || zeile.length === 0) return;
    let anw;
    try {
      anw = parse(zeile);
      if (anw.length !== 1) throw Z.fehler('syntax');
    } catch (e) { r.zeigeFehler(e, (rr, t) => this.nachFehler(t)); return; }
    const vars = variablenIn(zeile);
    if (vars.length === 0) { r.zeigeFehler(Z.fehler('variable'), (rr, t) => this.nachFehler(t)); return; }
    this.letzteZeile = zeile;
    this.eingabe = new Eingabe(klon(zeile));
    this.zustand = 'eingabe';
    this.ergebnis = null;
    r.push(new SolveSchirm(this, anw[0], vars));
  }

  // MARK: Ansicht

  ansicht(r) {
    const zeigeEingabe = this.zustand === 'eingabe';
    let zeile = zeigeEingabe ? this.eingabe.wurzel : (this.letzteZeile || []);
    if (this.zustand === 'ergebnis' && this.mehrfach) zeile = this.mehrfach.zeile;
    const v = {
      art: 'rechnen',
      eingabe: {
        zeile,
        pfad: zeigeEingabe ? this.eingabe.pfad : null,
        pos: zeigeEingabe ? this.eingabe.pos : null,
        cursor: zeigeEingabe,
        umschliessen: zeigeEingabe && this.eingabe.umschliessen,
        anhang: this.anhang,
      },
      ergebnis: null,
      hoch: false,
      runter: false,
    };
    if (this.zustand === 'ergebnis' && this.ergebnis) {
      v.ergebnis = ergebnisElemente(this.ergebnis);
      v.disp = !!this.ergebnis.disp;
      const n = r.verlauf.length;
      const pos = this.verlaufPos === null ? n - 1 : this.verlaufPos;
      v.hoch = pos > 0;
      v.runter = this.verlaufPos !== null && pos < n - 1;
    } else if (zeigeEingabe && this.eingabe.istLeer() && r.verlauf.length) {
      v.hoch = true;
    }
    return v;
  }
}

/// Anzeige-Elemente eines Ergebnisses (je nach gewählter Form)
export function ergebnisElemente(e) {
  if (e.art === 'basen') return { art: 'basen', zeilen: e.zeilen };
  if (e.art === 'matrix') return { art: 'matrix', wert: e.wert, el: e.el };
  if (e.art === 'text') return { art: 'text', text: e.text };
  if (e.spezial) return { art: 'el', el: e.spezial.el };
  return { art: 'el', el: e.formen[e.index].el };
}

// MARK: Auswerten je nach Modus

export function werteAus(r, knoten) {
  if (r.modus === 'BASE') {
    const ktx = { basis: r.basis, ansBasis: r.ansBasis, varsBasis: Object.fromEntries(Object.entries(r.vars).map(([n, w]) => [n, A.istReal(w) && Z.istGanz(w) ? w.n : 0n])) };
    return { t: 'basen', v: B.werteBasis(knoten, ktx) };
  }
  if (r.modus === 'VERIFY' && knoten.a === 'rel') {
    const ktx = r.ktx();
    const l = A.werte(knoten.l, ktx), rr = A.werte(knoten.r, ktx);
    return { t: 'bool', v: vergleiche(l, rr, knoten.op) };
  }
  return A.werte(knoten, r.ktx());
}

function vergleiche(a, b, op) {
  if (!A.istReal(a) || !A.istReal(b)) {
    if (op === '=' || op === '≠') {
      const g = K.gleich(K.alsKomplex(a), K.alsKomplex(b));
      return op === '=' ? g : !g;
    }
    throw Z.fehler('math');
  }
  const gleich = Z.gleich(a, b);
  const d = Z.zahl(Z.sub(a, b));
  switch (op) {
    case '=': return gleich;
    case '≠': return !gleich;
    case '<': return !gleich && d < 0;
    case '>': return !gleich && d > 0;
    case '≤': return gleich || d < 0;
    case '≥': return gleich || d > 0;
    default: throw Z.fehler('syntax');
  }
}

export function setzeAns(r, w) {
  if (!w) return;
  if (w.t === 'basen') { r.ansBasis = w.v; r.ans = Q(w.v); return; }
  if (w.t === 'bool') return;
  if (w.t === 'm') { r.mat.Ans = w; return; }
  if (w.t === 'v') { r.vct.Ans = w; return; }
  if (w.t === 'multi') { r.ans = w.werte[0]; return; }
  r.ans = w;
}

/// Ergebnisanzeige aufbauen: { wert, formen, index, spezial, art, ansFaehig }
export function ergebnisAnzeige(r, w, knoten, naeherung) {
  const einst = r.formatEinst();
  if (w.t === 'basen') return { art: 'basen', wert: Q(w.v), v: w.v, zeilen: B.formatBasis(w.v, r.basis), ansFaehig: true };
  if (w.t === 'bool') return { art: 'text', wert: null, text: T(w.v ? 'verify.wahr' : 'verify.falsch'), ansFaehig: false };
  if (w.t === 'm' || w.t === 'v') {
    return { art: 'matrix', wert: w, el: (w.t === 'm' ? w.e : [w.e]).map((zeile) => zeile.map((x) => kurzForm(x, einst))), ansFaehig: true };
  }
  if (w.t === 'multi') {
    const el = [];
    w.namen.forEach((n, i) => {
      if (i > 0) el.push({ k: 'txt', v: r.einst.dezimal === ',' ? '; ' : ', ' });
      el.push({ k: 'txt', v: n + '=' });
      const f = F.formenReal(w.werte[i], einst);
      el.push(...(naeherung ? f[f.length - 1] : f[0]).el);
    });
    return { art: 'el', wert: w.werte[0], formen: [{ art: 'exakt', el }], index: 0, spezial: null, ansFaehig: true };
  }
  let formen;
  if (w.t === 'c') formen = F.formenKomplex(w, einst, knoten ? A.komplexFormIn(knoten) : null);
  else if (r.modus === 'CMPLX' && knoten && A.komplexFormIn(knoten)) formen = F.formenKomplex(K.alsKomplex(w), einst, A.komplexFormIn(knoten));
  else formen = F.formenReal(w, einst);
  let index = 0;
  if (naeherung) {
    const d = formen.findIndex((f) => f.art === 'dezimal');
    if (d >= 0) index = d;
  }
  const erg = { art: 'el', wert: w, formen, index, spezial: null, ansFaehig: true };
  if (knoten && A.istReal(w) && A.istGMSAusdruck(knoten)) {
    const el = F.gms(Z.zahl(w), einst);
    if (el) erg.spezial = { art: 'gms', el };
  }
  return erg;
}

/// kurze Darstellung für Matrix-/Vektorelemente
export function kurzForm(x, einst) {
  if (x.t === 'q') {
    const b = F.bruch(x.n, x.d, false, einst);
    if (b) return b;
  }
  if (x.t === 's') {
    const s = F.wurzelForm(x);
    if (s) return s;
  }
  return [{ k: 'txt', v: F.kurz(Z.zahl(x), 7, einst) }];
}

// MARK: RECALL

class RecallSchirm {
  constructor(rs) { this.rs = rs; }
  taste(k, r) {
    if (k === 'ac' || k === 'S:sto') { r.pop(); return; }
    const v = variableAus(k);
    if (v) {
      r.pop();
      this.rs.einfuegen({ el: { k: 'var', v } });
    }
  }
  ansicht(r) {
    const einst = { ...r.formatEinst(), zahl: { art: 'norm', stellen: 1 }, io: 'MD' };
    const zeilen = VARIABLEN.map((n) => {
      const w = r.vars[n];
      const el = w.t === 'c' ? F.komplex(w, einst, 'rechtw') : F.dezimal(Z.zahl(w), einst);
      return { links: n + '=', el };
    });
    return { art: 'variablen', titel: T('recall.titel'), zeilen };
  }
}

// MARK: CALC-Abfrage

class CalcSchirm {
  constructor(rs, vars) {
    this.rs = rs;
    this.vars = vars;
    this.i = 0;
    this.feld = new Werteingabe(rs.r);
  }
  taste(k, r) {
    const erg = this.feld.taste(k);
    if (erg === 'fertig' || (k === 'eq' && this.feld.leer)) {
      if (erg === 'fertig') {
        try {
          r.vars[this.vars[this.i]] = this.feld.wert();
        } catch (e) {
          r.zeigeFehler(e, () => {});
          return;
        }
        this.feld.leeren();
      }
      if (this.i < this.vars.length - 1) this.i++;
      else { r.pop(); this.rs.calcErgebnis(r); }
      return;
    }
    if (erg) return;
    if (k === 'down') { if (this.i < this.vars.length - 1) this.i++; this.feld.leeren(); return; }
    if (k === 'up') { if (this.i > 0) this.i--; this.feld.leeren(); return; }
    if (k === 'ac') {
      if (!this.feld.leer) { this.feld.leeren(); return; }
      r.pop();
      this.rs.calcDaten = null;
      this.rs.bearbeiten(true);
      return;
    }
    if (k === 'calc') { r.pop(); this.rs.calcErgebnis(r); return; }
    if (k === 'menu' || k === 'S:menu') r.globaleTaste(k);
  }
  ansicht(r) {
    const einst = r.formatEinst();
    return {
      art: 'abfrage',
      zeilen: this.vars.map((n, i) => {
        const w = r.vars[n];
        const el = w.t === 'c' ? F.komplex(w, einst, 'rechtw') : F.formenReal(w, einst)[0].el;
        return { links: n + '=', el, markiert: i === this.i };
      }),
      feld: this.feld.leer ? null : this.feld.ansicht(),
      auswahl: this.i,
    };
  }
}

// MARK: SOLVE

class SolveSchirm {
  constructor(rs, knoten, vars) {
    this.rs = rs;
    this.knoten = knoten;
    this.vars = vars;
    this.i = Math.max(0, vars.indexOf('x'));
    this.feld = new Werteingabe(rs.r);
    this.ergebnis = null; // { name, x, lr }
  }

  loese(r) {
    const name = this.vars[this.i];
    const ktx = r.ktx();
    const f = (t) => {
      ktx.lokal = { [name]: Z.D(t) };
      const { links, rechts } = A.seiten(this.knoten, ktx);
      const d = A.plus(links, rechts, true);
      if (!A.istReal(d)) throw Z.fehler('math');
      return Z.zahl(d);
    };
    try {
      const start = Z.zahl(K.istKomplex(r.vars[name]) ? r.vars[name].re : r.vars[name]);
      const { x, lr } = newton(f, start);
      const w = Z.D(x);
      r.vars[name] = Z.erkenneBruch(x) ? Q(Z.erkenneBruch(x).n, Z.erkenneBruch(x).d) : w;
      this.ergebnis = { name, x: r.vars[name], lr };
    } catch (e) {
      r.zeigeFehler(Z.fehler(e instanceof Z.RechenFehler && e.art !== 'math' ? e.art : 'solve'), () => {});
    }
  }

  taste(k, r) {
    if (this.ergebnis) {
      if (k === 'eq' || k === 'S:calc') { this.ergebnis = null; return; }
      if (k === 'ac' || k === 'left' || k === 'right') { r.pop(); this.rs.bearbeiten(true); return; }
      if (k === 'menu' || k === 'S:menu') r.globaleTaste(k);
      return;
    }
    const erg = this.feld.taste(k);
    if (erg === 'fertig') {
      try {
        r.vars[this.vars[this.i]] = this.feld.wert();
      } catch (e) {
        r.zeigeFehler(e, () => {});
        return;
      }
      this.feld.leeren();
      if (this.i < this.vars.length - 1) this.i++;
      return;
    }
    if (erg) return;
    if (k === 'eq') { this.loese(r); return; }
    if (k === 'down') { if (this.i < this.vars.length - 1) this.i++; return; }
    if (k === 'up') { if (this.i > 0) this.i--; return; }
    if (k === 'ac') {
      if (!this.feld.leer) { this.feld.leeren(); return; }
      r.pop();
      this.rs.bearbeiten(true);
      return;
    }
    if (k === 'menu' || k === 'S:menu') r.globaleTaste(k);
  }

  ansicht(r) {
    const einst = r.formatEinst();
    const dez = { ...einst, io: 'MD' };
    if (this.ergebnis) {
      return {
        art: 'solve',
        gleichung: this.rs.letzteZeile,
        zeilen: [
          { links: this.ergebnis.name + '=', el: F.formenReal(this.ergebnis.x, dez)[0].el, markiert: true },
          { links: T('solve.lr'), el: F.dezimal(this.ergebnis.lr, dez) },
        ],
      };
    }
    return {
      art: 'abfrage',
      titel: T('solve.loesen') + ' ' + this.vars[this.i],
      gleichung: this.rs.letzteZeile,
      zeilen: this.vars.map((n, i) => {
        const w = r.vars[n];
        const el = w.t === 'c' ? F.komplex(w, einst, 'rechtw') : F.formenReal(w, dez)[0].el;
        return { links: n + '=', el, markiert: i === this.i };
      }),
      feld: this.feld.leer ? null : this.feld.ansicht(),
      auswahl: this.i,
    };
  }
}

// MARK: Menüs

/// Element einfügen und Menüs schließen
function einfuegenAus(r, rs, el, fortsetzung = false) {
  r.menuesSchliessen();
  rs.einfuegenElement(el, fortsetzung);
}

export function optnMenue(r, rs) {
  const fn = (v, text) => ({ text: text || v, aktion: () => einfuegenAus(r, rs, { k: 'fn', v }) });
  const post = (v, text) => ({ text, aktion: () => einfuegenAus(r, rs, { k: 'post', v }) });
  const op = (v, text) => ({ text: text || v, aktion: () => einfuegenAus(r, rs, { k: 'op', v }, true) });
  const unter = (titel, seiten, spalten = 1) => ({
    text: titel,
    aktion: () => r.push(new Menue({ titel, seiten, spalten, zurueck: true })),
  });
  const hyp = unter(T('optn.hyp'), [[fn('sinh'), fn('cosh'), fn('tanh'), fn('asinh', 'sinh⁻¹'), fn('acosh', 'cosh⁻¹'), fn('atanh', 'tanh⁻¹')]], 2);
  const winkel = unter(T('optn.winkel'), [[post('°', '°'), post('r', 'ʳ'), post('g', 'ᵍ')]], 1);
  const praefix = unter(T('optn.ingenieur'), inSeiten(PRAEFIXE.map(([s]) => post('eng:' + s, s)), 6), 2);
  switch (r.modus) {
    case 'CMPLX':
      return new Menue({ seiten: [
        [fn('arg', T('optn.arg')), fn('Conjg', T('optn.konj')), fn('ReP', T('optn.re')), fn('ImP', T('optn.im'))],
        [post('▸polar', T('optn.polar')), post('▸rechtw', T('optn.rechtw')), winkel],
      ] });
    case 'BASE':
      return new Menue({ seiten: [
        [op('and'), op('or'), op('xor'), op('xnor')],
        [fn('Not'), fn('Neg')],
        [{ text: T('optn.dez'), aktion: () => einfuegenAus(r, rs, { k: 'pre', v: 'd' }) },
          { text: T('optn.hex'), aktion: () => einfuegenAus(r, rs, { k: 'pre', v: 'h' }) },
          { text: T('optn.bin'), aktion: () => einfuegenAus(r, rs, { k: 'pre', v: 'b' }) },
          { text: T('optn.okt'), aktion: () => einfuegenAus(r, rs, { k: 'pre', v: 'o' }) }],
      ] });
    case 'MAT': return Modi.matrixOptn(r, rs, einfuegenAus);
    case 'VCT': return Modi.vektorOptn(r, rs, einfuegenAus);
    case 'STAT': return Modi.statOptn(r, rs, einfuegenAus);
    case 'VERIFY':
      return new Menue({ seiten: [['=', '≠', '>', '<', '≥', '≤'].map((v) => ({ text: v, aktion: () => einfuegenAus(r, rs, { k: 'op', v }) }))], spalten: 2 });
    default:
      return new Menue({ seiten: [[hyp, winkel, praefix]] });
  }
}

export function setupMenue(r) {
  const e = r.einst;
  const setze = (fn) => () => { fn(); r.zurBasis(); };
  const wahl = (titel, optionen, wert, setzen, spalten = 1) => ({
    text: titel,
    aktion: () => r.push(new Menue({
      titel,
      zurueck: true,
      spalten,
      seiten: inSeiten(optionen.map(([v, text]) => ({ text, markiert: v === wert(), aktion: setze(() => setzen(v)) })), 4),
    })),
  });
  const ziffernFrage = (frage, min, max, setzen) => r.push(new ZiffernFrage(frage, min, max, (n) => { setzen(n); r.zurBasis(); }));
  const zahlformat = {
    text: T('setup.zahl'),
    aktion: () => r.push(new Menue({
      titel: T('setup.zahl'), zurueck: true, spalten: 1,
      seiten: [[
        { text: 'Fix', markiert: e.zahl.art === 'fix', aktion: () => ziffernFrage(T('fix.frage'), 0, 9, (n) => { e.zahl = { art: 'fix', stellen: n }; }) },
        { text: 'Sci', markiert: e.zahl.art === 'sci', aktion: () => ziffernFrage(T('sci.frage'), 0, 9, (n) => { e.zahl = { art: 'sci', stellen: n }; }) },
        { text: 'Norm', markiert: e.zahl.art === 'norm', aktion: () => ziffernFrage(T('norm.frage'), 1, 2, (n) => { e.zahl = { art: 'norm', stellen: n }; }) },
      ]],
    })),
  };
  const anAus = (titel, get, set) => wahl(titel, [[true, T('ein')], [false, T('aus')]], get, set);
  const ioWechsel = (v) => { if (e.io !== v) { e.io = v; r.verlauf = []; if (r.haupt instanceof RechenSchirm) r.haupt.ac(); } };
  const seiten = [
    [
      wahl(T('setup.io'), ['MM', 'MD', 'LL', 'LD'].map((v) => [v, T('io.' + v)]), () => e.io, ioWechsel),
      wahl(T('setup.winkel'), ['D', 'R', 'G'].map((v) => [v, T('winkel.' + v)]), () => e.winkel, (v) => { e.winkel = v; }),
      zahlformat,
      anAus(T('setup.ingenieur'), () => e.ingenieur, (v) => { e.ingenieur = v; }),
    ],
    [
      wahl(T('setup.bruch'), [['abc', 'ab/c'], ['dc', 'd/c']], () => e.bruch, (v) => { e.bruch = v; }),
      wahl(T('setup.komplex'), [['rechtw', 'a+bi'], ['polar', 'r∠θ']], () => e.komplex, (v) => { e.komplex = v; }),
      anAus(T('setup.statistik'), () => e.statFreq, (v) => { if (e.statFreq !== v) { e.statFreq = v; r.stat.daten.forEach((z) => { z.f = null; }); r.stat.geaendert(); } }),
      { text: T('setup.sheet'), aktion: () => r.push(new Hinweis([T('setup.sheet'), '', T('sheet.info')])) },
    ],
    [
      anAus(T('setup.eqn'), () => e.eqnKomplex, (v) => { e.eqnKomplex = v; }),
      wahl(T('setup.tabelle'), [['f', 'f(x)'], ['fg', 'f(x),g(x)']], () => e.tabelle, (v) => { e.tabelle = v; }),
      wahl(T('setup.dezimal'), [['.', T('dezimal.punkt')], [',', T('dezimal.komma')]], () => e.dezimal, (v) => { e.dezimal = v; }),
      anAus(T('setup.tausender'), () => e.tausender, (v) => { e.tausender = v; }),
    ],
    [
      wahl(T('setup.schrift'), [['normal', T('schrift.normal')], ['klein', T('schrift.klein')]], () => e.schrift, (v) => { e.schrift = v; }),
      wahl(T('setup.sprache'), [['de', 'Deutsch'], ['en', 'English'], ['fr', 'Français']], () => e.sprache, (v) => { r.setzeSprache(v); if (r.beiSprache) r.beiSprache(v); }),
    ],
  ];
  return new Menue({ titel: T('setup.titel'), seiten });
}

/// Abfrage einer Ziffer (Fix 0~9?)
class ZiffernFrage {
  constructor(frage, min, max, fertig) {
    this.frage = frage;
    this.min = min;
    this.max = max;
    this.fertig = fertig;
    this.istMenue = true;
  }
  taste(k, r) {
    if (k === 'ac' || k === 'left') { r.pop(); return; }
    if (/^\d$/.test(k)) {
      const n = Number(k);
      if (n >= this.min && n <= this.max) this.fertig(n);
    }
  }
  ansicht() { return { art: 'text', zeilen: [this.frage], mitte: false }; }
}

export function constMenue(r, rs) {
  const sp = r.einst.sprache;
  const gruppen = KONSTANTEN_GRUPPEN.map((g) => ({
    text: g[sp],
    aktion: () => r.push(new Menue({
      titel: g[sp],
      zurueck: true,
      spalten: 3,
      seiten: inSeiten(g.ids.map((id) => {
        const k = KONSTANTEN[id];
        return { text: k.symbol, aktion: () => einfuegenAus(r, rs, { k: 'k', v: id }) };
      }), 9),
    })),
  }));
  return new Menue({ titel: 'CONST', spalten: 2, seiten: [gruppen] });
}

export function convMenue(r, rs) {
  const sp = r.einst.sprache;
  const gruppen = UMRECHNUNG_GRUPPEN.map((g) => ({
    text: g[sp],
    aktion: () => r.push(new Menue({
      titel: g[sp],
      zurueck: true,
      spalten: 2,
      seiten: inSeiten(g.ids.map((id) => ({ text: UMRECHNUNGEN[id].text, aktion: () => einfuegenAus(r, rs, { k: 'post', v: 'conv:' + id }) })), 6),
    })),
  }));
  return new Menue({ titel: 'CONV', spalten: 2, seiten: [gruppen] });
}

export function resetMenue(r) {
  const frage = (text, aktion) => () => { r.menuesSchliessen(); r.push(new Frage(text, aktion)); };
  return new Menue({ titel: 'RESET', seiten: [[
    { text: T('reset.einst'), aktion: frage(T('reset.frage.einst'), () => { const s = r.einst.sprache; r.einst = standardEinstellungen(s); }) },
    { text: T('reset.speicher'), aktion: frage(T('reset.frage.speicher'), () => { r.vars = Object.fromEntries(VARIABLEN.map((v) => [v, NULL])); r.ans = NULL; }) },
    { text: T('reset.alles'), aktion: frage(T('reset.frage.alles'), () => { const s = r.einst.sprache; r.einst = standardEinstellungen(s); r.allesLoeschen(); r.setzeModus('COMP'); r.push(new Hinweis([T('fertig.ac')])); }) },
  ]] });
}

export { STAT_NAMEN };
