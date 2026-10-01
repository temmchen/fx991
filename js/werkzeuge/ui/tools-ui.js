// tools-ui.js – Arbeitsbereiche „Analysis“, „Gleichungen“ und „Solver“ sowie die Unterseiten „Konstanten“
// und „Protokoll“ von „Mehr“. Portierung der Ansichten AnalysisView.swift, EquationsView.swift,
// SolverView.swift, Constants.swift (ConstantsView) und TapeView.swift für Touch:
// Trefferflächen ≥ 44 pt, Werte über „→ X“ in den Rechner, statt Mac-Menüs Blätter von unten.
// refresh() baut Eingabefelder nur neu auf, wenn sich die Struktur ändert (Anzahl Gleichungen, Grad,
// Variablen einer Formel …); sonst werden nur Werte und Ergebnisse aktualisiert – ein gerade
// bearbeitetes Feld behält Fokus und Text. app.js ruft refresh() höchstens einmal pro Bild auf; eigene
// Eingaben zeichnen über frameScheduler ebenfalls gebündelt im nächsten Bild.
import { el, clear, icon, mathField, numberField, segmented, switchControl, openSheet, confirmSheet, copyText,
  shareOrDownload, longPress, haptic } from './common.js';
import { Fmt } from '../fmt.js';
import { evaluateConstant } from '../expression.js';
import { subscripted } from '../numerics.js';
import { AnalysisModel } from '../analysis.js';
import { LGSSolver } from '../equations.js';
import { EQ_MODES, LGS_MIN, LGS_MAX, DEGREE_MIN, DEGREE_MAX } from '../eqmodel.js';
import { GROUPS, CONSTANT_TEXTS, splitSymbol, valueText, copyText as constantCopyText } from '../constants.js';
import { Calculator } from '../calculator.js';

// MARK: - Gemeinsame Hilfen

/// Zeichnen im nächsten Bild; mehrere Aufrufe innerhalb eines Bildes ergeben einen Durchlauf
function frameScheduler(fn) {
  let pending = false;
  const run = () => {
    pending = false;
    fn();
  };
  return () => {
    if (pending) return;
    pending = true;
    const raf = globalThis.requestAnimationFrame;
    if (typeof raf === 'function') raf(run); else setTimeout(run, 16);
  };
}

/// Eingabefeld hat gerade den Fokus (wird bearbeitet)
function isFocused(node) {
  return typeof document !== 'undefined' && document.activeElement === node;
}

/// Feldinhalt setzen, ohne ein gerade bearbeitetes Feld zu stören (force: nach einer Aktion wie „Lösen“)
function syncValue(input, text, force = false) {
  if (!input || (!force && isFocused(input))) return;
  if (input.value !== text) input.value = text;
}

/// `try? evaluateConstant(t)` mit endlichem Ergebnis – sonst null
function tryConst(t) {
  try {
    const v = evaluateConstant(String(t ?? ''));
    return Number.isFinite(v) ? v : null;
  } catch (e) {
    return null;
  }
}

/// Zufällige Kennung für Protokollzeilen (UUID-Text wie im Rechner)
function newID() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') {
    try { return c.randomUUID().toUpperCase(); } catch (e) { /* Ersatz unten */ }
  }
  let s = '';
  for (let i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
  s = s.toUpperCase();
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-4${s.slice(13, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

let activeStates = false;

/// iOS zeigt :active (Druckzustand der Knöpfe) nur, wenn irgendwo touchstart abgehört wird
function enableActiveStates() {
  if (activeStates || typeof document === 'undefined') return;
  activeStates = true;
  document.addEventListener('touchstart', () => {}, { passive: true });
}

/// Kopfzeile (Titel, optional „‹ Mehr“, Aktionen) und scrollender Körper eines Bereichs
function paneFrame(root, title, { back = null } = {}) {
  enableActiveStates();
  clear(root);
  root.classList.add('tools-pane');
  const h1 = el('h1', { text: title });
  const actions = el('div', { class: 'actions' });
  const backBtn = back
    ? el('button', { type: 'button', class: 'btn ghost back tools-back', title: 'Zurück zu „Mehr“', onclick: back },
      icon('back'), el('span', { text: 'Mehr' }))
    : null;
  const head = el('div', { class: 'pane-head' }, backBtn, h1, actions);
  const body = el('div', { class: 'pane-body' });
  root.append(head, body);
  return { head, h1, actions, body };
}

/// Leiste zwischen Kopf und Körper (scrollt nicht mit)
function toolbar(root, body, ...children) {
  const bar = el('div', { class: 'tools-bar' }, ...children);
  root.insertBefore(bar, body);
  return bar;
}

function iconButton(name, label, onclick, extra = '') {
  return el('button', { type: 'button', class: `btn icon ghost ${extra}`.trim(), 'aria-label': label, title: label, onclick },
    icon(name));
}

function textButton(label, onclick, extra = '') {
  return el('button', { type: 'button', class: `btn ${extra}`.trim(), onclick }, label);
}

/// Knopf „→ X“: Wert in den Rechner (wie der Pfeil-Knopf der Mac-App)
function pushButton(ctx, value, label) {
  return el('button', {
    type: 'button', class: 'btn push-btn', 'aria-label': `${label || 'Wert'} in den Rechner (Ans)`, title: 'In den Rechner (Ans)',
    onclick: () => { ctx.push(value, label); haptic(); },
  }, '→ Ans');
}

/// Ergebniszeile (Monospace) mit optionalem Knopf „→ X“ (SolutionLine in Swift)
function solutionLine(ctx, text, value = null, label = '') {
  return el('div', { class: 'sol-line' },
    el('span', { class: 'sol-text', text }),
    typeof value === 'number' && Number.isFinite(value) ? pushButton(ctx, value, label) : null);
}

function caption(text, extra = '') {
  return el('p', { class: `caption ${extra}`.trim(), text });
}

function separatorLine() {
  return el('hr', { class: 'tools-sep' });
}

/// Einfaches Textfeld ohne Rechen-Leiste (Namen, Beschreibungen, Einheiten)
function plainField(value, { placeholder = '', label = null, className = '', onInput = null, onEnter = null,
  autocapitalize = 'off', enterkeyhint = 'done' } = {}) {
  const input = el('input', {
    type: 'text', class: `field ${className}`.trim(), value: value ?? '', placeholder,
    'aria-label': label || placeholder || null, autocapitalize, autocomplete: 'off', autocorrect: 'off',
    spellcheck: 'false', enterkeyhint,
  });
  if (onInput) input.addEventListener('input', () => onInput(input.value, input));
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.isComposing) return;
    e.preventDefault();
    if (onEnter) onEnter(input.value, input); else input.blur();
  });
  return input;
}

/// Stepper −/+ (wie Stepper in SwiftUI)
function stepper(value, min, max, onChange, label) {
  return el('div', { class: 'stepper', role: 'group', 'aria-label': label },
    el('button', { type: 'button', class: 'btn icon', 'aria-label': `${label}: weniger`, disabled: value <= min,
      onclick: () => onChange(Math.max(min, value - 1)) }, icon('minus')),
    el('button', { type: 'button', class: 'btn icon', 'aria-label': `${label}: mehr`, disabled: value >= max,
      onclick: () => onChange(Math.min(max, value + 1)) }, icon('plus')));
}

/// Breite eines Bereichs beobachten (ResizeObserver); verborgene Bereiche (Breite 0) zählen nicht
function observeWidth(node, threshold, onChange) {
  let wide = null;
  const check = (w) => {
    if (!(w > 0)) return;
    const now = w >= threshold;
    if (now === wide) return;
    wide = now;
    onChange(now);
  };
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver((entries) => { for (const e of entries) check(e.contentRect.width); }).observe(node);
  } else if (typeof window !== 'undefined') {
    window.addEventListener('resize', () => check(node.clientWidth));
  }
  check(node.clientWidth);
}

/// Pfeil „›“ am Ende einer Listenzeile (grau, wie .list-item .chev)
function chevron() {
  const c = icon('chevron');
  c.classList.add('chev');
  return c;
}

/// Symbol mit echter Tiefstellung: „ρ_Cu“ → ρ mit tiefgestelltem Cu (SymbolText in Swift)
function symbolNodes(symbol) {
  const [base, sub] = splitSymbol(symbol);
  return sub ? [base, el('sub', { text: sub })] : [symbol];
}

// MARK: - Analysis

/// Fläche ∫ₐᵇ im Graph zeigen; die Funktion wird bei Bedarf angelegt (AppModel.showArea)
function showArea(ctx, text, a, b) {
  const g = ctx.graph;
  const t = String(text).trim();
  let name = null;
  const row = g.rows.find((r) => r.text.trim() === t);
  const c = row ? g.compiledRow(row.id) : null;
  if (c && c.isFunction) name = c.name; else name = g.addFunctionRow(t);
  if (!name) return;
  g.integrate(name, a, b);
  const vp = { ...g.view };
  if (a < vp.xMin || b > vp.xMax) {
    const m = (b - a) * 0.25;
    vp.xMin = Math.min(vp.xMin, a - m);
    vp.xMax = Math.max(vp.xMax, b + m);
    g.view = vp;
    g.fitY();
  }
  ctx.changed();
  ctx.switchTab('graph');
}

export function mountAnalysis(root, ctx) {
  const model = ctx.analysis;
  const f = paneFrame(root, 'Analysis');
  const sched = frameScheduler(() => render());
  f.actions.append(el('button', { type: 'button', class: 'btn ghost an-from', onclick: () => pickFromGraph() },
    icon('graph'), el('span', { text: 'Aus dem Graph' })));

  // Funktion
  const textField = mathField(model.text, {
    placeholder: 'Funktion, z. B. f(x) = x^3 - 2x  oder  u(t) = 325 sin(2π·50t)', label: 'Funktion',
    onInput: (v) => { model.text = v; sched(); },
  });
  const notesBox = el('div', { class: 'an-notes' });
  const errorBox = el('p', { class: 'error', hidden: true });

  // Ableitungen
  const formulas = el('div', { class: 'an-formulas' });
  const d1Btn = el('button', { type: 'button', class: 'btn', onclick: () => plotDerivative(0) });
  const d2Btn = el('button', { type: 'button', class: 'btn', onclick: () => plotDerivative(1) });
  const x0Label = el('span', { class: 'an-lbl' });
  const x0Field = numberField(model.x0, { label: 'Stelle', onInput: (v) => { model.x0 = v; sched(); }, className: 'an-short' });
  const valuesBox = el('div', { class: 'an-values' });
  const linesBox = el('div', { class: 'an-lines' });
  const derivCard = el('section', { class: 'card an-card', hidden: true },
    el('h2', { text: 'Ableitungen' }), formulas,
    el('div', { class: 'row wrap an-btns' }, d1Btn, d2Btn),
    separatorLine(),
    el('label', { class: 'an-at' }, x0Label, x0Field),
    valuesBox, linesBox);

  // Integral
  const antiBox = el('div', { class: 'an-anti' });
  const aLabel = el('span', { class: 'an-lbl' });
  const bLabel = el('span', { class: 'an-lbl' });
  const aField = numberField(model.a, { placeholder: 'a', label: 'Untere Grenze', onInput: (v) => { model.a = v; sched(); }, className: 'an-short' });
  const bField = numberField(model.b, { placeholder: 'b', label: 'Obere Grenze', onInput: (v) => { model.b = v; sched(); }, className: 'an-short' });
  const gField = mathField(model.g, {
    placeholder: 'g(x) für die Fläche zwischen zwei Graphen', label: 'Zweite Funktion',
    onInput: (v) => { model.g = v; sched(); },
  });
  const intBox = el('div', { class: 'an-int' });
  const intCard = el('section', { class: 'card an-card', hidden: true },
    el('h2', { text: 'Integral' }), antiBox,
    el('div', { class: 'an-bounds' }, el('label', { class: 'an-at' }, aLabel, aField), el('label', { class: 'an-at' }, bLabel, bField)),
    el('label', { class: 'an-g' }, el('span', { class: 'an-lbl', text: 'Zweite Funktion (optional):' }), gField),
    intBox);

  f.body.append(el('div', { class: 'an-top' }, textField, notesBox, errorBox), derivCard, intCard);

  let last = null;    // zuletzt gezeigtes Ergebnis (aus dem Zwischenspeicher des Modells)
  let cur = null;     // Ausgabe für die Knöpfe

  function plotDerivative(k) {
    if (!cur) return;
    const n = cur.name, v = cur.variable;
    const marks = k === 0 ? "'" : "''";
    ctx.plot([cur.source !== null ? `y = ${n}${marks}(${v})` : 'y = ' + cur.derivInput[k]]);
  }

  function formulaRow(lhs, rhs) {
    return [el('span', { class: 'an-lhs', text: lhs }), el('span', { class: 'an-eq', text: '=' }), el('span', { class: 'an-rhs', text: rhs })];
  }

  function lineRow(text, onPlot) {
    return el('div', { class: 'sol-line an-line' }, el('span', { class: 'sol-text small', text }),
      el('button', { type: 'button', class: 'btn', onclick: onPlot }, 'Im Graph'));
  }

  function kennwert(grid, label, v, formula) {
    grid.append(
      el('span', { class: 'kw-label', text: label }),
      el('span', { class: 'kw-value', text: v !== null && v !== undefined ? Fmt.num(v, 8) : '–' }),
      v !== null && v !== undefined && Number.isFinite(v) ? pushButton(ctx, v, label) : el('span', { class: 'kw-none' }),
      el('span', { class: 'kw-formula', text: formula }));
  }

  function render() {
    syncValue(textField, model.text);
    syncValue(x0Field, model.x0);
    syncValue(aField, model.a);
    syncValue(bField, model.b);
    syncValue(gField, model.g);
    const res = model.cachedCompute(ctx.graph);
    if (res === last) return;
    last = res;
    if (!res.ok) {
      cur = null;
      errorBox.textContent = res.error;
      errorBox.hidden = false;
      clear(notesBox);
      derivCard.hidden = true;
      intCard.hidden = true;
      return;
    }
    const r = res.out;
    cur = r;
    const n = r.name, v = r.variable, N = n.toUpperCase();
    errorBox.hidden = true;
    clear(notesBox).append(...r.notes.map((t) => caption(t)));
    derivCard.hidden = false;
    intCard.hidden = false;

    // Ableitungen
    clear(formulas).append(
      ...formulaRow(`${n}(${v})`, r.fPretty), ...formulaRow(`${n}′(${v})`, r.derivs[0]),
      ...formulaRow(`${n}″(${v})`, r.derivs[1]), ...formulaRow(`${n}‴(${v})`, r.derivs[2]));
    d1Btn.textContent = `${n}′ im Graph zeigen`;
    d2Btn.textContent = `${n}″ im Graph zeigen`;
    x0Label.textContent = `An der Stelle ${v}₀ =`;
    clear(valuesBox).append(...r.values.map(([t, y]) =>
      solutionLine(ctx, `${t} = ${Fmt.num(y, 8)}`, Number.isFinite(y) ? y : null, t)));
    clear(linesBox);
    if (r.tangent) {
      const [m, b] = r.tangent;
      linesBox.append(lineRow(`Tangente:  t(${v}) = ` + AnalysisModel.line(m, b, v), () => ctx.plot([AnalysisModel.plotLine('t', m, b)])));
    }
    if (r.normal) {
      const [m, b] = r.normal;
      linesBox.append(lineRow(`Normale:   n(${v}) = ` + AnalysisModel.line(m, b, v), () => ctx.plot([AnalysisModel.plotLine('n', m, b)])));
    }

    // Stammfunktion
    clear(antiBox);
    if (r.F !== null) {
      antiBox.append(el('div', { class: 'an-formulas' }, ...formulaRow(`${N}(${v})`, r.F + ' + C')),
        caption(`Stammfunktion (Probe: ${N}′ = ${n} numerisch geprüft)`));
    } else {
      antiBox.append(caption('Keine elementare Stammfunktion nach den Standardregeln gefunden – Integral wird numerisch berechnet.', 'callout'));
    }
    aLabel.textContent = `von ${v} =`;
    bLabel.textContent = `bis ${v} =`;

    // bestimmtes Integral, Fläche, Kennwerte
    clear(intBox);
    if (r.integral === null || r.aVal === null || r.bVal === null) return;
    const a = r.aVal, b = r.bVal, I = r.integral;
    intBox.append(solutionLine(ctx, `∫ von ${Fmt.num(a, 6)} bis ${Fmt.num(b, 6)} ${n}(${v}) d${v} = ${Fmt.num(I, 10)}`, I, '∫'));
    if (r.exact !== null && r.F !== null) {
      intBox.append(el('p', { class: 'an-exact', text: `= ${N}(${Fmt.num(b, 6)}) − ${N}(${Fmt.num(a, 6)}) = ${Fmt.num(r.exact, 10)}` }));
    }
    if (r.pole) {
      intBox.append(el('p', { class: 'warn', text: '⚠ Polstelle oder Definitionslücke im Intervall – uneigentliches Integral, Wert mit Vorsicht' }));
    }
    intBox.append(separatorLine());
    const withWhat = r.gName !== null ? `zwischen ${n} und ${r.gName}` : `zwischen Graph und ${v}-Achse`;
    if (r.area !== null) intBox.append(solutionLine(ctx, `Flächeninhalt ${withWhat}: A = ${Fmt.num(r.area, 10)}`, r.area, 'A'));
    if (r.zeros.length > 0) {
      intBox.append(
        caption((r.gName === null ? 'Nullstellen im Intervall: ' : 'Schnittstellen im Intervall: ') + r.zeros.map((z) => Fmt.num(z, 6)).join('; ')),
        caption('Teilflächen: ' + r.pieces.map((p) => '|' + Fmt.num(p[2], 6) + '|').join(' + ')));
    }
    const text = model.text;
    const FI = r.FInput;
    intBox.append(el('div', { class: 'row wrap an-btns' },
      textButton('Fläche im Graph zeigen', () => showArea(ctx, text, Math.min(a, b), Math.max(a, b))),
      FI !== null ? textButton(`${N}(${v}) im Graph zeigen`, () => ctx.plot(['y = ' + FI])) : null));
    intBox.append(separatorLine(), el('h3', { text: 'Kennwerte im Intervall (Wechselstromtechnik)' }));
    const grid = el('div', { class: 'kw-grid' });
    kennwert(grid, 'Mittelwert (arithmetisch)', r.mean, `1/T · ∫ ${n} d${v}`);
    kennwert(grid, 'Gleichrichtwert', r.rectified, `1/T · ∫ |${n}| d${v}`);
    kennwert(grid, 'Effektivwert', r.rms, `√(1/T · ∫ ${n}² d${v})`);
    kennwert(grid, 'Scheitelwert', r.peak, `max |${n}|`);
    if (r.rms !== null && r.rectified !== null && r.rectified > 0) {
      kennwert(grid, 'Formfaktor', r.rms / r.rectified, 'Effektivwert / Gleichrichtwert');
    }
    if (r.rms !== null && r.peak !== null && r.rms > 0) {
      kennwert(grid, 'Scheitelfaktor', r.peak / r.rms, 'Scheitelwert / Effektivwert');
    }
    intBox.append(grid);
  }

  /// „Aus dem Graph“: Funktionszeilen des Graphen zur Auswahl (Menü in Swift)
  function pickFromGraph() {
    const g = ctx.graph;
    const rows = g.rows.filter((r) => g.compiledRow(r.id)?.isFunction === true);
    let sheet = null;
    const content = rows.length > 0
      ? el('div', { class: 'list pick-list' }, rows.map((r) => el('button', {
        type: 'button', class: 'list-item',
        onclick: () => {
          model.text = r.text;
          syncValue(textField, r.text, true);
          sheet?.close();
          render();
        },
      }, el('span', { class: 'pick-dot', style: { background: `var(--c${((r.color % 8) + 8) % 8})` } }),
      el('span', { class: 'grow mono', text: r.text }))))
      : el('p', { class: 'empty', text: 'Im Graph ist noch keine Funktion eingetragen.' });
    sheet = openSheet('Aus dem Graph', content);
  }

  return {
    /// { force: true }: Darstellung geändert (Dezimalkomma, Erscheinungsbild) → Ergebnisse neu aufbauen
    refresh: (o) => { if (o && o.force) last = null; render(); },
    show: () => render(),
  };
}

// MARK: - Gleichungen

/// Koeffizientenfeld; Eingabetaste springt ins nächste Feld des Panels
function coefInput(value, label, onInput, extra = '') {
  return numberField(value, {
    placeholder: '0', label, onInput, enterkeyhint: 'next', className: `eq-coef ${extra}`.trim(),
    onEnter: (_, input) => focusNext(input),
  });
}

function focusNext(input) {
  const scope = input.closest('.eq-panel') || document;
  const list = Array.from(scope.querySelectorAll('input.eq-coef'));
  const i = list.indexOf(input);
  if (i >= 0 && i + 1 < list.length) {
    const next = list[i + 1];
    next.focus();
    try { next.setSelectionRange(0, next.value.length); } catch (e) { /* ohne Markierung */ }
  } else {
    input.blur();
  }
}

function varLabel(name) {
  return el('span', { class: 'eq-var', text: name });
}

function errorText(message) {
  return el('p', { class: 'error', text: message });
}

/// Matrix mit eckigen Klammern und Trennstrich vor der rechten Seite (MatrixView in Swift)
function matrixView(rows) {
  const n = rows.length > 0 ? rows[0].length : 0;
  const grid = el('div', { class: 'mx-grid', style: { gridTemplateColumns: `repeat(${n}, auto)` } });
  for (const row of rows) {
    row.forEach((v, j) => grid.append(el('span', { class: j === n - 1 ? 'mx-cell mx-rhs' : 'mx-cell', text: v })));
  }
  return el('div', { class: 'mx' }, el('span', { class: 'mx-br l' }), grid, el('span', { class: 'mx-br r' }));
}

/// Lösungsweg (Gauß) – Inhalt wird erst beim Aufklappen gebaut
function stepsDetails(model, r) {
  const det = el('details', { class: 'card eq-steps' },
    el('summary', { text: r.exact ? 'Lösungsweg (Gauß-Verfahren, exakt mit Brüchen)' : 'Lösungsweg (Gauß-Verfahren, Dezimalzahlen)' }));
  let built = false;
  const build = () => {
    if (built) return;
    built = true;
    const box = el('div', { class: 'eq-steps-body' });
    for (const st of r.steps) {
      box.append(el('div', { class: 'eq-step' }, matrixView(st.matrix),
        el('div', { class: 'eq-ops' }, st.ops.map((o) => el('div', { text: o })))));
    }
    if (r.backSubstitution.length > 0) {
      box.append(el('h3', { text: 'Rückwärtseinsetzen' }),
        el('div', { class: 'eq-back' }, r.backSubstitution.map((t) => el('div', { text: t }))));
    }
    det.append(box);
  };
  if (model.showSteps) {
    det.open = true;
    build();
  }
  det.addEventListener('toggle', () => {
    if (det.open) build();
    if (model.showSteps !== det.open) model.showSteps = det.open;
  });
  return det;
}

function lgsPanel(ctx, model, touch) {
  const n = model.n;
  const names = LGSSolver.variableNames(n);
  const fieldsA = [];
  const fieldsB = [];
  const grid = el('div', { class: 'eq-grid', style: { gridTemplateColumns: `repeat(${3 * n + 3}, auto)` } });
  grid.style.setProperty('--n', String(n));
  for (let i = 0; i < n; i++) {
    grid.append(el('span', { class: 'eq-rowno', text: `(${i + 1})` }));
    const row = [];
    for (let j = 0; j < n; j++) {
      const input = coefInput(model.A[i][j], `Zeile ${i + 1}, ${names[j]}`, (v) => { model.setA(i, j, v); touch(); }, n > 5 ? 'narrow' : '');
      row.push(input);
      grid.append(el('span', { class: 'eq-op', text: j > 0 ? '+' : '' }), input, varLabel(names[j]));
    }
    fieldsA.push(row);
    const bi = coefInput(model.b[i], `Zeile ${i + 1}, rechte Seite`, (v) => { model.setB(i, v); touch(); }, 'rhs');
    fieldsB.push(bi);
    grid.append(el('span', { class: 'eq-eqs', text: '=' }), bi);
  }
  const setN = (v) => { model.n = v; touch(true); };
  const result = el('div', { class: 'eq-result' });
  const node = el('div', { class: 'eq-lgs' },
    el('div', { class: 'eq-head' },
      el('div', { class: 'row eq-count' }, el('span', { class: 'grow', text: `${n} Gleichungen mit ${n} Unbekannten` }),
        stepper(n, LGS_MIN, LGS_MAX, setN, 'Anzahl der Gleichungen')),
      el('div', { class: 'row' },
        textButton('Beispiel', () => { model.loadExample(); touch(true); }),
        textButton('Leeren', () => { model.clearLGS(); touch(true); }))),
    caption('Brüche wie 1/3 und Dezimalzahlen (2,5) sind erlaubt; leere Felder zählen als 0.'),
    el('div', { class: 'eq-grid-scroll' }, grid),
    result);

  let last = null;
  function update(force = false) {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) syncValue(fieldsA[i][j], model.A[i][j], force);
      syncValue(fieldsB[i], model.b[i], force);
    }
    const res = model.result('lgs');
    if (res === last) return;
    last = res;
    clear(result);
    if (!res.ok) {
      result.append(errorText(res.error));
      return;
    }
    const r = res.out;
    result.append(el('div', { class: 'card eq-res' },
      el('div', { class: 'eq-headline', text: r.summary }),
      r.solutionLines.map((line, k) => solutionLine(ctx, line, r.kind === 'unique' ? r.values[k] : null, names[k])),
      caption(r.detText),
      r.kind === 'unique'
        ? textButton(`Alle Werte in den Rechner (${names.map((n, k) => `${n}→${'ABCDEF'[k] || '?'}`).join(', ')})`,
          () => r.values.forEach((v, k) => ctx.push(v, names[k])))
        : null),
    stepsDetails(model, r));
  }
  return { node, update, invalidate: () => { last = null; } };
}

/// Ergebniskarte der Polynomgleichungen (PolyResultView in Swift)
function polyResultCard(ctx, model, mode, r) {
  return el('div', { class: 'card eq-res' },
    el('div', { class: 'eq-polytext', text: r.polyText }),
    r.infoLines.map((t) => el('div', { class: 'eq-info', text: t })),
    separatorLine(),
    r.rootLines.map((t) => solutionLine(ctx, t)),
    r.exactLines.length > 0
      ? [separatorLine(), el('h3', { text: 'Exakt' }), el('div', { class: 'eq-exact' }, r.exactLines.map((t) => el('div', { text: t })))]
      : null,
    el('div', { class: 'row wrap eq-actions' },
      textButton('Im Graph zeigen', () => ctx.plot(model.plotTexts(mode))),
      r.realRoots.length > 0
        ? textButton(r.realRoots.length > 1 ? `Reelle Lösungen in den Rechner (${r.realRoots.map((x, i) => `x${subscripted(i + 1)}→${'ABCDEF'[i] || '?'}`).join(', ')})` : 'Reelle Lösung in den Rechner (Ans)',
          () => r.realRoots.forEach((x, i) => ctx.push(x, `x${subscripted(i + 1)}`)))
        : null,
      r.roots.some((z) => z.im !== 0) ? caption('Komplexe Lösungen: im Rechner mit COMPLEX eingeben') : null));
}

/// Panel mit festen Koeffizienten (quadratisch, kubisch): terms = [[Name, Potenztext], …]
function fixedPolyPanel(ctx, model, touch, mode, title, list, setter, terms) {
  const fields = terms.map(([name], i) => coefInput(list()[i], `Koeffizient ${name}`, (v) => { setter(i, v); touch(); }));
  const row = el('div', { class: 'eq-coefs' }, terms.map(([, power], i) => {
    const last = i === terms.length - 1;
    return el('span', { class: 'eq-term' }, fields[i],
      power ? varLabel(power) : null,
      last ? el('span', { class: 'eq-eqs', text: '= 0' }) : el('span', { class: 'eq-op', text: '+' }));
  }));
  const result = el('div', { class: 'eq-result' });
  const node = el('div', { class: 'eq-poly' }, el('div', { class: 'eq-title', text: title }), row, result);
  let last = null;
  function update(force = false) {
    const values = list();
    fields.forEach((input, i) => syncValue(input, values[i], force));
    const res = model.result(mode);
    if (res === last) return;
    last = res;
    clear(result).append(res.ok ? polyResultCard(ctx, model, mode, res.out) : errorText(res.error));
  }
  return { node, update, invalidate: () => { last = null; } };
}

function polynomialPanel(ctx, model, touch) {
  const deg = model.degree;
  const fields = new Map();   // Potenz → Feld
  const grid = el('div', { class: 'eq-polygrid' });
  for (let p = deg; p >= 0; p--) {
    const input = coefInput(model.poly[p], `Koeffizient a${subscripted(p)}`, (v) => { model.setPoly(p, v); touch(); });
    fields.set(p, input);
    grid.append(el('span', { class: 'eq-term' }, input,
      p === 0 ? null : varLabel(p === 1 ? 'x' : 'x' + Fmt.superscript(p)),
      p > 0 ? el('span', { class: 'eq-op', text: '+' }) : null));
  }
  const result = el('div', { class: 'eq-result' });
  const node = el('div', { class: 'eq-poly' },
    el('div', { class: 'row eq-count' }, el('span', { class: 'grow', text: `Grad ${deg}` }),
      stepper(deg, DEGREE_MIN, DEGREE_MAX, (v) => { model.degree = v; touch(true); }, 'Grad')),
    el('div', { class: 'eq-title', text: 'aₙ·xⁿ + … + a₁·x + a₀ = 0' }),
    grid, result);
  let last = null;
  function update(force = false) {
    for (const [p, input] of fields) syncValue(input, model.poly[p], force);
    const res = model.result('polynomial');
    if (res === last) return;
    last = res;
    clear(result).append(res.ok ? polyResultCard(ctx, model, 'polynomial', res.out) : errorText(res.error));
  }
  return { node, update, invalidate: () => { last = null; } };
}

function equationPanel(ctx, model, touch) {
  const lhs = mathField(model.lhs, { placeholder: 'linke Seite', label: 'linke Seite', onInput: (v) => { model.lhs = v; touch(); } });
  const rhs = mathField(model.rhs, { placeholder: 'rechte Seite', label: 'rechte Seite', onInput: (v) => { model.rhs = v; touch(); } });
  const from = numberField(model.from, { label: 'Intervall von', onInput: (v) => { model.from = v; touch(); }, className: 'eq-bound' });
  const to = numberField(model.to, { label: 'Intervall bis', onInput: (v) => { model.to = v; touch(); }, className: 'eq-bound' });
  const result = el('div', { class: 'eq-result' });
  const node = el('div', { class: 'eq-equation' },
    caption('Beliebige Gleichung in x – alle Lösungen im Intervall (numerisch, Vorzeichenwechsel und Berührstellen)', 'callout'),
    el('div', { class: 'eq-lr' }, lhs, el('span', { class: 'eq-eqs big', text: '=' }), rhs),
    el('div', { class: 'eq-interval' }, el('span', { text: 'Suchen im Intervall von' }), from, el('span', { text: 'bis' }), to),
    result);
  let last = null;
  function update(force = false) {
    syncValue(lhs, model.lhs, force);
    syncValue(rhs, model.rhs, force);
    syncValue(from, model.from, force);
    syncValue(to, model.to, force);
    const res = model.result('equation');
    if (res === last) return;
    last = res;
    clear(result);
    if (!res.ok) {
      result.append(errorText(res.error));
      return;
    }
    const r = res.out;
    const iv = `[${Fmt.num(r.from, 4)}; ${Fmt.num(r.to, 4)}]`;
    const count = r.solutions.length;
    result.append(el('div', { class: 'card eq-res' },
      el('div', { class: 'eq-headline', text: count === 0 ? `Keine Lösung im Intervall ${iv}.`
        : `${count} Lösung${count === 1 ? '' : 'en'} im Intervall ${iv}:` }),
      r.solutions.map((x, i) => solutionLine(ctx, `x${subscripted(i + 1)} = ${Fmt.num(x, 8)}`, x, `x${subscripted(i + 1)}`)),
      el('div', { class: 'row wrap eq-actions' },
        textButton('Beide Seiten im Graph zeigen (Schnittpunkte)', () => ctx.plot(model.plotTexts('equation'))))));
  }
  return { node, update, invalidate: () => { last = null; } };
}

export function mountEquations(root, ctx) {
  const model = ctx.equations;
  const f = paneFrame(root, 'Gleichungen');
  const sched = frameScheduler(() => render());
  const seg = segmented(EQ_MODES.map((m) => ({ value: m.id, label: m.title })), model.mode, (v) => {
    model.mode = v;
    render();
    f.body.scrollTop = 0;
    reveal();
  }, { className: 'eq-modes' });
  toolbar(root, f.body, seg);
  const host = el('div', { class: 'eq-panel' });
  f.body.append(host);

  let panel = null;
  let panelKey = null;

  /// touch(true): Knopf oder Stepper (Felder auch mit Fokus neu füllen) → sofort, sonst im nächsten Bild
  const touch = (now = false) => { if (now) render(true); else sched(); };

  /// gewählten Modus im (schmal scrollenden) Segmentschalter mittig zeigen
  function reveal() {
    const b = seg.querySelector('button.on');
    if (!b || !(seg.clientWidth > 0) || seg.scrollWidth <= seg.clientWidth) return;
    const d = b.getBoundingClientRect().left - seg.getBoundingClientRect().left;
    const left = seg.scrollLeft + d - (seg.clientWidth - b.offsetWidth) / 2;
    if (typeof seg.scrollTo === 'function') seg.scrollTo({ left, behavior: 'smooth' }); else seg.scrollLeft = left;
  }

  function render(force = false) {
    seg.setValue(model.mode);
    const key = model.mode + (model.mode === 'lgs' ? '|' + model.n : (model.mode === 'polynomial' ? '|' + model.degree : ''));
    if (key !== panelKey) {
      panelKey = key;
      switch (model.mode) {
        case 'lgs': panel = lgsPanel(ctx, model, touch); break;
        case 'quadratic':
          panel = fixedPolyPanel(ctx, model, touch, 'quadratic', 'a·x² + b·x + c = 0', () => model.quad,
            (i, v) => model.setQuad(i, v), [['a', 'x²'], ['b', 'x'], ['c', '']]);
          break;
        case 'cubic':
          panel = fixedPolyPanel(ctx, model, touch, 'cubic', 'a·x³ + b·x² + c·x + d = 0', () => model.cubic,
            (i, v) => model.setCubic(i, v), [['a', 'x³'], ['b', 'x²'], ['c', 'x'], ['d', '']]);
          break;
        case 'polynomial': panel = polynomialPanel(ctx, model, touch); break;
        default: panel = equationPanel(ctx, model, touch); break;
      }
      clear(host).append(panel.node);
    }
    panel.update(force);
  }

  let shownMode = null;
  return {
    refresh: (o) => { if (o && o.force && panel) panel.invalidate(); render(); },
    show: () => {
      render();
      if (shownMode !== model.mode) { shownMode = model.mode; reveal(); }
    },
  };
}

// MARK: - Solver

/// Blatt „Konstante aus dem Katalog einsetzen“ (ConstantMenu in Swift): Gruppen und Konstanten
function constantPicker(ctx, onPick) {
  const model = ctx.constants;
  const groups = GROUPS.filter((g) => model.items(g.id).length > 0);
  if (groups.length === 0) return;
  let current = groups[0].id;
  let sheet = null;
  const list = el('div', { class: 'list pick-list' });
  const fill = () => {
    clear(list).append(...model.items(current).map((c) => el('button', {
      type: 'button', class: 'list-item const-pick',
      onclick: () => { sheet?.close(); onPick(c); },
    }, el('span', { class: 'const-sym' }, symbolNodes(c.symbol)),
    el('span', { class: 'grow const-pick-text' },
      el('span', { class: 'mono', text: `= ${Fmt.sig(c.value, 8)} ${c.unit}`.trim() }),
      el('small', { class: 'muted', text: c.name })))));
  };
  const seg = segmented(groups.map((g) => ({ value: g.id, label: g.title })), current, (g) => {
    current = g;
    fill();
    const sb = list.closest('.sheet-body');
    if (sb) sb.scrollTop = 0;
  }, { className: 'pick-seg' });
  fill();
  sheet = openSheet(CONSTANT_TEXTS.helpMenu, el('div', { class: 'pick-body' }, seg, list));
}

export function mountSolver(root, ctx) {
  const model = ctx.solver;
  const calc = ctx.calc;
  const f = paneFrame(root, 'Solver');
  const sched = frameScheduler(() => render());
  const backBtn = el('button', { type: 'button', class: 'btn ghost back tools-back solver-back',
    onclick: () => { view = 'list'; render(); } }, icon('back'), el('span', { text: 'Formeln' }));
  f.head.insertBefore(backBtn, f.h1);
  f.actions.append(iconButton('plus', 'Neue Formel', () => addFormula()));
  f.body.classList.add('solver-body');
  const listCol = el('div', { class: 'solver-list' });
  const detailCol = el('div', { class: 'solver-detail' });
  f.body.append(listCol, detailCol);

  let view = model.selected ? 'detail' : 'list';   // schmal: Liste oder Formel
  let wide = false;                                 // breit: beides nebeneinander (wie HSplitView)
  let editing = false;                              // Liste ordnen

  const fmtVar = (v) => (calc.vars[v] !== undefined ? Fmt.num(calc.vars[v], 10) : '');

  // MARK: Liste
  let listKey = null;
  function renderList() {
    const key = JSON.stringify([model.equations.map((e) => [e.id, e.name, e.text, e.note]), model.selected, editing, wide]);
    if (key === listKey) return;
    listKey = key;
    const eqs = model.equations;
    const items = eqs.map((eq, i) => el('div', { class: `list-item solver-item${eq.id === model.selected ? ' on' : ''}` },
      el('button', { type: 'button', class: 'solver-pick', onclick: () => select(eq.id), 'aria-current': eq.id === model.selected ? 'true' : null },
        el('span', { class: 'solver-iname', text: eq.name || '–' }),
        el('span', { class: 'solver-itext', text: eq.text }),
        eq.note ? el('span', { class: 'solver-inote', text: eq.note }) : null),
      editing
        ? el('span', { class: 'solver-move' },
          el('button', { type: 'button', class: 'btn icon ghost up', 'aria-label': 'Nach oben', disabled: i === 0,
            onclick: () => { model.moveEquation(i, i - 1); sched(); } }, icon('chevron')),
          el('button', { type: 'button', class: 'btn icon ghost down', 'aria-label': 'Nach unten', disabled: i === eqs.length - 1,
            onclick: () => { model.moveEquation(i, i + 1); sched(); } }, icon('chevron')))
        : (wide ? null : chevron())));
    clear(listCol).append(
      eqs.length > 0 ? el('div', { class: 'list solver-items' }, items)
        : el('p', { class: 'empty', text: 'Keine Formeln – mit + anlegen oder die Standardformeln laden.' }),
      el('div', { class: 'row wrap solver-list-actions' },
        el('button', { type: 'button', class: 'btn', onclick: () => addFormula() }, icon('plus'), el('span', { text: 'Neue Formel' })),
        textButton('Standardformeln', () => { model.addDefaults(); sched(); }),
        eqs.length > 1 ? textButton(editing ? 'Fertig' : 'Ordnen', () => { editing = !editing; renderList(); }) : null));
  }

  function select(id) {
    if (model.selected !== id) {
      model.selected = id;
      ctx.changed();
    }
    view = 'detail';
    render();
    detailCol.scrollTop = 0;
  }

  // MARK: Formel
  let detailId = null;           // Formel, für die die Kopffelder gebaut sind
  let nameF = null, noteF = null, textF = null, msgBox = null, varsBox = null;
  let msgKey = null, varsKey = null;
  let rows = [];                 // [{ v, input, status, push }]
  let parsed = null;             // { text, err, vars } der gezeigten Formel

  function buildDetail(eq) {
    detailId = eq.id;
    msgKey = null;
    varsKey = null;
    const id = eq.id;
    nameF = plainField(eq.name, { placeholder: 'Name', label: 'Name', className: 'solver-name', autocapitalize: 'characters',
      onInput: (v) => { model.updateEquation(id, { name: v }); sched(); } });
    noteF = plainField(eq.note, { placeholder: 'Beschreibung', label: 'Beschreibung', autocapitalize: 'sentences',
      onInput: (v) => { model.updateEquation(id, { note: v }); sched(); } });
    textF = mathField(eq.text, { placeholder: 'Formel, z. B. P = U*I', label: 'Formel', className: 'solver-formula',
      onInput: (v) => { model.updateEquation(id, { text: v }); sched(); } });
    msgBox = el('div', { class: 'solver-msg' });
    varsBox = el('div', { class: 'solver-vars' });
    clear(detailCol).append(
      el('div', { class: 'card solver-head' }, el('div', { class: 'row' }, nameF, noteF), textF),
      msgBox, varsBox,
      el('div', { class: 'solver-foot' },
        el('button', { type: 'button', class: 'btn ghost danger', onclick: () => removeFormula(id) }, icon('trash'), el('span', { text: 'Formel löschen' }))));
  }

  function varRow(eqId, v) {
    const input = numberField(fmtVar(v), { placeholder: 'Wert', label: `Wert ${v}`, className: 'solver-val',
      onInput: (s, inp) => setVar(v, s, inp) });
    input.addEventListener('blur', () => { input.classList.remove('invalid'); syncValue(input, fmtVar(v), true); });
    const status = el('span', { class: 'solver-status' });
    const push = el('button', { type: 'button', class: 'btn push-btn', 'aria-label': `${v} in den Rechner (Ans)`,
      title: 'Wert in den Rechner (Ans)', onclick: () => { const x = calc.vars[v]; if (x !== undefined) { ctx.push(x, v); haptic(); } } }, '→ Ans');
    const node = el('div', { class: 'solver-var' },
      el('span', { class: 'solver-vname', text: v }),
      input,
      iconButton('constants', CONSTANT_TEXTS.helpMenu, () => constantPicker(ctx, (c) => {
        calc.vars[v] = c.value;
        ctx.changed();
        syncValue(input, fmtVar(v), true);
        input.classList.remove('invalid');
        render();
      }), 'solver-const'),
      el('button', { type: 'button', class: 'btn primary solver-solve', onclick: () => solveFor(eqId, v, input) }, 'Lösen'),
      el('div', { class: 'solver-var-foot' }, status, push));
    return { v, input, status, push, node };
  }

  /// Wert eintragen wie das Binding in Swift: leer = Variable löschen, sonst Term auswerten
  function setVar(v, s, input) {
    const t = s.trim();
    if (t === '') {
      delete calc.vars[v];
    } else {
      const x = tryConst(t);
      if (x === null) { input.classList.add('invalid'); return; }
      calc.vars[v] = x;
    }
    input.classList.remove('invalid');
    ctx.changed();
    sched();
  }

  function solveFor(eqId, v, input) {
    const r = model.solveInto(eqId, v, calc.vars, calc.angle);
    if (!r) return;
    if (r.tape) calc.tapeInfo(r.tape);
    ctx.changed();
    syncValue(input, fmtVar(v), true);
    input.classList.remove('invalid');
    haptic();
    render();
  }

  function renderDetail() {
    const eq = model.selected ? model.equation(model.selected) : null;
    if (!eq) {
      const emptyKey = 'leer|' + wide;
      if (detailId === emptyKey) return;
      detailId = emptyKey;
      nameF = noteF = textF = msgBox = varsBox = null;
      rows = [];
      clear(detailCol).append(el('div', { class: 'empty solver-empty' }, icon('solver'),
        el('p', { text: wide ? 'Formel links auswählen oder mit + anlegen' : 'Formel auswählen oder mit + anlegen' })));
      return;
    }
    if (detailId !== eq.id) buildDetail(eq);
    syncValue(nameF, eq.name);
    syncValue(noteF, eq.note ?? '');
    syncValue(textF, eq.text);
    // Formel nur bei geändertem Text neu zerlegen (refresh läuft nach jeder Rechnertaste)
    if (!parsed || parsed.text !== eq.text) {
      const e = model.error(eq);
      parsed = { text: eq.text, err: e, vars: e !== null ? [] : model.variables(eq) };
    }
    const err = parsed.err;
    const mk = JSON.stringify([err, eq.name]);
    if (mk !== msgKey) {
      msgKey = mk;
      clear(msgBox).append(err !== null ? errorText(err)
        : caption(`Werte eintragen und bei der gesuchten Größe „Lösen“ tippen. Am Rechner: SOLVER (Shift 7) → ${eq.name} → Wert tippen + Menütaste speichert, Menütaste allein löst.`, 'callout'));
    }
    const vars = parsed.vars;
    const vk = JSON.stringify(vars);
    if (vk !== varsKey) {
      varsKey = vk;
      rows = vars.map((v) => varRow(eq.id, v));
      clear(varsBox).append(...rows.map((r) => r.node));
    }
    for (const r of rows) {
      syncValue(r.input, fmtVar(r.v));
      r.status.textContent = model.status[eq.id + r.v] ?? '';
      r.push.disabled = calc.vars[r.v] === undefined;
    }
  }

  function render() {
    if (!model.selected && view === 'detail' && !wide) view = 'list';
    root.dataset.view = view;
    root.classList.toggle('is-wide', wide);
    backBtn.hidden = wide || view !== 'detail';
    renderList();
    renderDetail();
  }

  function addFormula() {
    model.addEquation();
    editing = false;
    view = 'detail';
    render();
    detailCol.scrollTop = 0;
    if (textF) {
      textF.focus();
      try { textF.setSelectionRange(0, textF.value.length); } catch (e) { /* ohne Markierung */ }
    }
  }

  async function removeFormula(id) {
    const eq = model.equation(id);
    if (!eq) return;
    const ok = await confirmSheet(`Die Formel „${eq.name}“ (${eq.text}) wird gelöscht.`, { title: 'Formel löschen?', ok: 'Löschen', danger: true });
    if (!ok) return;
    model.removeEquation(id);
    if (!wide) view = 'list';
    render();
  }

  observeWidth(root, 700, (w) => { wide = w; render(); });

  return {
    refresh: (o) => { if (o && o.force) { listKey = null; msgKey = null; } render(); },
    show: () => {
      // wie onAppear in Swift: ohne Auswahl die erste Formel wählen
      if (!model.selected && model.equations.length > 0) {
        model.selected = model.equations[0].id;
        setTimeout(() => ctx.changed(), 0);
      }
      render();
    },
  };
}

// MARK: - Konstanten

const ALL = 'alle';

export function mountConstants(root, ctx) {
  const model = ctx.constants;
  const f = paneFrame(root, 'Konstanten', { back: () => ctx.switchTab('more') });

  const search = el('input', {
    type: 'search', class: 'field const-search', placeholder: CONSTANT_TEXTS.searchPlaceholder, value: model.search ?? '',
    'aria-label': 'Konstanten suchen', autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false',
    enterkeyhint: 'search',
  });
  search.addEventListener('input', () => { model.search = search.value; renderList(); });
  search.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); search.blur(); } });
  const seg = segmented([{ value: ALL, label: CONSTANT_TEXTS.all }, ...GROUPS.map((g) => ({ value: g.id, label: g.title }))],
    model.group ?? ALL, (v) => {
      model.group = v === ALL ? null : v;
      renderList();
      f.body.scrollTop = 0;
    }, { className: 'const-groups' });
  toolbar(root, f.body, search, seg);

  const listBox = el('div', { class: 'list const-list' });

  // eigene Konstante anlegen
  const symF = plainField('', { placeholder: CONSTANT_TEXTS.fieldSymbol, label: CONSTANT_TEXTS.fieldSymbol, className: 'cf-sym',
    enterkeyhint: 'next', onInput: validate, onEnter: () => unitF.focus() });
  const unitF = plainField('', { placeholder: CONSTANT_TEXTS.fieldUnit, label: CONSTANT_TEXTS.fieldUnit, className: 'cf-unit',
    enterkeyhint: 'next', onEnter: () => nameF.focus() });
  const nameF = plainField('', { placeholder: CONSTANT_TEXTS.fieldName, label: CONSTANT_TEXTS.fieldName, className: 'cf-name',
    autocapitalize: 'sentences', enterkeyhint: 'next', onEnter: () => valF.focus() });
  const valF = numberField('', { placeholder: CONSTANT_TEXTS.fieldValue, label: CONSTANT_TEXTS.fieldValue, className: 'cf-val',
    onInput: validate, onEnter: () => add() });
  const addBtn = el('button', { type: 'button', class: 'btn primary cf-add', disabled: true, onclick: () => add() }, CONSTANT_TEXTS.add);
  const form = el('section', { class: 'card const-form' },
    el('h2', { text: 'Eigene Konstante' }),
    el('div', { class: 'cf-grid' }, symF, unitF, nameF, valF),
    addBtn);

  f.actions.append(iconButton('plus', 'Eigene Konstante anlegen', () => {
    symF.focus();
    form.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  }));
  f.body.append(caption('Antippen: Wert in den Rechner (Ans) · lange drücken: Wert kopieren', 'const-hint'), listBox, form);

  function validate() {
    const t = valF.value.trim();
    const v = t === '' ? null : tryConst(t);
    valF.classList.toggle('invalid', t !== '' && v === null);
    addBtn.disabled = symF.value.trim() === '' || v === null;
  }

  function add() {
    const v = tryConst(valF.value.trim());
    if (symF.value.trim() === '' || v === null) return;
    const c = model.addCustom(symF.value, nameF.value, v, unitF.value);
    if (!c) return;
    for (const x of [symF, unitF, nameF, valF]) x.value = '';
    validate();
    if (typeof document !== 'undefined') document.activeElement?.blur?.();
    seg.setValue('eigene');
    // „Eigene“ steht ganz rechts im (schmal waagrecht scrollenden) Schalter: sichtbar machen
    const on = seg.querySelector('button.on');
    if (on && seg.scrollWidth > seg.clientWidth) {
      const d = on.getBoundingClientRect().left - seg.getBoundingClientRect().left;
      seg.scrollLeft += d - (seg.clientWidth - on.offsetWidth) / 2;
    }
    renderList(true);
    haptic();
  }

  function copyValue(c) {
    const t = constantCopyText(c);
    copyText(t).then((ok) => ctx.toast(ok ? `${c.symbol} kopiert: ${t}` : 'Kopieren nicht möglich'));
  }

  async function removeConstant(c) {
    const ok = await confirmSheet(`Die eigene Konstante „${c.symbol}“ wird gelöscht.`, { title: 'Konstante löschen?', ok: 'Löschen', danger: true });
    if (ok) model.remove(c.id);
    renderList(true);
  }

  function row(c) {
    const main = el('button', {
      type: 'button', class: 'const-main', title: CONSTANT_TEXTS.helpPush,
      'aria-label': `${c.symbol}, ${c.name}, ${valueText(c)} ${c.unit} – ${CONSTANT_TEXTS.helpPush}`.replace(/\s+–/, ' –'),
      onclick: () => ctx.push(c.value, c.symbol),
    },
    el('span', { class: 'const-sym' }, symbolNodes(c.symbol)),
    el('span', { class: 'const-name' }, el('span', { text: c.name }), c.note ? el('small', { text: c.note }) : null),
    el('span', { class: 'const-val' }, el('span', { class: 'mono', text: valueText(c) }), c.unit ? el('small', { text: c.unit }) : null));
    // Kopieren erst beim Loslassen: iOS erlaubt die Zwischenablage nur während einer Nutzergeste
    // (das Loslassen zählt, der Zeitgeber des langen Drückens nicht)
    let copyArmed = false;
    longPress(main, () => { copyArmed = true; });
    main.addEventListener('pointerup', () => { if (copyArmed) { copyArmed = false; copyValue(c); } });
    main.addEventListener('pointercancel', () => { copyArmed = false; });
    return el('div', { class: 'list-item const-row' }, main,
      c.group === 'eigene' ? iconButton('trash', CONSTANT_TEXTS.helpDelete, () => removeConstant(c), 'const-del') : null);
  }

  let listKey = null;
  function renderList(force = false) {
    const key = JSON.stringify([model.group, model.search, model.custom.map((c) => [c.id, c.symbol, c.name, c.value, c.unit, c.note]), Fmt.comma]);
    if (!force && key === listKey) return;
    listKey = key;
    const list = model.filtered();
    clear(listBox);
    if (list.length === 0) {
      listBox.append(el('p', { class: 'empty', text: model.group === 'eigene' ? CONSTANT_TEXTS.emptyCustom : CONSTANT_TEXTS.empty }));
      return;
    }
    listBox.append(...list.map(row));
  }

  function render() {
    seg.setValue(model.group ?? ALL);
    syncValue(search, model.search ?? '');
    renderList();
  }

  observeWidth(root, 620, (w) => root.classList.toggle('is-wide', w));

  return { refresh: (o) => { if (o && o.force) listKey = null; render(); }, show: () => render() };
}

// MARK: - Protokoll

const TAPE_KINDS = ['op', 'result', 'info', 'alpha', 'separator'];

export function mountTape(root, ctx) {
  const calc = ctx.calc;
  const f = paneFrame(root, 'Protokoll', { back: () => ctx.switchTab('more') });

  f.actions.append(
    iconButton('copy', 'Alles kopieren', () => copyAll()),
    iconButton('share', 'Als Textdatei teilen', () => shareAll()),
    iconButton('trash', 'Protokoll leeren', () => clearAll(), 'tape-clear'));

  const printSwitch = switchControl('Protokoll aktiv', calc.printOn, (on) => { calc.printOn = on; ctx.changed(); });
  const modeSeg = segmented([{ value: 'man', label: 'MAN' }, { value: 'norm', label: 'NORM' }, { value: 'trace', label: 'TRACE' }],
    calc.printMode, (m) => { calc.printMode = m; ctx.changed(); }, { className: 'tape-modes' });
  toolbar(root, f.body,
    el('div', { class: 'tape-controls' }, printSwitch, modeSeg,
      el('button', { type: 'button', class: 'btn', onclick: () => separator() }, icon('minus'), el('span', { text: 'Trennlinie' }))),
    caption('MAN: nur PRINT-Befehle · NORM: Rechenschritte · TRACE: Schritte mit Ergebnissen'));

  const paper = el('div', { class: 'tape-paper', role: 'log', 'aria-label': 'Rechenprotokoll' });
  f.body.classList.add('tape-body');
  f.body.append(paper);

  let ids = [];            // Kennungen der gezeigten Zeilen
  let emptyShown = false;

  function lineNode(l) {
    const kind = TAPE_KINDS.includes(l.kind) ? l.kind : 'op';
    return el('div', { class: `tl k-${kind}`, text: l.text === '' ? ' ' : l.text });
  }

  function scrollEnd(smooth) {
    const b = f.body;
    if (smooth && typeof b.scrollTo === 'function') b.scrollTo({ top: b.scrollHeight, behavior: 'smooth' });
    else b.scrollTop = b.scrollHeight;
  }

  /// Nur neue Zeilen anhängen; bei geändertem Anfang (Leeren, Laden) alles neu
  function render(jump = false) {
    printSwitch.input.checked = !!calc.printOn;
    modeSeg.setValue(calc.printMode);
    const tape = calc.tape;
    if (tape.length === 0) {
      if (!emptyShown) {
        clear(paper).append(el('div', { class: 'tape-empty', text: 'Noch keine Einträge.\nJede Rechnung am Rechner erscheint hier\n(PRINT-Menü: Shift −).' }));
        emptyShown = true;
        ids = [];
      }
      return;
    }
    const k = ids.length;
    let start = 0;
    if (!emptyShown && k > 0 && tape.length >= k && tape[0].id === ids[0] && tape[k - 1].id === ids[k - 1]) {
      start = k;
    } else {
      clear(paper);
      ids = [];
      emptyShown = false;
      jump = true;
    }
    if (start < tape.length) {
      const frag = document.createDocumentFragment();
      for (let i = start; i < tape.length; i++) {
        frag.appendChild(lineNode(tape[i]));
        ids.push(tape[i].id);
      }
      paper.appendChild(frag);
      scrollEnd(!jump);
    } else if (jump) {
      scrollEnd(false);
    }
  }

  function separator() {
    calc.tape.push({ id: newID(), text: '─'.repeat(Calculator.tapeWidth), kind: 'separator' });
    ctx.changed();
    render();
  }

  function tapeText() {
    return calc.tape.map((l) => l.text).join('\n');
  }

  function copyAll() {
    if (calc.tape.length === 0) { ctx.toast('Das Protokoll ist leer.'); return; }
    copyText(tapeText()).then((ok) => ctx.toast(ok ? 'Protokoll kopiert' : 'Kopieren nicht möglich'));
  }

  function shareAll() {
    if (calc.tape.length === 0) { ctx.toast('Das Protokoll ist leer.'); return; }
    const d = new Date();
    const p2 = (x) => String(x).padStart(2, '0');
    const name = `RPN42-Protokoll-${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}.txt`;
    shareOrDownload(new Blob([tapeText() + '\n'], { type: 'text/plain' }), name, 'RPN42 – Rechenprotokoll');
  }

  async function clearAll() {
    if (calc.tape.length === 0) return;
    const ok = await confirmSheet('Alle Einträge des Rechenprotokolls werden gelöscht.', { title: 'Protokoll leeren?', ok: 'Leeren', danger: true });
    if (!ok) return;
    calc.tape = [];
    ctx.changed();
    render();
  }

  return {
    refresh: () => render(),
    show: () => {
      render(true);
      const raf = globalThis.requestAnimationFrame;
      if (typeof raf === 'function') raf(() => scrollEnd(false));
    },
  };
}
