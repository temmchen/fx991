// sw.js – Service Worker der Web-App: lädt beim Installieren alle Dateien vorab (offline im Klassenraum,
// im Flugmodus) und liefert sie danach aus diesem versionierten Zwischenspeicher. Alle Dateien einer Version
// gehören zusammen: Neue Version = VERSION erhöhen → der Browser lädt sie beim nächsten Öffnen im
// Hintergrund komplett herunter, danach wird sie sofort aktiv (skipWaiting): schon das nächste Neuladen
// zeigt sie (app.js lädt selbst neu, solange noch nichts eingegeben wurde). Alte Zwischenspeicher werden
// gelöscht. Die App lädt alle Module beim Start, eine laufende ältere Seite holt danach nichts mehr nach.
// Auf temmchen.github.io teilen sich mehrere Apps den Ursprung: nur Zwischenspeicher mit „fx991-“ anfassen
// und nur Anfragen innerhalb des eigenen Bereichs (scope) beantworten.
const VERSION = '1.2.0';
const PREFIX = 'fx991-';
const CACHE = PREFIX + VERSION;

/// Alle Dateien der App (relativ zu sw.js)
const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'qr-code.svg',
  'css/app.css',
  'css/werkzeuge-app.css',
  'css/werkzeuge-graph.css',
  'css/werkzeuge-print.css',
  'css/werkzeuge-tools.css',
  'js/app.js',
  'js/anzeige.js',
  'js/auswertung.js',
  'js/basisn.js',
  'js/bildschirme.js',
  'js/eingabe.js',
  'js/format.js',
  'js/gleichungen.js',
  'js/hilfe.js',
  'js/i18n.js',
  'js/inhalt.js',
  'js/inhalt/de.js',
  'js/inhalt/en.js',
  'js/inhalt/fr.js',
  'js/inhalt/griechisch.js',
  'js/komplex.js',
  'js/konstanten.js',
  'js/matrix.js',
  'js/modi.js',
  'js/parser.js',
  'js/rechner.js',
  'js/statistik.js',
  'js/tastatur.js',
  'js/tasten.js',
  'js/verteilung.js',
  'js/zahl.js',
  'js/zeichnen.js',
  'js/werkzeuge/analysis.js',
  'js/werkzeuge/calculator.js',
  'js/werkzeuge/complex.js',
  'js/werkzeuge/constants.js',
  'js/werkzeuge/eqmodel.js',
  'js/werkzeuge/equations.js',
  'js/werkzeuge/expression.js',
  'js/werkzeuge/fmt.js',
  'js/werkzeuge/graph.js',
  'js/werkzeuge/hpformat.js',
  'js/werkzeuge/numerics.js',
  'js/werkzeuge/rational.js',
  'js/werkzeuge/solver.js',
  'js/werkzeuge/symbolic.js',
  'js/werkzeuge/ui/common.js',
  'js/werkzeuge/ui/graph-render.js',
  'js/werkzeuge/ui/graph-ui.js',
  'js/werkzeuge/ui/print-ui.js',
  'js/werkzeuge/ui/tools-ui.js',
  'icons/apple-touch-icon.png',
  'icons/favicon-32.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
];

// MARK: Installieren: alles frisch vom Server holen (am HTTP-Cache vorbei), dann sofort übernehmen.
// Scheitert das Herunterladen (Netz weg), bleibt die bisherige Version aktiv.

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

// ältere Seiten (bis 1.1.0) bitten per Nachricht um die Übernahme
self.addEventListener('message', (event) => {
  // waitUntil: der Worker darf nicht beendet werden, bevor das Übernehmen angestoßen ist
  if (event.data !== 'skipWaiting') return;
  const p = self.skipWaiting();
  if (typeof event.waitUntil === 'function') event.waitUntil(p);
});

// MARK: Aktivieren: alte Versionen löschen, offene Seiten übernehmen

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// MARK: Anfragen

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;
  const scopePath = new URL(self.registration.scope).pathname;
  if (!url.pathname.startsWith(scopePath)) return;          // andere Apps auf demselben Server
  if (req.headers.has('range')) return;

  if (req.mode === 'navigate') {
    const rel = url.pathname.slice(scopePath.length);
    // Start der App (auch ./?lang=fr, ./?beamer=1) → gespeichertes index.html
    if (rel === '' || rel === 'index.html') event.respondWith(appShell(event));
    else event.respondWith(networkFirst(event));
    return;
  }
  event.respondWith(cacheFirst(event));
});

/// index.html dieser Version aus dem Zwischenspeicher (Suchteil ignorieren); fehlt es, aus dem Netz
async function appShell(event) {
  const cache = await caches.open(CACHE);
  const cached = (await cache.match('index.html', { ignoreSearch: true }))
    || (await cache.match('./', { ignoreSearch: true }));
  if (cached) return plain(cached);
  try {
    const res = await fetch('index.html', { cache: 'no-cache' });
    if (res && res.ok) {
      if (res.type === 'basic') event.waitUntil(cache.put('index.html', res.clone()).catch(() => {}));
      return plain(res);
    }
  } catch (e) { /* weiter unten */ }
  try {
    return await fetch(event.request);
  } catch (e) {
    return offlinePage();
  }
}

/// Dateien dieser Version aus dem Zwischenspeicher; nur was fehlt, kommt aus dem Netz (und wird eingelagert)
async function cacheFirst(event) {
  const req = event.request;
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res && res.ok && res.type === 'basic') event.waitUntil(cache.put(req, res.clone()).catch(() => {}));
    return res;
  } catch (e) {
    return Response.error();
  }
}

/// andere Seiten im Bereich (z. B. README): Netz zuerst, sonst Zwischenspeicher
async function networkFirst(event) {
  try {
    return await fetch(event.request);
  } catch (e) {
    const cache = await caches.open(CACHE);
    return (await cache.match(event.request, { ignoreSearch: true })) || offlinePage();
  }
}

/// Safari liefert umgeleitete Antworten nicht für Navigationen aus → ohne „redirected“ neu verpacken
function plain(res) {
  if (!res.redirected) return res;
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: res.headers });
}

function offlinePage() {
  const html = '<!doctype html><html lang="de"><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
    + '<title>fx-991 Trainer · offline</title>'
    + '<body style="margin:0;padding:48px 20px;font:17px/1.45 -apple-system,system-ui,sans-serif;background:#1F1E1C;color:#F4F2EC">'
    + '<h1 style="font-size:22px">Der fx-991 Trainer ist offline noch nicht verfügbar</h1>'
    + '<p>Bitte einmal mit Internetverbindung öffnen. Danach funktioniert er auch ohne Netz.</p>'
    + '</body></html>';
  return new Response(html, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
