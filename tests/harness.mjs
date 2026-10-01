// harness.mjs – kleiner Testrahmen für JavaScriptCore (jsc -m) und den Browser.
export const results = { ok: 0, fail: [], sections: [] };
let current = '';

export const out = (typeof print === 'function') ? print : (s) => console.log(s);

export function section(name) {
  current = name;
  results.sections.push(name);
}

export function check(cond, name) {
  if (cond) results.ok++;
  else results.fail.push(`[${current}] ${name}`);
}

export function near(a, b, tol, name) {
  if (a === null || a === undefined || Number.isNaN(a)) {
    results.fail.push(`[${current}] ${name} (kein Wert: ${a})`);
    return;
  }
  if (Math.abs(a - b) <= tol * Math.max(1, Math.abs(b))) results.ok++;
  else results.fail.push(`[${current}] ${name}: ${a} ≠ ${b}`);
}

/// Führt eine Testfunktion aus; Ausnahmen zählen als Fehler statt den Lauf abzubrechen
export function run(name, fn) {
  section(name);
  try {
    fn();
  } catch (e) {
    results.fail.push(`[${name}] Ausnahme: ${e && e.stack ? e.stack.split('\n')[0] : e}`);
  }
}

export function report() {
  out(`Tests: ${results.ok} bestanden, ${results.fail.length} fehlgeschlagen`);
  for (const f of results.fail) out('  ✗ ' + f);
  return results.fail.length === 0;
}
