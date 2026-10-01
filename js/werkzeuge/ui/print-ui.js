// print-ui.js – Unterseite „Ausdruck / PDF“ (wie ExportView.swift: Inhalte wählen, Vorschau, drucken)
// und der Ausdruck selbst (wie PDFReport.swift) als HTML in #print-root: Kopf, Graph (farbig oder
// schwarz-weiß mit Strichmustern, wahlweise im Maßstab 1 LE = x cm auf Karopapier), Funktionen, Merkmale,
// Integral, Analysis, Gleichungen mit Lösungsweg, Solver-Werte und Rechenprotokoll.
// Das PDF entsteht über den Druckdialog des Systems (iPhone: Drucken → Teilen → „In Dateien sichern“).
// Kein DOM-Zugriff auf oberster Ebene: das Modul lädt auch in JavaScriptCore (tests/ui-smoke.mjs).
import { el, clear, icon, segmented, switchControl, shareOrDownload, debounce, haptic } from './common.js';
import { drawGraph } from './graph-render.js';
import { Fmt } from '../fmt.js';
import { subscripted } from '../numerics.js';
import { LGSEntry, LGSSolver } from '../equations.js';
import { EQ_MODES } from '../eqmodel.js';
import { PALETTE_DASHES, paletteColor } from '../graph.js';

// MARK: Optionen (ExportOptions in PDFReport.swift)

/// Maßstäbe des Graphen: Seitenbreite oder 1 LE = x cm
export const SCALES = Object.freeze([
  Object.freeze({ id: 'fit', title: 'Seitenbreite', short: 'Seitenbreite', cm: null }),
  Object.freeze({ id: 'cm05', title: '1 LE = 0,5 cm', short: '0,5 cm', cm: 0.5 }),
  Object.freeze({ id: 'cm1', title: '1 LE = 1 cm', short: '1 cm', cm: 1 }),
  Object.freeze({ id: 'cm2', title: '1 LE = 2 cm', short: '2 cm', cm: 2 }),
]);

/// Anfangswerte wie `ExportOptions()` in Swift
export function defaultExportOptions() {
  return {
    title: 'Funktionsgraph', subtitle: '', landscape: false, graph: true, functions: true, features: true,
    intersections: true, integral: true, analysis: false, equations: false, steps: true, solver: false,
    tape: false, color: true, labels: true, karo: false, scale: 'fit',
  };
}

/// Ergänzt fehlende oder falsch getippte Felder (ändert das Objekt selbst, damit ctx.settings.export
/// dasselbe Objekt bleibt) – wie das Decodieren in Swift mit Standardwerten
export function normalizeExportOptions(o) {
  const out = o !== null && typeof o === 'object' ? o : {};
  const d = defaultExportOptions();
  for (const k of Object.keys(d)) if (typeof out[k] !== typeof d[k]) out[k] = d[k];
  if (!SCALES.some((s) => s.id === out.scale)) out.scale = 'fit';
  return out;
}

function scaleOf(id) {
  return SCALES.find((s) => s.id === id) ?? SCALES[0];
}

/// Optionen aus ctx.settings.export (bei Bedarf angelegt)
function options(ctx) {
  const s = ctx.settings && typeof ctx.settings === 'object' ? ctx.settings : (ctx.settings = {});
  if (!s.export || typeof s.export !== 'object') s.export = defaultExportOptions();
  return normalizeExportOptions(s.export);
}

// MARK: Seite (A4, Ränder wie PDFReport: 42 pt seitlich, 40 pt oben, 46 pt unten)

const PAGE = Object.freeze({ portrait: { w: 210, h: 297 }, landscape: { w: 297, h: 210 } });
const MARGIN = Object.freeze({ top: 14, side: 15, bottom: 16 });   // mm (≈ 40 / 42 / 46 pt)
/// CSS-Pixel je Millimeter (96 px je Zoll)
const PX_PER_MM = 96 / 25.4;
/// Grundgrößen des Graphen im Ausdruck in pt wie PDFReport (GraphRenderOptions: Linie 1,5, Achsen 0,9,
/// Schrift 8, Punkte 2,4); drawGraph rechnet sie mit scale = 96/72 in CSS-Pixel um (auch Pfeile, Abstände, Karo)
const PRINT_SIZES = Object.freeze({ lineWidth: 1.5, axisWidth: 0.9, fontSize: 8, dotRadius: 2.4 });
const PT_TO_PX = 96 / 72;
/// Auflösung des Druckbilds (Bildpunkte je CSS-Pixel, 3 ≈ 290 dpi) und des geteilten PNG (300 dpi)
const PRINT_RATIO = 3;
const PNG_DPI = 300;
/// Obergrenze der Bildpunkte einer Zeichenfläche (iOS erlaubt höchstens 16,7 Mio.)
const MAX_PIXELS = 14e6;

const MONO = 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace';

/// Speicher einer nicht mehr gebrauchten Zeichenfläche sofort freigeben (iOS begrenzt den Canvas-Speicher
/// und gibt ihn sonst erst spät zurück – nach einigen Ausdrucken bliebe das Bild leer)
function releaseCanvas(c) {
  if (c && typeof c.width === 'number') { c.width = 0; c.height = 0; }
}

/// Druckbare Fläche in mm
function printable(o) {
  const pg = o.landscape ? PAGE.landscape : PAGE.portrait;
  return { page: pg, w: pg.w - 2 * MARGIN.side, h: pg.h - MARGIN.top - MARGIN.bottom };
}

/// Runden „halb von 0 weg“ wie Swift x.rounded()
function roundHalfAway(x) {
  return Math.sign(x) * Math.round(Math.abs(x));
}

/// Größe des Graphen in mm und das gedruckte Sichtfenster (wie PDFReport.make):
/// Seitenbreite → Seitenverhältnis der Zeichenfläche am Bildschirm; fester Maßstab → Ausschnitt um die
/// Mitte der aktuellen Ansicht, auf ganze Kästchen (5 mm) gekürzt und der Ursprung auf Kästchen ausgerichtet.
export function graphLayout(o, view, canvasSize) {
  const area = printable(o);
  const W = area.w;
  const maxH = area.h * (o.landscape ? 0.74 : 0.6);
  const vw = view.xMax - view.xMin, vh = view.yMax - view.yMin;
  let vp = { xMin: view.xMin, xMax: view.xMax, yMin: view.yMin, yMax: view.yMax };
  let gw = W, gh;
  const c = scaleOf(o.scale).cm;
  if (c !== null) {
    const ppu = c * 10;   // mm je Längeneinheit
    gw = Math.min(W, vw * ppu);
    gh = Math.min(maxH, vh * ppu);
    // ganze Kästchen, damit das Karo aufgeht (mindestens eines, sonst gäbe es kein Bild)
    gw = Math.max(5, Math.floor(gw / 5) * 5);
    gh = Math.max(5, Math.floor(gh / 5) * 5);
    const cx = (view.xMin + view.xMax) / 2, cy = (view.yMin + view.yMax) / 2;
    const uw = gw / ppu, uh = gh / ppu;
    // Ursprung auf Kästchen ausrichten
    const step = 0.5 / c;
    const x0 = roundHalfAway((cx - uw / 2) / step) * step;
    const y0 = roundHalfAway((cy - uh / 2) / step) * step;
    vp = { xMin: x0, xMax: x0 + uw, yMin: y0, yMax: y0 + uh };
  } else {
    const cs = canvasSize || {};
    const aspect = cs.width > 10 && cs.height > 10 ? cs.height / cs.width : (vw > 0 ? vh / vw : 0.7);
    gh = W * aspect;
    if (gh > maxH) { gh = maxH; gw = gh / aspect; }
  }
  return { vp, gw, gh, cm: c, fixedStep: c === null ? null : (c >= 1 ? 1 : 2) };
}

// MARK: Texte

const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '-': '⁻' };

/// wie Swift trimmingCharacters(in: .whitespaces)
function trimWS(s) {
  return String(s ?? '').replace(/^[\t\p{Zs}]+|[\t\p{Zs}]+$/gu, '');
}

/// Funktionsterm hübsch: x^2 → x², * → ·, - → −, sqrt → √, pi → π, Dezimalkomma (PDFReport.pretty)
export function pretty(s) {
  let t = String(s ?? '').replace(/\^\(?(-?[0-9]+)\)?(?![0-9.,])/g, (m, g) => Array.from(g, (ch) => SUP[ch] ?? ch).join(''));
  t = t.split('sqrt').join('√').split('pi').join('π');
  t = t.split('*').join('·').split('-').join('−');
  // ohne Lookbehind (?<=…): das kennt Safari erst ab iOS 16.4 – sonst ließe sich das Modul auf älteren iPhones nicht laden
  if (Fmt.comma) t = t.replace(/([0-9])\.(?=[0-9])/g, '$1,');
  return t;
}

/// Beschriftung einer Zeile: „f(x) = x² − 1“, „f: y = …“ (automatische Namen) oder der Text selbst
export function rowLabel(c, text) {
  const t = trimWS(text);
  const k = c && c.kind;
  if (k && k.k === 'function' && k.auto) {
    if (t.startsWith('y')) return `${k.name}: ` + pretty(t);
    return `${k.name}(${k.variable}) = ` + pretty(t);
  }
  return pretty(t);
}

/// „30. September 2026“
function dateText(d = new Date()) {
  try {
    return d.toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch (e) {
    return isoDate(d);
  }
}

/// „2026-09-30“ (Dateinamen wie ExportView.fileName)
function isoDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/// „Funktionsgraph 2026-09-30“ – ohne Zeichen, die in Dateinamen stören
function fileBase(o) {
  const t = trimWS(o.title).replace(/[\/\\:*?"<>|]+/g, '-');
  return (t === '' ? 'fx-991 Trainer' : t) + ' ' + isoDate();
}

// MARK: PNG mit Auflösungsangabe (pHYs), damit Pages/Word das Bild in Originalgröße maßstabsgetreu setzen

let crcTable = null;

function crc32(bytes, start, end) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xFFFFFFFF;
  for (let i = start; i < end; i++) c = crcTable[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/// PNG-Bytes mit Bildpunkten je Meter; ersetzt ein vorhandenes pHYs, sonst direkt nach IHDR eingefügt
export function pngWithDensity(bytes, pxPerMeter) {
  const SIG = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!(bytes instanceof Uint8Array) || bytes.length < 33 || SIG.some((b, i) => bytes[i] !== b)) return bytes;
  const ppm = Math.max(1, Math.round(pxPerMeter)) >>> 0;
  const chunk = new Uint8Array(21);
  const dv = new DataView(chunk.buffer);
  dv.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4);   // „pHYs“
  dv.setUint32(8, ppm);
  dv.setUint32(12, ppm);
  chunk[16] = 1;                             // Einheit: Meter
  dv.setUint32(17, crc32(chunk, 4, 17));
  const join = (a, b, c) => {
    const out = new Uint8Array(a.length + b.length + c.length);
    out.set(a, 0); out.set(b, a.length); out.set(c, a.length + b.length);
    return out;
  };
  const u32 = (p) => ((bytes[p] << 24) | (bytes[p + 1] << 16) | (bytes[p + 2] << 8) | bytes[p + 3]) >>> 0;
  let pos = 8, afterIHDR = -1;
  while (pos + 12 <= bytes.length) {
    const len = u32(pos);
    const type = String.fromCharCode(bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7]);
    const end = pos + 12 + len;
    if (end > bytes.length) break;
    if (type === 'IHDR') afterIHDR = end;
    if (type === 'pHYs') return join(bytes.subarray(0, pos), chunk, bytes.subarray(end));
    if (type === 'IDAT' || type === 'IEND') break;
    pos = end;
  }
  if (afterIHDR < 0) return bytes;
  return join(bytes.subarray(0, afterIHDR), chunk, bytes.subarray(afterIHDR));
}

/// data:-URL → Bytes (synchron, damit das Teilen noch zur Tipp-Geste gehört)
function dataURLBytes(url) {
  const bin = atob(url.slice(url.indexOf(',') + 1));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// MARK: Graph zeichnen

/// Zeichenfläche mit dem Graphen im Druckstil (weiß, kräftige Linien, wahlweise s/w und Karo);
/// ratio = Bildpunkte je CSS-Pixel. Rückgabe: Canvas mit CSS-Größe in mm oder null
function graphCanvas(ctx, o, layout, ratio) {
  const graph = ctx.graph;
  const wCss = layout.gw * PX_PER_MM, hCss = layout.gh * PX_PER_MM;
  let r = ratio;
  if (wCss * hCss * r * r > MAX_PIXELS) r = Math.sqrt(MAX_PIXELS / (wCss * hCss));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(wCss * r));
  canvas.height = Math.max(1, Math.round(hCss * r));
  const g = canvas.getContext('2d');
  if (!g) return null;
  const dpr = canvas.width / wCss;
  g.setTransform(dpr, 0, 0, canvas.height / hCss, 0, 0);
  g.fillStyle = '#FFFFFF';
  g.fillRect(0, 0, wCss, hCss);
  const karo = o.karo && layout.cm !== null;
  try {
    drawGraph(g, graph, {
      width: wCss, height: hCss, view: layout.vp, theme: 'print', bw: !o.color, scale: PT_TO_PX, ...PRINT_SIZES,
      grid: karo ? 'karo' : graph.settings.grid, pxPerMm: karo ? PX_PER_MM : null,
      features: graph.settings.features, labels: o.labels, selected: null, highlight: null,
      analysis: graph.analysis(layout.vp), step: layout.fixedStep, dpr,
    });
  } catch (e) {
    console.error('Graph für den Ausdruck:', e);
  }
  // Rahmen wie PDFReport (0,6 pt, Grau 0,55)
  g.setTransform(dpr, 0, 0, canvas.height / hCss, 0, 0);
  g.setLineDash([]);
  g.globalAlpha = 1;
  g.strokeStyle = '#8C8C8C';
  g.lineWidth = 0.8;
  g.strokeRect(0.4, 0.4, wCss - 0.8, hCss - 0.8);
  canvas.style.width = `${layout.gw}mm`;
  canvas.style.height = 'auto';
  return canvas;
}

/// Graph als PNG (300 dpi, Maße wie im Ausdruck)
function graphPNG(ctx, o) {
  const layout = graphLayout(o, ctx.graph.view, ctx.graph.canvasSize);
  const canvas = graphCanvas(ctx, o, layout, PNG_DPI / 96);
  if (!canvas) return null;
  const bytes = pngWithDensity(dataURLBytes(canvas.toDataURL('image/png')), canvas.width * 1000 / layout.gw);
  releaseCanvas(canvas);
  return new Blob([bytes], { type: 'image/png' });
}

// MARK: Bausteine des Ausdrucks (Block in PDFReport.swift)

/// Text mit Größe und Stärke wie attr(_:_:_:) in Swift
function text(s, size, weight = 400, { mono = false, color = null, before = 3 } = {}) {
  return el('p', {
    class: 'rpt-t',
    style: { fontSize: `${size}pt`, fontWeight: String(weight), marginTop: `${before}pt`, color: color ?? '', fontFamily: mono ? MONO : '' },
  }, s);
}

/// Abschnittsüberschrift mit feiner Linie darunter
function heading(s) {
  return el('h2', { class: 'rpt-h' }, s);
}

/// Zweispaltige Zeile: Bezeichnung | Wert (umbrechend)
function row(label, value, { lw = 132, mono = true } = {}) {
  return el('div', { class: mono ? 'rpt-row' : 'rpt-row plain', style: { gridTemplateColumns: `${lw}pt minmax(0, 1fr)` } },
    el('div', { class: 'rpt-l' }, label), el('div', { class: 'rpt-v' }, value));
}

/// Legendenzeile: Linienmuster in Kurvenfarbe (bzw. schwarz gestrichelt) + Funktionsterm
function legendRow(label, colorIndex, color) {
  const n = PALETTE_DASHES.length;
  const dash = color ? [] : PALETTE_DASHES[(((Math.trunc(colorIndex) || 0) % n) + n) % n];
  const line = el('svg:svg', { viewBox: '0 0 28 12', width: '28pt', height: '12pt', class: 'rpt-swatch', 'aria-hidden': 'true' },
    el('svg:line', {
      x1: '0', y1: '6.5', x2: '28', y2: '6.5', stroke: color ? paletteColor(colorIndex, false) : '#000000',
      'stroke-width': '1.8', 'stroke-dasharray': dash.length ? dash.join(' ') : null,
    }));
  return el('div', { class: 'rpt-fn' }, line, el('div', { class: 'rpt-fn-t' }, label));
}

/// Lösungsschritt des LGS: Matrix in Klammern (Spalten rechtsbündig, „│“ vor der rechten Seite) + Umformungen
function stepBlock(st) {
  const len = (s) => Array.from(String(s)).length;
  const cols = st.matrix.length > 0 ? st.matrix[0].length : 0;
  const widths = new Array(cols).fill(0);
  for (const rr of st.matrix) rr.forEach((v, j) => { widths[j] = Math.max(widths[j], len(v)); });
  const lines = st.matrix.map((rr) => rr.map((v, j) =>
    (j === cols - 1 ? '│ ' : '') + ' '.repeat(Math.max(0, widths[j] - len(v))) + v).join('  '));
  return el('div', { class: 'rpt-step' },
    el('div', { class: 'rpt-mx' }, el('div', { class: 'rpt-mx-in' }, lines.join('\n'))),
    el('div', { class: 'rpt-ops' }, st.ops.join('\n')));
}

/// Protokoll-Block: Zeilen spaltenweise (erst nach unten, dann nach rechts)
function tapeChunk(chunk, rows, cols) {
  const grid = el('div', { class: 'rpt-tape', style: {
    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${rows}, 10.5pt)` } });
  chunk.forEach((l, k) => {
    const col = Math.floor(k / rows);
    grid.appendChild(el('div', { class: col > 0 ? 'c cr' : 'c' }, l === '' ? ' ' : l));
  });
  return grid;
}

/// Blöcke zusammensetzen: „keepWithNext“ → gemeinsamer Kasten, der nicht über eine Seite umbricht
function assemble(blocks) {
  const out = [];
  let group = null;
  for (const b of blocks) {
    if (group) {
      group.appendChild(b.node);
      if (!b.keep) { out.push(group); group = null; }
      continue;
    }
    if (b.keep) group = el('div', { class: 'rpt-keep' }, b.node);
    else out.push(b.node);
  }
  if (group) out.push(group);
  return out;
}

// MARK: Gleichungen

/// Ergebnis einer Betriebsart des Gleichungen-Modells → Ergebnisobjekt oder null (Fehler)
function eqResult(m, mode) {
  try {
    let r;
    if (typeof m.result === 'function') r = m.result(mode);
    else if (mode === 'lgs') r = m.lgs();
    else if (mode === 'quadratic') r = m.quadratic();
    else if (mode === 'cubic') r = m.cubicResult();
    else if (mode === 'polynomial') r = m.polynomial();
    else r = m.equation();
    return r && r.ok ? r.out : null;
  } catch (e) {
    return null;
  }
}

function modeTitle(mode) {
  return (EQ_MODES.find((x) => x.id === mode) ?? EQ_MODES[0]).title;
}

function equationBlocks(m, o, push) {
  switch (m.mode) {
    case 'lgs': {
      push(heading('Lineares Gleichungssystem'), true);
      const names = LGSSolver.variableNames(m.n);
      for (let i = 0; i < m.n; i++) {
        let s = '';
        for (let j = 0; j < m.n; j++) {
          const raw = trimWS(m.A[i][j]);
          const e = LGSEntry.parse(raw);
          const v = e ? LGSEntry.toNumber(e) : 0;
          if (v === 0) continue;
          const neg = raw.startsWith('-') || raw.startsWith('−') || v < 0;
          let mag = raw.split('−').join('-');
          if (mag.startsWith('-')) mag = mag.slice(1);
          if (mag.startsWith('+')) mag = mag.slice(1);
          const coeff = mag === '1' ? '' : pretty(mag);
          if (s === '') s = (neg ? '−' : '') + coeff + names[j];
          else s += (neg ? ' − ' : ' + ') + coeff + names[j];
        }
        const rhs = trimWS(m.b[i]);
        push(row(`(${i + 1})`, (s === '' ? '0' : s) + ' = ' + pretty(rhs === '' ? '0' : rhs), { lw: 40 }));
      }
      const r = eqResult(m, 'lgs');
      if (r) {
        push(text(r.summary, 10.5, 600, { before: 8 }), true);
        for (const l of r.solutionLines) push(row('', l, { lw: 20 }));
        push(row('', r.detText, { lw: 20 }));
        if (o.steps) {
          push(text('Lösungsweg', 10.5, 600, { before: 10 }), true);
          for (const st of r.steps) push(stepBlock(st));
          if (r.backSubstitution.length > 0) {
            push(text('Rückwärtseinsetzen', 10, 600, { before: 8 }), true);
            for (const l of r.backSubstitution) push(text(l, 9, 400, { mono: true, before: 2 }));
          }
        }
      }
      break;
    }
    case 'quadratic':
    case 'cubic':
    case 'polynomial': {
      const name = m.mode === 'quadratic' ? 'Quadratische Gleichung' : (m.mode === 'cubic' ? 'Kubische Gleichung' : 'Polynomgleichung');
      push(heading(name), true);
      const r = eqResult(m, m.mode);
      if (r) {
        push(text(r.polyText, 12, 500, { before: 4 }));
        for (const l of r.infoLines) push(text(l, 9.5, 400, { before: 2 }));
        push(text('Lösungen', 10.5, 600, { before: 8 }), true);
        for (const l of r.rootLines) push(text(l, 10, 400, { mono: true, before: 2 }));
        if (r.exactLines.length > 0) {
          push(text('Exakt', 10.5, 600, { before: 8 }), true);
          for (const l of r.exactLines) push(text(l, 9, 400, { mono: true, before: 2 }));
        }
      }
      break;
    }
    default: {
      push(heading('Gleichung'), true);
      push(text(pretty(m.lhs) + ' = ' + pretty(m.rhs), 12, 500, { before: 4 }));
      const r = eqResult(m, 'equation');
      if (r) {
        push(text(`Lösungen im Intervall [${Fmt.num(r.from, 4)}; ${Fmt.num(r.to, 4)}]:`, 10, 400, { before: 4 }), true);
        if (r.solutions.length === 0) push(text('keine', 10, 400, { before: 2 }));
        r.solutions.forEach((x, i) => push(text(`x${subscripted(i + 1)} = ${Fmt.num(x, 8)}`, 10, 400, { mono: true, before: 2 })));
      }
    }
  }
}

// MARK: Ausdruck aufbauen (PDFReport.make)

const FEATURE_GROUPS = [
  ['zero', 'Nullstelle', 'Nullstellen'], ['yIntercept', 'Schnittpunkt y-Achse', 'Schnittpunkt y-Achse'],
  ['maximum', 'Hochpunkt', 'Hochpunkte'], ['minimum', 'Tiefpunkt', 'Tiefpunkte'],
  ['inflection', 'Wendepunkt', 'Wendepunkte'], ['saddle', 'Sattelpunkt', 'Sattelpunkte'],
];

/// Schlüssel des Graphenbilds: nur wenn er sich ändert, zeichnet die Vorschau den Graphen neu
/// (Tippen im Titel oder neue Protokollzeilen zeichnen ihn nicht jedes Mal neu)
function graphKey(ctx, o, layout, ratio) {
  const g = ctx.graph;
  try {
    return JSON.stringify([layout, o.color, o.karo, o.labels, Fmt.comma, Math.round(ratio * 100), g.revision,
      g.paramRevision, g.settings, g.integral, g.statPoints]);
  } catch (e) {
    return null;
  }
}

/// Baut den Ausdruck. mode: 'print' (Druck: das vorab erzeugte, fertig geladene <img> des Graphen, sonst
/// sofort gezeichnete Zeichenfläche – nie etwas, auf das vor window.print() gewartet werden müsste),
/// 'canvas' (Zeichenfläche direkt: Vorschau); cache = { key, canvas } hält das Graphenbild der Vorschau.
/// Rückgabe { node }
function buildReport(ctx, o, { mode = 'print', ratio = PRINT_RATIO, preview = false, cache = null } = {}) {
  const graph = ctx.graph;
  const blocks = [];
  const push = (node, keep = false) => { blocks.push({ node, keep }); };

  // Kopf
  const title = trimWS(o.title) === '' ? 'fx-991 Trainer' : o.title;
  push(el('header', { class: 'rpt-head' },
    el('div', { class: 'rpt-titles' },
      el('h1', { class: 'rpt-title' }, title),
      o.subtitle === '' ? null : el('p', { class: 'rpt-sub' }, o.subtitle)),
    el('div', { class: 'rpt-meta' }, dateText(), el('br'), 'fx-991DE X Trainer · Tom Bleyer')));

  // Graph
  const layout = graphLayout(o, graph.view, graph.canvasSize);
  const vp = o.graph ? layout.vp : graph.view;
  const visibleFns = graph.compiled.filter((c) => c.isFunction && c.visible);
  if (o.graph) {
    let pic = mode === 'print' ? preparedImage(graphKey(ctx, o, layout, ratio)) : null;
    if (!pic && cache) {
      const key = graphKey(ctx, o, layout, ratio);
      if (key !== null && cache.key === key && cache.canvas) {
        pic = cache.canvas;
      } else {
        pic = graphCanvas(ctx, o, layout, ratio);
        if (cache.canvas && cache.canvas !== pic) releaseCanvas(cache.canvas);
        cache.key = key;
        cache.canvas = pic;
      }
    } else if (!pic) {
      pic = graphCanvas(ctx, o, layout, ratio);
    }
    push(el('figure', { class: 'rpt-graph' }, pic), true);
    let note = `Ausschnitt: x von ${Fmt.num(vp.xMin, 3)} bis ${Fmt.num(vp.xMax, 3)}, y von ${Fmt.num(vp.yMin, 3)} bis ${Fmt.num(vp.yMax, 3)}`;
    if (o.scale !== 'fit') note += `  ·  Maßstab ${scaleOf(o.scale).title} (beim Drucken „Tatsächliche Größe“ bzw. 100 % wählen)`;
    if (graph.settings.degrees) note += '  ·  Winkel in Grad';
    push(text(note, 7.5, 400, { color: '#666666', before: 3 }));
  }

  // Funktionen (Legende)
  if (o.functions) {
    const items = graph.compiled.filter((c) => c.visible && (c.isFunction || c.kind.k === 'vertical' || c.point !== null));
    if (items.length > 0) {
      push(heading('Funktionen'), true);
      for (const c of items) {
        const r = graph.rows.find((x) => x.id === c.id);
        push(legendRow(rowLabel(c, r ? r.text : ''), c.color, o.color));
      }
    }
  }

  // Merkmale
  if (o.features && graph.settings.features && visibleFns.length > 0) {
    const analysis = graph.analysis(vp);
    push(heading('Merkmale im dargestellten Bereich'), true);
    for (const c of visibleFns) {
      if (!c.features) continue;
      const r = graph.rows.find((x) => x.id === c.id);
      push(text(rowLabel(c, r ? r.text : ''), 10.5, 600, { before: 8 }), true);
      const feats = analysis.perRow.get(c.id) ?? [];
      if (feats.length === 0) push(row('', 'keine im dargestellten Bereich', { mono: false }));
      for (const [k, one, many] of FEATURE_GROUPS) {
        const fs = feats.filter((f) => f.kind === k).sort((a, b) => a.x - b.x);
        if (fs.length === 0) continue;
        push(row(fs.length === 1 ? one : many, fs.map((f) => graph.label(f)).join('   ')));
      }
    }
    if (o.intersections && analysis.intersections.length > 0) {
      push(text('Schnittpunkte der Graphen', 10.5, 600, { before: 8 }), true);
      const byPair = new Map();
      for (const f of analysis.intersections) {
        const key = `${f.function} ∩ ${f.other ?? ''}`;
        if (!byPair.has(key)) byPair.set(key, []);
        byPair.get(key).push(f);
      }
      for (const [key, fs] of byPair) push(row(key, fs.map((f) => graph.label(f)).join('   ')));
    }
  }

  // Integral
  const s = graph.integral;
  if (o.integral && s && s.visible !== false) {
    const v = graph.integralValue();
    if (v !== null) {
      push(heading('Integral'), true);
      push(row(`∫ ${s.function}(x) dx`, `von ${Fmt.num(s.a, 4)} bis ${Fmt.num(s.b, 4)}  =  ${Fmt.num(v, 6)}`));
    }
  }

  // Analysis: Ableitungen und Integral
  if (o.analysis && ctx.analysis) {
    const res = typeof ctx.analysis.cachedCompute === 'function' ? ctx.analysis.cachedCompute(graph) : ctx.analysis.compute(graph);
    if (res && res.ok) {
      const r = res.out;
      const n = r.name, v = r.variable, N = n.toUpperCase();
      const lineText = (fn, m, b) => `${fn}(${v}) = ${Fmt.num(m, 6)}·${v} ${b < 0 ? '−' : '+'} ${Fmt.num(Math.abs(b), 6)}`;
      push(heading('Ableitungen und Integral'), true);
      push(row(`${n}(${v})`, r.fPretty, { lw: 80, mono: false }));
      r.derivs.forEach((d, k) => push(row(n + '′'.repeat(k + 1) + `(${v})`, d, { lw: 80, mono: false })));
      if (r.x0 !== null) {
        push(text(`An der Stelle ${v}₀ = ${Fmt.num(r.x0, 6)}`, 10.5, 600, { before: 8 }), true);
        for (const [l, val] of r.values) push(row(l, Fmt.num(val, 8), { lw: 120 }));
        if (r.tangent) push(row('Tangente', lineText('t', r.tangent[0], r.tangent[1]), { lw: 120 }));
        if (r.normal) push(row('Normale', lineText('n', r.normal[0], r.normal[1]), { lw: 120 }));
      }
      push(text('Integral', 10.5, 600, { before: 8 }), true);
      push(row('Stammfunktion', r.F !== null ? `${N}(${v}) = ${r.F} + C` : 'keine elementare Stammfunktion (numerisch)', { lw: 120, mono: false }));
      if (r.integral !== null && r.aVal !== null && r.bVal !== null) {
        push(row(`∫ von ${Fmt.num(r.aVal, 4)} bis ${Fmt.num(r.bVal, 4)}`, Fmt.num(r.integral, 10) + (r.pole ? '   (Polstelle im Intervall!)' : ''), { lw: 120 }));
        if (r.area !== null) {
          push(row('Flächeninhalt', Fmt.num(r.area, 10) + (r.gName !== null ? `   (zwischen ${n} und ${r.gName})` : ''), { lw: 120 }));
        }
        if (r.zeros.length > 0) {
          push(row('Teilflächen', r.pieces.map((p) => `[${Fmt.num(p[0], 4)}; ${Fmt.num(p[1], 4)}]: ${Fmt.num(p[2], 6)}`).join('   '), { lw: 120 }));
        }
        const kw = [];
        if (r.mean !== null) kw.push(`Mittelwert ${Fmt.num(r.mean, 6)}`);
        if (r.rectified !== null) kw.push(`Gleichrichtwert ${Fmt.num(r.rectified, 6)}`);
        if (r.rms !== null) kw.push(`Effektivwert ${Fmt.num(r.rms, 6)}`);
        if (r.peak !== null) kw.push(`Scheitelwert ${Fmt.num(r.peak, 6)}`);
        push(row('Kennwerte', kw.join('   '), { lw: 120, mono: false }));
      }
    }
  }

  // Gleichungen
  if (o.equations && ctx.equations) equationBlocks(ctx.equations, o, push);

  // Solver
  const sv = ctx.solver;
  const eq = o.solver && sv && sv.selected ? sv.equations.find((e) => e.id === sv.selected) : null;
  if (eq) {
    push(heading(`Formel: ${eq.name}` + (eq.note ? ` – ${eq.note}` : '')), true);
    push(text(pretty(eq.text), 12, 500, { before: 4 }));
    const vars = (ctx.calc && ctx.calc.vars) || {};
    for (const name of sv.variables(eq)) {
      const x = vars[name];
      const val = typeof x === 'number' ? Fmt.num(x, 8)
        : (x !== undefined && x !== null && typeof ctx.calc.formatValue === 'function' ? ctx.calc.formatValue(x) : '–');
      push(row(name, val, { lw: 80 }));
    }
  }

  // Protokoll (3 Spalten hoch, 4 quer; je 46 Zeilen, quer 40, damit Überschrift und Block auf eine Seite passen)
  const tape = ctx.calc && Array.isArray(ctx.calc.tape) ? ctx.calc.tape : [];
  if (o.tape && tape.length > 0) {
    push(heading('Rechenprotokoll'), true);
    const lines = tape.map((l) => String(l.text ?? ''));
    const perCol = o.landscape ? 40 : 46, cols = o.landscape ? 4 : 3;
    for (let i = 0; i < lines.length; i += perCol * cols) {
      const chunk = lines.slice(i, i + perCol * cols);
      const rows = chunk.length <= perCol ? chunk.length : Math.min(perCol, Math.ceil(chunk.length / cols));
      push(tapeChunk(chunk, rows, cols));
      if (preview) break;   // die Vorschau zeigt ohnehin nur die erste Seite
    }
  }

  const node = el('div', { class: `rpt ${o.landscape ? 'rpt-landscape' : 'rpt-portrait'}` }, assemble(blocks));
  return { node };
}

// MARK: Drucken

let printing = false;
let printTimer = null;
let savedTitle = null;
let hooked = false;

/// Vorab erzeugtes, fertig geladenes Druckbild des Graphen (die Unterseite „Ausdruck / PDF“ bereitet es
/// nach der Vorschau vor). So ruft „Drucken“ window.print() ohne jedes Warten noch in der Tipp-Geste auf:
/// iOS öffnet den Druckdialog (besonders in der Web-App vom Home-Bildschirm) nur aus einer Nutzergeste,
/// und ein await davor – etwa auf img.decode() – beendet sie. Fehlt das Bild noch, druckt die sofort
/// gezeichnete Zeichenfläche.
let prepared = { key: null, img: null, ready: false };

/// Vorbereitetes Bild zum Schlüssel oder null (noch nicht geladen / anderer Graph)
function preparedImage(key) {
  return key !== null && prepared.ready && prepared.key === key && prepared.img ? prepared.img : null;
}

/// Druckbild zu den Optionen vorbereiten (nur wenn sich der Graph geändert hat)
function preparePrintImage(ctx, o) {
  if (!o.graph) return;
  const layout = graphLayout(o, ctx.graph.view, ctx.graph.canvasSize);
  const key = graphKey(ctx, o, layout, PRINT_RATIO);
  if (key === null || key === prepared.key) return;
  const canvas = graphCanvas(ctx, o, layout, PRINT_RATIO);
  if (!canvas) return;
  let url = null;
  try { url = canvas.toDataURL('image/png'); } catch (e) { url = null; }
  releaseCanvas(canvas);
  if (!url) return;
  const img = el('img', { class: 'rpt-img', alt: 'Funktionsgraph', style: { width: `${layout.gw}mm`, height: 'auto' } });
  const p = { key, img, ready: false };
  const ready = () => { p.ready = true; };
  // decode() lehnt manche großen Bilder ab, obwohl sie laden: dann auf „load“ warten bzw. geladen genügt
  const fallback = () => { if (img.complete && img.naturalWidth > 0) ready(); else img.addEventListener('load', ready, { once: true }); };
  dropPrepared();
  prepared = p;
  img.src = url;
  if (typeof img.decode === 'function') img.decode().then(ready, fallback);
  else img.addEventListener('load', ready, { once: true });
}

/// Vorbereitetes Bild freigeben (Speicher: dekodiert bis rund 15 MB)
function dropPrepared() {
  const img = prepared.img;
  prepared = { key: null, img: null, ready: false };
  if (img && !img.isConnected) img.removeAttribute('src');
}

function printRoot() {
  let r = document.getElementById('print-root');
  if (!r) {
    r = el('div', { id: 'print-root', 'aria-hidden': 'true' });
    document.body.appendChild(r);
  }
  return r;
}

/// Hoch/Quer über ein eigenes <style id="print-page">
function setPageStyle(landscape) {
  let s = document.getElementById('print-page');
  if (!s) {
    s = document.createElement('style');
    s.id = 'print-page';
    document.head.appendChild(s);
  }
  s.textContent = `@page { size: A4 ${landscape ? 'landscape' : 'portrait'}; }`;
}

function fillPrintRoot(ctx, o, mode) {
  const root = printRoot();
  for (const c of root.querySelectorAll('canvas')) releaseCanvas(c);
  clear(root);
  const built = buildReport(ctx, o, { mode });
  root.appendChild(built.node);
  setPageStyle(o.landscape);
  return built;
}

function restoreTitle() {
  if (savedTitle !== null) {
    document.title = savedTitle;
    savedTitle = null;
  }
}

/// Drucken über das Browsermenü (Safari: Teilen → Drucken, Desktop: ⌘P): Ausdruck frisch aufbauen.
/// app.js ruft das gleich beim Start auf – sonst wäre der Ausdruck leer, solange die Unterseite
/// „Ausdruck / PDF“ noch nie geöffnet war.
export function installPrintHooks(ctx) {
  if (hooked) return;
  hooked = true;
  window.addEventListener('beforeprint', () => {
    if (printing) return;
    try {
      fillPrintRoot(ctx, options(ctx), 'print');
    } catch (e) {
      console.error('Ausdruck:', e);
    }
  });
  window.addEventListener('afterprint', () => {
    printing = false;
    restoreTitle();
  });
}

/// Stylesheet css/werkzeuge-print.css einbinden, falls index.html es nicht schon lädt (fx991: anderer Name und Ort)
function ensureStylesheet() {
  const links = document.querySelectorAll('link[rel="stylesheet"]');
  for (const l of links) if (/(^|\/)werkzeuge-print\.css(\?|#|$)/.test(l.getAttribute('href') || '')) return;
  document.head.appendChild(el('link', { rel: 'stylesheet', href: new URL('../../../css/werkzeuge-print.css', import.meta.url).href }));
}

/// Baut den Ausdruck in #print-root und öffnet den Druckdialog (iOS: dort als PDF teilen/sichern).
/// Alles bis window.print() läuft synchron im Aufruf (kein await): nur so zählt der Aufruf in iOS noch
/// zur Tipp-Geste. Das Graphenbild liegt schon fertig vor (preparePrintImage) oder ist eine Zeichenfläche.
export async function printReport(ctx, opts = null) {
  ensureStylesheet();
  installPrintHooks(ctx);
  const o = normalizeExportOptions(opts ? { ...opts } : { ...options(ctx) });
  printing = true;
  clearTimeout(printTimer);
  printTimer = setTimeout(() => { printing = false; }, 15000);
  fillPrintRoot(ctx, o, 'print');
  // Dateiname des PDFs = Titel des Dokuments (wie ExportView.fileName ohne „.pdf“)
  if (savedTitle === null) savedTitle = document.title;
  document.title = fileBase(o);
  if (typeof window.print !== 'function') {
    printing = false;
    restoreTitle();
    ctx.toast?.('Drucken ist hier nicht möglich');
    return false;
  }
  window.print();
  return true;
}

// MARK: Unterseite „Ausdruck / PDF“ (ExportView)

/// Kurzer Fingerabdruck aller Daten, die in den Ausdruck eingehen (refresh() baut nur bei Änderung neu)
function signature(ctx, o) {
  const g = ctx.graph;
  const parts = [o, Fmt.comma, dateText(), g.revision, g.paramRevision, g.view, g.settings, g.integral,
    g.canvasSize, g.statPoints];
  if (o.analysis && ctx.analysis) parts.push(ctx.analysis.state);
  if (o.equations && ctx.equations) parts.push(ctx.equations.state);
  if (o.solver && ctx.solver) parts.push(ctx.solver.selected, ctx.solver.equations, ctx.calc ? ctx.calc.vars : null);
  if (o.tape && ctx.calc) {
    const t = ctx.calc.tape;
    parts.push(t.length, t.length ? t[0].id : null, t.length ? t[t.length - 1].id : null);
  }
  try {
    return JSON.stringify(parts);
  } catch (e) {
    return String(Math.random());
  }
}

export function mountPrint(root, ctx) {
  ensureStylesheet();
  installPrintHooks(ctx);
  clear(root);
  const saveSoon = debounce(() => ctx.save?.(), 400);

  // Stand der Optionen, den die Bedienelemente zeigen (refresh() gleicht nur bei Abweichung an)
  let syncedJSON = '';

  // Option setzen, sichern, Vorschau planen
  const set = (key, value) => {
    const o = options(ctx);
    if (o[key] === value) return;
    o[key] = value;
    syncedJSON = JSON.stringify(o);
    ctx.save?.();
    updateStates();
    schedule(250);
  };

  // MARK: Kopf
  const back = el('button', { type: 'button', class: 'btn ghost back print-back', 'aria-label': 'Zurück zu Mehr',
    onclick: () => ctx.switchTab('more') }, icon('back'), el('span', null, ctx.zurueckText || 'Mehr'));
  const head = el('header', { class: 'pane-head' }, back, el('h1', null, 'Ausdruck / PDF'),
    el('div', { class: 'actions' },
      el('button', { type: 'button', class: 'btn icon ghost', 'aria-label': 'Drucken / als PDF sichern', title: 'Drucken / als PDF sichern',
        onclick: () => doPrint() }, icon('print'))));

  // MARK: Vorschau + Knöpfe
  const sheet = el('div', { class: 'pp-sheet' });
  const frame = el('div', { class: 'pp-frame' }, sheet);
  const previewBox = el('div', { class: 'print-preview', 'aria-label': 'Vorschau der ersten Seite' }, frame);
  const printBtn = el('button', { type: 'button', class: 'btn primary', onclick: () => doPrint() }, icon('print'), 'Drucken / als PDF sichern');
  const pngBtn = el('button', { type: 'button', class: 'btn', onclick: () => doPNG() }, icon('share'), 'Graph als PNG teilen');
  const previewCard = el('section', { class: 'card print-preview-card' },
    el('h2', null, 'Vorschau · Seite 1'),
    previewBox,
    el('div', { class: 'print-actions' }, printBtn, pngBtn),
    el('p', { class: 'print-hint' },
      'PDF auf dem iPhone: „Drucken / als PDF sichern“ tippen, im Druckdialog oben auf das Teilen-Symbol tippen und „In Dateien sichern“ wählen.'),
    el('p', { class: 'print-hint' },
      'Bei „A4 quer“ im Druckdialog das Querformat wählen. Das PNG hat 300 dpi; bei festem Maßstab ist es in Originalgröße (z. B. in Pages oder Word) ebenfalls maßstabsgetreu.'));

  // MARK: Optionen
  const o0 = options(ctx);
  const textField = (value, placeholder, key) => {
    const input = el('input', { type: 'text', class: 'field', value, placeholder, 'aria-label': placeholder,
      autocomplete: 'off', enterkeyhint: 'done' });
    input.addEventListener('input', () => {
      const o = options(ctx);
      o[key] = input.value;
      syncedJSON = JSON.stringify(o);
      saveSoon();
      schedule(350);
    });
    input.addEventListener('change', () => saveSoon.flush());
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } });
    return input;
  };
  const titleInput = textField(o0.title, 'Titel', 'title');
  const subInput = textField(o0.subtitle, 'Untertitel (Klasse, Name …)', 'subtitle');
  const formatSeg = segmented([{ value: 'portrait', label: 'A4 hoch' }, { value: 'landscape', label: 'A4 quer' }],
    o0.landscape ? 'landscape' : 'portrait', (v) => set('landscape', v === 'landscape'), { className: 'print-seg' });
  const scaleSeg = segmented(SCALES.map((sc) => ({ value: sc.id, label: sc.short, title: sc.title })), o0.scale,
    (v) => set('scale', v), { className: 'print-seg' });

  const sw = {};
  const toggle = (key, label, hint = null) => {
    sw[key] = switchControl(label, o0[key], (v) => set(key, v), { hint });
    return sw[key];
  };
  const eqLabel = el('span', null, '');
  const solverHint = el('span', null, '');

  const optionsCol = el('div', { class: 'print-col print-col-options' },
    el('section', { class: 'card print-opts' },
      el('h2', null, 'Kopf'),
      el('label', { class: 'lbl' }, 'Titel'), titleInput,
      el('label', { class: 'lbl' }, 'Untertitel'), subInput,
      el('label', { class: 'lbl' }, 'Format'), formatSeg),
    el('section', { class: 'card print-opts' },
      el('h2', null, 'Graph'),
      toggle('graph', 'Graph'),
      el('div', { class: 'print-field' }, el('label', { class: 'lbl' }, 'Maßstab (1 LE = …)'), scaleSeg),
      toggle('karo', 'Karopapier (5 mm)', 'nur mit festem Maßstab'),
      toggle('color', 'Farbig', 'sonst schwarz mit Strichmustern'),
      toggle('labels', 'Merkmale im Graph beschriften')),
    el('section', { class: 'card print-opts' },
      el('h2', null, 'Inhalte'),
      toggle('functions', 'Funktionsterme'),
      toggle('features', 'Merkmale (Nullstellen, Extrema …)'),
      toggle('intersections', 'Schnittpunkte der Graphen'),
      toggle('integral', 'Integral (Fläche im Graph)'),
      toggle('analysis', 'Ableitungen und Integral (Reiter Analysis)'),
      toggle('equations', eqLabel),
      toggle('steps', '… mit Lösungsweg'),
      toggle('solver', 'Solver-Formel mit Werten', solverHint),
      toggle('tape', 'Rechenprotokoll')),
    el('p', { class: 'print-hint' }, 'Tipp: Für exakte Zentimeter beim Drucken „Tatsächliche Größe“ bzw. 100 % wählen.'));

  const body = el('div', { class: 'pane-body print-body' },
    el('div', { class: 'print-layout' },
      el('div', { class: 'print-col print-col-preview' }, previewCard),
      optionsCol));
  root.append(head, body);

  // MARK: Zustände der Bedienelemente

  const setDisabled = (node, dis) => {
    node.classList.toggle('is-disabled', dis);
    if (node.input) node.input.disabled = dis;
    else for (const b of node.children) b.disabled = dis;
  };

  function updateStates() {
    const o = options(ctx);
    setDisabled(scaleSeg, !o.graph);
    setDisabled(sw.karo, o.scale === 'fit' || !o.graph);
    setDisabled(sw.steps, !o.equations);
    const eqm = ctx.equations;
    eqLabel.textContent = `Gleichungen („${modeTitle(eqm ? eqm.mode : 'lgs')}“)`;
    const sv = ctx.solver;
    const eq = sv && sv.selected ? sv.equations.find((e) => e.id === sv.selected) : null;
    solverHint.textContent = eq ? `Formel ${eq.name}` : 'keine Formel gewählt (Reiter Solver)';
  }

  /// Bedienelemente an die gespeicherten Optionen angleichen (z. B. nach „Alles zurücksetzen“)
  function syncControls() {
    const o = options(ctx);
    const j = JSON.stringify(o);
    if (j === syncedJSON) return;
    syncedJSON = j;
    if (document.activeElement !== titleInput && titleInput.value !== o.title) titleInput.value = o.title;
    if (document.activeElement !== subInput && subInput.value !== o.subtitle) subInput.value = o.subtitle;
    formatSeg.setValue(o.landscape ? 'landscape' : 'portrait');
    scaleSeg.setValue(o.scale);
    for (const [k, node] of Object.entries(sw)) if (node.input.checked !== o[k]) node.input.checked = o[k];
  }

  // MARK: Vorschau der ersten Seite (verkleinert, wie PDFPreview)

  let builtSig = null;
  let timer = null;
  let prepTimer = null;
  const graphCache = { key: null, canvas: null };
  let fitScale = 0.4;
  const visible = () => root.isConnected && root.getClientRects().length > 0 && previewBox.clientWidth > 0;

  /// Maßstab der Vorschau: ganze Seite in der Breite der Karte, Höhe begrenzt
  function fit() {
    const o = options(ctx);
    const pg = printable(o).page;
    const pw = pg.w * PX_PER_MM, ph = pg.h * PX_PER_MM;
    // Breite ohne den Innenabstand der Vorschaufläche (sonst ragt A4 quer in den Rand)
    const cs = getComputedStyle(previewBox);
    const cw = previewBox.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
    if (!(cw > 0)) return;
    const vh = window.innerHeight || 800;
    const wide = root.clientWidth >= 720;
    const maxH = wide ? Math.max(320, vh - 170) : Math.max(240, vh * 0.42);
    const s = Math.min(cw / pw, maxH / ph);
    fitScale = s;
    frame.style.width = `${Math.floor(pw * s)}px`;
    frame.style.height = `${Math.floor(ph * s)}px`;
    sheet.style.width = `${pg.w}mm`;
    sheet.style.height = `${pg.h}mm`;
    sheet.style.transform = `scale(${s})`;
  }

  function renderPreview() {
    timer = null;
    if (!visible()) return;
    const o = options(ctx);
    const sig = signature(ctx, o);
    fit();
    const dpr = window.devicePixelRatio || 2;
    const ratio = Math.min(2, Math.max(0.6, dpr * fitScale * 1.15));
    let built;
    try {
      built = buildReport(ctx, o, { mode: 'canvas', ratio, preview: true, cache: graphCache });
    } catch (e) {
      console.error('Vorschau:', e);
      return;
    }
    clear(sheet);
    const area = printable(o);
    const content = el('div', { class: 'pp-content', style: {
      left: `${MARGIN.side}mm`, top: `${MARGIN.top}mm`, width: `${area.w}mm`, height: `${area.h}mm` } }, built.node);
    const foot = el('div', { class: 'pp-foot', style: { left: `${MARGIN.side}mm`, right: `${MARGIN.side}mm` } },
      el('span', null, 'Erstellt mit dem fx-991DE X Trainer'), el('span', null, 'Seite 1'));
    sheet.append(content, foot);
    // Blöcke, die nicht mehr ganz auf die erste Seite passen, ausblenden (der Druck bricht dort um)
    const limit = area.h * PX_PER_MM + 0.5;
    let cut = false;
    for (const child of built.node.children) {
      if (!cut && child.offsetTop + child.offsetHeight > limit && child !== built.node.firstElementChild) cut = true;
      if (cut) child.style.visibility = 'hidden';
    }
    builtSig = sig;
    schedulePrepare();
  }

  /// Druckbild im Hintergrund vorbereiten, damit „Drucken“ sofort (in der Tipp-Geste) drucken kann
  /// (etwas später als die Vorschau: das PNG zu kodieren dauert auf dem iPhone einen Moment)
  function schedulePrepare() {
    clearTimeout(prepTimer);
    prepTimer = setTimeout(() => {
      prepTimer = null;
      if (!visible()) return;
      try { preparePrintImage(ctx, options(ctx)); } catch (e) { console.error('Druckbild:', e); }
    }, 400);
  }

  function schedule(delay = 250) {
    clearTimeout(timer);
    timer = setTimeout(renderPreview, delay);
  }

  let raf = 0;
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (!visible()) return;
        fit();
        refresh();
      });
    }).observe(previewBox);
  }

  // MARK: Knöpfe

  async function doPrint() {
    haptic();
    saveSoon.flush();
    try {
      await printReport(ctx, options(ctx));
    } catch (e) {
      console.error('Drucken:', e);
      ctx.toast?.('Drucken fehlgeschlagen');
    }
  }

  function doPNG() {
    haptic();
    const o = options(ctx);
    let blob = null;
    try {
      blob = graphPNG(ctx, o);
    } catch (e) {
      console.error('PNG:', e);
    }
    if (!blob) { ctx.toast?.('Bild konnte nicht erzeugt werden'); return; }
    shareOrDownload(blob, fileBase(o) + '.png', trimWS(o.title) || 'fx-991 Trainer').catch(() => ctx.toast?.('Teilen fehlgeschlagen'));
  }

  function refresh() {
    syncControls();
    updateStates();
    if (!visible()) return;
    const sig = signature(ctx, options(ctx));
    if (sig !== builtSig && timer === null) schedule(builtSig === null ? 0 : 250);
  }

  updateStates();
  syncControls();
  return {
    refresh,
    show() { refresh(); schedulePrepare(); },
    hide() {
      clearTimeout(timer);
      timer = null;
      clearTimeout(prepTimer);
      prepTimer = null;
      dropPrepared();
    },
  };
}
