// app.js – Start der Web-App: Rechner, Gehäuse, Hilfe, Sprache, Beamer, QR, Speichern, Offline.

import { Rechner } from './rechner.js';
import { zeichneLCD } from './anzeige.js';
import { baueGeraet, setzeDezimal, miniKappe } from './tastatur.js';
import { Hilfe } from './hilfe.js';
import { setzeSprache } from './i18n.js';
import { uiText } from './inhalt.js';

const SPEICHER = 'fx991.zustand';
const UI_SPEICHER = 'fx991.ui';
const SPRACHEN = ['de', 'en', 'fr'];

// MARK: Gespeicherte Einstellungen

function lies(k) {
  try { return localStorage.getItem(k); } catch (e) { return null; }
}
function schreib(k, v) {
  try { localStorage.setItem(k, v); } catch (e) { /* privater Modus: ohne Speichern */ }
}

let ui = { sprache: null, hilfeOffen: null, beamer: false };
try { ui = { ...ui, ...JSON.parse(lies(UI_SPEICHER) || '{}') }; } catch (e) { /* Voreinstellung */ }

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

const rahmen = document.getElementById('geraet-rahmen');
const geraetBox = document.getElementById('geraet');
const spurBox = document.getElementById('tastenspur');
const banner = document.getElementById('banner');
const { geraet, lcd, knoepfe } = baueGeraet(geraetBox, (id) => druecke(id, 'nutzer'));

let tastenhilfe = false;
let hilfeShift = null;
const spur = [];

function zeichne() {
  zeichneLCD(lcd, r.ansicht());
  setzeDezimal(geraet, r.einst.dezimal);
}

let sicherTimer = null;
function sichern() {
  clearTimeout(sicherTimer);
  sicherTimer = setTimeout(() => schreib(SPEICHER, r.zustand()), 300);
}

function druecke(id, quelle) {
  if (tastenhilfe && quelle === 'nutzer') {
    // Tastenhilfe: erklären statt rechnen; SHIFT/ALPHA wählen die Zweitfunktion
    if (id === 'shift' || id === 'alpha') {
      hilfeShift = hilfeShift === id ? null : id;
      zeigeBanner(uiText(sprache, 'ui.tastenhilfeBanner') + (hilfeShift ? ` · ${hilfeShift.toUpperCase()}` : ''));
      return;
    }
    hilfe.zeigeTaste(id, hilfeShift);
    hilfeShift = null;
    zeigeBanner(uiText(sprache, 'ui.tastenhilfeBanner'));
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
  const sichtbar = document.body.classList.contains('beamer') || vorfuehrung;
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
  skaliere();
}

// MARK: Vorführen (Lektionen)

let vorfuehrung = null;

/// Tastenfolge vorführen: jede Taste leuchtet auf und wird gedrückt
export function spiele(ids, { tempo = 520 } = {}) {
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
  const bereich = document.getElementById('rechner-bereich');
  const spurH = spurBox.childElementCount ? spurBox.offsetHeight + 4 : 0;
  const w = bereich.clientWidth - 22;
  const hoehe = bereich.clientHeight - 24 - spurH;
  const s = Math.max(0.25, Math.min(w / 400, hoehe / 860));
  rahmen.style.width = 400 * s + 'px';
  rahmen.style.height = 860 * s + 'px';
  geraetBox.style.transform = `scale(${s})`;
}
new ResizeObserver(skaliere).observe(document.getElementById('rechner-bereich'));
window.addEventListener('resize', skaliere);

// MARK: Hilfe

const hilfeBox = document.getElementById('hilfe');
const hilfe = new Hilfe(hilfeBox, {
  rechner: r,
  spiele,
  sprache,
  schliessen: () => setzeHilfe(false),
  zeichne,
  // auf dem Handy verdeckt die Hilfe den Rechner: vor dem Vorführen schließen
  vorVorfuehrung: () => { if (!breit()) setzeHilfe(false); },
});

function breit() { return window.matchMedia('(min-width: 821px)').matches; }

function setzeHilfe(offen) {
  hilfeBox.hidden = !offen;
  document.getElementById('knopf-hilfe').classList.toggle('an', offen);
  ui.hilfeOffen = offen;
  schreib(UI_SPEICHER, JSON.stringify(ui));
  requestAnimationFrame(skaliere);
}
setzeHilfe(ui.hilfeOffen === null ? breit() : ui.hilfeOffen && (breit() || false));
if (params.get('hilfe') === '1') setzeHilfe(true);
document.getElementById('knopf-hilfe').addEventListener('click', () => setzeHilfe(hilfeBox.hidden));

function zeigeBanner(text) {
  banner.textContent = text;
  banner.hidden = !text;
}

document.getElementById('knopf-tastenhilfe').addEventListener('click', () => {
  tastenhilfe = !tastenhilfe;
  hilfeShift = null;
  document.getElementById('knopf-tastenhilfe').classList.toggle('an', tastenhilfe);
  zeigeBanner(tastenhilfe ? uiText(sprache, 'ui.tastenhilfeBanner') : '');
  if (tastenhilfe) { setzeHilfe(true); hilfe.zeigeReiter('tasten'); }
});

// MARK: Beamer

function setzeBeamer(an) {
  document.body.classList.toggle('beamer', an);
  document.getElementById('knopf-beamer').classList.toggle('an', an);
  ui.beamer = an;
  schreib(UI_SPEICHER, JSON.stringify(ui));
  zeichneSpur(false);
}
document.getElementById('knopf-beamer').addEventListener('click', () => setzeBeamer(!document.body.classList.contains('beamer')));
if (ui.beamer || params.get('beamer') === '1') setzeBeamer(true);

// MARK: QR-Code

const qr = document.getElementById('qr-vollbild');
function setzeQR(an) { qr.hidden = !an; }
document.getElementById('knopf-qr').addEventListener('click', () => setzeQR(true));
qr.addEventListener('click', () => setzeQR(false));

// MARK: Sprache

function wendeSpracheAn(s) {
  sprache = s;
  ui.sprache = s;
  schreib(UI_SPEICHER, JSON.stringify(ui));
  r.setzeSprache(s);
  setzeSprache(s);
  document.documentElement.lang = s;
  document.querySelectorAll('[data-sprache]').forEach((b) => b.classList.toggle('an', b.dataset.sprache === s));
  document.querySelectorAll('[data-t]').forEach((e) => { e.textContent = uiText(s, e.dataset.t); });
  document.title = uiText(s, 'ui.titel');
  hilfe.setzeSprache(s);
  zeichne();
  sichern();
}
document.querySelectorAll('[data-sprache]').forEach((b) => b.addEventListener('click', () => wendeSpracheAn(b.dataset.sprache)));
r.beiSprache = (s) => { if (s !== sprache) wendeSpracheAn(s); };

// MARK: Tastatur des Computers

const TASTATUR = {
  Enter: 'eq', '=': 'eq', Backspace: 'del', Delete: 'del', Escape: 'ac',
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  '+': 'add', '-': 'sub', '*': 'mul', '/': 'div', '(': 'lpar', ')': 'rpar', '^': 'pow', '.': 'dot', ',': 'dot',
};
window.addEventListener('keydown', (ev) => {
  if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
  const ziel = ev.target;
  if (ziel && (ziel.tagName === 'INPUT' || ziel.tagName === 'TEXTAREA')) return;
  if (!qr.hidden) { if (ev.key === 'Escape' || ev.key === 'q' || ev.key === 'Q') { setzeQR(false); ev.preventDefault(); } return; }
  if (ev.key === 'q' || ev.key === 'Q') { setzeQR(true); ev.preventDefault(); return; }
  let id = TASTATUR[ev.key];
  if (!id && /^\d$/.test(ev.key)) id = ev.key;
  if (!id) return;
  ev.preventDefault();
  druecke(id, 'nutzer');
});

// MARK: Start

wendeSpracheAn(sprache);
skaliere();
zeichne();
document.body.classList.add('bereit');

// MARK: Offline (Service Worker)

// lokal (Entwicklung) ohne Service Worker, damit immer der aktuelle Stand geladen wird
const lokal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) && params.get('sw') !== '1';
if ('serviceWorker' in navigator && location.protocol !== 'file:' && !lokal) {
  navigator.serviceWorker.register('sw.js').then((reg) => {
    const pruefe = () => {
      if (reg.waiting && document.visibilityState === 'hidden') reg.waiting.postMessage('skipWaiting');
    };
    reg.addEventListener('updatefound', () => {
      const neu = reg.installing;
      if (neu) neu.addEventListener('statechange', pruefe);
    });
    document.addEventListener('visibilitychange', pruefe);
  }).catch(() => { /* ohne Offline-Fähigkeit */ });
  let neuGeladen = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (neuGeladen) return;
    neuGeladen = true;
    if (document.visibilityState === 'hidden') location.reload();
  });
}
