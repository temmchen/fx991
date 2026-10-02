// tasten.js – Tastenfeld des fx-991DE X: Kennungen, Beschriftungen und was eine Taste eingibt.
//
// Tastenkennungen (auch in den Lektionen benutzt):
//   shift alpha up down left right menu on
//   optn calc int x
//   frac sqrt sq pow log ln
//   neg dms inv sin cos tan
//   sto eng lpar rpar sd mplus
//   7 8 9 del ac / 4 5 6 mul div / 1 2 3 add sub / 0 dot exp ans eq
// Mit SHIFT bzw. ALPHA gedrückt: 'S:sin', 'A:neg' usw.

/// Beschriftung: haupt, shift (gelb), alpha (rot), basis (blau, Basis-N), komplex (lila, Komplex)
export const TASTEN = {
  shift: { haupt: 'SHIFT', art: 'system' },
  alpha: { haupt: 'ALPHA', art: 'system' },
  menu: { haupt: 'MENU', shift: 'SETUP', art: 'system' },
  on: { haupt: 'ON', art: 'system' },
  up: { haupt: '▲', art: 'pfeil' },
  down: { haupt: '▼', art: 'pfeil' },
  left: { haupt: '◀', art: 'pfeil' },
  right: { haupt: '▶', art: 'pfeil' },
  optn: { haupt: 'OPTN', shift: 'QR' },
  calc: { haupt: 'CALC', shift: 'SOLVE', alpha: '=' },
  int: { haupt: '∫▫▫', shift: 'd/dx▫', alpha: ':' },
  x: { haupt: 'x', shift: 'Σ▫▫' },
  frac: { haupt: '▫/▫', shift: '▫▫/▫' },
  sqrt: { haupt: '√▫', shift: '∛▫', alpha: '▫̄' },
  sq: { haupt: 'x²', shift: 'x³', basis: 'DEC' },
  pow: { haupt: 'x▫', shift: '▫√▫', basis: 'HEX' },
  log: { haupt: 'log▫▫', shift: '10▫', basis: 'BIN' },
  ln: { haupt: 'ln', shift: 'e▫', basis: 'OCT' },
  neg: { haupt: '(−)', shift: 'log', alpha: 'A', hex: true },
  dms: { haupt: '°′″', shift: 'FACT', alpha: 'B', hex: true },
  inv: { haupt: 'x⁻¹', shift: 'x!', alpha: 'C', hex: true },
  sin: { haupt: 'sin', shift: 'sin⁻¹', alpha: 'D', hex: true },
  cos: { haupt: 'cos', shift: 'cos⁻¹', alpha: 'E', hex: true },
  tan: { haupt: 'tan', shift: 'tan⁻¹', alpha: 'F', hex: true },
  sto: { haupt: 'STO', shift: 'RECALL' },
  eng: { haupt: 'ENG', shift: '←', komplexShift: '∠', komplex: 'i' },
  lpar: { haupt: '(', shift: 'Abs' },
  rpar: { haupt: ')', shift: ',', alpha: 'x' },
  sd: { haupt: 'S⇔D', shift: 'a b/c⇔d/c', alpha: 'y' },
  mplus: { haupt: 'M+', shift: 'M−', alpha: 'M' },
  7: { haupt: '7', shift: 'CONST', art: 'zahl' },
  8: { haupt: '8', shift: 'CONV', art: 'zahl' },
  9: { haupt: '9', shift: 'RESET', art: 'zahl' },
  del: { haupt: 'DEL', shift: 'INS', alpha: 'UNDO', art: 'blau' },
  ac: { haupt: 'AC', shift: 'OFF', art: 'blau' },
  4: { haupt: '4', art: 'zahl' },
  5: { haupt: '5', art: 'zahl' },
  6: { haupt: '6', art: 'zahl' },
  mul: { haupt: '×', shift: 'nPr', art: 'zahl' },
  div: { haupt: '÷', shift: 'nCr', art: 'zahl' },
  1: { haupt: '1', art: 'zahl' },
  2: { haupt: '2', art: 'zahl' },
  3: { haupt: '3', art: 'zahl' },
  add: { haupt: '+', shift: 'Pol', art: 'zahl' },
  sub: { haupt: '−', shift: 'Rec', art: 'zahl' },
  0: { haupt: '0', shift: 'Rnd', art: 'zahl' },
  dot: { haupt: '.', shift: 'Ran#', alpha: 'RanInt', art: 'zahl' },
  exp: { haupt: '×10ˣ', shift: 'π', alpha: 'e', art: 'zahl' },
  ans: { haupt: 'Ans', shift: '%', art: 'zahl' },
  eq: { haupt: '=', shift: '≈', art: 'zahl' },
};

/// Reihen des Tastenfelds (für die Oberfläche)
export const REIHEN_FUNKTION = [
  ['frac', 'sqrt', 'sq', 'pow', 'log', 'ln'],
  ['neg', 'dms', 'inv', 'sin', 'cos', 'tan'],
  ['sto', 'eng', 'lpar', 'rpar', 'sd', 'mplus'],
];
export const REIHEN_ZAHLEN = [
  ['7', '8', '9', 'del', 'ac'],
  ['4', '5', '6', 'mul', 'div'],
  ['1', '2', '3', 'add', 'sub'],
  ['0', 'dot', 'exp', 'ans', 'eq'],
];

/// Variablentasten (nach STO, RECALL, ALPHA)
export const VARIABLEN_TASTE = {
  neg: 'A', dms: 'B', inv: 'C', sin: 'D', cos: 'E', tan: 'F', mplus: 'M', rpar: 'x', sd: 'y', x: 'x',
};

/// Variable aus einer (ggf. mit ALPHA gedrückten) Taste oder null
export function variableAus(k) {
  const id = k.startsWith('A:') ? k.slice(2) : k;
  if (k.startsWith('S:')) return null;
  return VARIABLEN_TASTE[id] || null;
}

/// Hexadezimalziffern A–F im Basis-N-Modus (Tasten (−) °′″ x⁻¹ sin cos tan ohne ALPHA)
export const HEX_TASTE = { neg: 'A', dms: 'B', inv: 'C', sin: 'D', cos: 'E', tan: 'F' };

/// Was gibt eine Taste ein? (für Rechen- und Werteingaben)
///   { el }        einfaches Element
///   { op }        zweistelliger Operator (setzt nach einem Ergebnis „Ans“ davor)
///   { post }      nachgestellter Operator (ebenso)
///   { T }         Schablone;  { Tpost: 'pow' } Potenz (setzt „Ans“ davor)
///   { fn }        Funktion mit Klammer
///   null          keine Eingabe (Sondertaste oder im Modus nicht verfügbar)
export function eingabeFuer(k, modus, linear = false) {
  const komplex = modus === 'CMPLX';
  const var_ = variableAus(k);
  if (var_ && k.startsWith('A:')) return { el: { k: 'var', v: var_ } };
  if (k === 'x') return { el: { k: 'var', v: 'x' } };
  if (/^\d$/.test(k)) return { el: { k: 'z', v: k } };
  switch (k) {
    case 'dot': return { el: { k: 'z', v: '.' } };
    case 'add': return { op: '+' };
    case 'sub': return { op: '-' };
    case 'mul': return { op: '×' };
    case 'div': return { op: '÷' };
    case 'S:mul': return { op: 'nPr' };
    case 'S:div': return { op: 'nCr' };
    case 'lpar': return { el: { k: '(' } };
    case 'rpar': return { el: { k: ')' } };
    case 'S:rpar': return { el: { k: 'op', v: ',' } };
    case 'neg': return { el: { k: 'neg' } };
    case 'frac': return { T: 'frac' };
    case 'S:frac': return { T: 'mixed' };
    case 'sqrt': return { T: 'sqrt' };
    case 'S:sqrt': return { T: 'cbrt' };
    case 'A:sqrt': return { T: 'period' };
    case 'sq': return { post: '²' };
    case 'S:sq': return { post: '³' };
    case 'pow': return { Tpost: 'pow' };
    case 'S:pow': return { T: 'root' };
    case 'log': return linear ? { fn: 'log' } : { T: 'log' };
    case 'S:log': return { T: 'pow10' };
    case 'ln': return { fn: 'ln' };
    case 'S:ln': return { T: 'epow' };
    case 'S:neg': return { fn: 'log' };
    case 'dms': return { post: 'dms' };
    case 'inv': return { post: '⁻¹' };
    case 'S:inv': return { post: '!' };
    case 'sin': return { fn: 'sin' };
    case 'cos': return { fn: 'cos' };
    case 'tan': return { fn: 'tan' };
    case 'S:sin': return { fn: 'asin' };
    case 'S:cos': return { fn: 'acos' };
    case 'S:tan': return { fn: 'atan' };
    case 'S:lpar': return linear ? { fn: 'Abs' } : { T: 'abs' };
    case 'exp': return { el: { k: 'e10' } };
    case 'S:exp': return { el: { k: 'k', v: 'pi' } };
    case 'A:exp': return { el: { k: 'k', v: 'e' } };
    case 'ans': return { el: { k: 'ans' } };
    case 'S:ans': return { post: '%' };
    case 'S:add': return { fn: 'Pol' };
    case 'S:sub': return { fn: 'Rec' };
    case 'S:0': return { fn: 'Rnd' };
    case 'S:dot': return { el: { k: 'ran' } };
    case 'A:dot': return { fn: 'RanInt' };
    case 'A:calc': return { el: { k: 'op', v: '=' } };
    case 'int': return { T: 'int' };
    case 'S:int': return { T: 'diff' };
    case 'A:int': return { el: { k: 'op', v: ':' } };
    case 'S:x': return { T: 'sum' };
    case 'eng': return komplex ? { el: { k: 'k', v: 'i' } } : null;
    case 'A:eng': return komplex ? { el: { k: 'k', v: 'i' } } : null;
    case 'S:eng': return komplex ? { op: '∠' } : null;
    default: return null;
  }
}

/// Namen der Tasten für Tastenfolgen in Lektionen („[SHIFT][sin]0.5[)][=]“)
export const TASTEN_ALIAS = {
  SHIFT: 'shift', ALPHA: 'alpha', MENU: 'menu', SETUP: 'S:menu', ON: 'on', OPTN: 'optn', CALC: 'calc',
  '∫': 'int', x: 'x', '▫/▫': 'frac', 'a/b': 'frac', '√': 'sqrt', 'x²': 'sq', 'x^': 'pow', 'x▫': 'pow',
  'log▫▫': 'log', ln: 'ln', '(−)': 'neg', '(-)': 'neg', "°'\"": 'dms', '°′″': 'dms', 'x⁻¹': 'inv',
  sin: 'sin', cos: 'cos', tan: 'tan', STO: 'sto', ENG: 'eng', '(': 'lpar', ')': 'rpar', 'S⇔D': 'sd',
  'M+': 'mplus', DEL: 'del', AC: 'ac', '×': 'mul', '÷': 'div', '+': 'add', '−': 'sub', '-': 'sub',
  '.': 'dot', ',': 'dot', '×10ˣ': 'exp', 'x10': 'exp', Ans: 'ans', '=': 'eq', '▲': 'up', '▼': 'down',
  '◀': 'left', '▶': 'right',
};

/// „[SHIFT][sin]0.5[)][=]“ → ['shift','sin','0','dot','5','rpar','eq']
export function tastenfolge(text) {
  const out = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '[') {
      const ende = text.indexOf(']', i + 1);
      const name = text.slice(i + 1, ende);
      out.push(TASTEN_ALIAS[name] || name);
      i = ende + 1;
      continue;
    }
    if (c === ' ') { i++; continue; }
    if (/\d/.test(c)) out.push(c);
    else if (c === '.' || c === ',') out.push('dot');
    else if (c === '+') out.push('add');
    else if (c === '-' || c === '−') out.push('sub');
    else if (c === '*' || c === '×') out.push('mul');
    else if (c === '/' || c === '÷') out.push('div');
    else if (c === '(') out.push('lpar');
    else if (c === ')') out.push('rpar');
    else if (c === '=') out.push('eq');
    else throw new Error('Unbekanntes Zeichen in Tastenfolge: ' + c);
    i++;
  }
  return out;
}
