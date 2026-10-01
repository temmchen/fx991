// eingabe.js – Eingabezeile im Lehrbuchformat (MathI) mit Schablonen, Cursor und Bearbeitung.
//
// Eine Zeile ist ein Array von Elementen (unveränderte, schlichte Objekte, damit sie sich als JSON
// sichern lassen):
//   { k: 'z', v: '7' }                 Ziffer, Dezimalpunkt '.', im BASE-N-Modus auch 'A'…'F'
//   { k: 'op', v: '+' }                zweistellige Operatoren: + − × ÷ nPr nCr ∠ · and or xor xnor
//                                      sowie Trennzeichen ',' ':' und Relationen = ≠ < > ≤ ≥
//   { k: 'neg' }                       Vorzeichen (−)
//   { k: '(' }  { k: ')' }
//   { k: 'fn', v: 'sin' }              Funktion mit öffnender Klammer: „sin(“
//   { k: 'var', v: 'A' }               Variable A–F, M, x, y
//   { k: 'ans' }  { k: 'ran' }         Ans, Ran#
//   { k: 'k', v: 'pi' }                Konstante (pi, e, i oder Kennung aus dem CONST-Katalog)
//   { k: 'post', v: '²' }              nachgestellte Operatoren: ² ³ ⁻¹ ! % ° r g dms, Präfixe (k, m …),
//                                      Umrechnungen, Statistik-Schätzwerte, ▸r∠θ, ▸a+bi
//   { k: 'pre', v: 'h' }               Zahlsystem-Kennzeichen d h b o (BASE-N)
//   { k: 'e10' }                       „×₁₀“ der Taste ×10^x (Exponent folgt als Ziffern)
//   { k: 'mat', v: 'A' } { k: 'vct', v: 'A' } { k: 'stat', v: 'xquer' }
//   { k: 'T', v: art, s: [Zeile, …] }  Schablone mit Eingabefeldern (siehe FELDER)
//
// Der Cursor ist ein Pfad durch die Schablonen ({ i: Index der Schablone, s: Feld }) plus Position
// in der innersten Zeile.

/// Anzahl der Eingabefelder je Schablone (Reihenfolge = Reihenfolge beim Durchlaufen mit ▶)
export const FELDER = {
  frac: 2,   // Zähler, Nenner
  mixed: 3,  // Ganze, Zähler, Nenner
  sqrt: 1,   // √▭
  cbrt: 1,   // ∛▭
  root: 2,   // ▭√▭: Wurzelexponent, Radikand
  pow: 1,    // x^▭ (gehört zum Element links davon)
  pow10: 1,  // 10^▭
  epow: 1,   // e^▭
  log: 2,    // log▭(▭): Basis, Argument
  abs: 1,    // |▭|
  int: 3,    // ∫: Integrand, untere Grenze, obere Grenze
  diff: 2,   // d/dx(▭)|x=▭: Funktion, Stelle
  sum: 3,    // Σ: Term, Start, Ende
  period: 1, // Periode (fx-991DE X): Ziffern unter dem Strich
};

/// Schablonen, die eine schon getippte Zahl (links vom Cursor) als erstes Feld übernehmen
const UEBERNIMMT_LINKS = new Set(['frac', 'mixed']);

const MAX_ELEMENTE = 199;

export function schablone(art) {
  const n = FELDER[art];
  if (!n) throw new Error('Unbekannte Schablone ' + art);
  return { k: 'T', v: art, s: Array.from({ length: n }, () => []) };
}

export const klon = (x) => JSON.parse(JSON.stringify(x));

/// Anzahl Elemente (rekursiv)
export function zaehle(zeile) {
  let n = 0;
  for (const e of zeile) {
    n++;
    if (e.k === 'T') for (const f of e.s) n += zaehle(f);
  }
  return n;
}

export function istLeer(zeile) {
  return zeile.length === 0;
}

const istZahlTeil = (e) => e.k === 'z';

export class Eingabe {
  constructor(zeile = []) {
    this.wurzel = zeile;
    this.pfad = [];
    this.pos = zeile.length;
    this.umschliessen = false; // INS: nächste Schablone umschließt das Element rechts
  }

  // MARK: Zustand

  zustand() {
    return { wurzel: klon(this.wurzel), pfad: klon(this.pfad), pos: this.pos };
  }

  setzeZustand(z) {
    this.wurzel = klon(z.wurzel);
    this.pfad = klon(z.pfad);
    this.pos = z.pos;
    this.umschliessen = false;
  }

  leeren() {
    this.wurzel = [];
    this.pfad = [];
    this.pos = 0;
    this.umschliessen = false;
  }

  istLeer() {
    return this.wurzel.length === 0;
  }

  /// Zeile auf Tiefe t des Pfads (0 = Wurzel)
  zeileAuf(t) {
    let z = this.wurzel;
    for (let j = 0; j < t; j++) z = z[this.pfad[j].i].s[this.pfad[j].s];
    return z;
  }

  zeile() {
    return this.zeileAuf(this.pfad.length);
  }

  /// Schablone, in der der Cursor gerade steht (oder null)
  aktuelleSchablone() {
    if (this.pfad.length === 0) return null;
    const p = this.pfad[this.pfad.length - 1];
    return this.zeileAuf(this.pfad.length - 1)[p.i];
  }

  cursorAnsEnde() {
    this.pfad = [];
    this.pos = this.wurzel.length;
  }

  cursorAnDenAnfang() {
    this.pfad = [];
    this.pos = 0;
  }

  voll() {
    return zaehle(this.wurzel) >= MAX_ELEMENTE;
  }

  // MARK: Einfügen

  /// Einfaches Element an der Cursorposition einfügen
  einfuegen(e) {
    if (this.voll()) return false;
    this.umschliessen = false;
    const z = this.zeile();
    z.splice(this.pos, 0, e);
    this.pos++;
    return true;
  }

  /// Mehrere Elemente (z. B. „Ans“ + Operator)
  einfuegenAlle(liste) {
    for (const e of liste) this.einfuegen(e);
  }

  /// Schablone einfügen; der Cursor springt ins erste (bzw. passende) Feld
  schabloneEinfuegen(art) {
    if (this.voll()) return false;
    const t = schablone(art);
    const z = this.zeile();
    if (this.umschliessen) {
      // INS: das Element rechts vom Cursor wird zum Inhalt des ersten Feldes
      this.umschliessen = false;
      const [von, bis] = this.elementRechts(z, this.pos);
      if (bis > von) {
        t.s[0] = z.splice(von, bis - von);
        z.splice(this.pos, 0, t);
        this.pos++;
        return true;
      }
    }
    if (UEBERNIMMT_LINKS.has(art)) {
      // eine schon getippte Zahl (oder Klammer, Variable) wird zum Zähler bzw. zur Ganzen
      const [von, bis] = this.elementLinks(z, this.pos);
      if (bis > von) {
        const teil = z.splice(von, bis - von);
        if (art === 'frac') t.s[0] = teil; else t.s[0] = teil;
        z.splice(von, 0, t);
        this.pfad.push({ i: von, s: 1 });
        this.pos = 0;
        return true;
      }
    }
    z.splice(this.pos, 0, t);
    this.pfad.push({ i: this.pos, s: 0 });
    this.pos = 0;
    return true;
  }

  /// [von, bis) des Elements links von pos: Zahl, Klammergruppe, Variable/Konstante
  elementLinks(z, pos) {
    if (pos === 0) return [0, 0];
    const e = z[pos - 1];
    if (istZahlTeil(e)) {
      let von = pos - 1;
      while (von > 0 && istZahlTeil(z[von - 1])) von--;
      return [von, pos];
    }
    if (e.k === ')') {
      let tiefe = 0;
      for (let j = pos - 1; j >= 0; j--) {
        if (z[j].k === ')') tiefe++;
        else if (z[j].k === '(' || z[j].k === 'fn') {
          tiefe--;
          if (tiefe === 0) return [j, pos];
        }
      }
      return [0, 0];
    }
    if (e.k === 'var' || e.k === 'ans' || e.k === 'k') return [pos - 1, pos];
    return [0, 0];
  }

  /// [von, bis) des Elements rechts von pos (für INS)
  elementRechts(z, pos) {
    if (pos >= z.length) return [pos, pos];
    const e = z[pos];
    if (istZahlTeil(e)) {
      let bis = pos + 1;
      while (bis < z.length && istZahlTeil(z[bis])) bis++;
      return [pos, bis];
    }
    if (e.k === '(' || e.k === 'fn') {
      let tiefe = 0;
      for (let j = pos; j < z.length; j++) {
        if (z[j].k === '(' || z[j].k === 'fn') tiefe++;
        else if (z[j].k === ')') {
          tiefe--;
          if (tiefe === 0) return [pos, j + 1];
        }
      }
      return [pos, z.length];
    }
    return [pos, pos + 1];
  }

  // MARK: Cursor

  /// ▶
  rechts() {
    const z = this.zeile();
    if (this.pos < z.length) {
      const e = z[this.pos];
      if (e.k === 'T') {
        this.pfad.push({ i: this.pos, s: 0 });
        this.pos = 0;
      } else this.pos++;
      return true;
    }
    if (this.pfad.length === 0) return false;
    const p = this.pfad[this.pfad.length - 1];
    const t = this.zeileAuf(this.pfad.length - 1)[p.i];
    if (p.s + 1 < t.s.length) {
      p.s++;
      this.pos = 0;
    } else {
      this.pfad.pop();
      this.pos = p.i + 1;
    }
    return true;
  }

  /// ◀
  links() {
    const z = this.zeile();
    if (this.pos > 0) {
      const e = z[this.pos - 1];
      if (e.k === 'T') {
        this.pfad.push({ i: this.pos - 1, s: e.s.length - 1 });
        this.pos = e.s[e.s.length - 1].length;
      } else this.pos--;
      return true;
    }
    if (this.pfad.length === 0) return false;
    const p = this.pfad[this.pfad.length - 1];
    const t = this.zeileAuf(this.pfad.length - 1)[p.i];
    if (p.s > 0) {
      p.s--;
      this.pos = t.s[p.s].length;
    } else {
      this.pfad.pop();
      this.pos = p.i;
    }
    return true;
  }

  /// ▲ / ▼ innerhalb von Schablonen (Bruch: Zähler ↔ Nenner); true, wenn sich etwas bewegt hat
  vertikal(richtung) {
    // von innen nach außen: die erste Schablone, in der eine vertikale Bewegung möglich ist
    for (let t = this.pfad.length - 1; t >= 0; t--) {
      const p = this.pfad[t];
      const s = this.zeileAuf(t)[p.i];
      const ziel = vertikalesZiel(s.v, p.s, richtung);
      if (ziel !== null) {
        this.pfad = this.pfad.slice(0, t + 1);
        this.pfad[t] = { i: p.i, s: ziel };
        this.pos = richtung > 0 ? s.s[ziel].length : s.s[ziel].length;
        this.pos = Math.min(this.pos, s.s[ziel].length);
        return true;
      }
    }
    return false;
  }

  // MARK: Löschen

  /// DEL: löscht links vom Cursor
  loeschen() {
    this.umschliessen = false;
    const z = this.zeile();
    if (this.pos > 0) {
      const e = z[this.pos - 1];
      if (e.k === 'T') {
        if (e.s.every((f) => f.length === 0)) {
          z.splice(this.pos - 1, 1);
          this.pos--;
        } else {
          // in die Schablone hinein (letztes Feld, Ende)
          this.pfad.push({ i: this.pos - 1, s: e.s.length - 1 });
          this.pos = e.s[e.s.length - 1].length;
        }
        return true;
      }
      z.splice(this.pos - 1, 1);
      this.pos--;
      return true;
    }
    if (this.pfad.length === 0) return false;
    // am Anfang eines Feldes
    const p = this.pfad[this.pfad.length - 1];
    const eltern = this.zeileAuf(this.pfad.length - 1);
    const t = eltern[p.i];
    if (t.s.every((f) => f.length === 0)) {
      eltern.splice(p.i, 1);
      this.pfad.pop();
      this.pos = p.i;
      return true;
    }
    if (p.s > 0) {
      p.s--;
      this.pos = t.s[p.s].length;
      return true;
    }
    this.pfad.pop();
    this.pos = p.i;
    return true;
  }

  // MARK: Abfragen

  /// Element direkt links vom Cursor (in der aktuellen Zeile)
  links1() {
    const z = this.zeile();
    return this.pos > 0 ? z[this.pos - 1] : null;
  }

  /// Enthält die Eingabe ein Element dieser Art (rekursiv)?
  enthaelt(pruef) {
    const such = (zeile) => zeile.some((e) => pruef(e) || (e.k === 'T' && e.s.some(such)));
    return such(this.wurzel);
  }
}

/// Feld, in das ▲ (richtung −1) bzw. ▼ (+1) führt, oder null
function vertikalesZiel(art, feld, richtung) {
  switch (art) {
    case 'frac':
      if (richtung > 0 && feld === 0) return 1;
      if (richtung < 0 && feld === 1) return 0;
      return null;
    case 'mixed':
      if (richtung > 0 && feld === 1) return 2;
      if (richtung < 0 && feld === 2) return 1;
      return null;
    case 'int':
    case 'sum':
      if (richtung < 0 && feld !== 2) return 2;
      if (richtung > 0 && feld !== 1) return 1;
      return null;
    default:
      return null;
  }
}
