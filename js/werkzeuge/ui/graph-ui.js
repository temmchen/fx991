// graph-ui.js – Arbeitsbereich „Graph“ fürs iPhone: Zeichenfläche mit Gesten (ein Finger verschieben, zwei Finger
// zoomen, doppelt tippen, Merkmale antippen, lang drücken = Spur), darunter die Funktionsliste im Desmos-Stil mit
// Merkmals-Chips, Schiebereglern, Merkmalstabelle, Integral und Eingabehilfe; Einstellungen als Blatt, Teilen als PNG.
// (Portierung von GraphView.swift und GraphPanel.swift; Zeichnen in graph-render.js)
// Kein DOM-Zugriff auf oberster Ebene: das Modul lädt auch in JavaScriptCore (tests/ui-smoke.mjs).
import {
  el, clear, icon, mathField, numberField, switchControl, openSheet, confirmSheet, copyText, shareOrDownload,
  longPress, haptic,
} from './common.js';
import { drawGraph, cachedIntegralValue, rgba } from './graph-render.js';
import { paletteColor, PALETTE_NAMES, defaultView } from '../graph.js';
import { Fmt } from '../fmt.js';
import { evaluateConstant } from '../expression.js';
import { FEATURE, featureName } from '../numerics.js';

// MARK: - Sichtfenster-Rechnungen (rein, ohne DOM; size = {width, height} der Zeichenfläche in Punkten)

/// Runden „halb von 0 weg“ wie Swift x.rounded()
function roundHalfAway(x) {
  return Math.sign(x) * Math.round(Math.abs(x));
}

function validView(v) {
  const w = v.xMax - v.xMin, h = v.yMax - v.yMin;
  return w > 1e-12 && w < 1e12 && h > 1e-12 && h < 1e12 &&
    [v.xMin, v.xMax, v.yMin, v.yMax].every((x) => Number.isFinite(x));
}

export const ViewMath = {
  /// Verschieben um (dx | dy) Punkte, Inhalt folgt dem Finger (wie GraphModel.pan)
  pan(v, dx, dy, size) {
    if (!size || !(size.width > 0) || !(size.height > 0)) return null;
    const ux = (v.xMax - v.xMin) / size.width, uy = (v.yMax - v.yMin) / size.height;
    const out = { xMin: v.xMin - dx * ux, xMax: v.xMax - dx * ux, yMin: v.yMin + dy * uy, yMax: v.yMax + dy * uy };
    return validView(out) ? out : null;
  },

  /// Zoomen um den Punkt (px | py) mit Faktor (< 1 = hinein), wie GraphModel.zoom
  zoom(v, factor, px, py, size) {
    if (!size || !(size.width > 0) || !(size.height > 0)) return null;
    const fx = px / size.width, fy = py / size.height;
    const cx = v.xMin + fx * (v.xMax - v.xMin);
    const cy = v.yMax - fy * (v.yMax - v.yMin);
    const w = (v.xMax - v.xMin) * factor, h = (v.yMax - v.yMin) * factor;
    const xMin = cx - fx * w, yMax = cy + fy * h;
    const out = { xMin, xMax: xMin + w, yMin: yMax - h, yMax };
    return validView(out) ? out : null;
  },

  /// Art des Zoomens mit zwei Fingern: 'x' / 'y', wenn die Finger klar waagrecht bzw. senkrecht liegen, sonst 'both'
  pinchMode(a, b) {
    const dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y);
    if (dx >= 40 && dy < dx * 0.27) return 'x';
    if (dy >= 40 && dx < dy * 0.27) return 'y';
    return 'both';
  },

  /// Zwei-Finger-Geste ab Gestenbeginn: Punkt unter der Anfangsmitte bleibt unter der aktuellen Mitte,
  /// Maßstab folgt dem Fingerabstand (gleichmäßig oder nur in einer Achse)
  pinch(v0, a0, b0, a1, b1, size, mode = 'both') {
    if (!size || !(size.width > 0) || !(size.height > 0)) return null;
    const W = size.width, H = size.height;
    const m0 = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 };
    const m1 = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 };
    const w0 = v0.xMax - v0.xMin, h0 = v0.yMax - v0.yMin;
    const wx = v0.xMin + m0.x / W * w0, wy = v0.yMax - m0.y / H * h0;
    let kx = 1, ky = 1;
    if (mode === 'x') {
      kx = Math.max(Math.abs(a0.x - b0.x), 10) / Math.max(Math.abs(a1.x - b1.x), 10);
    } else if (mode === 'y') {
      ky = Math.max(Math.abs(a0.y - b0.y), 10) / Math.max(Math.abs(a1.y - b1.y), 10);
    } else {
      const d0 = Math.hypot(a0.x - b0.x, a0.y - b0.y), d1 = Math.hypot(a1.x - b1.x, a1.y - b1.y);
      kx = ky = Math.max(d0, 10) / Math.max(d1, 10);
    }
    const w = w0 * kx, h = h0 * ky;
    const xMin = wx - m1.x / W * w, yMax = wy + m1.y / H * h;
    const out = { xMin, xMax: xMin + w, yMin: yMax - h, yMax };
    return validView(out) ? out : null;
  },

  /// Zwischenstufe einer Ansichts-Animation (t = 0 … 1)
  lerp(a, b, t) {
    return {
      xMin: a.xMin + (b.xMin - a.xMin) * t, xMax: a.xMax + (b.xMax - a.xMax) * t,
      yMin: a.yMin + (b.yMin - a.yMin) * t, yMax: a.yMax + (b.yMax - a.yMax) * t,
    };
  },
};

// MARK: - Texte (GraphPanel.swift → SyntaxHelp)

const SYNTAX_HELP = [
  ['f(x) = 0.5x^3 - 2x', 'Funktion mit Namen'],
  ['y = 2x + 1', 'Funktion (Name automatisch)'],
  ['x^2 - 4', 'ohne „=“ ebenfalls Funktion'],
  ['a·sin(b·x)', 'a, b werden Schieberegler'],
  ['a = 2', 'Parameter mit Regler'],
  ["g(x) = f'(x)", "Ableitungen f', f''"],
  ['u(t) = 325 sin(2π·50t)', 'andere Variable (t)'],
  ['x = 3', 'senkrechte Gerade'],
  ['P(2|3)  oder  (2; 3)', 'Punkt'],
  ['√x  sqrt(x)  root(x;3)', 'Wurzeln'],
  ['|x|  abs(x)  ln x  log x', 'Betrag, ln, lg'],
  ['e^x  π  2,5  1e-3', 'Konstanten, Dezimalkomma'],
  ['sin^2(x)  sin^-1(x)', 'Potenz, Umkehrfunktion'],
  ['min(a;b)  mod(x;2)  step(x)', 'weitere Funktionen'],
];

/// Reihenfolge der Merkmale in Listen (FeatureListView)
const FEATURE_ORDER = [FEATURE.zero, FEATURE.yIntercept, FEATURE.maximum, FEATURE.minimum, FEATURE.inflection, FEATURE.saddle];

function sortFeatures(list) {
  const idx = (k) => { const i = FEATURE_ORDER.indexOf(k); return i < 0 ? 0 : i; };
  return [...list].sort((a, b) => (idx(a.kind) - idx(b.kind)) || (a.x - b.x));
}

// MARK: - Eigene Symbole (ergänzen icon() aus common.js)

const MY_PATHS = {
  fity: 'M12 3.5v17M8.5 7L12 3.5 15.5 7M8.5 17l3.5 3.5 3.5-3.5M4 12h3M17 12h3',
  shrink: 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5',
  push: 'M20 12H7.5M12 7.5L7.5 12l4.5 4.5M4 5v14',
  tag: 'M3.5 12.5V4.5a1 1 0 0 1 1-1h8l8 8-9 9-8-8zM8 8h.01',
  target: 'M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17zM12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3',
};

function myIcon(name) {
  const s = el('svg:svg', { viewBox: '0 0 24 24', class: 'ico', 'aria-hidden': 'true', fill: 'none',
    stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  s.appendChild(el('svg:path', { d: MY_PATHS[name] }));
  return s;
}

/// Drei Punkte (⋯) – gefüllte Kreise, gut sichtbar
function dotsIcon() {
  const s = el('svg:svg', { viewBox: '0 0 24 24', class: 'ico', 'aria-hidden': 'true', fill: 'currentColor' });
  for (const cx of [5.5, 12, 18.5]) s.appendChild(el('svg:circle', { cx: String(cx), cy: '12', r: '1.9' }));
  return s;
}

// MARK: - Schieberegler (Zeiger-Ereignisse: waagrecht ziehen oder tippen; senkrecht bleibt Scrollen)

function makeSlider({ label = '', onInput = null, onEnd = null } = {}) {
  const PAD = 14;
  const fill = el('span', { class: 'sl-fill' });
  const thumb = el('span', { class: 'sl-thumb' });
  const node = el('div', { class: 'slider', role: 'slider', tabindex: '0', 'aria-label': label },
    el('span', { class: 'sl-track' }, fill), thumb);
  let min = 0, max = 1, value = 0;
  let active = null;   // { id, x0, y0, moving }
  const render = () => {
    const t = max > min ? Math.min(1, Math.max(0, (value - min) / (max - min))) : 0;
    node.style.setProperty('--t', String(t));
    node.setAttribute('aria-valuemin', String(min));
    node.setAttribute('aria-valuemax', String(max));
    node.setAttribute('aria-valuenow', String(value));
    node.setAttribute('aria-valuetext', Fmt.num(value, 3));
  };
  const fromX = (clientX) => {
    const r = node.getBoundingClientRect();
    const t = (clientX - r.left - PAD) / Math.max(1, r.width - 2 * PAD);
    return min + Math.min(1, Math.max(0, t)) * (max - min);
  };
  const emit = (v) => { value = v; render(); onInput?.(v); };
  node.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    active = { id: e.pointerId, x0: e.clientX, y0: e.clientY, moving: e.pointerType === 'mouse' };
    try { node.setPointerCapture(e.pointerId); } catch (err) { /* ohne Erfassen weiter */ }
    node.classList.add('active');
    if (active.moving) { e.preventDefault(); emit(fromX(e.clientX)); }
  });
  node.addEventListener('pointermove', (e) => {
    if (!active || e.pointerId !== active.id) return;
    if (!active.moving) {
      const dx = Math.abs(e.clientX - active.x0), dy = Math.abs(e.clientY - active.y0);
      if (dx < 5 && dy < 5) return;
      if (dy > dx) { active = null; node.classList.remove('active'); return; }   // Liste scrollt
      active.moving = true;
    }
    emit(fromX(e.clientX));
  });
  const end = (e) => {
    if (!active || e.pointerId !== active.id) return;
    const tap = !active.moving && e.type === 'pointerup';
    const moved = active.moving;
    active = null;
    node.classList.remove('active');
    if (tap) emit(fromX(e.clientX));
    if (tap || moved) onEnd?.();
  };
  node.addEventListener('pointerup', end);
  node.addEventListener('pointercancel', end);
  node.addEventListener('keydown', (e) => {
    const step = (max - min) / 100;
    let v = null;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') v = value - step;
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') v = value + step;
    else if (e.key === 'Home') v = min;
    else if (e.key === 'End') v = max;
    if (v === null) return;
    e.preventDefault();
    emit(Math.min(max, Math.max(min, v)));
    onEnd?.();
  });
  render();
  return {
    node,
    get dragging() { return !!(active && active.moving); },
    /// Bereich und Wert setzen (während des Ziehens bleibt der Bereich stehen)
    set(a, b, v) {
      if (active && active.moving) return;
      if (a === min && b === max && v === value) return;
      min = a; max = b; value = v;
      render();
    },
  };
}

// MARK: - Einstellungen der Oberfläche (je Gerät; nur Bequemlichkeit, darf fehlen)

const UI_KEY = 'fx991.graph.ui';   // fx991: eigener Schlüssel (gleicher Ursprung wie RPN42)

function loadUI() {
  try {
    const o = JSON.parse(globalThis.localStorage?.getItem(UI_KEY) || '{}');
    return o && typeof o === 'object' ? o : {};
  } catch (e) { return {}; }
}

function saveUI(o) {
  try { globalThis.localStorage?.setItem(UI_KEY, JSON.stringify(o)); } catch (e) { /* ohne Speicher weiter */ }
}

/// data:-URL → Blob (synchron, damit das Teilen-Blatt noch als Reaktion auf das Antippen gilt)
function dataURLToBlob(url) {
  const [head, data] = url.split(',');
  const mime = /data:([^;]+)/.exec(head)?.[1] || 'image/png';
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

const now = () => (globalThis.performance ? performance.now() : Date.now());

/// Blatt, das durch langes Drücken aufging: Der Finger liegt noch auf – sein Loslassen (auf iOS unter Umständen
/// ein Klick an dieser Stelle) darf das Blatt weder schließen noch darin etwas auslösen
function holdUntilRelease(handle) {
  const backdrop = handle && handle.sheet ? handle.sheet.parentElement : null;
  if (!backdrop) return;
  backdrop.style.pointerEvents = 'none';
  let done = false;
  const unlock = () => {
    if (done) return;
    done = true;
    window.removeEventListener('pointerup', unlock, true);
    window.removeEventListener('pointercancel', unlock, true);
    setTimeout(() => { backdrop.style.pointerEvents = ''; }, 350);
  };
  window.addEventListener('pointerup', unlock, true);
  window.addEventListener('pointercancel', unlock, true);
  setTimeout(unlock, 4000);
}

// MARK: - Bereich „Graph“

export function mountGraph(root, ctx) {
  const model = ctx.graph;
  const ui = loadUI();
  const fractions = {
    portrait: Number.isFinite(ui.anteil?.portrait) ? ui.anteil.portrait : 0.54,
    split: Number.isFinite(ui.anteil?.split) ? ui.anteil.split : 0.64,
  };

  const theme = () => {
    const t = ctx.theme || document.documentElement.dataset.theme;
    return t === 'dark' ? 'dark' : 'light';
  };
  const isDark = () => theme() === 'dark';
  const changed = () => { if (typeof ctx.changed === 'function') ctx.changed(); };
  const push = (v, label) => { if (typeof ctx.push === 'function') ctx.push(v, label); };
  const toast = (t) => { if (typeof ctx.toast === 'function') ctx.toast(t); };
  const isSplit = () => document.body.classList.contains('split');

  // Zustand der Oberfläche
  let sizeCSS = null;          // Größe der Zeichenfläche (Punkte)
  let stageShown = false;
  let dpr = 1;
  let render = null;           // letztes Ergebnis von drawGraph
  let hits = [];
  let lastKey = '';
  let lastAnalysis = null, lastAnalysisMs = 0;
  let trace = null;            // { rowId, x, y, fixed, snapped, mouse }
  let hoverId = null;          // Merkmal unter dem Mauszeiger
  let mousePos = null;
  let expanded = false;
  let typing = false;
  let lastSplit = null;
  let lastStageH = -1;

  root.classList.add('graph-pane');
  clear(root);

  // MARK: Titelzeile

  const headBtn = (content, label, onClick, extra = '') => el('button', {
    type: 'button', class: `btn icon ghost ${extra}`.trim(), 'aria-label': label, title: label, onclick: onClick,
  }, content);
  const bHome = headBtn(icon('home'), 'Standardansicht (−10 … 10, gleiche Einheiten)', () => { stopMotion(); model.standardView(size()); refresh(); });
  const bEqual = headBtn(el('span', { class: 'txt-ico', text: '1:1' }), 'Gleiche Einheiten auf beiden Achsen', () => { stopMotion(); model.equalAxes(size()); refresh(); });
  const bFit = headBtn(myIcon('fity'), 'y-Bereich an die Graphen anpassen', () => { stopMotion(); model.fitY(); refresh(); });
  const bSettings = headBtn(icon('gear'), 'Darstellung', () => openSettings());
  const bShare = headBtn(icon('share'), 'Graph als Bild (PNG) teilen', () => sharePNG());
  const bTrash = headBtn(icon('trash'), 'Graph leeren', () => askClear(), 'danger');
  const head = el('header', { class: 'pane-head graph-head' },
    el('h1', { text: 'Graph' }),
    el('div', { class: 'actions' }, bHome, bEqual, bFit, bSettings, bShare, bTrash));

  // MARK: Zeichenfläche

  const canvas = el('canvas', { class: 'graph-canvas', role: 'img', 'aria-label': 'Zeichenfläche des Graphen' });
  const tBtn = (content, label, onClick) => el('button', { type: 'button', class: 'graph-tool', 'aria-label': label, title: label, onclick: onClick }, content);
  const bZoomIn = tBtn(icon('zoomin'), 'Vergrößern', () => zoomButton(0.7));
  const bZoomOut = tBtn(icon('zoomout'), 'Verkleinern', () => zoomButton(1 / 0.7));
  const bExpand = tBtn(icon('fullscreen'), 'Zeichenfläche vergrößern', () => setExpanded(!expanded));
  const tools = el('div', { class: 'graph-tools' }, bZoomIn, bZoomOut, bExpand);
  const readout = el('div', { class: 'graph-readout', hidden: true });
  const bubble = el('div', { class: 'graph-bubble', hidden: true, role: 'group', 'aria-label': 'Punkt' });
  const stage = el('div', { class: 'graph-stage' }, canvas, tools, readout, bubble);
  const handle = el('button', { type: 'button', class: 'graph-handle', 'aria-label': 'Zeichenfläche vergrößern oder verkleinern' },
    el('span', { class: 'grabber', 'aria-hidden': 'true' }));

  // MARK: Liste

  const rowsBox = el('div', { class: 'list fn-list' });
  const addBtn = el('button', { type: 'button', class: 'btn fn-add', onclick: () => addRowAndFocus() },
    icon('plus'), 'Funktion');
  const paramBox = el('div', { class: 'param-box' });
  const paramCard = el('section', { class: 'card gcard param-card', hidden: true }, el('h2', { text: 'Parameter' }), paramBox);

  const featCard = collapsible('Merkmale', 'merkmale', () => updateAnalysisViews(true));
  const featBody = featCard.body;

  // Integral / Fläche
  const fnSelect = el('select', { class: 'field integ-fn', 'aria-label': 'Funktion' });
  const aField = numberField('0', { label: 'von', onEnter: (v, input) => { input.blur(); applyIntegral(); } });
  const bField = numberField('1', { label: 'bis', onEnter: (v, input) => { input.blur(); applyIntegral(); } });
  const bCalc = el('button', { type: 'button', class: 'btn primary', onclick: () => applyIntegral() }, 'Berechnen');
  const bHideInt = el('button', { type: 'button', class: 'btn', hidden: true, onclick: () => { model.integral = null; changed(); refresh(); } }, 'Ausblenden');
  const intValue = el('div', { class: 'integ-value mono', hidden: true });
  const bIntPush = el('button', { type: 'button', class: 'btn small', hidden: true, onclick: () => pushIntegral() }, myIcon('push'), 'Rechner');
  const intNote = el('div', { class: 'integ-note muted small', hidden: true });
  const integralCard = el('section', { class: 'card gcard integ-card', hidden: true },
    el('h2', { text: 'Integral / Fläche' }),
    el('div', { class: 'row integ-row' }, el('span', { class: 'integ-sign', text: '∫' }), fnSelect),
    el('div', { class: 'row integ-row' },
      el('label', { class: 'integ-lbl' }, el('span', { text: 'von' }), aField),
      el('label', { class: 'integ-lbl' }, el('span', { text: 'bis' }), bField)),
    el('div', { class: 'row wrap integ-row' }, bCalc, bHideInt, el('span', { class: 'grow' }), intValue, bIntPush),
    intNote);

  const helpCard = collapsible('Eingabehilfe', 'hilfe', null);
  helpCard.body.appendChild(el('table', { class: 'kv syntax-help' },
    el('tbody', null, SYNTAX_HELP.map(([a, b]) => el('tr', null, el('td', { class: 'mono sh-code', text: a }), el('td', { class: 'muted', text: b }))))));

  const list = el('div', { class: 'pane-body graph-list' }, rowsBox, addBtn, paramCard, featCard.card, integralCard, helpCard.card);
  const main = el('div', { class: 'graph-main' }, stage, handle, list);
  root.append(head, main);

  // MARK: Hilfen

  function size() {
    return sizeCSS || model.canvasSize || { width: 900, height: 620 };
  }

  function collapsible(title, key, onOpen) {
    const chevron = icon('chevron');
    const btn = el('button', { type: 'button', class: 'card-toggle', 'aria-expanded': 'false' }, el('h2', { text: title }), chevron);
    const body = el('div', { class: 'card-body', hidden: true });
    const card = el('section', { class: 'card gcard collapsible' }, btn, body);
    const state = { card, body, open: false };
    state.set = (o) => {
      state.open = o;
      body.hidden = !o;
      card.classList.toggle('open', o);
      btn.setAttribute('aria-expanded', o ? 'true' : 'false');
      ui.offen = { ...(ui.offen || {}), [key]: o };
      saveUI(ui);
      if (o) onOpen?.();
    };
    btn.addEventListener('click', () => state.set(!state.open));
    if (ui.offen && ui.offen[key]) { state.open = true; body.hidden = false; card.classList.add('open'); btn.setAttribute('aria-expanded', 'true'); }
    return state;
  }

  /// Merkmal (oder Punktzeile) zur Kennung aus der letzten Analyse
  function findFeature(id) {
    if (!id) return null;
    if (id.startsWith('point|')) {
      const rowId = id.slice(6, -1);
      const c = model.compiledRow(rowId);
      if (!c || !c.visible || c.kind.k !== 'point' || !c.point) return null;
      const name = c.kind.name ?? '';
      return { kind: 'point', x: c.point[0], y: c.point[1], function: name, other: null, index: 0, id, shortName: name, rowId };
    }
    const a = lastAnalysis;
    if (!a || !model.settings.features) return null;
    for (const fs of a.perRow.values()) for (const f of fs) if (f.id === id) return f;
    for (const f of a.intersections) if (f.id === id) return f;
    return null;
  }

  function featureTitle(f) {
    if (f.kind === 'point') return f.function ? `Punkt ${f.function}` : 'Punkt';
    return `${f.shortName} · ${featureName(f.kind)}` + (f.other ? ` ${f.function} ∩ ${f.other}` : ` von ${f.function}`);
  }

  function pushPoint(f) {
    const n = f.shortName || 'P';
    push(f.y, `${n} y`);
    push(f.x, `${n} x`);
  }

  // MARK: Zeilen der Funktionsliste

  const views = new Map();        // Zeilen-id → Zeilenansicht
  const expandedRows = new Set(); // Zeilen mit allen Merkmals-Chips

  function makeRowView(row) {
    const id = row.id;
    const v = { id, last: {}, chipsKey: null, extraMode: null };
    v.dotInner = el('span', { class: 'fn-dot-inner' });
    v.dot = el('button', { type: 'button', class: 'fn-dot', 'aria-label': 'Graph ausblenden', title: 'Antippen: ein-/ausblenden · lang drücken: Farbe' }, v.dotInner);
    v.dot.addEventListener('click', () => toggleVisible(id));
    longPress(v.dot, () => openRowSheet(id, true));
    v.prefix = el('span', { class: 'fn-prefix', hidden: true });
    v.input = mathField(row.text, {
      placeholder: 'z. B. x^2 − 4', label: 'Funktionsterm',
      onInput: (val) => { model.updateRow(id, { text: val }); refresh(); },
      onEnter: () => submitRow(id),
    });
    v.input.classList.add('fn-input');
    v.error = el('div', { class: 'error fn-error', hidden: true });
    v.extra = el('div', { class: 'fn-extra', hidden: true });
    v.chips = el('div', { class: 'fn-chips', hidden: true });
    v.more = el('button', { type: 'button', class: 'btn icon ghost fn-more', 'aria-label': 'Zeile: Farbe, Merkmale, Ableitung', title: 'Farbe, Merkmale, Ableitung …', onclick: () => openRowSheet(id) }, dotsIcon());
    v.del = el('button', { type: 'button', class: 'btn icon ghost fn-del', 'aria-label': 'Zeile löschen', title: 'Zeile löschen', onclick: () => deleteRow(id) }, icon('close'));
    v.node = el('div', { class: 'fn-row', dataset: { id } },
      v.dot,
      el('div', { class: 'fn-main' }, el('div', { class: 'fn-line' }, v.prefix, v.input), v.error, v.extra, v.chips),
      v.more, v.del);
    return v;
  }

  function setText(node, text, cacheObj, key) {
    if (cacheObj[key] === text) return;
    cacheObj[key] = text;
    node.textContent = text;
  }

  function updateRowView(v, row, c) {
    const L = v.last;
    // Eingabefeld nur ändern, wenn es nicht gerade bearbeitet wird (Fokus bleibt erhalten)
    if (document.activeElement !== v.input && v.input.value !== row.text) v.input.value = row.text;
    // Farbpunkt
    const color = paletteColor(row.color, isDark());
    if (L.color !== color) { L.color = color; v.node.style.setProperty('--dot', color); }
    if (L.visible !== row.visible) {
      L.visible = row.visible;
      v.dot.classList.toggle('off', !row.visible);
      v.dot.setAttribute('aria-label', row.visible ? 'Graph ausblenden' : 'Graph einblenden');
    }
    // Name vor dem Feld (automatische Namen)
    const trimmed = row.text.trim();
    let prefix = '', tag = false;
    if (c && c.kind.k === 'function' && c.kind.auto) {
      if (trimmed.startsWith('y')) { prefix = c.kind.name; tag = true; } else prefix = `${c.kind.name}(${c.kind.variable}) =`;
    }
    if (L.prefix !== prefix || L.tag !== tag) {
      L.prefix = prefix; L.tag = tag;
      v.prefix.textContent = prefix;
      v.prefix.hidden = prefix === '';
      v.prefix.classList.toggle('tag', tag);
    }
    // Fehlermeldung
    const err = c && c.error && trimmed !== '' ? c.error : '';
    if (L.err !== err) {
      L.err = err;
      v.error.textContent = err;
      v.error.hidden = err === '';
      v.input.classList.toggle('invalid', err !== '');
    }
    // Zusatz: Regler einer Parameterzeile, senkrechte Gerade
    let mode = '';
    if (c && c.kind.k === 'parameter' && c.constant !== null) mode = 'param';
    else if (c && c.kind.k === 'vertical' && c.constant !== null) mode = 'vertical';
    if (v.extraMode !== mode) {
      v.extraMode = mode;
      clear(v.extra);
      v.extra.hidden = mode === '';
      v.ex = null;
      if (mode === 'param') {
        const ex = {};
        ex.lo = el('span', { class: 'sl-lbl muted' });
        ex.hi = el('span', { class: 'sl-lbl muted' });
        ex.slider = makeSlider({
          label: `Parameter ${c.kind.name}`,
          onInput: (val) => {
            const cc = model.compiledRow(v.id);
            if (cc && cc.kind.k === 'parameter') { model.setParamRow(v.id, cc.kind.name, val); refresh(); }
          },
        });
        v.extra.append(el('div', { class: 'param-inline' }, ex.lo, ex.slider.node, ex.hi));
        v.ex = ex;
      } else if (mode === 'vertical') {
        v.ex = { text: el('span', { class: 'muted small' }) };
        v.extra.append(v.ex.text);
      }
    }
    if (mode === 'param') {
      const val = c.constant;
      const lo = Math.min(-10, val), hi = Math.max(10, val);
      v.ex.slider.set(lo, hi, val);
      if (!v.ex.slider.dragging) {
        setText(v.ex.lo, Fmt.num(lo, 2), L, 'lo');
        setText(v.ex.hi, Fmt.num(hi, 2), L, 'hi');
      }
    } else if (mode === 'vertical') {
      setText(v.ex.text, `senkrechte Gerade bei x = ${Fmt.num(c.constant, model.settings.decimals)}`, L, 'vert');
    }
  }

  function updateRows() {
    const rows = model.rows;
    const compiled = model.compiled;
    const byId = new Map(compiled.map((c) => [c.id, c]));
    const ids = new Set(rows.map((r) => r.id));
    for (const [id, v] of views) {
      if (!ids.has(id)) { v.node.remove(); views.delete(id); expandedRows.delete(id); }
    }
    let prev = null;
    for (const r of rows) {
      let v = views.get(r.id);
      if (!v) { v = makeRowView(r); views.set(r.id, v); }
      const expected = prev ? prev.nextSibling : rowsBox.firstChild;
      if (v.node !== expected) rowsBox.insertBefore(v.node, expected);
      updateRowView(v, r, byId.get(r.id));
      prev = v.node;
    }
    rowsBox.hidden = rows.length === 0;
  }

  function toggleVisible(id) {
    const row = model.rows.find((r) => r.id === id);
    if (!row) return;
    model.updateRow(id, { visible: !row.visible });
    refresh();
  }

  function deleteRow(id) {
    model.removeRow(id);
    if (trace && trace.rowId === id) trace = null;
    refresh();
  }

  function addRowAndFocus() {
    const id = model.addRow('');
    refresh();
    const v = views.get(id);
    if (v) {
      v.input.focus();
      v.node.scrollIntoView({ block: 'nearest' });
    }
  }

  /// Eingabetaste: nächste Zeile, sonst neue Zeile (wenn die aktuelle nicht leer ist), sonst Tastatur schließen
  function submitRow(id) {
    const rows = model.rows;
    const i = rows.findIndex((r) => r.id === id);
    if (i < 0) return;
    if (i + 1 < rows.length) {
      views.get(rows[i + 1].id)?.input.focus();
    } else if (rows[i].text.trim() !== '') {
      addRowAndFocus();
    } else {
      views.get(id)?.input.blur();
    }
  }

  // MARK: Blatt einer Zeile (Farbe, Merkmale, Ableitung, Löschen – Menü „⋯“ in Swift)

  function openRowSheet(id, fingerDown = false) {
    const row = model.rows.find((r) => r.id === id);
    if (!row) return;
    const c = model.compiledRow(id);
    const title = c && c.isFunction ? `${c.name}(${c.variable})` : (row.text.trim() || 'Leere Zeile');
    let sheet = null;
    const swatches = el('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Farbe' });
    const paint = () => {
      const cur = model.rows.find((r) => r.id === id);
      for (const b of swatches.children) {
        const on = cur && Number(b.dataset.i) === cur.color;
        b.classList.toggle('on', on);
        b.setAttribute('aria-checked', on ? 'true' : 'false');
      }
    };
    PALETTE_NAMES.forEach((name, i) => {
      const b = el('button', { type: 'button', class: 'swatch', role: 'radio', dataset: { i: String(i) } },
        el('i', { 'aria-hidden': 'true' }), el('span', { text: name }));
      b.style.setProperty('--sw', paletteColor(i, isDark()));
      b.addEventListener('click', () => { model.updateRow(id, { color: i }); refresh(); paint(); });
      swatches.appendChild(b);
    });
    paint();
    const visSw = switchControl('Graph anzeigen', row.visible, (on) => { model.updateRow(id, { visible: on }); refresh(); });
    const featSw = switchControl('Merkmale anzeigen', row.features !== false, (on) => { model.updateRow(id, { features: on }); refresh(); });
    const acts = el('div', { class: 'col sheet-acts' });
    if (c && c.isFunction) {
      acts.append(el('button', { type: 'button', class: 'btn', onclick: () => {
        model.addRow(`${c.name}'(${c.variable})`); refresh(); sheet?.close();
      } }, `Ableitung ${c.name}' hinzufügen`));
      acts.append(el('button', { type: 'button', class: 'btn', onclick: () => { model.fitY(); refresh(); sheet?.close(); } }, 'Graph zentrieren'));
    }
    acts.append(el('button', { type: 'button', class: 'btn danger', onclick: () => { deleteRow(id); sheet?.close(); } }, icon('trash'), 'Zeile löschen'));
    const content = el('div', { class: 'col row-sheet' },
      el('label', { class: 'lbl', text: 'Farbe' }), swatches, visSw, featSw, acts);
    sheet = openSheet(title, content);
    if (fingerDown) holdUntilRelease(sheet);
  }

  // MARK: Freie Parameter (ParamSliderRow)

  const paramViews = new Map();
  let paramKey = null;

  function makeParamView(name) {
    const pv = { name, last: {} };
    const setting = () => model.params[name] || { value: 1, min: -10, max: 10 };
    pv.slider = makeSlider({
      label: `Parameter ${name}`,
      onInput: (v) => { model.setParam(name, roundHalfAway(v * 100) / 100); refresh(); },
    });
    const commitValue = (s, input) => {
      let v;
      try { v = evaluateConstant(s); } catch (e) { input.classList.add('invalid'); return; }
      if (!Number.isFinite(v)) { input.classList.add('invalid'); return; }
      input.classList.remove('invalid');
      const p = { ...setting() };
      if (v < p.min) p.min = v;
      if (v > p.max) p.max = v;
      model.params[name] = p;
      model.setParam(name, v);
      refresh();
    };
    pv.value = numberField(Fmt.num(setting().value, 3), {
      label: `Wert von ${name}`, className: 'param-val',
      onEnter: (s, input) => { commitValue(s, input); input.blur(); },
      onChange: (s, input) => commitValue(s, input),
    });
    const commitRange = (key) => (s, input) => {
      let v;
      try { v = evaluateConstant(s); } catch (e) { input.classList.add('invalid'); return; }
      if (!Number.isFinite(v)) { input.classList.add('invalid'); return; }
      input.classList.remove('invalid');
      model.params[name] = { ...setting(), [key]: v };
      changed();
      refresh();
    };
    pv.minField = numberField(Fmt.num(setting().min, 4), {
      label: `Minimum von ${name}`, onEnter: (s, input) => { commitRange('min')(s, input); input.blur(); }, onChange: commitRange('min'),
    });
    pv.maxField = numberField(Fmt.num(setting().max, 4), {
      label: `Maximum von ${name}`, onEnter: (s, input) => { commitRange('max')(s, input); input.blur(); }, onChange: commitRange('max'),
    });
    pv.rangeBox = el('div', { class: 'param-range-edit', hidden: true },
      el('label', { class: 'integ-lbl' }, el('span', { text: 'Minimum' }), pv.minField),
      el('label', { class: 'integ-lbl' }, el('span', { text: 'Maximum' }), pv.maxField));
    pv.rangeBtn = el('button', { type: 'button', class: 'param-range', 'aria-expanded': 'false', title: 'Bereich des Schiebereglers',
      onclick: () => {
        pv.rangeBox.hidden = !pv.rangeBox.hidden;
        pv.rangeBtn.setAttribute('aria-expanded', pv.rangeBox.hidden ? 'false' : 'true');
      } });
    pv.node = el('div', { class: 'param-row' },
      el('div', { class: 'param-top' }, el('span', { class: 'param-name mono', text: name }), pv.slider.node, pv.value),
      pv.rangeBtn, pv.rangeBox);
    pv.update = () => {
      const p = setting();
      pv.slider.set(p.min, Math.max(p.max, p.min + 1e-9), p.value);
      if (document.activeElement !== pv.value) {
        const t = Fmt.num(p.value, 3);
        if (pv.value.value !== t) { pv.value.value = t; pv.value.classList.remove('invalid'); }
      }
      setText(pv.rangeBtn, `Bereich ${Fmt.num(p.min, 2)} … ${Fmt.num(p.max, 2)}`, pv.last, 'range');
      if (document.activeElement !== pv.minField) { const t = Fmt.num(p.min, 4); if (pv.minField.value !== t) pv.minField.value = t; }
      if (document.activeElement !== pv.maxField) { const t = Fmt.num(p.max, 4); if (pv.maxField.value !== t) pv.maxField.value = t; }
    };
    return pv;
  }

  function updateParams() {
    const names = model.freeParams;
    paramCard.hidden = names.length === 0;
    const key = names.join('\n');
    if (key !== paramKey) {
      paramKey = key;
      for (const [n, pv] of paramViews) if (!names.includes(n)) { pv.node.remove(); paramViews.delete(n); }
      let prev = null;
      for (const n of names) {
        let pv = paramViews.get(n);
        if (!pv) { pv = makeParamView(n); paramViews.set(n, pv); }
        const expected = prev ? prev.nextSibling : paramBox.firstChild;
        if (pv.node !== expected) paramBox.insertBefore(pv.node, expected);
        prev = pv.node;
      }
    }
    for (const n of names) paramViews.get(n)?.update();
  }

  // MARK: Integral (IntegralSection)

  let namesKey = null, integralKey = null, valueKey = null;

  function updateIntegral() {
    const fns = model.functions;
    const names = fns.map((c) => c.name);
    integralCard.hidden = names.length === 0;
    if (names.length === 0) return;
    const nk = fns.map((c) => `${c.name}(${c.variable})`).join('\n');
    if (nk !== namesKey) {
      namesKey = nk;
      const cur = fnSelect.value;
      clear(fnSelect);
      for (const c of fns) fnSelect.appendChild(el('option', { value: c.name, text: `${c.name}(${c.variable})` }));
      fnSelect.value = names.includes(cur) ? cur : (model.integral && names.includes(model.integral.function) ? model.integral.function : names[0]);
    }
    const s = model.integral;
    const ik = s ? `${s.function}|${s.a}|${s.b}|${s.visible}` : '';
    if (ik !== integralKey) {
      integralKey = ik;
      if (s) {
        if (names.includes(s.function)) fnSelect.value = s.function;
        if (document.activeElement !== aField) aField.value = Fmt.num(s.a, 6);
        if (document.activeElement !== bField) bField.value = Fmt.num(s.b, 6);
      }
      bCalc.textContent = s ? 'Aktualisieren' : 'Berechnen';
      bHideInt.hidden = !s;
    }
    const vk = `${ik}|${model.revision}|${model.paramRevision}|${model.settings.decimals}|${Fmt.comma}`;
    if (vk !== valueKey) {
      valueKey = vk;
      const v = s ? cachedIntegralValue(model) : null;
      intValue.hidden = v === null;
      bIntPush.hidden = v === null;
      intNote.hidden = v === null;
      if (v !== null) {
        intValue.textContent = '= ' + Fmt.num(v, Math.max(model.settings.decimals, 4));
        intNote.textContent = `∫ von ${Fmt.num(s.a, 3)} bis ${Fmt.num(s.b, 3)} ${s.function}(x) dx = ${Fmt.num(v, 6)} (orientierte Fläche)`;
      }
    }
  }

  function applyIntegral() {
    const names = model.functionNames;
    const f = names.includes(fnSelect.value) ? fnSelect.value : (names[0] || '');
    let a, b;
    try { a = evaluateConstant(aField.value); aField.classList.remove('invalid'); } catch (e) { aField.classList.add('invalid'); }
    try { b = evaluateConstant(bField.value); bField.classList.remove('invalid'); } catch (e) { bField.classList.add('invalid'); }
    if (a === undefined || b === undefined || !f) return;
    if (!Number.isFinite(a)) { aField.classList.add('invalid'); return; }
    if (!Number.isFinite(b)) { bField.classList.add('invalid'); return; }
    model.integrate(f, a, b);
    refresh();
  }

  function pushIntegral() {
    const s = model.integral;
    const v = s ? cachedIntegralValue(model) : null;
    if (v !== null) push(v, `∫ ${s.function}(x) dx`);
  }

  // MARK: Merkmals-Chips und Merkmalstabelle (hängen von der Analyse ab → verzögert, nicht während Gesten)

  let analysisTimer = null;
  let tableKey = null;

  function scheduleAnalysisViews() {
    clearTimeout(analysisTimer);
    analysisTimer = setTimeout(() => updateAnalysisViews(false), 120);
  }

  function updateAnalysisViews(force) {
    clearTimeout(analysisTimer);
    if (gestureActive()) { analysisTimer = setTimeout(() => updateAnalysisViews(force), 160); return; }
    const featuresOn = !!model.settings.features;
    const need = featuresOn || featCard.open;
    const a = need ? model.analysis() : null;
    if (a && a !== lastAnalysis) lastAnalysis = a;
    // Chips je Zeile
    const byId = new Map(model.compiled.map((c) => [c.id, c]));
    for (const row of model.rows) {
      const v = views.get(row.id);
      if (v) updateChips(v, row, byId.get(row.id), a);
    }
    // Tabelle
    if (featCard.open && a) {
      const key = `${analysisStamp(a)}|${model.settings.decimals}|${featuresOn}|${Fmt.comma}|${isDark()}`;
      if (force || key !== tableKey) { tableKey = key; buildFeatureTable(a); }
    }
    markSelection();
  }

  // Analyseergebnisse unterscheiden (jedes neue Ergebnis bekommt eine Nummer)
  const stamps = new WeakMap();
  let stampNo = 0;
  function analysisStamp(a) {
    let s = stamps.get(a);
    if (!s) { s = ++stampNo; stamps.set(a, s); }
    return s;
  }

  function updateChips(v, row, c, a) {
    const show = !!(c && c.isFunction && row.features !== false && row.visible && model.settings.features && a);
    if (!show) {
      if (!v.chips.hidden) { v.chips.hidden = true; clear(v.chips); v.chipsKey = null; }
      return;
    }
    const feats = sortFeatures(a.perRow.get(row.id) || []);
    const open = expandedRows.has(row.id);
    const key = feats.map((f) => f.id).join(',') + '|' + open;
    v.chips.hidden = false;
    if (key === v.chipsKey) return;
    v.chipsKey = key;
    clear(v.chips);
    if (feats.length === 0) {
      v.chips.append(el('span', { class: 'muted small fn-nofeat', text: 'Keine Merkmale im sichtbaren Bereich' }));
      return;
    }
    const shown = open ? feats : feats.slice(0, 10);
    for (const f of shown) {
      v.chips.append(el('button', {
        type: 'button', class: 'fchip', dataset: { fid: f.id }, 'aria-label': `${featureName(f.kind)} ${f.shortName}`,
        onclick: () => toggleFeature(f.id),
      }, f.shortName));
    }
    if (feats.length > 10) {
      v.chips.append(el('button', { type: 'button', class: 'fchip more', onclick: () => {
        if (expandedRows.has(row.id)) expandedRows.delete(row.id); else expandedRows.add(row.id);
        updateAnalysisViews(false);
      } }, open ? 'weniger' : `… ${feats.length - 10} weitere`));
    }
  }

  function featLine(f, prefix) {
    const dec = model.settings.decimals;
    const main = el('button', {
      type: 'button', class: 'feat-main',
      title: featureName(f.kind) + (f.other ? ` ${f.function} ∩ ${f.other}` : ''),
      onclick: () => toggleFeature(f.id),
    },
    prefix ? el('span', { class: 'feat-pre muted', text: prefix }) : null,
    el('span', { class: 'feat-short', text: f.shortName }),
    prefix ? null : el('span', { class: 'feat-name muted', text: featureName(f.kind) }),
    el('span', { class: 'feat-pt mono', text: Fmt.point(f.x, f.y, dec) }));
    const pushBtn = el('button', { type: 'button', class: 'btn icon ghost feat-push', 'aria-label': `${f.shortName} in den Rechner: Y = y, X = x`, title: 'In den Rechner: Y = y, X = x', onclick: () => pushPoint(f) }, myIcon('push'));
    return el('div', { class: 'feat-row', dataset: { fid: f.id } }, main, pushBtn);
  }

  function buildFeatureTable(a) {
    clear(featBody);
    const featuresOn = !!model.settings.features;
    const fns = model.compiled.filter((c) => c.isFunction && c.visible);
    if (featuresOn) {
      const withFeat = fns.filter((c) => c.features);
      if (withFeat.length === 0) featBody.append(el('p', { class: 'muted small feat-empty', text: 'Keine sichtbaren Funktionen' }));
      for (const c of withFeat) {
        const head = el('div', { class: 'feat-head' }, el('i', { class: 'feat-dot', 'aria-hidden': 'true' }), `${c.name}(${c.variable})`);
        head.style.setProperty('--dot', paletteColor(c.color, isDark()));
        featBody.append(head);
        const feats = sortFeatures(a.perRow.get(c.id) || []);
        if (feats.length === 0) featBody.append(el('p', { class: 'muted small feat-empty', text: 'Keine Merkmale im sichtbaren Bereich' }));
        for (const f of feats) featBody.append(featLine(f, null));
      }
    } else {
      featBody.append(el('p', { class: 'muted small feat-empty', text: 'Merkmale sind in der Darstellung ausgeschaltet.' }));
    }
    if (fns.length >= 2 || a.intersections.length > 0) {
      featBody.append(el('div', { class: 'feat-head' }, 'Schnittpunkte'));
      if (a.intersections.length === 0) featBody.append(el('p', { class: 'muted small feat-empty', text: 'Keine Schnittpunkte im sichtbaren Bereich' }));
      for (const f of a.intersections) featBody.append(featLine(f, `${f.function} ∩ ${f.other ?? ''}`));
    }
  }

  function markSelection() {
    const sel = model.selectedFeature;
    for (const n of root.querySelectorAll('.fchip[data-fid], .feat-row[data-fid]')) {
      const on = n.dataset.fid === sel;
      if (n.classList.contains('on') !== on) n.classList.toggle('on', on);
    }
  }

  // MARK: Auswahl, Info-Blase, Spur

  /// Merkmal antippen: auswählen und beschriften bzw. wieder abwählen (wie FeatureLine in Swift)
  function toggleFeature(id) {
    if (model.selectedFeature === id) {
      model.selectedFeature = null;
      model.pinned.delete(id);
    } else {
      model.selectedFeature = id;
      if (!id.startsWith('point|')) model.pinned.add(id);
      haptic();
    }
    trace = null;
    hideReadout();
    selectionChanged();
  }

  function selectionChanged() {
    markSelection();
    updateBubble();
    requestDraw();
  }

  let bubbleKey = null, bubbleSize = null, bubbleAnchor = null;

  function actionBtn(label, onClick, { aria = null, primary = false } = {}) {
    return el('button', { type: 'button', class: `btn small ${primary ? 'primary' : ''}`.trim(), 'aria-label': aria || null, onclick: onClick }, label);
  }

  function buildBubble(title, coords, actions) {
    clear(bubble);
    bubble.append(
      el('div', { class: 'gb-head' },
        el('div', { class: 'gb-title', text: title }),
        el('button', { type: 'button', class: 'btn icon ghost gb-close', 'aria-label': 'Schließen', onclick: () => closeBubble() }, icon('close'))),
      el('div', { class: 'gb-coords', text: coords }),
      el('div', { class: 'gb-actions' }, actions));
    bubble.setAttribute('aria-label', title);
    bubbleSize = null;
  }

  function closeBubble() {
    if (trace && trace.fixed) trace = null;
    if (model.selectedFeature) model.selectedFeature = null;
    selectionChanged();
  }

  /// Blase zum ausgewählten Merkmal bzw. zur festgehaltenen Spur (Inhalt nur bei Änderung neu)
  function updateBubble() {
    const dec = model.settings.decimals;
    let key = null, anchor = null;
    if (trace && trace.fixed && trace.rowId) {
      const c = model.compiledRow(trace.rowId);
      if (!c || !c.isFunction || !c.visible) { trace = null; }
      else {
        const y = c.f(trace.x);
        if (Number.isFinite(y)) {
          trace.y = y;
          key = `t|${c.id}|${c.name}|${Fmt.point(trace.x, y, dec + 1)}|${Fmt.comma}`;
          anchor = { x: trace.x, y };
          if (key !== bubbleKey) buildTraceBubble(c, trace.x, y, dec);
        }
      }
    } else if (model.selectedFeature) {
      const f = findFeature(model.selectedFeature);
      if (f) {
        key = `f|${f.id}|${Fmt.point(f.x, f.y, dec)}|${Fmt.comma}`;
        anchor = { x: f.x, y: f.y };
        if (key !== bubbleKey) buildFeatureBubble(f, dec);
      }
    }
    bubbleKey = key;
    bubbleAnchor = anchor;
    if (!key) { bubble.hidden = true; return; }
    positionBubble();
  }

  function buildFeatureBubble(f, dec) {
    buildBubble(featureTitle(f), Fmt.point(f.x, f.y, dec), [
      actionBtn('x → Rechner', () => push(f.x, `${f.shortName || 'P'} x`), { aria: 'x-Wert in den Rechner' }),
      actionBtn('y → Rechner', () => push(f.y, `${f.shortName || 'P'} y`), { aria: 'y-Wert in den Rechner' }),
      el('button', { type: 'button', class: 'btn small icon-only', 'aria-label': 'Weitere Aktionen', onclick: () => openFeatureSheet(f.id) }, dotsIcon()),
    ]);
  }

  function buildTraceBubble(c, x, y, dec) {
    const acts = [
      actionBtn(`${c.name}(${Fmt.num(x, 3)}) → Rechner`, () => push(y, `${c.name}(x)`), { aria: `${c.name}(${Fmt.num(x, 3)}) in den Rechner` }),
      actionBtn('x → Rechner', () => push(x, 'x'), { aria: 'x-Wert in den Rechner' }),
    ];
    const m = c.d1 ? c.d1(x) : NaN;
    if (Number.isFinite(m)) {
      acts.push(actionBtn('Tangente', () => addLine(m, x, y, 't'), { aria: `Tangente an ${c.name} bei x = ${Fmt.num(x, 3)} einfügen` }));
      if (m !== 0) acts.push(actionBtn('Normale', () => addLine(-1 / m, x, y, 'n'), { aria: `Normale an ${c.name} bei x = ${Fmt.num(x, 3)} einfügen` }));
    }
    buildBubble(`${c.name}(${c.variable})`, Fmt.point(x, y, dec + 1), acts);
  }

  function positionBubble() {
    if (!bubbleKey || !bubbleAnchor || !render || !sizeCSS) { bubble.hidden = true; return; }
    const ax = render.px(bubbleAnchor.x), ay = render.py(bubbleAnchor.y);
    const W = sizeCSS.width, H = sizeCSS.height;
    const inside = Number.isFinite(ax) && Number.isFinite(ay) && ax >= 0 && ax <= W && ay >= 0 && ay <= H;
    if (!inside) { bubble.hidden = true; return; }
    if (bubble.hidden) { bubble.hidden = false; bubbleSize = null; }
    if (!bubbleSize) bubbleSize = { w: bubble.offsetWidth, h: bubble.offsetHeight };
    const { w, h } = bubbleSize;
    const left = Math.min(Math.max(ax - w / 2, 8), Math.max(8, W - w - 8));
    let top = ay - h - 18;
    if (top < 8) top = ay + 18;
    if (top + h > H - 8) top = Math.max(8, Math.min(ay - h - 18, H - h - 8));
    bubble.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  }

  /// Weitere Aktionen zu einem Punkt (Kontextmenü in GraphView/FeatureLine)
  function openFeatureSheet(id) {
    const f = findFeature(id);
    if (!f) return;
    let sheet = null;
    const pinnedNow = model.pinned.has(f.id);
    const items = [
      ['Punkt in den Rechner (Y = y, X = x)', () => pushPoint(f)],
      ['x-Wert in den Rechner', () => push(f.x, `${f.shortName || 'P'} x`)],
      ['y-Wert in den Rechner', () => push(f.y, `${f.shortName || 'P'} y`)],
      ['Koordinaten kopieren', async () => {
        const ok = await copyText(f.kind === 'point' ? (f.shortName + Fmt.point(f.x, f.y, model.settings.decimals)) : model.label(f));
        toast(ok ? 'Koordinaten kopiert' : 'Kopieren nicht möglich');
      }],
      ['Ansicht hier zentrieren', () => { stopMotion(); model.center(f.x, f.y); refresh(); }],
    ];
    if (f.kind !== 'point') {
      items.push([pinnedNow ? 'Beschriftung entfernen' : 'Beschriftung anheften', () => {
        if (model.pinned.has(f.id)) model.pinned.delete(f.id); else model.pinned.add(f.id);
        requestDraw();
      }]);
    }
    const listNode = el('div', { class: 'list sheet-list' }, items.map(([label, fn]) =>
      el('button', { type: 'button', class: 'list-item', onclick: () => { fn(); sheet?.close(); } }, label)));
    sheet = openSheet(featureTitle(f) + ' ' + Fmt.point(f.x, f.y, model.settings.decimals), listNode);
  }

  /// Tangente/Normale y = m·x + b als neue Zeile (GraphNSView.addLine)
  function addLine(m, x0, y0, prefix) {
    const b = y0 - m * x0;
    const used = new Set(model.compiled.map((c) => c.name));
    let name = prefix;
    let k = 1;
    while (used.has(name)) { name = `${prefix}${k}`; k += 1; }
    const mText = Fmt.plain(roundHalfAway(m * 1e6) / 1e6);
    const bAbs = Fmt.plain(roundHalfAway(Math.abs(b) * 1e6) / 1e6);
    const text = `${name}(x) = ${mText}*x ` + (b < 0 ? '- ' : '+ ') + bAbs;
    model.addRow(text);
    trace = null;
    refresh();
    selectionChanged();
    toast(`${prefix === 't' ? 'Tangente' : 'Normale'} ${name}(x) eingefügt`);
  }

  /// Spur: Kurve, die dem Punkt p senkrecht am nächsten liegt (maxDist: nur Maus-Hover wie Swift, 16 pt)
  function traceAt(p, { snap = true, maxDist = Infinity } = {}) {
    if (!render) return null;
    const x = render.xAt(p.x);
    let best = null;
    for (const c of model.compiled) {
      if (!(c.isFunction && c.visible) || !c.f) continue;
      const y = c.f(x);
      if (!Number.isFinite(y)) continue;
      const d = Math.abs(render.py(y) - p.y);
      if (d < maxDist && (!best || d < best.d)) best = { c, y, d };
    }
    if (!best) return null;
    let tx = x, ty = best.y, snapped = null;
    if (snap && lastAnalysis && model.settings.features) {
      let bd = 10;
      for (const f of (lastAnalysis.perRow.get(best.c.id) || [])) {
        const d = Math.abs(render.px(f.x) - p.x);
        if (d < bd) { bd = d; tx = f.x; ty = f.y; snapped = f.id; }
      }
    }
    return { rowId: best.c.id, x: tx, y: ty, fixed: false, snapped };
  }

  function startTrace(p) {
    if (!gest) return;
    gest.mode = 'trace';
    haptic();
    if (model.selectedFeature) { model.selectedFeature = null; markSelection(); }
    moveTrace(p);
    updateBubble();
  }

  function moveTrace(p) {
    const t = traceAt(p, { snap: true });
    if (t && t.snapped && (!trace || trace.snapped !== t.snapped)) haptic();
    trace = t || { rowId: null, x: render ? render.xAt(p.x) : 0, y: render ? render.yAt(p.y) : 0, fixed: false };
    showReadout(true);
    requestDraw();
  }

  function fixTrace() {
    if (trace && trace.rowId) trace.fixed = true; else trace = null;
    hideReadout();
    updateBubble();
    requestDraw();
  }

  function showReadout(top) {
    const dec = model.settings.decimals;
    let text = '';
    if (trace && trace.rowId && !trace.fixed && !trace.mouse) {
      const c = model.compiledRow(trace.rowId);
      if (c) text = `${c.name}: ${Fmt.point(trace.x, trace.y, dec + 1)}`;
    } else if (trace && !trace.rowId && !trace.fixed) {
      text = `x = ${Fmt.num(trace.x, 4)}   y = ${Fmt.num(trace.y, 4)}`;
    } else if (mousePos && render) {
      text = `x = ${Fmt.num(render.xAt(mousePos.x), 4)}   y = ${Fmt.num(render.yAt(mousePos.y), 4)}`;
    }
    if (!text) { hideReadout(); return; }
    if (readout.textContent !== text) readout.textContent = text;
    readout.classList.toggle('top', !!top);
    readout.hidden = false;
  }

  function hideReadout() {
    readout.hidden = true;
  }

  // MARK: Zeichnen (requestAnimationFrame, nur wenn nötig)

  let rafId = 0, needDraw = false, pendingView = null;
  let liveDirty = false, changedTimer = null;
  let anim = null, inertia = null, wheelUntil = 0, wheelTimer = null;

  function requestDraw() {
    needDraw = true;
    schedule();
  }

  function schedule() {
    if (!rafId && typeof requestAnimationFrame === 'function') rafId = requestAnimationFrame(frame);
  }

  function frame(ts) {
    rafId = 0;
    if (anim) stepAnim(ts);
    if (inertia) stepInertia(ts);
    if (pendingView) {
      model.view = pendingView;
      pendingView = null;
      needDraw = true;
      liveChanged();
    }
    if (needDraw) { needDraw = false; draw(false); }
    if (anim || inertia) schedule();
  }

  /// Sichtfenster während einer Geste geändert: Sichern/Aktualisieren der anderen Bereiche gebündelt
  function liveChanged() {
    liveDirty = true;
    if (!changedTimer) changedTimer = setTimeout(() => { changedTimer = null; if (liveDirty) { liveDirty = false; changed(); } }, 300);
  }

  /// Geste zu Ende: Änderung melden, frische Analyse zeichnen, Liste nachziehen
  function endLive() {
    clearTimeout(changedTimer);
    changedTimer = null;
    if (liveDirty) { liveDirty = false; changed(); }
    requestDraw();
    scheduleAnalysisViews();
  }

  function gestureActive() {
    return !!((gest && (gest.mode === 'pan' || gest.mode === 'pinch')) || anim || inertia || now() < wheelUntil);
  }

  function currentView() {
    const v = pendingView || model.view;
    return { xMin: v.xMin, xMax: v.xMax, yMin: v.yMin, yMax: v.yMax };
  }

  function stopMotion() {
    anim = null;
    inertia = null;
    if (pendingView) { model.view = pendingView; pendingView = null; liveDirty = true; }
  }

  /// Analyse fürs Zeichnen: während Gesten die letzte weiterverwenden, wenn sie teuer war
  function analysisForDraw() {
    if (!model.settings.features) return { analysis: null, stale: false };
    if (gestureActive() && lastAnalysis && lastAnalysisMs > 6) return { analysis: lastAnalysis, stale: true };
    const t0 = now();
    const a = model.analysis();
    const dt = now() - t0;
    if (a !== lastAnalysis) { lastAnalysis = a; if (dt > 0.3) lastAnalysisMs = dt; }
    return { analysis: a, stale: false };
  }

  function drawKey() {
    const v = model.view, s = model.settings, it = model.integral;
    const sp = model.statPoints;
    return [sizeCSS.width, sizeCSS.height, dpr, v.xMin, v.xMax, v.yMin, v.yMax, model.revision, model.paramRevision,
      s.grid, s.features, s.inflections, s.allLabels, s.degrees, s.piAxis, s.decimals, s.curveNames, Fmt.comma,
      theme(), model.selectedFeature, [...model.pinned].join(','),
      it ? `${it.function},${it.a},${it.b},${it.visible}` : '', sp.length ? `${sp.length},${sp[0]},${sp[sp.length - 1]}` : '',
      trace ? `${trace.rowId},${trace.x},${trace.y},${trace.fixed}` : '', hoverId, expanded].join('|');
  }

  function toolsRect() {
    if (!sizeCSS) return null;
    return { x: sizeCSS.width - 60, y: 0, w: 60, h: 3 * 44 + 2 * 6 + 16 };
  }

  function draw(force) {
    if (!stageShown || !sizeCSS) return;
    const w = sizeCSS.width, h = sizeCSS.height;
    const wantW = Math.max(1, Math.round(w * dpr)), wantH = Math.max(1, Math.round(h * dpr));
    if (canvas.width !== wantW || canvas.height !== wantH) { canvas.width = wantW; canvas.height = wantH; force = true; }
    const key = drawKey();
    if (!force && key === lastKey) return;
    const g = canvas.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    model.canvasSize = { width: w, height: h };
    const { analysis, stale } = analysisForDraw();
    render = drawGraph(g, model, {
      width: w, height: h, theme: theme(), dpr, analysis, labels: true, highlight: hoverId,
      tickFactor: w < 600 ? 6 : 7.5, reserved: toolsRect(),
    });
    hits = render.hits;
    drawOverlay(g);
    lastKey = stale ? key + '|alt' : key;
    updateBubble();
    if (trace && !trace.fixed) showReadout(!trace.mouse);
    else if (mousePos) showReadout(false);
  }

  /// Spur über der Zeichnung (drawOverlay in GraphView.swift)
  function drawOverlay(g) {
    if (!trace || !trace.rowId || hoverId || !render) return;
    const c = model.compiledRow(trace.rowId);
    if (!c || !c.f || !c.visible) return;
    const y = trace.snapped ? trace.y : c.f(trace.x);
    if (!Number.isFinite(y)) return;
    const col = render.colors;
    const p = { x: render.px(trace.x), y: render.py(y) };
    g.save();
    g.strokeStyle = rgba(col.muted, 0.6);
    g.lineWidth = 1;
    g.setLineDash([3, 3]);
    g.beginPath(); g.moveTo(p.x, 0); g.lineTo(p.x, sizeCSS.height); g.stroke();
    g.setLineDash([]);
    g.fillStyle = col.surface;
    g.beginPath(); g.arc(p.x, p.y, 7, 0, Math.PI * 2); g.fill();
    g.fillStyle = paletteColor(c.color, isDark());
    g.beginPath(); g.arc(p.x, p.y, 5, 0, Math.PI * 2); g.fill();
    g.restore();
    if (trace.mouse) render.placeLabel(`${c.name}: ` + Fmt.point(trace.x, y, model.settings.decimals + 1), p.x, p.y);
  }

  // MARK: Größe der Zeichenfläche

  function layoutMain() {
    const H = main.clientHeight;
    if (H <= 0) return;
    const hh = handle.offsetHeight || 22;
    let h;
    if (expanded) h = H - hh;
    else {
      const flach = !isSplit() && window.innerWidth > window.innerHeight && window.innerHeight < 600;   // iPhone quer
      const f = typing ? 0.36 : (isSplit() ? fractions.split : (flach ? Math.max(fractions.portrait, 0.74) : fractions.portrait));
      h = Math.round(H * f);
      h = Math.max(Math.min(h, H - hh - 72), Math.min(120, H - hh));
    }
    if (h !== lastStageH) { lastStageH = h; stage.style.height = `${h}px`; }
  }

  function onStageResize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (w < 2 || h < 2) { stageShown = false; return; }
    const wasShown = stageShown;
    stageShown = true;
    dpr = Math.min(3, Math.max(1, (typeof window !== 'undefined' && window.devicePixelRatio) || 1));
    if (wasShown && sizeCSS && sizeCSS.width === w && sizeCSS.height === h &&
        canvas.width === Math.round(w * dpr) && canvas.height === Math.round(h * dpr)) { requestDraw(); return; }
    const size2 = { width: w, height: h };
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    const old = sizeCSS;
    sizeCSS = size2;
    model.canvasSize = size2;
    const saved = ui.groesse;
    if (old && (old.width !== w || old.height !== h)) {
      stopMotion();
      model.resize(old, size2);   // Maßstab und Mittelpunkt bleiben
    } else if (!old && isDefaultView(model.view)) {
      model.standardView(size2);  // erste Anzeige: gleiche Einheiten statt verzerrter Grundansicht
    } else if (!old && saved && saved.width > 10 && saved.height > 10 && (saved.width !== w || saved.height !== h)) {
      // Das gesicherte Sichtfenster gehört zur Flächengröße beim Sichern (z. B. beim Tippen verkleinert oder quer):
      // beim ersten Anzeigen nach dem Start von dort umrechnen, sonst sind die Achsen verzerrt
      model.resize(saved, size2);
    }
    if (!saved || saved.width !== w || saved.height !== h) { ui.groesse = size2; saveUI(ui); }
    bubbleSize = null;
    draw(true);
  }

  function isDefaultView(v) {
    const d = defaultView();
    return v.xMin === d.xMin && v.xMax === d.xMax && v.yMin === d.yMin && v.yMax === d.yMax;
  }

  function setExpanded(on) {
    expanded = !!on;
    root.classList.toggle('expanded', expanded);
    clear(bExpand);
    bExpand.appendChild(expanded ? myIcon('shrink') : icon('fullscreen'));
    const label = expanded ? 'Zeichenfläche verkleinern' : 'Zeichenfläche vergrößern';
    bExpand.setAttribute('aria-label', label);
    bExpand.title = label;
    handle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    layoutMain();
  }

  function setTyping(on) {
    if (typing === on) return;
    typing = on;
    root.classList.toggle('typing', on);
    if (!expanded) layoutMain();
  }

  // Griff zwischen Zeichenfläche und Liste: tippen = vergrößern/zurück, ziehen = Aufteilung ändern
  let hdrag = null;
  handle.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    hdrag = { id: e.pointerId, y0: e.clientY, h0: stage.offsetHeight, H: main.clientHeight, moved: false };
    try { handle.setPointerCapture(e.pointerId); } catch (err) { /* ohne Erfassen weiter */ }
  });
  handle.addEventListener('pointermove', (e) => {
    if (!hdrag || e.pointerId !== hdrag.id) return;
    const dy = e.clientY - hdrag.y0;
    if (!hdrag.moved && Math.abs(dy) < 6) return;
    if (!hdrag.moved) {
      hdrag.moved = true;
      if (expanded) { expanded = false; root.classList.remove('expanded'); setExpanded(false); hdrag.h0 = stage.offsetHeight; hdrag.y0 = e.clientY; }
    }
    const hh = handle.offsetHeight || 22;
    const h = Math.round(Math.min(Math.max(hdrag.h0 + dy, 110), hdrag.H - hh - 72));
    const f = Math.min(0.88, Math.max(0.2, h / hdrag.H));
    if (typing) return;
    if (isSplit()) fractions.split = f; else fractions.portrait = f;
    layoutMain();
  });
  const handleEnd = (e) => {
    if (!hdrag || e.pointerId !== hdrag.id) return;
    const moved = hdrag.moved;
    hdrag = null;
    if (!moved && e.type === 'pointerup') { setExpanded(!expanded); return; }
    if (moved) { ui.anteil = { ...fractions }; saveUI(ui); }
  };
  handle.addEventListener('pointerup', handleEnd);
  handle.addEventListener('pointercancel', handleEnd);
  handle.addEventListener('click', (e) => { if (e.detail === 0) setExpanded(!expanded); });   // Tastatur/Bedienungshilfen

  // MARK: Gesten auf der Zeichenfläche

  const pointers = new Map();   // Zeiger-id → {x, y}
  let gest = null;              // { mode: 'pending'|'pan'|'pinch'|'trace', … }
  let lpTimer = null;
  let lastTap = null;
  let canvasRect = null;

  function localPos(e) {
    const r = canvasRect || canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function hitAt(p, pointerType) {
    let best = null;
    for (const h of hits) {
      const d = Math.hypot(h.x - p.x, h.y - p.y);
      const lim = pointerType === 'mouse' ? Math.max(10, h.r + 4) : Math.max(22, h.r + 14);
      if (d <= lim && (!best || d < best.d)) best = { h, d };
    }
    return best ? best.h : null;
  }

  function firstTwo() {
    const it = [...pointers.entries()];
    return [it[0], it[1]];
  }

  function startPinch() {
    const [[ia, a], [ib, b]] = firstTwo();
    gest = { mode: 'pinch', ids: [ia, ib], a0: { ...a }, b0: { ...b }, view0: currentView(), axis: ViewMath.pinchMode(a, b) };
  }

  function startPan(id, p) {
    gest = { mode: 'pan', id, start: { ...p }, view0: currentView(), samples: [{ t: now(), x: p.x, y: p.y }], touch: true };
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button === 2) { contextAt(localPos(e)); return; }
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    anim = null;
    if (inertia) { inertia = null; }
    canvasRect = canvas.getBoundingClientRect();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ohne Erfassen weiter */ }
    const p = localPos(e);
    pointers.set(e.pointerId, p);
    if (pointers.size === 1) {
      gest = { mode: 'pending', id: e.pointerId, start: p, last: p, touch: e.pointerType !== 'mouse', samples: [] };
      clearTimeout(lpTimer);
      lpTimer = setTimeout(() => { if (gest && gest.mode === 'pending') startTrace(gest.last); }, 450);
      if (hoverId) { hoverId = null; requestDraw(); }
      if (trace && trace.mouse) trace = null;
    } else if (pointers.size >= 2 && gest && gest.mode !== 'pinch') {
      clearTimeout(lpTimer);
      if (gest.mode === 'trace') { trace = null; hideReadout(); }
      startPinch();
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) {
      if (e.pointerType === 'mouse' && !gest) hover(localPos(e));
      return;
    }
    const p = localPos(e);
    pointers.set(e.pointerId, p);
    if (!gest) return;
    if (gest.mode === 'pending') {
      gest.last = p;
      if (Math.hypot(p.x - gest.start.x, p.y - gest.start.y) <= (gest.touch ? 8 : 3)) return;
      clearTimeout(lpTimer);
      gest.mode = 'pan';
      gest.view0 = currentView();
      gest.samples = [{ t: now(), x: gest.start.x, y: gest.start.y }];
      if (trace && !trace.fixed) { trace = null; hideReadout(); }
    }
    if (gest.mode === 'pan' && e.pointerId === gest.id) {
      const v = ViewMath.pan(gest.view0, p.x - gest.start.x, p.y - gest.start.y, size());
      if (v) { pendingView = v; schedule(); }
      gest.samples.push({ t: now(), x: p.x, y: p.y });
      if (gest.samples.length > 8) gest.samples.shift();
    } else if (gest.mode === 'pinch') {
      const a = pointers.get(gest.ids[0]), b = pointers.get(gest.ids[1]);
      if (a && b) {
        const v = ViewMath.pinch(gest.view0, gest.a0, gest.b0, a, b, size(), gest.axis);
        if (v) { pendingView = v; schedule(); }
      }
    } else if (gest.mode === 'trace') {
      gest.last = p;
      moveTrace(p);
    }
  });

  function pointerEnd(e, cancelled) {
    if (!pointers.has(e.pointerId)) return;
    const p = localPos(e);
    pointers.delete(e.pointerId);
    if (!gest) { if (pointers.size === 0) canvasRect = null; return; }
    const mode = gest.mode;
    if (mode === 'pending') {
      clearTimeout(lpTimer);
      if (pointers.size === 0) { gest = null; canvasRect = null; if (!cancelled) tapAt(p, e.pointerType); }
      return;
    }
    if (mode === 'pan') {
      if (e.pointerId !== gest.id) return;
      if (pointers.size === 0) {
        const vel = cancelled ? null : velocity(gest.samples);
        const view0 = currentView();
        gest = null;
        canvasRect = null;
        if (vel) startInertia(vel, view0); else endLive();
      }
      return;
    }
    if (mode === 'pinch') {
      if (pointers.size >= 2) startPinch();
      else if (pointers.size === 1) { const [[id, q]] = [...pointers.entries()]; startPan(id, q); }
      else { gest = null; canvasRect = null; endLive(); }
      return;
    }
    if (mode === 'trace') {
      if (pointers.size === 0) {
        gest = null;
        canvasRect = null;
        if (cancelled) { trace = null; hideReadout(); requestDraw(); } else fixTrace();
      }
    }
  }

  canvas.addEventListener('pointerup', (e) => pointerEnd(e, false));
  canvas.addEventListener('pointercancel', (e) => pointerEnd(e, true));
  canvas.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse' && !pointers.has(e.pointerId)) {
      mousePos = null;
      let dirty = false;
      if (hoverId) { hoverId = null; dirty = true; }
      if (trace && trace.mouse && !trace.fixed) { trace = null; dirty = true; }
      hideReadout();
      if (dirty) requestDraw();
    }
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  // Safari: Seitenzoom verhindern; am Mac kommt das Trackpad-Zoomen nur als gesture*-Ereignis
  // (auf dem iPhone laufen dabei Zeiger-Ereignisse mit – dann zählt nur die Zwei-Finger-Geste oben)
  let gz = null;
  stage.addEventListener('gesturestart', (e) => {
    e.preventDefault();
    if (pointers.size) return;
    const r = canvas.getBoundingClientRect();
    gz = { view0: currentView(), p: { x: (e.clientX ?? r.left + r.width / 2) - r.left, y: (e.clientY ?? r.top + r.height / 2) - r.top } };
  });
  stage.addEventListener('gesturechange', (e) => {
    e.preventDefault();
    if (!gz || pointers.size || !(e.scale > 0)) return;
    const v = ViewMath.zoom(gz.view0, 1 / Math.max(0.05, e.scale), gz.p.x, gz.p.y, size());
    if (v) { pendingView = v; wheelUntil = now() + 200; schedule(); }
  });
  stage.addEventListener('gestureend', (e) => {
    e.preventDefault();
    if (gz) { gz = null; endLive(); }
  });

  function velocity(samples) {
    if (!samples || samples.length < 2) return null;
    const last = samples[samples.length - 1];
    if (now() - last.t > 60) return null;          // vor dem Loslassen angehalten
    let first = samples[0];
    for (const s of samples) if (last.t - s.t <= 90) { first = s; break; }
    const dt = last.t - first.t;
    if (dt < 8) return null;
    const vx = (last.x - first.x) / dt, vy = (last.y - first.y) / dt;
    return Math.hypot(vx, vy) > 0.35 ? { vx, vy } : null;
  }

  /// Nachlaufen nach dem Verschieben (abklingende Geschwindigkeit)
  function startInertia(vel, view0) {
    inertia = { vx: vel.vx, vy: vel.vy, t: now(), view0, ox: 0, oy: 0 };
    schedule();
  }

  function stepInertia(ts) {
    const it = inertia;
    const dt = Math.min(40, Math.max(0, ts - it.t));
    it.t = ts;
    const decay = Math.pow(0.94, dt / 16.7);
    it.vx *= decay; it.vy *= decay;
    it.ox += it.vx * dt; it.oy += it.vy * dt;
    const v = ViewMath.pan(it.view0, it.ox, it.oy, size());
    if (v) pendingView = v;
    if (!v || Math.hypot(it.vx, it.vy) < 0.02) { inertia = null; setTimeout(endLive, 0); }
  }

  /// Weiche Ansichtsänderung (Doppeltippen, Lupen-Knöpfe)
  function animateView(target, ms = 200) {
    if (!target) return;
    inertia = null;
    anim = { from: currentView(), to: target, t0: now(), ms };
    schedule();
  }

  function stepAnim(ts) {
    const a = anim;
    const t = Math.min(1, Math.max(0, (ts - a.t0) / a.ms));
    const e = 1 - Math.pow(1 - t, 3);
    pendingView = t >= 1 ? a.to : ViewMath.lerp(a.from, a.to, e);
    if (t >= 1) { anim = null; setTimeout(endLive, 0); }
  }

  function zoomButton(f) {
    const s = size();
    animateView(ViewMath.zoom(currentView(), f, s.width / 2, s.height / 2, s));
  }

  function tapAt(p, pointerType) {
    const hit = hitAt(p, pointerType);
    if (hit) {
      lastTap = null;
      toggleFeature(hit.feature.id);
      return;
    }
    const t = now();
    if (lastTap && t - lastTap.t < 330 && Math.hypot(p.x - lastTap.p.x, p.y - lastTap.p.y) < 30) {
      lastTap = null;
      animateView(ViewMath.zoom(currentView(), 0.5, p.x, p.y, size()));   // Doppeltippen: hineinzoomen
      return;
    }
    lastTap = { t, p };
    const a = document.activeElement;
    if (a && a.tagName === 'INPUT' && list.contains(a)) a.blur();   // Tippen auf die Fläche schließt die Tastatur
    let dirty = false;
    if (trace) { trace = null; hideReadout(); dirty = true; }
    if (model.selectedFeature) { model.selectedFeature = null; dirty = true; }
    if (dirty) selectionChanged();
  }

  /// Rechtsklick (Maus): Merkmal auswählen oder Kurvenpunkt mit Aktionen zeigen (Kontextmenü in Swift)
  function contextAt(p) {
    const hit = hitAt(p, 'mouse');
    if (hit) {
      if (model.selectedFeature !== hit.feature.id) toggleFeature(hit.feature.id);
      openFeatureSheet(hit.feature.id);
      return;
    }
    const t = traceAt(p, { snap: false, maxDist: 16 });
    if (t) {
      trace = { ...t, fixed: true };
      model.selectedFeature = null;
      hideReadout();
      selectionChanged();
    }
  }

  /// Maus ohne gedrückte Taste: Merkmal hervorheben, sonst Spur und Koordinaten (mouseMoved in Swift)
  function hover(p) {
    if (!render) return;
    mousePos = p;
    const hit = hitAt(p, 'mouse');
    const id = hit ? hit.feature.id : null;
    let dirty = id !== hoverId;
    hoverId = id;
    if (!(trace && trace.fixed)) {
      const t = id ? null : traceAt(p, { snap: false, maxDist: 16 });
      const nt = t ? { ...t, mouse: true } : null;
      if ((nt && (!trace || trace.rowId !== nt.rowId || trace.x !== nt.x)) || (!nt && trace)) dirty = true;
      trace = nt;
    }
    showReadout(false);
    if (dirty) requestDraw();
  }

  // Mausrad / Trackpad: zoomen um den Zeiger (Trackpad-Pinch kommt als Rad mit ctrlKey), ⇧ + Rad verschiebt
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    anim = null;
    inertia = null;
    const s = size();
    const p = localPos(e);
    let dx = e.deltaX, dy = e.deltaY;
    if (e.deltaMode === 1) { dx *= 16; dy *= 16; } else if (e.deltaMode === 2) { dx *= s.width; dy *= s.height; }
    const base = currentView();
    let v;
    if (e.shiftKey && !e.ctrlKey) {
      if (dx === 0) { dx = dy; dy = 0; }
      v = ViewMath.pan(base, -dx, -dy, s);
    } else {
      const k = e.ctrlKey ? 0.01 : 0.0025;
      const f = Math.min(Math.max(Math.exp(dy * k), 0.5), 2);
      v = ViewMath.zoom(base, f, p.x, p.y, s);
    }
    if (v) { pendingView = v; schedule(); }
    wheelUntil = now() + 200;
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(endLive, 220);
  }, { passive: false });

  // MARK: Einstellungen (GraphSettingsView)

  function openSettings() {
    const sw = (label, key) => switchControl(label, !!model.settings[key], (on) => { model.setSetting(key, on); refresh(); });
    const decOut = el('span', { class: 'gs-dec mono', text: String(model.settings.decimals) });
    const bMinus = el('button', { type: 'button', class: 'btn icon', 'aria-label': 'Weniger Nachkommastellen' }, icon('minus'));
    const bPlus = el('button', { type: 'button', class: 'btn icon', 'aria-label': 'Mehr Nachkommastellen' }, icon('plus'));
    const paintDec = () => {
      const n = model.settings.decimals;
      decOut.textContent = String(n);
      bMinus.disabled = n <= 1;
      bPlus.disabled = n >= 8;
    };
    const step = (d) => {
      const n = Math.min(8, Math.max(1, (model.settings.decimals | 0) + d));
      model.setSetting('decimals', n);
      paintDec();
      refresh();
    };
    bMinus.addEventListener('click', () => step(-1));
    bPlus.addEventListener('click', () => step(1));
    paintDec();

    const viewField = (label, key) => {
      const apply = (s, input) => {
        let v;
        try { v = evaluateConstant(s); } catch (e) { input.classList.add('invalid'); return; }
        if (!Number.isFinite(v)) { input.classList.add('invalid'); return; }
        const vp = { ...model.view, [key]: v };
        if (vp.xMax > vp.xMin && vp.yMax > vp.yMin) {
          input.classList.remove('invalid');
          stopMotion();
          model.view = vp;
          changed();
          refresh();
        } else input.classList.add('invalid');
      };
      const f = numberField(Fmt.num(model.view[key], 4), {
        label: `${label} (${key})`,
        onEnter: (s, input) => { apply(s, input); input.blur(); },
        onChange: (s, input) => apply(s, input),
      });
      return el('label', { class: 'gs-field' }, el('span', { class: 'lbl', text: label }), f);
    };

    const content = el('div', { class: 'col graph-settings' },
      sw('Gitter', 'grid'),
      sw('Merkmale (Punkte) anzeigen', 'features'),
      sw('Wende- und Sattelpunkte', 'inflections'),
      sw('Alle Merkmale beschriften', 'allLabels'),
      sw('Funktionsnamen am Graphen', 'curveNames'),
      el('hr', { class: 'gs-sep' }),
      sw('x-Achse in Vielfachen von π', 'piAxis'),
      sw('Winkel in Grad (sin 90 = 1)', 'degrees'),
      el('div', { class: 'row gs-stepper' }, el('span', { class: 'grow', text: 'Nachkommastellen' }), bMinus, decOut, bPlus),
      el('hr', { class: 'gs-sep' }),
      el('h3', { text: 'Sichtfenster' }),
      el('div', { class: 'gs-grid' }, viewField('x von', 'xMin'), viewField('bis', 'xMax'), viewField('y von', 'yMin'), viewField('bis', 'yMax')),
      el('div', { class: 'row wrap gs-buttons' },
        el('button', { type: 'button', class: 'btn', onclick: () => { model.pinned = new Set(); refresh(); toast('Beschriftungen entfernt'); } }, myIcon('tag'), 'Beschriftungen entfernen')));
    openSheet('Darstellung', content, { actions: [{ label: 'Fertig', primary: true }] });
  }

  // MARK: Teilen, Leeren

  function sharePNG() {
    if (!sizeCSS) { toast('Graph ist nicht sichtbar'); return; }
    const w = sizeCSS.width, h = sizeCSS.height, k = 2;
    const c = document.createElement('canvas');
    c.width = Math.round(w * k);
    c.height = Math.round(h * k);
    const g = c.getContext('2d');
    if (!g) { toast('Bild nicht möglich'); return; }
    g.setTransform(k, 0, 0, k, 0, 0);
    drawGraph(g, model, { width: w, height: h, theme: theme(), dpr: k, labels: true, tickFactor: w < 600 ? 6 : 7.5,
      analysis: model.settings.features ? model.analysis() : null });
    let blob;
    try { blob = dataURLToBlob(c.toDataURL('image/png')); } catch (e) { toast('Bild nicht möglich'); return; }
    c.width = 0;   // Canvas-Speicher sofort freigeben (iOS)
    c.height = 0;
    shareOrDownload(blob, 'fx991-Graph.png', 'fx-991 Trainer – Graph');
  }

  async function askClear() {
    const ok = await confirmSheet('Alle Funktionen, Parameter, Flächen und Messwerte werden entfernt.',
      { title: 'Graph leeren?', ok: 'Graph leeren', danger: true });
    if (!ok) return;
    stopMotion();
    trace = null;
    hoverId = null;
    expandedRows.clear();
    if (typeof ctx.clearGraph === 'function') ctx.clearGraph(); else { model.clearAll(); changed(); }
    refresh();
  }

  // MARK: Tastatur (Eingabefelder der Liste): Zeichenfläche beim Tippen verkleinern

  list.addEventListener('focusin', (e) => {
    const t = e.target;
    if (!(t && t.tagName === 'INPUT')) return;
    clearTimeout(typingTimer);
    setTyping(true);
    setTimeout(() => ensureVisible(t), 350);
  });
  let typingTimer = null;
  list.addEventListener('focusout', () => {
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
      const a = document.activeElement;
      if (!(a && a.tagName === 'INPUT' && list.contains(a))) setTyping(false);
    }, 150);
  });

  /// Eingabefeld über der Tastatur (und der Rechen-Leiste) sichtbar halten
  function ensureVisible(input) {
    if (document.activeElement !== input) return;
    const vv = window.visualViewport;
    const visibleBottom = (vv ? vv.height + vv.offsetTop : window.innerHeight) - 58;
    const r = input.getBoundingClientRect();
    const lr = list.getBoundingClientRect();
    const bottom = Math.min(visibleBottom, lr.bottom);
    if (r.bottom > bottom) list.scrollTop += r.bottom - bottom + 12;
    else if (r.top < lr.top) list.scrollTop -= lr.top - r.top + 12;
  }

  if (typeof window !== 'undefined' && window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
      const a = document.activeElement;
      if (typing && a && a.tagName === 'INPUT' && list.contains(a)) setTimeout(() => ensureVisible(a), 60);
    });
  }

  // MARK: Beobachter

  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(() => layoutMain()).observe(main);
    new ResizeObserver(() => onStageResize()).observe(stage);
  } else if (typeof window !== 'undefined') {
    window.addEventListener('resize', () => { layoutMain(); onStageResize(); });
  }

  // MARK: Aktualisieren

  /// Nach Modelländerungen: Liste nur abgleichen (Fokus bleibt), Analyse-Teile verzögert, Zeichnen per rAF.
  /// {force: true} (z. B. Erscheinungsbild, Dezimaltrennzeichen): alles neu beschriften und zeichnen
  function refresh(opts) {
    if (opts && opts.force) {
      lastKey = '';
      tableKey = null;
      bubbleKey = null;
      namesKey = null;
      valueKey = null;
      for (const v of views.values()) { v.last = {}; v.chipsKey = null; }
      for (const pv of paramViews.values()) pv.last = {};
    }
    const split = isSplit();
    if (split !== lastSplit) { lastSplit = split; layoutMain(); }
    updateRows();
    updateParams();
    updateIntegral();
    scheduleAnalysisViews();
    requestDraw();
  }

  refresh();

  return {
    refresh,
    show() {
      layoutMain();
      onStageResize();
      refresh();
    },
    hide() {
      clearTimeout(lpTimer);
      pointers.clear();
      gest = null;
      stopMotion();
      if (liveDirty) endLive();
      if (trace && !trace.fixed) { trace = null; hideReadout(); }
      hoverId = null;
      mousePos = null;
    },
  };
}
