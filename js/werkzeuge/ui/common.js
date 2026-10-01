// common.js – gemeinsame Hilfen der Oberfläche: Elemente bauen, Symbole, Formelfelder mit
// Rechen-Leiste über der iOS-Tastatur, Segmentschalter, Blätter von unten, Kopieren/Teilen.
import { Fmt } from '../fmt.js';

// MARK: Elemente

/// el('div', {class: 'card', onclick: f, dataset: {id: 1}}, 'Text', kind, …)
/// Attribute: class, text, style (String oder Objekt), dataset, on<Ereignis>, sonst setAttribute.
/// Kinder: Knoten, Strings (als Text), Arrays, null/false (übersprungen).
export function el(tag, attrs = null, ...children) {
  const svg = tag.startsWith('svg:');
  const node = svg ? document.createElementNS('http://www.w3.org/2000/svg', tag.slice(4)) : document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') node.setAttribute('class', v);
      else if (k === 'text') node.textContent = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
      else if (k === 'dataset') Object.assign(node.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else if (k === 'value' && 'value' in node) node.value = v;
      else if (k === 'checked' || k === 'disabled' || k === 'hidden' || k === 'selected') node[k] = !!v;
      else node.setAttribute(k, v === true ? '' : String(v));
    }
  }
  append(node, children);
  return node;
}

function append(node, children) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(node, c);
    else if (c instanceof Node) node.appendChild(c);
    else node.appendChild(document.createTextNode(String(c)));
  }
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

// MARK: Symbole (24 × 24, Strich in currentColor)

const PATHS = {
  calc: 'M6 2.5h12a1.5 1.5 0 0 1 1.5 1.5v16a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 20V4A1.5 1.5 0 0 1 6 2.5zM7.5 5.5h9v4h-9zM8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01M16 17h.01',
  graph: 'M3.5 20.5h17M3.5 20.5v-17M5.5 17c2.5-9 5-11 7-6s4.5 3 6.5-6',
  analysis: 'M9.5 20c2 0 2.5-2 3-5l1.5-7c.5-2.5 1.5-4 3.5-4M8.5 10h8',
  equations: 'M4 4h16v16H4zM8 10h8M8 14h8',
  solver: 'M3 13h3l3 7 5-16h7M14.5 11l5 6M19.5 11l-5 6',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  constants: 'M5 4v16M9 4v16M13.5 4.5l5 15M4 20h16',
  tape: 'M7 3.5h10v17l-2.5-1.5-2.5 1.5-2.5-1.5L7 20.5zM9.5 8h5M9.5 11.5h5M9.5 15h3',
  print: 'M7 9V3.5h10V9M7 17H4.5v-8h15v8H17M7 14h10v6.5H7z',
  settings: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.5h.01',
  share: 'M12 3v12M8 7l4-4 4 4M6 11H5v9.5h14V11h-1',
  trash: 'M4 7h16M9.5 7V4.5h5V7M6 7l1 13.5h10L18 7M10 11v6M14 11v6',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  undo: 'M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  paste: 'M9 4.5H6.5v16h11v-16H15M9 3h6v3H9z',
  close: 'M6 6l12 12M18 6L6 18',
  back: 'M15 5l-7 7 7 7',
  chevron: 'M9 5l7 7-7 7',
  fit: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5',
  home: 'M4 11l8-7 8 7M6 9.5V20h12V9.5',
  zoomin: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.5 15.5L20 20M10.5 8v5M8 10.5h5',
  zoomout: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.5 15.5L20 20M8 10.5h5',
  eye: 'M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  eyeoff: 'M3 3l18 18M10.6 5.6A10 10 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3 3.8M6.6 6.6C4 8.3 2.5 12 2.5 12s3.5 6.5 9.5 6.5c1.6 0 3-.4 4.2-1M9.9 9.9a3 3 0 0 0 4.2 4.2',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12l2-1-1-3-2.2.2-1.3-1.3.2-2.2-3-1-1 2h-1.4l-1-2-3 1 .2 2.2-1.3 1.3L4 8 3 11l2 1v1.4l-2 1 1 3 2.2-.2 1.3 1.3L7.3 20l3 1 1-2h1.4l1 2 3-1-.2-2.2 1.3-1.3 2.2.2 1-3-2-1z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  grip: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
  fullscreen: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
};

/// SVG-Symbol; Größe über CSS (Standard 1.25em)
export function icon(name, size = null) {
  const s = el('svg:svg', { viewBox: '0 0 24 24', class: 'ico', 'aria-hidden': 'true', fill: 'none',
    stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  if (size) { s.setAttribute('width', size); s.setAttribute('height', size); }
  s.appendChild(el('svg:path', { d: PATHS[name] || PATHS.info }));
  return s;
}

// MARK: Formelfelder und Rechen-Leiste über der Tastatur

/// Tasten der Rechen-Leiste: [Beschriftung, eingefügter Text, Cursor-Versatz vom Ende]
const MATHBAR_KEYS = [
  ['x', 'x'], ['^', '^'], ['²', '²'], ['(', '('], [')', ')'], ['√', '√('], ['π', 'π'], ['e^', 'e^('],
  ['·', '*'], ['÷', '/'], ['−', '-'], ['+', '+'], ['=', '='], [';', ';'], ['|x|', '|'],
  ['sin', 'sin('], ['cos', 'cos('], ['tan', 'tan('], ['ln', 'ln('], ['log', 'log('], ['a', 'a'], ['t', 't'],
];

let mathbarTarget = null;

function mathbar() {
  let bar = document.getElementById('mathbar');
  if (!bar) {
    bar = el('div', { id: 'mathbar', hidden: true });
    document.body.appendChild(bar);
  }
  if (!bar.dataset.ready) {
    bar.dataset.ready = '1';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Rechenzeichen');
    const move = (d) => {
      const t = mathbarTarget;
      if (!t) return;
      const p = Math.max(0, Math.min(t.value.length, (t.selectionStart ?? t.value.length) + d));
      t.setSelectionRange(p, p);
    };
    const keys = el('div', { class: 'mathbar-keys' });
    keys.appendChild(el('button', { type: 'button', class: 'mb-key mb-nav', 'aria-label': 'Cursor links', dataset: { move: '-1' } }, '‹'));
    for (const [label, ins] of MATHBAR_KEYS) {
      keys.appendChild(el('button', { type: 'button', class: 'mb-key', dataset: { ins } }, label));
    }
    keys.appendChild(el('button', { type: 'button', class: 'mb-key mb-nav', 'aria-label': 'Cursor rechts', dataset: { move: '1' } }, '›'));
    bar.appendChild(keys);
    // Feld weg (neu aufgebaut, Blatt geschlossen) oder nicht mehr fokussiert: WebKit meldet beim Entfernen
    // eines fokussierten Feldes kein blur – die Leiste bliebe sonst über der Reiterleiste stehen
    const stale = () => {
      const t = mathbarTarget;
      if (t && t.isConnected !== false && document.activeElement === t) return false;
      mathbarTarget = null;
      bar.hidden = true;
      document.body.classList.remove('mathbar-on');
      return true;
    };
    // pointerdown + preventDefault: das Eingabefeld behält den Fokus (Tastatur bleibt offen).
    // Eingefügt wird erst beim Loslassen ohne Wischen: die Leiste ist auf dem iPhone breiter als der Bildschirm,
    // und wer sie seitlich schiebt (sin, cos …), soll dabei kein Zeichen tippen
    let pending = null;                  // { id, b, x, y } – gedrückte Taste
    bar.addEventListener('pointerdown', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      e.preventDefault();
      pending = (e.pointerType === 'mouse' && e.button !== 0) ? null : { id: e.pointerId, b, x: e.clientX, y: e.clientY };
    });
    bar.addEventListener('pointermove', (e) => {
      if (pending && pending.id === e.pointerId && Math.hypot(e.clientX - pending.x, e.clientY - pending.y) > 10) pending = null;
    });
    bar.addEventListener('pointercancel', () => { pending = null; });
    bar.addEventListener('pointerup', (e) => {
      const p = pending;
      pending = null;
      if (!p || p.id !== e.pointerId) return;
      if (stale()) return;
      if (p.b.dataset.move) { move(Number(p.b.dataset.move)); return; }
      insertAtCursor(mathbarTarget, p.b.dataset.ins);
    });
    bar.addEventListener('mousedown', (e) => e.preventDefault());
    const place = () => {
      if (bar.hidden || stale()) return;
      const vv = window.visualViewport;
      if (!vv) return;
      const hidden = window.innerHeight - vv.height - vv.offsetTop;
      bar.style.transform = `translateY(${-Math.max(0, hidden)}px)`;
    };
    window.visualViewport?.addEventListener('resize', place);
    window.visualViewport?.addEventListener('scroll', place);
    bar._place = place;
  }
  return bar;
}

/// Text an der Cursorposition einfügen und ein input-Ereignis auslösen
export function insertAtCursor(input, text) {
  if (!input) return;
  const s = input.selectionStart ?? input.value.length;
  const e = input.selectionEnd ?? s;
  input.setRangeText(text, s, e, 'end');
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function attachMathbar(input) {
  input.addEventListener('focus', () => {
    mathbarTarget = input;
    const bar = mathbar();
    bar.hidden = false;
    document.body.classList.add('mathbar-on');
    bar._place?.();
    setTimeout(() => bar._place?.(), 350);
  });
  input.addEventListener('blur', () => {
    setTimeout(() => {
      if (document.activeElement && document.activeElement.classList?.contains('math')) return;
      if (mathbarTarget === input) mathbarTarget = null;
      const bar = document.getElementById('mathbar');
      if (bar && !mathbarTarget) { bar.hidden = true; document.body.classList.remove('mathbar-on'); }
    }, 60);
  });
}

function textInput(value, { placeholder = '', onInput = null, onEnter = null, onChange = null, className = '',
  inputmode = 'text', label = null, enterkeyhint = 'done' } = {}) {
  const input = el('input', {
    type: 'text', class: `field ${className}`.trim(), value: value ?? '', placeholder,
    autocapitalize: 'off', autocomplete: 'off', autocorrect: 'off', spellcheck: 'false',
    inputmode, enterkeyhint, 'aria-label': label || placeholder || null,
  });
  if (onInput) input.addEventListener('input', () => onInput(input.value, input));
  if (onChange) input.addEventListener('change', () => onChange(input.value, input));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (onEnter) onEnter(input.value, input);
      else input.blur();
    }
  });
  return input;
}

/// Eingabefeld für Formeln (Monospace, keine Autokorrektur, Rechen-Leiste über der Tastatur)
export function mathField(value, opts = {}) {
  const input = textInput(value, { ...opts, className: `math ${opts.className || ''}` });
  attachMathbar(input);
  return input;
}

/// Eingabefeld für Zahlen (Dezimaltastatur mit Minus: inputmode "text" + Muster, da iOS sonst kein Minus hat)
export function numberField(value, opts = {}) {
  const input = textInput(value, { ...opts, className: `num ${opts.className || ''}`, inputmode: opts.inputmode || 'text' });
  attachMathbar(input);
  input.classList.add('math');
  return input;
}

// MARK: Schalter

/// Segmentschalter: options = [{value, label, title?}] oder ['a','b']
export function segmented(options, value, onChange, { className = '' } = {}) {
  const wrap = el('div', { class: `seg ${className}`.trim(), role: 'tablist' });
  const items = options.map((o) => (typeof o === 'object' ? o : { value: o, label: String(o) }));
  const set = (v) => {
    for (const b of wrap.children) {
      const on = b.dataset.value === String(v);
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    }
  };
  for (const o of items) {
    wrap.appendChild(el('button', {
      type: 'button', role: 'tab', dataset: { value: String(o.value) }, title: o.title || null,
      onclick: () => { set(o.value); onChange?.(o.value); },
    }, o.icon ? icon(o.icon) : null, o.label ?? null));
  }
  set(value);
  wrap.setValue = set;
  return wrap;
}

/// Kippschalter mit Beschriftung
export function switchControl(label, checked, onChange, { hint = null } = {}) {
  const input = el('input', { type: 'checkbox', checked, role: 'switch' });
  input.addEventListener('change', () => onChange?.(input.checked));
  const node = el('label', { class: 'switch' },
    el('span', { class: 'switch-text' }, label, hint ? el('small', { class: 'muted' }, hint) : null),
    input, el('span', { class: 'switch-track', 'aria-hidden': 'true' }));
  node.input = input;
  return node;
}

// MARK: Blätter von unten

/// Öffnet ein Blatt; content = Knoten; actions = [{label, primary?, danger?, onClick}] (Schließen folgt)
export function openSheet(title, content, { actions = [], onClose = null, wide = false } = {}) {
  // Eingabefeld dahinter verlassen (z. B. Blatt per langem Drücken, während ein Feld aktiv ist): die
  // Bildschirmtastatur verdeckte sonst das Blatt, und eine Hardware-Tastatur schriebe ins Feld hinter dem Blatt
  const active = document.activeElement;
  if (active && active !== document.body && typeof active.blur === 'function'
    && (active.tagName === 'TEXTAREA' || active.isContentEditable
      || (active.tagName === 'INPUT' && !/^(checkbox|radio|button|submit|reset|range|color|file|image)$/i.test(active.type || '')))) {
    active.blur();
  }
  const backdrop = el('div', { class: 'sheet-backdrop' });
  const close = () => {
    // Feld im Blatt vor dem Entfernen verlassen: WebKit meldet beim Entfernen kein blur (Rechen-Leiste bliebe stehen)
    const a = document.activeElement;
    if (a && a !== document.body && backdrop.contains(a) && typeof a.blur === 'function') a.blur();
    backdrop.classList.remove('open');
    setTimeout(() => backdrop.remove(), 220);
    document.removeEventListener('keydown', onKey);
    onClose?.();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const head = el('div', { class: 'sheet-head' },
    el('h2', { text: title }),
    el('button', { type: 'button', class: 'btn icon ghost', 'aria-label': 'Schließen', onclick: close }, icon('close')));
  const foot = actions.length ? el('div', { class: 'sheet-actions' }, actions.map((a) =>
    el('button', { type: 'button', class: `btn ${a.primary ? 'primary' : ''} ${a.danger ? 'danger' : ''}`.trim(),
      onclick: () => { if (a.onClick?.() !== false) close(); } }, a.label))) : null;
  const sheet = el('div', { class: `sheet ${wide ? 'wide' : ''}`.trim(), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    el('div', { class: 'sheet-grabber', 'aria-hidden': 'true' }), head, el('div', { class: 'sheet-body' }, content), foot);
  backdrop.appendChild(sheet);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(backdrop);
  requestAnimationFrame(() => backdrop.classList.add('open'));
  return { close, sheet };
}

/// Rückfrage; liefert true bei Bestätigung
export function confirmSheet(text, { title = 'Bestätigen', ok = 'OK', danger = false } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    openSheet(title, el('p', { class: 'confirm-text', text }), {
      actions: [
        { label: 'Abbrechen', onClick: () => { answered = true; resolve(false); } },
        { label: ok, primary: !danger, danger, onClick: () => { answered = true; resolve(true); } },
      ],
      onClose: () => { if (!answered) resolve(false); },
    });
  });
}

// MARK: Zwischenablage, Teilen

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    const ta = el('textarea', { readonly: true, style: { position: 'fixed', opacity: '0', top: '0' } });
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);   // iOS: select() allein markiert nichts
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
    ta.remove();
    return ok;
  }
}

/// Teilt eine Datei über das iOS-Teilen-Blatt (Sichern in Dateien/Fotos, AirDrop …) oder lädt sie herunter
export async function shareOrDownload(blob, filename, title = 'fx-991 Trainer') {
  try {
    const file = new File([blob], filename, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title });
      return true;
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return false;
  }
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return true;
}

// MARK: Gesten, Zeit, Zahlen

/// Langes Drücken (Standard 500 ms); verhindert danach den Klick
export function longPress(node, handler, ms = 500) {
  let timer = null, fired = false, x0 = 0, y0 = 0;
  const cancel = () => { clearTimeout(timer); timer = null; };
  node.addEventListener('pointerdown', (e) => {
    fired = false; x0 = e.clientX; y0 = e.clientY;
    cancel();
    timer = setTimeout(() => { fired = true; haptic(); handler(e); }, ms);
  });
  node.addEventListener('pointermove', (e) => { if (Math.hypot(e.clientX - x0, e.clientY - y0) > 10) cancel(); });
  node.addEventListener('pointerup', cancel);
  node.addEventListener('pointercancel', cancel);
  node.addEventListener('pointerleave', cancel);
  node.addEventListener('click', (e) => { if (fired) { e.preventDefault(); e.stopPropagation(); fired = false; } }, true);
  node.addEventListener('contextmenu', (e) => e.preventDefault());
}

export function debounce(fn, ms = 300) {
  let t = null;
  const d = (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  d.flush = (...args) => { clearTimeout(t); fn(...args); };
  return d;
}

/// Zahl deutsch formatiert (Dezimalkomma, echtes Minus), sehr groß/klein wissenschaftlich
export function formatNumber(x, digits = 6) {
  if (x === null || x === undefined || Number.isNaN(x)) return '—';
  return Fmt.num(x, digits);
}

// Haptik: iOS 18+ löst beim Umschalten eines <input switch> ein kurzes Tippgefühl aus; Android: vibrate
// Kein tabindex und display: none (app.css): WebKit fokussiert beim Label-Klick sonst den Schalter
// (Formularelemente mit tabindex sind dort mausfokussierbar) – das aktive Eingabefeld verlöre den Fokus
// und die Bildschirmtastatur ginge zu (z. B. XEQ-Namen tippen und dabei eine Rechnertaste drücken).
let hapticLabel = null;
export let hapticsEnabled = true;
export function setHaptics(on) { hapticsEnabled = !!on; }
let hapticDeferred = false;
export function haptic() {
  if (!hapticsEnabled) return;
  try {
    if (navigator.vibrate) { navigator.vibrate(8); return; }
    // pointerdown eines Fingers zählt noch nicht als Benutzergeste: ohne aktive Geste beim Loslassen auslösen
    const ua = navigator.userActivation;
    if (ua && !ua.isActive) {
      if (!hapticDeferred) {
        hapticDeferred = true;
        document.addEventListener('pointerup', () => { hapticDeferred = false; hapticNow(); }, { once: true, capture: true });
      }
      return;
    }
    hapticNow();
  } catch (e) { /* ohne Haptik weiter */ }
}

function hapticNow() {
  try {
    if (!hapticLabel) {
      const input = el('input', { type: 'checkbox', switch: true, 'aria-hidden': 'true' });
      hapticLabel = el('label', { class: 'haptic-helper', 'aria-hidden': 'true' }, input);
      document.body.appendChild(hapticLabel);
    }
    hapticLabel.click();
  } catch (e) { /* ohne Haptik weiter */ }
}
