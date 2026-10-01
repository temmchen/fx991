// inhalt.js – Hilfe-Inhalte in drei Sprachen (Lektionen, Tastenhilfe, Tipps, Über, Oberflächentexte).
// Fehlt etwas in einer Sprache, wird Deutsch verwendet.

import de from './inhalt/de.js';
import en from './inhalt/en.js';
import fr from './inhalt/fr.js';

const ALLE = { de, en, fr };

export function inhalt(s) {
  const d = ALLE[s] || de;
  return {
    ui: { ...de.ui, ...(d.ui || {}) },
    lektionen: d.lektionen && d.lektionen.length ? d.lektionen : de.lektionen,
    tasten: { ...de.tasten, ...(d.tasten || {}) },
    tipps: d.tipps && d.tipps.length ? d.tipps : de.tipps,
    ueber: d.ueber || de.ueber,
  };
}

export function uiText(s, k) {
  const key = k.replace(/^ui\./, '');
  const d = ALLE[s] || de;
  return (d.ui && d.ui[key]) ?? de.ui[key] ?? key;
}

export { ALLE };
