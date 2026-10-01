// app.js – Start der Web-App: Casio-Rechner (Gehäuse, LCD, Tastenspur, Beamer, QR), Hilfe mit Lektionen
// und die Werkzeuge aus RPN42 (Graph, Analysis, Gleichungen, Solver, Ausdruck/PDF) als Reiter.
// Reiter, Quer-/Breitformat (Rechner links, Arbeitsbereich rechts), Sichern und Service Worker nach dem
// Vorbild von RPN42 (dort js/app.js). Werte aus den Werkzeugen landen im Casio als Ans (mehrere auf
// einmal in A, B, C …); SHIFT OPTN am Casio zeichnet im Graphen (rechner.js, modi.js, zeichnen.js).
// Die Werkzeuge werden nachgeladen: scheitert das, läuft der Casio trotzdem.

import { Rechner, setzeAns } from './rechner.js';
import { zeichneLCD } from './anzeige.js';
import { baueGeraet, setzeDezimal, miniKappe } from './tastatur.js';
import { Hilfe } from './hilfe.js';
import { setzeSprache } from './i18n.js';
import { uiText } from './inhalt.js';
import * as Z from './zahl.js';

window.__fx991Booting = true;   // Module laufen: die Startfehler-Meldung in index.html wartet länger

const SPEICHER = 'fx991.zustand';
const UI_SPEICHER = 'fx991.ui';
const WERKZEUG_SPEICHER = 'fx991.werkzeuge';
const SPRACHEN = ['de', 'en', 'fr'];

/// Reiter der Leiste (Reihenfolge wie in index.html)
const TABS = [
  { id: 'calc', icon: 'calc', t: 'ui.tabRechner' },
  { id: 'graph', icon: 'graph', t: 'ui.tabGraph' },
  { id: 'analysis', icon: 'analysis', t: 'ui.tabAnalysis' },
  { id: 'equations', icon: 'equations', t: 'ui.tabGleichungen' },
  { id: 'solver', icon: 'solver', t: 'ui.tabSolver' },
  { id: 'hilfe', icon: 'help', t: 'ui.tabHilfe' },
];
/// Unterseiten → übergeordneter Reiter (bleibt in der Leiste markiert)
const PARENT = { print: 'hilfe' };
const PANE_IDS = ['calc', 'graph', 'analysis', 'equations', 'solver', 'hilfe', 'print'];
/// Werkzeug-Oberflächen (RPN42): Bereich → [Datei, mount-Funktion]
const UI_MODULE = {
  graph: ['./werkzeuge/ui/graph-ui.js', 'mountGraph'],
  analysis: ['./werkzeuge/ui/tools-ui.js', 'mountAnalysis'],
  equations: ['./werkzeuge/ui/tools-ui.js', 'mountEquations'],
  solver: ['./werkzeuge/ui/tools-ui.js', 'mountSolver'],
  print: ['./werkzeuge/ui/print-ui.js', 'mountPrint'],
};

/// Casio-Gehäuse (Entwurfsgröße, tastatur.js)
const GERAET = { breite: 400, hoehe: 880 };
/// Querformat: Mindestbreite rechts (Arbeitsbereich) und links (Leiste mit Sprache, Tastenhilfe, Beamer, Erscheinungsbild, QR)
const ARBEIT_MIN = 380;
const RECHNER_MIN = 400;

const body = document.body;
const rootEl = document.documentElement;
const t = (k) => uiText(sprache, k);

// MARK: Gespeicherte Einstellungen

function lies(k) {
  try { return localStorage.getItem(k); } catch (e) { return null; }
}
function schreib(k, v) {
  try { localStorage.setItem(k, v); return true; } catch (e) { return false; /* privater Modus: ohne Speichern */ }
}

let ui = { sprache: null, beamer: false, tab: 'calc', thema: 'system' };
try { ui = { ...ui, ...JSON.parse(lies(UI_SPEICHER) || '{}') }; } catch (e) { /* Voreinstellung */ }
function uiSichern() { schreib(UI_SPEICHER, JSON.stringify(ui)); }

const params = new URLSearchParams(location.search);
function startSprache() {
  const p = params.get('lang');
  if (SPRACHEN.includes(p)) return p;
  if (SPRACHEN.includes(ui.sprache)) return ui.sprache;
  const n = (navigator.language || 'de').slice(0, 2);
  return n === 'fr' ? 'fr' : n === 'en' ? 'en' : 'de';
}

// MARK: Rechner

let sprache = startSprache();
const r = new Rechner(sprache);
const gesichert = lies(SPEICHER);
if (gesichert) r.ladeZustand(gesichert);
if (r.einst.sprache !== sprache) r.setzeSprache(sprache);
setzeSprache(sprache);

const bereich = document.getElementById('rechner-bereich');
const rahmen = document.getElementById('geraet-rahmen');
const geraetBox = document.getElementById('geraet');
const spurBox = document.getElementById('tastenspur');
const banner = document.getElementById('banner');
const leiste = document.querySelector('#pane-calc .leiste');
const { geraet, lcd, knoepfe } = baueGeraet(geraetBox, (id) => druecke(id, 'nutzer'));

let tastenhilfe = false;
let hilfeShift = null;
const spur = [];

function zeichne() {
  zeichneLCD(lcd, r.ansicht());
  setzeDezimal(geraet, r.einst.dezimal);
  kommaAbgleichen();
}

let sicherTimer = null;
function sichern() {
  clearTimeout(sicherTimer);
  sicherTimer = setTimeout(() => schreib(SPEICHER, r.zustand()), 300);
}
function sofortSichern() {
  clearTimeout(sicherTimer);
  schreib(SPEICHER, r.zustand());
}

function druecke(id, quelle) {
  if (tastenhilfe && quelle === 'nutzer') {
    // Tastenhilfe: erklären statt rechnen; SHIFT/ALPHA wählen die Zweitfunktion
    if (id === 'shift' || id === 'alpha') {
      hilfeShift = hilfeShift === id ? null : id;
      zeigeBanner(t('ui.tastenhilfeBanner') + (hilfeShift ? ` · ${hilfeShift.toUpperCase()}` : ''));
      return;
    }
    if (split) {
      if (shownTab() !== 'hilfe') switchTab('hilfe');
      hilfe.zeigeTaste(id, hilfeShift);
    } else {
      zeigeTastenBlatt(id, hilfeShift);
    }
    hilfeShift = null;
    zeigeBanner(t('ui.tastenhilfeBanner'));
    return;
  }
  const k = knoepfe[id];
  if (k) {
    k.classList.add('gedrueckt');
    setTimeout(() => k.classList.remove('gedrueckt'), 110);
  }
  merkeSpur(id);
  r.taste(id);
  zeichne();
  sichern();
  hilfe.nachTaste(id);
  const aktiv = !navigator.userActivation || navigator.userActivation.hasBeenActive;
  if (navigator.vibrate && quelle === 'nutzer' && aktiv) { try { navigator.vibrate(6); } catch (e) { /* egal */ } }
}

// MARK: Tastenspur (Beamer, Vorführen)

function merkeSpur(id) {
  spur.push(id);
  while (spur.length > 14) spur.shift();
  zeichneSpur(true);
}

function zeichneSpur(neu) {
  const sichtbar = body.classList.contains('beamer') || vorfuehrung;
  spurBox.replaceChildren();
  if (!sichtbar) { skaliere(); return; }
  spur.forEach((id, i) => {
    const vorher = spur[i - 1];
    const mod = vorher === 'shift' ? 'S' : vorher === 'alpha' ? 'A' : null;
    const k = miniKappe(id, { mitShift: mod });
    if (id === 'shift') k.classList.add('shiftaktiv');
    if (neu && i === spur.length - 1) k.classList.add('neu');
    spurBox.append(k);
  });
  // zu lang für die Breite: älteste Tasten weglassen (die neuesten bleiben sichtbar). offsetWidth ohne die
  // Vergrößerung der Einblend-Animation (scrollWidth zählte sie mit)
  const verfuegbar = bereich.clientWidth - 24;
  const breite = () => Array.from(spurBox.children).reduce((w, k) => w + k.offsetWidth + 6, 2);
  while (spurBox.childElementCount > 1 && breite() > verfuegbar) spurBox.firstChild.remove();
  skaliere();
}

// MARK: Vorführen (Lektionen)

let vorfuehrung = null;

/// Tastenfolge vorführen: jede Taste leuchtet auf und wird gedrückt
function spiele(ids, { tempo = 520 } = {}) {
  if (vorfuehrung) vorfuehrung.abbruch = true;
  const lauf = { abbruch: false };
  vorfuehrung = lauf;
  spur.length = 0;
  zeichneSpur(false);
  return new Promise((fertig) => {
    let i = 0;
    const schritt = () => {
      if (lauf.abbruch) { fertig(false); return; }
      if (i >= ids.length) {
        setTimeout(() => { if (vorfuehrung === lauf) { vorfuehrung = null; zeichneSpur(false); } }, 2500);
        fertig(true);
        return;
      }
      const id = ids[i++];
      const k = knoepfe[id];
      if (k) k.classList.add('hervor');
      setTimeout(() => {
        if (k) k.classList.remove('hervor');
        druecke(id, 'vorfuehrung');
        setTimeout(schritt, tempo * 0.45);
      }, tempo * 0.55);
    };
    schritt();
  });
}

// MARK: Skalieren

function skaliere() {
  const spurH = spurBox.offsetHeight ? spurBox.offsetHeight + 4 : 0;   // im Beamer-Modus immer reserviert
  const w = bereich.clientWidth - 22;
  const hoehe = bereich.clientHeight - 22 - spurH;
  if (w <= 0 || hoehe <= 0) return;           // Rechner-Reiter verborgen
  const s = Math.max(0.25, Math.min(w / GERAET.breite, hoehe / GERAET.hoehe));
  rahmen.style.width = GERAET.breite * s + 'px';
  rahmen.style.height = GERAET.hoehe * s + 'px';
  geraetBox.style.transform = `scale(${s})`;
}
new ResizeObserver(skaliere).observe(bereich);

// MARK: Meldung

let toastTimer = 0;
function toast(text) {
  const node = document.getElementById('toast');
  if (!node || text === null || text === undefined || text === '') return;
  const s = String(text);
  node.textContent = s;
  node.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('show'), Math.min(5000, 1800 + s.length * 35));
}

// MARK: Hilfe

const hilfe = new Hilfe(document.getElementById('pane-hilfe'), {
  rechner: r,
  spiele,
  sprache,
  schliessen: () => switchTab('calc'),
  zeichne,
  // auf dem Handy liegt der Rechner in einem anderen Reiter: vor dem Vorführen dorthin wechseln
  vorVorfuehrung: () => { if (!split) switchTab('calc'); },
  werkzeuge: {
    oeffne: (tab) => { if (werkzeugeBereit()) switchTab(tab); },
    beispiel: (texte) => { if (werkzeugeBereit()) zeichneImGraph(texte, { grad: r.einst.winkel === 'D', standard: true }); },
    drucken: () => { if (werkzeugeBereit()) switchTab('print'); },
    zuruecksetzen: () => { if (werkzeugeBereit()) frageZuruecksetzen(); },
  },
});

function zeigeBanner(text) {
  banner.textContent = text;
  banner.hidden = !text;
}

/// Tastenhilfe am Handy: Erklärung als Blatt über dem Rechner (im Querformat rechts im Hilfe-Reiter)
let tastenBlatt = null;
function zeigeTastenBlatt(id, mod) {
  if (!W) {
    hilfe.zeigeTaste(id, mod);
    switchTab('hilfe');
    return;
  }
  if (tastenBlatt) tastenBlatt.close();
  const inhalt = W.el('div', { class: 'hilfe-inhalt tastenhilfe-blatt' }, hilfe.tastenKarte(id, mod));
  tastenBlatt = W.openSheet(t('ui.tastenTitel'), inhalt, { onClose: () => { tastenBlatt = null; } });
}

const knopfTastenhilfe = document.getElementById('knopf-tastenhilfe');
knopfTastenhilfe.addEventListener('click', () => {
  tastenhilfe = !tastenhilfe;
  hilfeShift = null;
  knopfTastenhilfe.classList.toggle('an', tastenhilfe);
  zeigeBanner(tastenhilfe ? t('ui.tastenhilfeBanner') : '');
  if (tastenhilfe) {
    hilfe.zeigeReiter('tasten');
    if (split) switchTab('hilfe');
  }
});

// MARK: Beamer

const knopfBeamer = document.getElementById('knopf-beamer');
function setzeBeamer(an) {
  body.classList.toggle('beamer', an);
  knopfBeamer.classList.toggle('an', an);
  ui.beamer = an;
  uiSichern();
  zeichneSpur(false);
  if (split) setzeRechnerBreite();
}
knopfBeamer.addEventListener('click', () => setzeBeamer(!body.classList.contains('beamer')));

// MARK: QR-Code

const qr = document.getElementById('qr-vollbild');
function setzeQR(an) { qr.hidden = !an; }
document.getElementById('knopf-qr').addEventListener('click', () => setzeQR(true));
qr.addEventListener('click', () => setzeQR(false));

// MARK: Reiter und Aufteilung (wie RPN42)

let current = 'calc';                 // gewählter Reiter (auch Unterseiten)
let split = false;                    // Quer-/Breitformat: Rechner links, Arbeitsbereich rechts
let visibleNow = [];                  // zurzeit sichtbare Bereiche
const panes = {};                     // Werkzeug-Bereiche: { refresh, show?, hide? }
const paneNodes = {};
for (const id of PANE_IDS) paneNodes[id] = document.getElementById('pane-' + id);
const tabbar = document.getElementById('tabbar');
const tabButtons = [];

/// Quer-/Breitformat: breit genug und breiter als hoch (iPhone quer bleibt einspaltig)
function istGeteilt(w, h) {
  return w >= 760 && w > h && h >= 560;
}
/// Im Querformat zeigt rechts ein Arbeitsbereich; ist „Rechner“ gewählt, die Hilfe
function shownTab() {
  return split && current === 'calc' ? 'hilfe' : current;
}
function visibleIds() {
  const s = shownTab();
  return split && s !== 'calc' ? ['calc', s] : [s];
}

function switchTab(id) {
  if (id === 'more') id = 'hilfe';            // RPN42-Bereiche kennen „Mehr“ (Zurück-Knopf im Ausdruck)
  if (!PANE_IDS.includes(id)) return;
  if (id === current) { applyLayout(); return; }
  if (UI_MODULE[id] && !W && werkzeugFehler) { toast(t('ui.werkzeugeFehlen')); return; }
  current = id;
  if (tastenBlatt) tastenBlatt.close();
  applyLayout();
  ui.tab = PARENT[id] || id;                  // Unterseiten nicht als Start-Reiter merken
  uiSichern();
}

function ensureMounted(id) {
  if (id === 'calc' || id === 'hilfe') return null;
  if (panes[id]) return panes[id];
  if (!W) return null;
  const root = paneNodes[id];
  if (!root) return null;
  const [pfad, name] = UI_MODULE[id];
  try {
    const m = W.module[pfad];
    if (!m) throw new Error(`${pfad} nicht geladen`);
    if (m.e) throw m.e;
    const fn = m.m[name];
    if (typeof fn !== 'function') throw new Error(`${name} fehlt in ${pfad}`);
    panes[id] = fn(root, W.ctx) || {};
  } catch (e) {
    console.error(`fx991: Bereich ${id} nicht aufgebaut`, e);
    panes[id] = mountFehler(root, id, e);
  }
  return panes[id];
}

/// Fehlermeldung statt des Bereichs (der übrige Trainer läuft weiter)
function mountFehler(root, id, err) {
  root.replaceChildren();
  const kopf = document.createElement('div');
  kopf.className = 'pane-head';
  const h1 = document.createElement('h1');
  h1.textContent = tabTitel(id);
  kopf.append(h1);
  const koerper = document.createElement('div');
  koerper.className = 'pane-body';
  const karte = document.createElement('div');
  karte.className = 'card';
  const p = document.createElement('p');
  p.className = 'error';
  p.textContent = t('ui.werkzeugeFehlen');
  const d = document.createElement('p');
  d.className = 'muted mono small';
  d.textContent = err && err.message ? err.message : String(err);
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn';
  b.textContent = t('ui.neuLaden');
  b.addEventListener('click', () => { sofortSichern(); location.reload(); });
  karte.append(p, d, b);
  koerper.append(karte);
  root.append(kopf, koerper);
  return { refresh() {} };
}

function tabTitel(id) {
  const tab = TABS.find((x) => x.id === (PARENT[id] || id));
  return tab ? t(tab.t) : id;
}

/// Klassen, sichtbare Bereiche, Reiterleiste und Querformat anwenden
function applyLayout() {
  const want = istGeteilt(window.innerWidth, window.innerHeight);
  // Bildschirmtastatur (Android verkleinert das Fenster): Aufteilung nicht umbauen, solange ein Feld aktiv ist
  if (want !== split && !(isTextTarget(document.activeElement) && visibleNow.length > 0)) split = want;
  body.classList.toggle('split', split);
  if (split) setzeRechnerBreite();

  const shown = shownTab();
  for (const c of Array.from(body.classList)) if (c.startsWith('tab-') && c !== 'tab-' + shown) body.classList.remove(c);
  body.classList.add('tab-' + shown);
  for (const id of PANE_IDS) paneNodes[id]?.classList.toggle('active', id === shown);
  const tabOn = PARENT[shown] || shown;
  for (const b of tabButtons) {
    const on = b.dataset.tab === tabOn;
    b.classList.toggle('on', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  }
  updateThemeColor();

  const vis = visibleIds();
  const before = visibleNow;
  visibleNow = vis;
  for (const id of before) {
    if (vis.includes(id)) continue;
    const a = document.activeElement;
    if (a && paneNodes[id] && paneNodes[id].contains(a) && typeof a.blur === 'function') a.blur();
    const p = panes[id];
    if (p && typeof p.hide === 'function') { try { p.hide(); } catch (e) { console.error(e); } }
  }
  for (const id of vis) {
    if (before.includes(id) && (panes[id] || !UI_MODULE[id])) continue;
    const p = ensureMounted(id);
    if (p && typeof p.show === 'function') { try { p.show(); } catch (e) { console.error(e); } }
    refreshPane(id, staleForce.delete(id));
  }
  if (vis.includes('calc')) requestAnimationFrame(skaliere);
}

/// --calc-w: Rechnerbreite im Querformat aus der Höhe (das Gehäuse behält sein Seitenverhältnis)
function setzeRechnerBreite() {
  const tb = tabbar ? tabbar.getBoundingClientRect().height || 54 : 54;
  const lh = leiste ? leiste.getBoundingClientRect().height || 46 : 46;
  const spurH = body.classList.contains('beamer') ? 56 : 0;
  const frei = window.innerHeight - tb - lh - 22 - spurH;
  const s = Math.min(Math.max(frei, 0) / GERAET.hoehe, 1.25);
  const natuerlich = GERAET.breite * s + 24;
  const hoechstens = window.innerWidth - ARBEIT_MIN;
  const w = Math.round(Math.max(0, Math.min(Math.max(natuerlich, RECHNER_MIN), hoechstens)));
  const v = `${w}px`;
  if (rootEl.style.getPropertyValue('--calc-w') !== v) rootEl.style.setProperty('--calc-w', v);
}

let layoutFrame = 0;
function onResize() {
  if (layoutFrame) return;
  layoutFrame = requestAnimationFrame(() => {
    layoutFrame = 0;
    applyLayout();
    scheduleRefresh();
  });
}
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', () => { onResize(); setTimeout(onResize, 300); });
// während der Eingabe zurückgestellte Umstellung Hoch-/Querformat nachholen
document.addEventListener('focusout', () => setTimeout(() => {
  if (istGeteilt(window.innerWidth, window.innerHeight) !== split) onResize();
  // iOS-Web-App: nach dem Schließen der Bildschirmtastatur bleibt das Fenster manchmal hochgeschoben
  if (!isTextTarget(document.activeElement) && (window.scrollY || 0) !== 0 && typeof window.scrollTo === 'function') {
    window.scrollTo(0, 0);
  }
}, 0));

// MARK: Auffrischen der Werkzeuge (einmal pro Bild)

let frame = 0;
let forceNext = false;
const staleForce = new Set();               // verborgene Bereiche: beim nächsten Zeigen voll auffrischen
/// force: Darstellung hat sich geändert (Erscheinungsbild, Dezimalkomma) – auch ohne Modelländerung neu zeichnen
function scheduleRefresh(force = false) {
  if (force) {
    forceNext = true;
    for (const id of Object.keys(panes)) if (!visibleNow.includes(id)) staleForce.add(id);
  }
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    const f = forceNext;
    forceNext = false;
    for (const id of visibleNow) refreshPane(id, f);
  });
}
function refreshPane(id, force = false) {
  const p = panes[id];
  if (!p || typeof p.refresh !== 'function') return;
  try { p.refresh(force ? { force: true } : undefined); } catch (e) { console.error(`fx991: refresh ${id}`, e); }
}

// MARK: Erscheinungsbild: hell oder dunkel (Knöpfe ☀︎ | ☾ in der Rechner-Leiste). Bis zur ersten Wahl
// folgt es dem System. Das Casio-Gehäuse bleibt immer dunkel; Fläche, Leisten, Hilfe und Werkzeuge folgen.

const THEMEN = ['system', 'light', 'dark'];
let thema = THEMEN.includes(ui.thema) ? ui.thema : 'system';
const darkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
const themaGruppe = document.querySelector('.leiste .themen');
const themaKnoepfe = Array.from(document.querySelectorAll('.leiste [data-thema]'));
const THEMA_SYMBOL = {
  light: '<g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/></g>',
  dark: '<path d="M19.6 14.6A8 8 0 0 1 9.4 4.4a8 8 0 1 0 10.2 10.2z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
};
function applyTheme() {
  const dark = thema === 'dark' || (thema === 'system' && !!(darkQuery && darkQuery.matches));
  const theme = dark ? 'dark' : 'light';
  if (rootEl.dataset.theme !== theme) rootEl.dataset.theme = theme;
  if (W) W.ctx.theme = theme;
  updateThemeColor();
  zeigeThemaKnoepfe();
}
/// Knöpfe: Symbol, gedrückt = sichtbares Erscheinungsbild, Text für Vorlesen und Tooltip
function zeigeThemaKnoepfe() {
  if (themaGruppe) themaGruppe.setAttribute('aria-label', t('ui.themaTitel'));
  for (const b of themaKnoepfe) {
    const id = b.dataset.thema;
    if (!b.firstChild) b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${THEMA_SYMBOL[id]}</svg>`;
    const an = rootEl.dataset.theme === id;
    b.classList.toggle('an', an);
    b.setAttribute('aria-pressed', an ? 'true' : 'false');
    const text = `${t('ui.themaTitel')}: ${t('ui.thema_' + id)}`;
    b.title = text;
    b.setAttribute('aria-label', text);
  }
}
for (const b of themaKnoepfe) {
  b.addEventListener('click', () => {
    thema = b.dataset.thema;
    ui.thema = thema;
    uiSichern();
    applyTheme();
    scheduleRefresh(true);                     // Graph-Zeichenflächen in den neuen Farben
  });
}
if (darkQuery) {
  const onSystemTheme = () => { if (thema !== 'system') return; applyTheme(); scheduleRefresh(true); };
  if (typeof darkQuery.addEventListener === 'function') darkQuery.addEventListener('change', onSystemTheme);
  else if (typeof darkQuery.addListener === 'function') darkQuery.addListener(onSystemTheme);
}
/// Farbe der Browserleiste passend zum sichtbaren Bereich
function updateThemeColor() {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  const dark = rootEl.dataset.theme === 'dark';
  const c = shownTab() === 'calc' ? (dark ? '#141518' : '#E6E5E1') : (dark ? '#0F0F0E' : '#F2F1EE');
  if (meta.getAttribute('content') !== c) meta.setAttribute('content', c);
}

// MARK: Werkzeuge (Graph, Analysis, Gleichungen, Solver, Ausdruck) – nachgeladen

let W = null;                  // { graph, analysis, equations, solver, constants, settings, ctx, module, Fmt, el, openSheet, … }
let werkzeugFehler = null;
const solverVars = {};         // Werte der Solver-Formeln (eigene Namen wie U, R, I – getrennt von A–F, x, y des Casio)

function werkzeugeBereit() {
  if (W) return true;
  toast(werkzeugFehler ? t('ui.werkzeugeFehlen') : t('ui.werkzeugeLaden'));
  return false;
}

async function starteWerkzeuge() {
  const pfade = [...new Set(Object.values(UI_MODULE).map(([p]) => p))];
  const module = {};
  const oberflaechen = Promise.all(pfade.map((p) => import(p).then((m) => { module[p] = { m }; },
    (e) => { module[p] = { e }; console.error(`fx991: ${p} nicht ladbar`, e); })));
  const [graphM, analysisM, solverM, constantsM, fmtM, commonM] = await Promise.all([
    import('./werkzeuge/graph.js'), import('./werkzeuge/analysis.js'), import('./werkzeuge/solver.js'),
    import('./werkzeuge/constants.js'), import('./werkzeuge/fmt.js'), import('./werkzeuge/ui/common.js'),
  ]);
  const eqM = await import('./werkzeuge/eqmodel.js').catch((e) => { console.error('fx991: eqmodel.js nicht ladbar', e); return null; });

  // Modelle (wie AppModel.init in RPN42)
  const graph = new graphM.GraphModel();
  graph.rows = [graphM.functionRow('', 0)];     // erster Start: leerer Graph
  const analysis = new analysisM.AnalysisModel();
  const solver = new solverM.SolverModel();
  const constants = new constantsM.ConstantsModel();
  const EquationsModel = eqM && eqM.EquationsModel;
  let equations = null;
  try { if (EquationsModel) equations = new EquationsModel(); } catch (e) { console.error(e); }
  const settings = { export: null };            // Ausdruck: print-ui legt die Standardwerte an
  const Fmt = fmtM.Fmt;

  // Laden (jedes Teil einzeln: ein kaputtes Teil verwirft nicht alles)
  let saved = null;
  try { saved = JSON.parse(lies(WERKZEUG_SPEICHER) || 'null'); } catch (e) { saved = null; }
  if (saved && typeof saved === 'object') {
    const part = (name, fn) => {
      if (saved[name] === undefined || saved[name] === null) return;
      try { fn(saved[name]); } catch (e) { console.warn(`fx991: gesicherter Teil „${name}“ unbrauchbar`, e); }
    };
    part('graph', (s) => graph.restore(s));
    part('equations', (s) => { if (equations) equations.restore(s); });
    part('solver', (s) => {
      const list = Array.isArray(s) ? s : s.equations;
      if (!Array.isArray(list) || list.length === 0) return;
      const before = solver.state;
      solver.restore(s);
      if (solver.equations.length === 0) solver.restore(before);
    });
    part('analysis', (s) => analysis.restore(s));
    part('constants', (s) => constants.restore(s));
    part('solverVars', (s) => {
      for (const [k, v] of Object.entries(s)) if (typeof v === 'number' && Number.isFinite(v)) solverVars[k] = v;
    });
    part('settings', (s) => { if (s.export && typeof s.export === 'object') settings.export = s.export; });
  }
  if (!settings.export) delete settings.export;
  // Flächengröße des Graphen vom letzten Mal (graph-ui sichert sie): sonst verzerrte Achsen beim Zurücksetzen
  try {
    const g = JSON.parse(lies('fx991.graph.ui') || 'null')?.groesse;
    if (g && g.width > 10 && g.height > 10) graph.canvasSize = { width: g.width, height: g.height };
  } catch (e) { /* Standardgröße */ }
  Fmt.comma = r.einst.dezimal === ',';

  // Sichern
  let speicherGewarnt = false;
  function snapshot() {
    const s = { version: 1 };
    const put = (k, fn) => { try { s[k] = fn(); } catch (e) { console.warn(`fx991: „${k}“ nicht gesichert`, e); } };
    put('graph', () => graph.state);
    put('analysis', () => analysis.state);
    if (equations) put('equations', () => equations.state);
    else if (saved && saved.equations) s.equations = saved.equations;   // Modul fehlte: Gesichertes nicht verlieren
    put('solver', () => { const st = solver.state; return { equations: st.equations, selected: st.selected }; });
    put('constants', () => ({ custom: constants.state.custom }));
    s.solverVars = { ...solverVars };
    s.settings = settings;
    return s;
  }
  function save() {
    if (!schreib(WERKZEUG_SPEICHER, JSON.stringify(snapshot())) && !speicherGewarnt) {
      speicherGewarnt = true;
      toast(t('ui.speichernNicht'));
    }
  }
  const scheduleSave = commonM.debounce(save, 400);
  const saveNow = () => scheduleSave.flush();

  /// Modell geändert → sichtbare Bereiche auffrischen und Sichern planen
  function changed() {
    scheduleRefresh();
    scheduleSave();
  }

  /// nach dem Umschalten (neue Zeichenfläche hat ihre Größe) ausführen
  function afterLayout(fn) {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      try { fn(); } catch (e) { console.error(e); }
      changed();
    }));
  }

  /// Funktionsterme in den Graph übernehmen und Graph zeigen (AppModel.plot)
  function plot(texts) {
    const list = (Array.isArray(texts) ? texts : [texts]).map((x) => String(x ?? '').trim()).filter((x) => x !== '');
    if (list.length === 0) return;
    if (graph.rows.length > 0 && graph.rows.every((row) => String(row.text).trim() === '')) graph.setRows([]);
    for (const x of list) graph.addFunctionRow(x);
    switchTab('graph');
    afterLayout(() => graph.fitY());
    changed();
  }

  /// Fläche ∫ₐᵇ im Graph zeigen; die Funktion wird bei Bedarf angelegt (AppModel.showArea)
  function showArea(text, a, b) {
    const s = String(text ?? '').trim();
    let name = null;
    const row = graph.rows.find((x) => String(x.text).trim() === s);
    const c = row ? graph.compiledRow(row.id) : null;
    if (c && c.isFunction) name = c.name;
    else name = graph.addFunctionRow(s);
    if (!name) return;
    graph.integrate(name, a, b);
    const vp = graph.view;
    if (a < vp.xMin || b > vp.xMax) {
      const m = (b - a) * 0.25;
      graph.view = { xMin: Math.min(vp.xMin, a - m), xMax: Math.max(vp.xMax, b + m), yMin: vp.yMin, yMax: vp.yMax };
      afterLayout(() => graph.fitY());
    }
    switchTab('graph');
    changed();
  }

  /// „Graph leeren“ (Rückfrage stellt der Aufrufer)
  function clearGraph() {
    graph.clearAll();
    switchTab('graph');
    changed();
  }

  /// Werkzeuge zurücksetzen (Graph, Gleichungen, Analysis, Ausdruck); Solver-Formeln und der Casio bleiben
  function resetAll() {
    graph.clearAll();
    try {
      if (equations) {
        if (typeof equations.reset === 'function') equations.reset();
        else equations.restore(new EquationsModel().state);
      }
    } catch (e) { console.error(e); }
    try { analysis.reset(); } catch (e) { console.error(e); }
    if (settings.export && typeof settings.export === 'object') {
      for (const k of Object.keys(settings.export)) delete settings.export[k];
    }
    for (const k of Object.keys(solverVars)) delete solverVars[k];
    switchTab('graph');
    scheduleRefresh(true);
    saveNow();
    toast(t('ui.zurueckgesetzt'));
  }

  // Rechner-Ersatz für die Werkzeuge: Solver-Variablen, Winkelmodus des Casio, kein Protokoll
  const calc = {
    vars: solverVars,
    get angle() { return { D: 'deg', R: 'rad', G: 'grad' }[r.einst.winkel] || 'deg'; },
    tape: [],
    printOn: false,
    printMode: 'man',
    tapeInfo() {},
    formatValue: (x) => (typeof x === 'number' ? Fmt.num(x, 10) : String(x)),
  };

  const ctx = {
    calc, graph, analysis, equations, solver, constants, settings,
    theme: rootEl.dataset.theme || 'light',
    push, toast, switchTab, save: saveNow, changed, plot, resetAll, clearGraph, showArea,
    showHelp: () => switchTab('hilfe'),
    showMoreSection: () => switchTab('hilfe'),
    setSetting: (key, value) => { settings[key] = value; scheduleRefresh(true); scheduleSave(); },
    get zurueckText() { return t('ui.hilfe'); },
    get tab() { return current; },
    get split() { return split; },
    isVisible: (id) => visibleNow.includes(id),
  };

  await oberflaechen;
  W = {
    graph, analysis, equations, solver, constants, settings, ctx, module, Fmt,
    el: commonM.el, openSheet: commonM.openSheet, confirmSheet: commonM.confirmSheet,
    afterLayout, changed, saveNow,
  };
  for (const m of [graph, analysis, solver, constants, equations]) if (m) m.onChange = changed;
  // Drucken über das Browsermenü (⌘P) auch vor dem ersten Öffnen von „Ausdruck / PDF“
  try {
    const pm = module['./werkzeuge/ui/print-ui.js'];
    if (pm && pm.m && typeof pm.m.installPrintHooks === 'function') pm.m.installPrintHooks(ctx);
  } catch (e) { console.error('fx991: Druck-Vorbereitung', e); }

  // SHIFT OPTN am Casio zeichnet jetzt im Graphen (vorher: QR-Code wie beim echten Rechner)
  r.zeichnen = (texte, optionen) => zeichneImGraph(texte, optionen);

  // Symbole der Reiterleiste
  for (const b of tabButtons) {
    const tab = TABS.find((x) => x.id === b.dataset.tab);
    if (tab && !b.querySelector('svg')) b.insertBefore(commonM.icon(tab.icon), b.firstChild);
  }

  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveNow(); });
  window.addEventListener('pagehide', saveNow);

  visibleNow = [];
  applyLayout();
  return W;
}

// MARK: Werte in den Casio (Ans, mehrere auf einmal in A, B, C …)

let pushPuffer = null;

/// Wert aus einem Werkzeug in den Casio: einzeln als Ans; ein Punkt des Graphen (erst y, dann x wie beim
/// Stack von RPN42) in die Variablen x und y; mehrere im selben Klick („Alle Werte …“) nacheinander in
/// A, B, C … (wie STO), Ans = letzter Wert
function push(wert, label = null) {
  const v = typeof wert === 'number' ? wert : Number(wert);
  if (!Number.isFinite(v)) { toast(t('ui.keinWert')); return; }
  if (!pushPuffer) {
    pushPuffer = [];
    queueMicrotask(pushAusfuehren);
  }
  pushPuffer.push({ v, label: label === null || label === undefined ? '' : String(label) });
}

function casioWert(v) {
  return Number.isInteger(v) && Math.abs(v) < 1e15 ? Z.Q(BigInt(v)) : Z.D(v);
}

function pushAusfuehren() {
  const liste = pushPuffer || [];
  pushPuffer = null;
  if (liste.length === 0) return;
  const zahl = (v) => (W ? W.Fmt.num(v, 10) : String(v));
  const punkt = liste.length === 2 && / y$/.test(liste[0].label) && / x$/.test(liste[1].label);
  if (punkt) {
    const y = liste[0].v, x = liste[1].v;
    r.vars.x = casioWert(x);
    r.vars.y = casioWert(y);
    setzeAns(r, casioWert(x));
    toast(`${t('ui.inXY')} – ${liste[1].label.replace(/ x$/, '')}: x = ${zahl(x)}, y = ${zahl(y)}`);
  } else if (liste.length === 1) {
    const { v, label } = liste[0];
    setzeAns(r, casioWert(v));
    toast(`${t('ui.inAns')}: ${label ? `${label} = ` : ''}${zahl(v)}`);
  } else {
    const namen = ['A', 'B', 'C', 'D', 'E', 'F'];
    const teile = [];
    liste.slice(0, namen.length).forEach(({ v, label }, i) => {
      r.vars[namen[i]] = casioWert(v);
      teile.push(`${label || '?'} = ${zahl(v)} → ${namen[i]}`);
    });
    setzeAns(r, casioWert(liste[Math.min(liste.length, namen.length) - 1].v));
    toast(`${t('ui.inVariablen')}: ${teile.join(' · ')}`);
  }
  zeichne();
  sichern();
}

// MARK: Zeichnen vom Casio (SHIFT OPTN) und Beispiele der Hilfe

const TRIG = /(^|[^a-z])(a?(sin|cos|tan))\(/;

/// Terme „f(x) = …“ in den Graph: gleicher Term schon da → nur einblenden; Regressionskurve r(x) ersetzen.
/// optionen: grad (Casio im Gradmaß), punkte (Statistik), bereich ([a, b] der Wertetabelle), standard (−10 … 10)
function zeichneImGraph(texte, { grad = false, punkte = null, bereich: xBereich = null, standard = false } = {}) {
  if (!W) return;
  const { graph } = W;
  const liste = (texte || []).map((x) => String(x ?? '').trim()).filter(Boolean);
  if (liste.length === 0 && !punkte) return;
  const rechts = (x) => String(x).replace(/^\s*[A-Za-z]\w*\([a-z]\)\s*=/, '').replace(/\s+/g, '');
  const trig = liste.some((x) => TRIG.test(x.replace(/^[^=]*=/, '')));
  if (trig && graph.settings.degrees !== grad) {
    graph.settings = { ...graph.settings, degrees: grad };
    toast(grad ? t('ui.graphGrad') : t('ui.graphBogen'));
  }
  if (graph.rows.length > 0 && graph.rows.every((row) => String(row.text).trim() === '')) graph.setRows([]);
  if (punkte) graph.statPoints = punkte.map((p) => [Number(p[0]), Number(p[1])]);
  for (const x of liste) {
    const gleich = graph.rows.find((row) => rechts(row.text) === rechts(x));
    if (gleich) {
      if (gleich.visible === false) graph.updateRow(gleich.id, { visible: true });
      continue;
    }
    const regression = /^r\(x\)\s*=/.test(x) ? graph.rows.find((row) => /^r\(x\)\s*=/.test(String(row.text).trim())) : null;
    if (regression) graph.updateRow(regression.id, { text: x });
    else graph.addFunctionRow(x);
  }

  // Sichtfenster: Messpunkte, Bereich der Wertetabelle, Winkelfunktionen, sonst nur y anpassen
  const vp = graph.view;
  const breite = vp.xMax - vp.xMin;
  if (punkte && punkte.length > 0) {
    let x0 = Infinity, x1 = -Infinity, y0 = 0, y1 = 0;
    for (const [x, y] of graph.statPoints) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x);
      y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    if (Number.isFinite(x0)) {
      const dx = Math.max(x1 - x0, 1) * 0.15, dy = Math.max(y1 - y0, 1) * 0.15;
      graph.view = { xMin: Math.min(x0, 0) - dx, xMax: x1 + dx, yMin: y0 - dy, yMax: y1 + dy };
    }
  } else if (xBereich) {
    const [a, b] = xBereich;
    const m = (b - a) * 0.08;
    graph.view = { xMin: a - m, xMax: b + m, yMin: vp.yMin, yMax: vp.yMax };
    W.afterLayout(() => graph.fitY());
  } else if (trig && grad && breite < 180) {
    graph.view = { xMin: -360, xMax: 360, yMin: vp.yMin, yMax: vp.yMax };
    W.afterLayout(() => graph.fitY());
  } else if ((trig && !grad && breite > 60) || standard) {
    graph.view = { xMin: -10, xMax: 10, yMin: vp.yMin, yMax: vp.yMax };
    W.afterLayout(() => graph.fitY());
  } else {
    W.afterLayout(() => graph.fitY());
  }
  switchTab('graph');
  W.changed();
}

async function frageZuruecksetzen() {
  const ok = await W.confirmSheet(t('ui.zuruecksetzenFrage'), { title: t('ui.zuruecksetzenTitel'), ok: t('ui.zuruecksetzenOk'), danger: true });
  if (ok) W.ctx.resetAll();
}

/// Dezimalzeichen der Werkzeuge folgt dem Casio (SETUP bzw. Sprache)
function kommaAbgleichen() {
  if (!W) return;
  const komma = r.einst.dezimal === ',';
  if (W.Fmt.comma !== komma) {
    W.Fmt.comma = komma;
    scheduleRefresh(true);
  }
}

// MARK: Sprache

function wendeSpracheAn(s) {
  sprache = s;
  ui.sprache = s;
  uiSichern();
  r.setzeSprache(s);
  setzeSprache(s);
  rootEl.lang = s;
  document.querySelectorAll('[data-sprache]').forEach((b) => b.classList.toggle('an', b.dataset.sprache === s));
  document.querySelectorAll('[data-t]').forEach((e) => { e.textContent = uiText(s, e.dataset.t); });
  document.title = uiText(s, 'ui.titel');
  for (const b of tabButtons) {
    const tab = TABS.find((x) => x.id === b.dataset.tab);
    if (!tab) continue;
    const span = b.querySelector('span');
    if (span) span.textContent = uiText(s, tab.t);
    b.setAttribute('aria-label', uiText(s, tab.t));
    paneNodes[tab.id]?.setAttribute('aria-label', uiText(s, tab.t));
  }
  hilfe.setzeSprache(s);
  zeigeThemaKnoepfe();
  if (tastenhilfe) zeigeBanner(t('ui.tastenhilfeBanner'));
  zeichne();
  sichern();
}
document.querySelectorAll('[data-sprache]').forEach((b) => b.addEventListener('click', () => wendeSpracheAn(b.dataset.sprache)));
r.beiSprache = (s) => { if (s !== sprache) wendeSpracheAn(s); };

// MARK: Reiterleiste

if (tabbar) {
  for (const tab of TABS) {
    let b = tabbar.querySelector(`button[data-tab="${tab.id}"]`);
    if (!b) {
      b = document.createElement('button');
      b.type = 'button';
      b.dataset.tab = tab.id;
      b.append(document.createElement('span'));
      tabbar.append(b);
    }
    b.addEventListener('click', (e) => {
      if (e.detail > 0) b.blur();               // Fingertipp/Klick: Fokus nicht auf dem Knopf lassen
      const shown = shownTab();
      const onTab = PARENT[shown] || shown;
      if (tab.id === onTab && tab.id === current) { scrollPaneTop(shown); return; }   // erneut tippen → nach oben
      if (split && tab.id === 'hilfe' && current === 'calc') { scrollPaneTop('hilfe'); return; }
      switchTab(tab.id);
    });
    tabButtons.push(b);
  }
}
function scrollPaneTop(id) {
  const scroller = paneNodes[id] && paneNodes[id].querySelector('.pane-body, .hilfe-inhalt');
  if (scroller && scroller.scrollTop > 0) {
    if (typeof scroller.scrollTo === 'function') scroller.scrollTo({ top: 0, behavior: 'smooth' });
    else scroller.scrollTop = 0;
  }
}

// MARK: Tastatur des Computers

const TASTATUR = {
  Enter: 'eq', '=': 'eq', Backspace: 'del', Delete: 'del', Escape: 'ac',
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  '+': 'add', '-': 'sub', '*': 'mul', '/': 'div', '(': 'lpar', ')': 'rpar', '^': 'pow', '.': 'dot', ',': 'dot',
};
document.addEventListener('keydown', (ev) => {
  if (ev.defaultPrevented || ev.isComposing) return;
  if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
  const aktiv = document.activeElement;
  if (isTextTarget(aktiv) || isTextTarget(ev.target)) {
    // esc im Eingabefeld: Tastatur wieder an den Rechner
    if (ev.key === 'Escape' && !document.querySelector('.sheet-backdrop') && aktiv && typeof aktiv.blur === 'function') aktiv.blur();
    return;
  }
  if (!qr.hidden) {
    if (ev.key === 'Escape' || ev.key === 'q' || ev.key === 'Q') { setzeQR(false); ev.preventDefault(); }
    return;
  }
  if (document.querySelector('.sheet-backdrop')) return;     // Blatt offen
  if (!visibleNow.includes('calc')) {
    if (ev.key === 'Escape' && PARENT[current]) { ev.preventDefault(); switchTab(PARENT[current]); }
    return;
  }
  if (ev.key === 'q' || ev.key === 'Q') { setzeQR(true); ev.preventDefault(); return; }
  let id = TASTATUR[ev.key];
  if (!id && /^\d$/.test(ev.key)) id = ev.key;
  if (!id) return;
  ev.preventDefault();
  druecke(id, 'nutzer');
});

// Tippen auf den Rechner gibt ihm die Tastatur zurück (aktives Eingabefeld rechts verlassen)
paneNodes.calc.addEventListener('pointerdown', () => {
  const a = document.activeElement;
  if (a && isTextTarget(a) && !paneNodes.calc.contains(a) && typeof a.blur === 'function') a.blur();
}, true);

// Seitenzoom mit zwei Fingern verhindern (Graph zoomt selbst; die Bedienelemente sollen nicht wandern)
document.addEventListener('gesturestart', (e) => e.preventDefault());

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') sofortSichern();
  else scheduleRefresh();
});
window.addEventListener('pagehide', sofortSichern);

/// Eingabefeld mit Tastaturfokus (dann gehen Tasten nicht an den Rechner)
function isTextTarget(n) {
  if (!n || n.nodeType !== 1) return false;
  if (n.isContentEditable) return true;
  const tag = n.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag !== 'INPUT') return false;
  const type = (n.getAttribute('type') || 'text').toLowerCase();
  return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file', 'image'].includes(type);
}

// MARK: Start

{
  // ?tab=graph|analysis|equations|solver|hilfe, ?hilfe=1 (Hilfe), ?f=x^2;sin(x) (Graph), sonst der zuletzt benutzte Reiter
  let start = PANE_IDS.includes(ui.tab) && !PARENT[ui.tab] ? ui.tab : 'calc';
  const tabParam = (params.get('tab') || '').toLowerCase();
  if (PANE_IDS.includes(tabParam)) start = tabParam;
  if (params.get('hilfe') === '1') start = 'hilfe';
  current = start;
}
if (ui.beamer || params.get('beamer') === '1') setzeBeamer(true);
wendeSpracheAn(sprache);
applyTheme();
applyLayout();
zeichne();
skaliere();
body.classList.add('bereit');

/// Funktionen aus der Adresse (?f=x^2+1;sin(x)): „+“ bleibt ein Plus; wiederholtes Laden zeichnet nicht doppelt
function termeAusAdresse() {
  const q = location.search.replace(/^\?/, '');
  const terme = [];
  for (const teil of q.split('&')) {
    if (!teil.startsWith('f=')) continue;
    let s = teil.slice(2);
    try { s = decodeURIComponent(s); } catch (e) { /* roh */ }
    for (const x of s.split(';')) {
      const y = x.trim();
      if (y !== '' && y.length <= 400 && terme.length < 12) terme.push(y);   // Namen vergibt der Graph (f, g, h …)
    }
  }
  return terme;
}

starteWerkzeuge().then(() => {
  const terme = termeAusAdresse();
  if (terme.length > 0) zeichneImGraph(terme, { grad: false });
  // „f“ und „tab“ aus der Adresse entfernen: sonst zeichnet ein Neuladen doppelt bzw. springt auf den Reiter der Adresse
  if (terme.length > 0 || params.has('tab')) {
    try {
      const rest = location.search.replace(/^\?/, '').split('&').filter((x) => x && !x.startsWith('f=') && !x.startsWith('tab='));
      history.replaceState(history.state, '', location.pathname + (rest.length ? '?' + rest.join('&') : '') + location.hash);
    } catch (e) { /* ohne bereinigte Adresse weiter */ }
  }
}).catch((e) => {
  werkzeugFehler = e;
  console.error('fx991: Werkzeuge nicht geladen', e);
  if (UI_MODULE[current]) {
    for (const id of Object.keys(UI_MODULE)) if (paneNodes[id]) panes[id] = mountFehler(paneNodes[id], id, e);
    applyLayout();
  }
});

window.__fx991Started = true;
document.getElementById('boot-fail')?.remove();

// MARK: Offline (Service Worker) und Updates
// sw.js übernimmt eine neue Version gleich nach dem Herunterladen (skipWaiting): das nächste Neuladen
// bzw. Öffnen zeigt sie. Die laufende Seite lädt selbst neu, solange noch nichts eingegeben wurde, sonst
// beim nächsten Verlassen (Wechsel in eine andere App, anderer Tab) oder spätestens beim Zurückkehren.

// lokal (Entwicklung) ohne Service Worker, damit immer der aktuelle Stand geladen wird
const lokal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) && params.get('sw') !== '1';
if ('serviceWorker' in navigator && location.protocol !== 'file:' && !lokal) {
  const hatteSteuerung = !!navigator.serviceWorker.controller;   // erste Installation: nichts neu laden
  let reg = null;
  let letztePruefung = Date.now();
  let benutzt = false;                  // schon getippt/geklickt? Dann nicht mitten in der Arbeit neu laden
  let updateBereit = false;
  let neuGeladen = false;
  const merke = () => { benutzt = true; };
  document.addEventListener('pointerdown', merke, { capture: true, once: true });
  document.addEventListener('keydown', merke, { capture: true, once: true });
  const neuLaden = () => {
    if (neuGeladen) return;
    neuGeladen = true;
    sofortSichern();
    try { if (W) W.saveNow(); } catch (e) { /* trotzdem neu laden */ }
    location.reload();
  };
  navigator.serviceWorker.register('sw.js').then((r) => { reg = r; }).catch(() => { /* ohne Offline-Fähigkeit */ });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hatteSteuerung || neuGeladen) return;
    if (document.visibilityState === 'hidden' || !benutzt) { neuLaden(); return; }
    updateBereit = true;
    toast(t('ui.neueVersion'));
  });
  document.addEventListener('visibilitychange', () => {
    if (updateBereit) { neuLaden(); return; }   // verlassen (im Hintergrund) oder zurückgekehrt
    // länger offene App (Handy): beim Zurückkehren nach einer neuen Version sehen (höchstens alle 30 min)
    if (document.visibilityState === 'visible' && reg && Date.now() - letztePruefung > 30 * 60 * 1000) {
      letztePruefung = Date.now();
      reg.update().catch(() => {});
    }
  });
}
