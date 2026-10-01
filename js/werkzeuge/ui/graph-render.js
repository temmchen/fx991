// graph-render.js – zeichnet Koordinatensystem, Kurven, Merkmale und Beschriftungen auf eine Canvas-2D-Fläche.
// Derselbe Code zeichnet auf den Bildschirm (graph-ui.js), ins PNG (Teilen) und in den Ausdruck (print-ui.js).
// (Portierung von GraphRenderer.swift; Farben aus Theme.swift → ChartColors und Palette)
//
// drawGraph(g, model, opts) → { hits: [{feature, x, y, r}], px, py, xAt, yAt, placeLabel, colors, rect }
//   g     CanvasRenderingContext2D, vom Aufrufer so transformiert, dass 1 Einheit = 1 CSS-Pixel ist
//   opts  { width, height,                  Zeichenfläche (CSS-Pixel); x, y = linke obere Ecke (Standard 0)
//           view = model.view,               Sichtfenster {xMin, xMax, yMin, yMax}
//           theme = 'light'|'dark'|'print',  Farben wie ChartColors.light/.dark/.print
//           bw = false,                      Schwarz-Weiß mit Strichmustern (PALETTE_DASHES)
//           scale = 1,                       Faktor für Strichstärken, Punktgrößen und Schrift (Druck/PNG)
//           grid,                            fehlt → Einstellung „Gitter“; true/false; 'karo' = 5-mm-Karopapier
//           pxPerMm = null,                  nötig für 'karo'
//           step = null,                     fester Beschriftungsschritt (Druck mit Maßstab; bei 'karo' sonst
//                                            aus dem Maßstab abgeleitet: ≥ 1 cm je Einheit → 1, sonst 2)
//           features = model.settings.features,
//           labels = true,                   true: Druck → alle Merkmale beschriften, Bildschirm → angeheftete
//                                            (model.pinned); false: keine; 'all'; oder Liste/Set von Merkmal-IDs
//           selected = model.selectedFeature, highlight = null (Merkmal unter dem Mauszeiger),
//           analysis = null,                 vorberechnete model.analysis(view) (sonst selbst geholt)
//           reserved = null,                 Rechteck(e) {x, y, w, h}, die Beschriftungen frei lassen
//           dpr = 1,                         Bildpunkte je Einheit (nur für scharfe Gitterlinien)
//           tickFactor = 7.5,                Abstand der Achsenbeschriftung in Schriftgrößen
//           print = (theme === 'print'),     Druckverhalten: dünnes Gitter, keine Hervorhebung
//           lineWidth, axisWidth, fontSize, dotRadius }   Grundgrößen (vor scale) wie GraphRenderOptions
import { PALETTE_DASHES, paletteColor } from '../graph.js';
import { Fmt } from '../fmt.js';
import { FEATURE } from '../numerics.js';

// MARK: - Farben (Theme.swift → ChartColors)

export const CHART_COLORS = Object.freeze({
  light: Object.freeze({
    surface: '#FCFCFB', gridMinor: '#EFEEEA', gridMajor: '#DEDDD6', axis: '#52514E', ink: '#0B0B0B',
    inkSecondary: '#52514E', muted: '#898781', labelBackground: 'rgba(252, 252, 251, 0.92)', dark: false,
  }),
  dark: Object.freeze({
    surface: '#1A1A19', gridMinor: '#242423', gridMajor: '#33332F', axis: '#C3C2B7', ink: '#FFFFFF',
    inkSecondary: '#C3C2B7', muted: '#898781', labelBackground: 'rgba(26, 26, 25, 0.92)', dark: true,
  }),
  /// Druck: reines Weiß, kräftigere Linien
  print: Object.freeze({
    surface: '#FFFFFF', gridMinor: '#E6E6E6', gridMajor: '#BDBDBD', axis: '#000000', ink: '#000000',
    inkSecondary: '#333333', muted: '#666666', labelBackground: 'rgba(255, 255, 255, 0.9)', dark: false,
  }),
});

/// Karopapier (Druck mit Maßstab)
const KARO_COLOR = '#C9D3DC';

/// Systemschrift wie --font in app.css
export const FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, "Helvetica Neue", Arial, sans-serif';

const EMPTY_ANALYSIS = Object.freeze({ perRow: new Map(), intersections: [], all() { return []; } });

/// Ab diesem senkrechten Abstand (Punkte) zweier Abtastpunkte wird auf eine Sprungstelle geprüft
const JUMP_CHECK = 16;

/// Höchstzahl Gitterlinien bzw. Achsenmarken je Richtung. Die Schleifen zählen mit: Weit vom Ursprung und stark
/// vergrößert gilt k + 1 === k (Gleitkomma, |k| > 2⁵³) – ohne Zähler hinge die App in einer Endlosschleife.
const MAX_LINES = 1200;

// MARK: - Hilfen

/// Runden „halb von 0 weg“ wie Swift x.rounded()
function roundHalfAway(x) {
  return Math.sign(x) * Math.round(Math.abs(x));
}

function gcdInt(a, b) {
  let x = Math.abs(a), y = Math.abs(b);
  while (y) { const t = x % y; x = y; y = t; }
  return x || 1;
}

function hexRGB(hex) {
  const h = String(hex).replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/// „#2A78D6“ → „rgba(42, 120, 214, a)“
export function rgba(hex, a) {
  const [r, g, b] = hexRGB(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/// Farbe a mit dem Anteil t von Farbe b mischen (NSColor.blended(withFraction:of:))
export function mixColor(a, b, t) {
  const x = hexRGB(a), y = hexRGB(b);
  const c = x.map((v, i) => Math.round(v * (1 - t) + y[i] * t));
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}

// Rechtecke {x, y, w, h} wie CGRect
const R = (x, y, w, h) => ({ x, y, w, h });
function intersects(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}
function containsRect(a, b) {
  return b.x >= a.x && b.y >= a.y && b.x + b.w <= a.x + a.w && b.y + b.h <= a.y + a.h;
}
function containsPoint(a, p) {
  return p.x >= a.x && p.x < a.x + a.w && p.y >= a.y && p.y < a.y + a.h;
}
function inset(r, dx, dy) {
  return R(r.x + dx, r.y + dy, r.w - 2 * dx, r.h - 2 * dy);
}

/// Schöne Schrittweite 1, 2, 5, 10 · 10ⁿ
export function niceStep(raw) {
  if (!(Number.isFinite(raw) && raw > 0)) return 1;
  const e = Math.floor(Math.log10(raw));
  const b = Math.pow(10, e);
  const m = raw / b;
  const n = m < 1.5 ? 1 : (m < 3.5 ? 2 : (m < 7.5 ? 5 : 10));
  return n * b;
}

/// Schritt der feinen Gitterlinien
export function minorOf(step, pi) {
  if (pi) return step / 4;
  const e = Math.floor(Math.log10(step));
  const m = roundHalfAway(step / Math.pow(10, e));
  return step / (m === 2 ? 4 : 5);
}

/// Beschriftung einer Achsenmarke („2,5“, „−π/2“, „3π/4“)
export function tickText(v, step, pi) {
  if (pi) {
    const q = roundHalfAway(v / Math.PI * 4);   // Vielfache von π/4
    if (q === 0) return '0';
    let num = q, den = 4;
    const g = gcdInt(num, den);
    num /= g; den /= g;
    const sign = num < 0 ? '−' : '';
    const a = Math.abs(num);
    const head = a === 1 ? 'π' : `${a}π`;
    return sign + (den === 1 ? head : `${head}/${den}`);
  }
  const dec = Math.max(0, Math.trunc(-Math.floor(Math.log10(step) + 1e-9)));
  return Fmt.num(v, Math.min(dec, 8));
}

// Textbreiten zwischenspeichern (measureText ist auf dem iPhone spürbar)
const widthCache = new Map();

/// Abgerundetes Rechteck als Pfad (roundRect fehlt in älteren Browsern)
function roundRectPath(g, x, y, w, h, r) {
  g.beginPath();
  if (typeof g.roundRect === 'function') { g.roundRect(x, y, w, h, r); return; }
  const rr = Math.min(r, w / 2, h / 2);
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}

// MARK: - Zeichner

class Renderer {
  constructor(g, model, opts) {
    this.g = g;
    this.model = model;
    const o = opts || {};
    this.rect = R(o.x || 0, o.y || 0, Math.max(0, o.width || 0), Math.max(0, o.height || 0));
    const v = o.view || model.view;
    this.vp = { xMin: v.xMin, xMax: v.xMax, yMin: v.yMin, yMax: v.yMax };
    this.vw = this.vp.xMax - this.vp.xMin;
    this.vh = this.vp.yMax - this.vp.yMin;
    this.theme = CHART_COLORS[o.theme] ? o.theme : 'light';
    this.colors = CHART_COLORS[this.theme];
    this.darkCurves = this.theme === 'dark';
    this.bw = !!o.bw;
    this.print = o.print ?? (this.theme === 'print');
    const k = Number.isFinite(o.scale) && o.scale > 0 ? o.scale : 1;
    this.k = k;
    this.lineWidth = (o.lineWidth ?? 2.5) * k;
    this.axisWidth = (o.axisWidth ?? 1.3) * k;
    this.fontSize = (o.fontSize ?? 11.5) * k;
    this.dotRadius = (o.dotRadius ?? 4.5) * k;
    this.tickFactor = Number.isFinite(o.tickFactor) && o.tickFactor > 0 ? o.tickFactor : 7.5;
    this.dpr = Number.isFinite(o.dpr) && o.dpr > 0 ? o.dpr : 1;
    this.settings = model.settings;
    // Gitter: fehlt → Einstellung; 'karo' → Karopapier (5 mm)
    this.metricGrid = null;
    if (o.grid === 'karo' && Number.isFinite(o.pxPerMm) && o.pxPerMm > 0) this.metricGrid = 5 * o.pxPerMm;
    this.gridOn = o.grid === undefined || o.grid === null ? !!this.settings.grid : (o.grid !== 'karo' && !!o.grid);
    this.fixedStep = Number.isFinite(o.step) && o.step > 0 ? o.step : null;
    if (this.fixedStep === null && this.metricGrid && this.vw > 0 && this.rect.w > 0) {
      const cmPerUnit = (this.rect.w / this.vw) / (10 * o.pxPerMm);
      this.fixedStep = cmPerUnit >= 1 ? 1 : 2;
    }
    this.featuresOn = o.features ?? !!this.settings.features;
    this.selected = o.selected === undefined ? model.selectedFeature : o.selected;
    this.highlight = o.highlight ?? null;
    this.reserved = [];
    if (o.reserved) for (const r of (Array.isArray(o.reserved) ? o.reserved : [o.reserved])) if (r) this.reserved.push(R(r.x, r.y, r.w, r.h));
    this.compiled = model.compiled;
    this.analysis = o.analysis || null;
    this.labelsOpt = o.labels === undefined ? true : o.labels;
    this.placed = [];
    this.dots = [];
    this.hits = [];
    this.integralLabel = null;
    this.curFont = null;
  }

  // MARK: Umrechnung

  px(x) { return this.rect.x + (x - this.vp.xMin) / this.vw * this.rect.w; }
  py(y) { return this.rect.y + (this.vp.yMax - y) / this.vh * this.rect.h; }
  xAt(p) { return this.vp.xMin + (p - this.rect.x) / this.rect.w * this.vw; }
  yAt(p) { return this.vp.yMax - (p - this.rect.y) / this.rect.h * this.vh; }

  curveColor(i) {
    return this.bw ? '#000000' : paletteColor(i, this.darkCurves);
  }

  /// Linie der Breite lw scharf auf Bildpunkte legen (wie „rounded() + 0.5“ in Swift)
  snap(v, lw) {
    const d = this.dpr;
    const dev = Math.max(1, Math.round(lw * d));
    const off = dev % 2 ? 0.5 : 0;
    return (Math.round(v * d - off) + off) / d;
  }

  /// Hauptschrittweite der Achsen (x, y) und ob die x-Achse in π beschriftet wird
  steps() {
    if (this.fixedStep) return [this.fixedStep, this.fixedStep, false];
    const target = this.fontSize * this.tickFactor;
    const pxPerX = this.rect.w / this.vw, pxPerY = this.rect.h / this.vh;
    let sx = niceStep(target / pxPerX);
    const sy = niceStep(target / pxPerY);
    let pi = false;
    if (this.settings.piAxis && !this.settings.degrees) {
      const r = target / pxPerX / Math.PI;
      const q = r < 0.35 ? 0.25 : (r < 0.75 ? 0.5 : niceStep(r));
      sx = q * Math.PI;
      pi = true;
    }
    return [sx, sy, pi];
  }

  // MARK: Text

  setFont(bold, size) {
    const f = `${bold ? '600 ' : ''}${size}px ${FONT_FAMILY}`;
    if (this.curFont !== f) { this.g.font = f; this.curFont = f; }
    return f;
  }

  measure(s, bold, size) {
    const f = this.setFont(bold, size);
    const key = f + '\n' + s;
    let w = widthCache.get(key);
    if (w === undefined) {
      w = this.g.measureText(s).width;
      if (widthCache.size > 4000) widthCache.clear();
      widthCache.set(key, w);
    }
    return w;
  }

  textSize(s, bold = false, size = null) {
    const fs = size ?? this.fontSize;
    return { w: this.measure(s, bold, fs), h: Math.ceil(fs * 1.21) };
  }

  /// Text mit hellem/dunklem Hof zeichnen; Rückgabe: belegtes Rechteck
  text(s, x, y, color, { halo = true, bold = false, size = null } = {}) {
    const g = this.g;
    const k = this.k;
    const sz = this.textSize(s, bold, size);
    const r = R(x, y, sz.w, sz.h);
    if (halo) {
      g.fillStyle = this.colors.labelBackground;
      roundRectPath(g, x - 2 * k, y - 0.5 * k, sz.w + 4 * k, sz.h + 1 * k, 2 * k);
      g.fill();
    }
    this.setFont(bold, size ?? this.fontSize);
    g.fillStyle = color;
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    g.fillText(s, x, y + sz.h / 2);
    return r;
  }

  // MARK: Zeichnen

  draw() {
    const g = this.g;
    const rect = this.rect;
    this.placed = [...this.reserved];
    this.dots = [];
    this.hits = [];
    this.integralLabel = null;
    if (!(rect.w > 0 && rect.h > 0)) return;
    g.save();
    g.beginPath();
    g.rect(rect.x, rect.y, rect.w, rect.h);
    g.clip();
    g.fillStyle = this.colors.surface;
    g.fillRect(rect.x, rect.y, rect.w, rect.h);
    g.setLineDash([]);
    g.lineCap = 'butt';
    g.lineJoin = 'miter';
    g.globalAlpha = 1;
    if (!(this.vw > 0 && this.vh > 0 && Number.isFinite(this.vw) && Number.isFinite(this.vh))) { g.restore(); return; }
    if (!this.analysis) {
      const same = this.vp.xMin === this.model.view.xMin && this.vp.xMax === this.model.view.xMax &&
        this.vp.yMin === this.model.view.yMin && this.vp.yMax === this.model.view.yMax;
      this.analysis = this.featuresOn ? this.model.analysis(same ? null : this.vp) : EMPTY_ANALYSIS;
    }
    this.labelIDs = this.makeLabelIDs();
    const [sx, sy, pi] = this.steps();
    if (this.gridOn || this.metricGrid) this.drawGrid(sx, sy, pi);
    this.drawIntegral();
    this.drawAxes();
    this.drawVerticals();
    for (const c of this.compiled) if (c.isFunction && c.visible) this.drawCurve(c);
    this.drawStatPoints();
    this.drawTickLabels(sx, sy, pi);
    if (this.integralLabel) {
      const [s, p] = this.integralLabel;
      const r = this.text(s, p.x, p.y, this.colors.ink, { halo: true, bold: true });
      this.placed.push(r);
    }
    this.drawPoints();
    if (this.featuresOn) this.drawFeatures();
    if (this.settings.curveNames) this.drawCurveNames();
    g.restore();
    this.curFont = null;
  }

  /// Merkmale, die beschriftet werden (labelIDs in Swift)
  makeLabelIDs() {
    const l = this.labelsOpt;
    if (l === 'all' || (l === true && this.print)) return new Set(this.analysis.all().map((f) => f.id));
    if (l === true || l === 'pinned') return this.model.pinned instanceof Set ? this.model.pinned : new Set(this.model.pinned || []);
    if (l instanceof Set) return l;
    if (Array.isArray(l)) return new Set(l);
    return new Set();
  }

  drawGrid(sx, sy, pi) {
    const g = this.g, rect = this.rect, vp = this.vp;
    g.save();
    if (this.metricGrid) {
      // Karopapier: gleichmäßiges Gitter ab dem Ursprung
      const gs = this.metricGrid;
      g.strokeStyle = KARO_COLOR;
      g.lineWidth = 0.4 * this.k;
      const ox = this.px(0), oy = this.py(0);
      if (gs > 0.5 && Number.isFinite(ox) && Number.isFinite(oy)) {
        g.beginPath();
        // erste Linie über den Rest (exakt): ox − floor(…)·gs verliert bei Ursprung weit außerhalb alle Stellen
        let x = rect.x + ((((ox - rect.x) % gs) + gs) % gs);
        while (x <= rect.x + rect.w) { g.moveTo(x, rect.y); g.lineTo(x, rect.y + rect.h); x += gs; }
        let y = rect.y + ((((oy - rect.y) % gs) + gs) % gs);
        while (y <= rect.y + rect.h) { g.moveTo(rect.x, y); g.lineTo(rect.x + rect.w, y); y += gs; }
        g.stroke();
      }
      g.restore();
      return;
    }
    const mx = minorOf(sx, pi), my = minorOf(sy, false);
    const vlines = (step, color, width) => {
      if (!(step > 0)) return;
      g.strokeStyle = color;
      g.lineWidth = width;
      g.beginPath();
      if (this.vw / step < 600) {
        let k = Math.ceil(vp.xMin / step);
        for (let i = 0; i < MAX_LINES && k * step <= vp.xMax; i++) {
          const x = this.snap(this.px(k * step), width);
          g.moveTo(x, rect.y); g.lineTo(x, rect.y + rect.h);
          k += 1;
        }
      }
      g.stroke();
    };
    const hlines = (step, color, width) => {
      if (!(step > 0)) return;
      g.strokeStyle = color;
      g.lineWidth = width;
      g.beginPath();
      if (this.vh / step < 600) {
        let k = Math.ceil(vp.yMin / step);
        for (let i = 0; i < MAX_LINES && k * step <= vp.yMax; i++) {
          const y = this.snap(this.py(k * step), width);
          g.moveTo(rect.x, y); g.lineTo(rect.x + rect.w, y);
          k += 1;
        }
      }
      g.stroke();
    };
    const w = (this.print ? 0.5 : 1) * this.k;
    vlines(mx, this.colors.gridMinor, w);
    hlines(my, this.colors.gridMinor, w);
    vlines(sx, this.colors.gridMajor, w);
    hlines(sy, this.colors.gridMajor, w);
    g.restore();
  }

  drawAxes() {
    const g = this.g, rect = this.rect, vp = this.vp, k = this.k;
    const maxX = rect.x + rect.w, maxY = rect.y + rect.h;
    g.save();
    g.strokeStyle = this.colors.axis;
    g.fillStyle = this.colors.axis;
    g.lineWidth = this.axisWidth;
    const arrow = (this.print ? 6 : 8) * k;
    const labelSize = this.fontSize + 1 * k;
    if (vp.yMin <= 0 && vp.yMax >= 0) {
      const y = this.snap(this.py(0), this.axisWidth);
      g.beginPath(); g.moveTo(rect.x, y); g.lineTo(maxX - 1, y); g.stroke();
      g.beginPath();
      g.moveTo(maxX, y);
      g.lineTo(maxX - arrow * 1.4, y - arrow * 0.55);
      g.lineTo(maxX - arrow * 1.4, y + arrow * 0.55);
      g.closePath(); g.fill();
      this.text('x', maxX - arrow * 1.4 - 10 * k, y + 5 * k, this.colors.ink, { halo: true, bold: true, size: labelSize });
    }
    if (vp.xMin <= 0 && vp.xMax >= 0) {
      const x = this.snap(this.px(0), this.axisWidth);
      g.strokeStyle = this.colors.axis;
      g.fillStyle = this.colors.axis;
      g.beginPath(); g.moveTo(x, maxY); g.lineTo(x, rect.y + 1); g.stroke();
      g.beginPath();
      g.moveTo(x, rect.y);
      g.lineTo(x - arrow * 0.55, rect.y + arrow * 1.4);
      g.lineTo(x + arrow * 0.55, rect.y + arrow * 1.4);
      g.closePath(); g.fill();
      this.text('y', x + 8 * k, rect.y + 2 * k, this.colors.ink, { halo: true, bold: true, size: labelSize });
    }
    g.restore();
  }

  drawTickLabels(sx, sy, pi) {
    const g = this.g, rect = this.rect, vp = this.vp, k = this.k;
    const maxX = rect.x + rect.w, maxY = rect.y + rect.h;
    const ink = this.colors.inkSecondary;
    const fh = this.textSize('0').h;
    const tick = (x0, y0, x1, y1) => {
      g.strokeStyle = this.colors.axis;
      g.lineWidth = this.axisWidth * 0.8;
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    };
    // x-Achse
    const axisY = this.py(0);
    const ly = Math.min(Math.max(axisY + 4 * k, rect.y + 2 * k), maxY - fh - 2 * k);
    let n = Math.ceil(vp.xMin / sx);
    let lastRight = -Infinity;
    for (let i = 0; i < MAX_LINES && n * sx <= vp.xMax && this.vw / sx < 400; i++) {
      const v = n * sx;
      n += 1;
      if (Math.abs(v) < sx * 1e-6) continue;
      const s = tickText(v, sx, pi);
      const w = this.textSize(s).w;
      const x = this.px(v);
      if (x - w / 2 < rect.x + 2 * k || x + w / 2 > maxX - 22 * k) continue;
      if (vp.yMin <= 0 && vp.yMax >= 0) tick(x, axisY - 3 * k, x, axisY + 3 * k);
      // schmale Fläche (iPhone, engerer Abstand als am Mac): lange Zahlen nicht übereinander schreiben
      if (x - w / 2 < lastRight + 4 * k) continue;
      lastRight = x + w / 2;
      const r = this.text(s, x - w / 2, ly, ink);
      this.placed.push(r);
    }
    // y-Achse
    const axisX = this.px(0);
    n = Math.ceil(vp.yMin / sy);
    for (let i = 0; i < MAX_LINES && n * sy <= vp.yMax && this.vh / sy < 400; i++) {
      const v = n * sy;
      n += 1;
      if (Math.abs(v) < sy * 1e-6) continue;
      const s = tickText(v, sy, false);
      const sz = this.textSize(s);
      const y = this.py(v);
      if (y - sz.h / 2 < rect.y + 18 * k || y + sz.h / 2 > maxY - 2 * k) continue;
      let lx = axisX - 6 * k - sz.w;
      if (lx < rect.x + 2 * k) lx = rect.x + 4 * k;
      if (lx + sz.w > maxX - 2 * k) lx = maxX - sz.w - 4 * k;
      if (vp.xMin <= 0 && vp.xMax >= 0) tick(axisX - 3 * k, y, axisX + 3 * k, y);
      const r = this.text(s, lx, y - sz.h / 2, ink);
      this.placed.push(r);
    }
    // Ursprung
    if (vp.xMin <= 0 && vp.xMax >= 0 && vp.yMin <= 0 && vp.yMax >= 0) {
      const r = this.text('0', axisX - 6 * k - this.textSize('0').w, axisY + 4 * k, ink);
      this.placed.push(r);
    }
  }

  // MARK: Kurven

  /// Sprungstelle zwischen zwei Abtastpunkten? (Intervallhalbierung bis auf 2 Bildpunkte)
  isJump(f, x0, y0, x1, y1, depth) {
    let ax = x0, ay = y0, bx = x1, by = y1;
    for (let i = 0; i < depth; i++) {
      const xm = 0.5 * (ax + bx);
      const ym = f(xm);
      if (!Number.isFinite(ym)) return true;
      const lo = Math.min(ay, by), hi = Math.max(ay, by);
      const tol = (hi - lo) * 0.02;
      if (ym < lo - tol || ym > hi + tol) return true;
      const d0 = Math.abs(this.py(ym) - this.py(ay)), d1 = Math.abs(this.py(by) - this.py(ym));
      if (Math.max(d0, d1) < 2) return false;
      if (d0 > d1) { bx = xm; by = ym; } else { ax = xm; ay = ym; }
    }
    return Math.abs(this.py(ay) - this.py(by)) > 2;
  }

  /// Kurvenpfad in g aufbauen (Lücken an Polstellen, Sprüngen und Definitionslücken)
  curvePath(f, xa = null, xb = null) {
    const g = this.g, rect = this.rect, vp = this.vp;
    g.beginPath();
    const lo = xa === null ? vp.xMin : Math.max(xa, vp.xMin);
    const hi = xb === null ? vp.xMax : Math.min(xb, vp.xMax);
    if (!(hi > lo)) return;
    const n = Math.max(Math.trunc((this.px(hi) - this.px(lo)) * 1.5), 8);
    const limitLo = rect.y - rect.h * 3, limitHi = rect.y + rect.h + rect.h * 3;
    let pen = false;
    let prevX = lo, prevY = f(lo);
    for (let i = 0; i <= n; i++) {
      const x = lo + (hi - lo) * i / n;
      const y = f(x);
      if (Number.isFinite(y)) {
        const yy = this.py(y);
        const p = { x: this.px(x), y: Math.min(Math.max(yy, limitLo), limitHi) };
        if (pen && Number.isFinite(prevY)) {
          // Swift prüft ab 24 Punkten (Mac: ≈ 45 Punkte je Einheit). Auf dem iPhone ist eine Einheit nur ≈ 19–22 Punkte
          // hoch – Sprünge um 1 (floor, round, step, sign) blieben sonst als senkrechte Striche stehen
          const dy = Math.abs(yy - this.py(prevY));
          if (dy > JUMP_CHECK && this.isJump(f, prevX, prevY, x, y, 40)) pen = false;
        }
        if (pen) g.lineTo(p.x, p.y); else { g.moveTo(p.x, p.y); pen = true; }
      } else {
        pen = false;
      }
      prevX = x;
      prevY = y;
    }
  }

  drawCurve(c) {
    if (!c.f) return;
    const g = this.g;
    g.save();
    const sel = this.selected;
    const highlighted = !this.print && typeof sel === 'string' && sel.includes(`|${c.name}|`);
    g.strokeStyle = this.curveColor(c.color);
    g.lineWidth = this.lineWidth + (highlighted ? 0.8 * this.k : 0);
    g.lineJoin = 'round';
    g.lineCap = 'round';
    if (this.bw) {
      const n = PALETTE_DASHES.length;
      const d = PALETTE_DASHES[(((c.color | 0) % n) + n) % n].map((v) => v * this.lineWidth / 1.6);
      if (d.length) g.setLineDash(d);
    }
    this.curvePath(c.f);
    g.stroke();
    g.restore();
  }

  drawVerticals() {
    const g = this.g, rect = this.rect, vp = this.vp;
    for (const c of this.compiled) {
      if (!(c.kind.k === 'vertical' && c.visible)) continue;
      const x0 = c.constant;
      if (x0 === null || !(x0 >= vp.xMin) || !(x0 <= vp.xMax)) continue;
      g.save();
      g.strokeStyle = this.curveColor(c.color);
      g.lineWidth = this.lineWidth;
      if (this.bw) g.setLineDash([6 * this.k, 4 * this.k]);
      const x = this.px(x0);
      g.beginPath(); g.moveTo(x, rect.y); g.lineTo(x, rect.y + rect.h); g.stroke();
      g.restore();
    }
  }

  drawIntegral() {
    const s = this.model.integral;
    if (!s || s.visible === false) return;
    const row = this.compiled.find((c) => c.name === s.function && c.isFunction && c.visible);
    if (!row || !row.f) return;
    const f = row.f;
    const g = this.g, rect = this.rect, vp = this.vp, k = this.k;
    const a = Math.min(s.a, s.b), b = Math.max(s.a, s.b);
    const lo = Math.max(a, vp.xMin), hi = Math.min(b, vp.xMax);
    if (!(hi > lo)) return;
    const n = Math.max(Math.trunc(this.px(hi) - this.px(lo)), 4);
    const base = this.py(0);
    g.save();
    g.beginPath();
    g.moveTo(this.px(lo), base);
    for (let i = 0; i <= n; i++) {
      const x = lo + (hi - lo) * i / n;
      const y = f(x);
      const yy = Number.isFinite(y) ? Math.min(Math.max(this.py(y), rect.y - 10), rect.y + rect.h + 10) : base;
      g.lineTo(this.px(x), yy);
    }
    g.lineTo(this.px(hi), base);
    g.closePath();
    const col = this.curveColor(row.color);
    g.fillStyle = rgba(col, this.bw ? 0.18 : 0.22);
    g.fill();
    // Grenzen
    g.strokeStyle = rgba(col, 0.8);
    g.lineWidth = 1 * k;
    g.setLineDash([4 * k, 3 * k]);
    g.beginPath();
    for (const xv of [a, b]) {
      if (!(xv >= vp.xMin && xv <= vp.xMax)) continue;
      const y = f(xv);
      g.moveTo(this.px(xv), base);
      g.lineTo(this.px(xv), Number.isFinite(y) ? this.py(y) : base);
    }
    g.stroke();
    g.restore();
    const v = integralValueCached(this.model);
    if (v !== null) {
      const mid = (lo + hi) / 2;
      const ym = f(mid);
      const label = '∫ = ' + Fmt.num(v, this.settings.decimals);
      const sz = this.textSize(label, true);
      const yLab = Number.isFinite(ym) ? (this.py(ym) + base) / 2 - sz.h / 2 : base - 20 * k;
      this.integralLabel = [label, { x: this.px(mid) - sz.w / 2, y: Math.min(Math.max(yLab, rect.y + 4 * k), rect.y + rect.h - 20 * k) }];
    }
  }

  dot(p, fill, r, ring = 2 * this.k) {
    const g = this.g, k = this.k;
    this.dots.push(R(p.x - r - 2 * k, p.y - r - 2 * k, 2 * r + 4 * k, 2 * r + 4 * k));
    g.fillStyle = this.colors.surface;
    g.beginPath(); g.arc(p.x, p.y, r + ring, 0, Math.PI * 2); g.fill();
    g.fillStyle = fill;
    g.beginPath(); g.arc(p.x, p.y, r, 0, Math.PI * 2); g.fill();
  }

  drawStatPoints() {
    const pts = this.model.statPoints;
    if (!Array.isArray(pts)) return;
    const area = inset(this.rect, -5, -5);
    for (const p of pts) {
      if (!Array.isArray(p) || p.length !== 2) continue;
      const pt = { x: this.px(p[0]), y: this.py(p[1]) };
      if (!containsPoint(area, pt)) continue;
      this.dot(pt, this.colors.ink, 3.5 * this.k, 1.5 * this.k);
    }
  }

  drawPoints() {
    for (const c of this.compiled) {
      if (!c.visible || c.kind.k !== 'point' || !c.point) continue;
      const [x, y] = c.point;
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const p = { x: this.px(x), y: this.py(y) };
      if (!containsPoint(this.rect, p)) continue;
      const r = this.dotRadius + 0.5 * this.k;
      this.dot(p, this.curveColor(c.color), r);
      const name = c.kind.name ?? '';
      this.hits.push({ feature: pointFeature(c), x: p.x, y: p.y, r });
      this.placeLabel(name + Fmt.point(x, y, this.settings.decimals), p);
    }
  }

  drawCurveNames() {
    const used = [];
    const k = this.k, rect = this.rect;
    const area = inset(rect, 4 * k, 4 * k);
    for (const c of this.compiled) {
      if (!(c.isFunction && c.visible) || !c.f) continue;
      const label = c.label;
      const sz = this.textSize(label, true);
      let pos = null;
      let t = 0.9;
      while (t > 0.08) {
        const x = this.vp.xMin + this.vw * t;
        const y = c.f(x);
        t -= 0.02;
        if (!Number.isFinite(y)) continue;
        const p = { x: this.px(x), y: this.py(y) };
        const cand = R(p.x + 6 * k, p.y - sz.h - 6 * k, sz.w, sz.h);
        if (!containsRect(area, cand)) continue;
        if (used.some((u) => intersects(inset(u, -4 * k, -4 * k), cand))) continue;
        if (this.placed.some((r) => intersects(r, cand)) || this.dots.some((r) => intersects(r, cand))) continue;
        pos = cand;
        used.push(cand);
        break;
      }
      if (pos) {
        const r = this.text(label, pos.x, pos.y, this.colors.ink, { halo: true, bold: true });
        this.placed.push(r);
      }
    }
  }

  // MARK: Merkmale

  drawFeatures() {
    const labels = [];   // [Text, Punkt, Priorität, erzwingen]
    const prio = (kind) => {
      switch (kind) {
        case FEATURE.maximum: case FEATURE.minimum: case FEATURE.zero: return 0;
        case FEATURE.yIntercept: case FEATURE.intersection: return 1;
        default: return 2;
      }
    };
    const pinned = this.model.pinned instanceof Set ? this.model.pinned : new Set();
    const allLabels = !!this.settings.allLabels;
    const a = this.analysis;
    for (const c of this.compiled) {
      if (!(c.isFunction && c.visible && c.features)) continue;
      for (const f of (a.perRow.get(c.id) || [])) {
        const p = { x: this.px(f.x), y: this.py(f.y) };
        if (!containsPoint(this.rect, p)) continue;
        const hot = !this.print && (this.highlight === f.id || this.selected === f.id);
        const col = this.curveColor(c.color);
        const r = hot ? this.dotRadius + 2 * this.k : this.dotRadius;
        this.dot(p, hot ? col : mixColor(col, this.colors.ink, 0.15), r);
        this.hits.push({ feature: f, x: p.x, y: p.y, r });
        if (allLabels || this.labelIDs.has(f.id) || hot) {
          labels.push([this.model.label(f), p, prio(f.kind), hot || (!this.print && pinned.has(f.id))]);
        }
      }
    }
    for (const f of a.intersections) {
      const p = { x: this.px(f.x), y: this.py(f.y) };
      if (!containsPoint(this.rect, p)) continue;
      const hot = !this.print && (this.highlight === f.id || this.selected === f.id);
      const r = hot ? this.dotRadius + 2 * this.k : this.dotRadius;
      this.dot(p, this.colors.inkSecondary, r);
      this.hits.push({ feature: f, x: p.x, y: p.y, r });
      if (allLabels || this.labelIDs.has(f.id) || hot) {
        labels.push([this.model.label(f), p, 1, hot || (!this.print && pinned.has(f.id))]);
      }
    }
    labels.sort((u, v) => ((u[3] ? 0 : 1) - (v[3] ? 0 : 1)) || (u[2] - v[2]));
    for (const [s, p, , force] of labels) this.placeLabel(s, p, force);
  }

  /// Beschriftung neben einen Punkt setzen, Überlappungen vermeiden; Rückgabe: belegtes Rechteck oder null
  placeLabel(s, p, force = true) {
    const k = this.k, rect = this.rect;
    const sz = this.textSize(s);
    const d = (this.print ? 4 : 7) * k;
    const cands = [
      [p.x + d, p.y - sz.h - d], [p.x + d, p.y + d],
      [p.x - sz.w - d, p.y - sz.h - d], [p.x - sz.w - d, p.y + d],
      [p.x - sz.w / 2, p.y - sz.h - d - 3 * k], [p.x - sz.w / 2, p.y + d + 3 * k],
      [p.x + d + 2 * k, p.y - sz.h / 2], [p.x - sz.w - d - 2 * k, p.y - sz.h / 2],
    ];
    let chosen = null;
    for (const [cx, cy] of cands) {
      const r = inset(R(cx, cy, sz.w, sz.h), -3 * k, -1 * k);
      if (containsRect(rect, r) && !this.placed.some((q) => intersects(q, r))
        && !this.dots.some((q) => intersects(q, r) && !containsPoint(q, p))) { chosen = [cx, cy]; break; }
    }
    if (!chosen && !force) return null;
    let [x, y] = chosen || cands[0];
    if (x + sz.w > rect.x + rect.w - 2 * k) x = rect.x + rect.w - sz.w - 2 * k;
    if (x < rect.x + 2 * k) x = rect.x + 2 * k;
    if (y + sz.h > rect.y + rect.h - 2 * k) y = rect.y + rect.h - sz.h - 2 * k;
    if (y < rect.y + 2 * k) y = rect.y + 2 * k;
    const drawn = this.text(s, x, y, this.colors.ink, { halo: true });
    const r = inset(drawn, -3 * k, -1 * k);
    this.placed.push(r);
    return r;
  }
}

// MARK: - Punkte aus Zeilen „P(2|3)“ als antippbare Merkmale

/// Punktzeile als Merkmal-ähnliches Objekt (kind 'point'; id „point|<Zeilen-id>|“)
export function pointFeature(c) {
  const name = c.kind.name ?? '';
  return {
    kind: 'point', x: c.point[0], y: c.point[1], function: name, other: null, index: 0,
    id: `point|${c.id}|`, shortName: name, rowId: c.id,
  };
}

// MARK: - Integralwert zwischenspeichern (sonst bei jedem Bild neu integriert)

const integralCache = new WeakMap();

function integralValueCached(model) {
  const s = model.integral;
  if (!s) return null;
  const key = `${s.function}|${s.a}|${s.b}|${model.revision}|${model.paramRevision}`;
  const c = integralCache.get(model);
  if (c && c.key === key) return c.value;
  const value = model.integralValue();
  integralCache.set(model, { key, value });
  return value;
}

/// ∫ₐᵇ der eingeblendeten Fläche (zwischengespeichert; null, wenn es keine gibt)
export function cachedIntegralValue(model) {
  return integralValueCached(model);
}

// MARK: - Schnittstelle

/// Zeichnet den Graphen (siehe Kopf) und liefert die Trefferflächen der Merkmalspunkte sowie Umrechnungen
export function drawGraph(g, model, opts = {}) {
  const r = new Renderer(g, model, opts);
  r.draw();
  return {
    hits: r.hits,
    rect: r.rect,
    colors: r.colors,
    px: (x) => r.px(x),
    py: (y) => r.py(y),
    xAt: (p) => r.xAt(p),
    yAt: (p) => r.yAt(p),
    /// weitere Beschriftung wie placeLabel in Swift (z. B. Spur), beachtet die schon belegten Flächen
    placeLabel: (s, x, y, force = true) => r.placeLabel(s, { x, y }, force),
  };
}
