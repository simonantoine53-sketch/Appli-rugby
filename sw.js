// Service worker : notifications push (réponse depuis la notification) et mode hors ligne.
// Convocation : boutons Présent / Absent dans la notification (Android, ordinateur) ; la réponse part avec un jeton
// signé par le serveur (une personne, un événement). Sur iPhone, pas de boutons : l'appui ouvre l'écran de réponse.
// Hors ligne : l'appli est gardée en cache (une version par build, VERSION et SHELL écrits par build.js) ;
// les dernières données lues (base Supabase) restent consultables ; une réponse donnée sans réseau attend son envoi.
const VERSION = '202610221525';
const SHELL = ["./","index.html","manifest.json","icons/icon-192.png","icons/icon-180.png","icons/icon-512.png","css/style.css?v=202610221525","js/update.js?v=202610221525","js/legal.js?v=202610221525","js/consent.js?v=202610221525","js/selects.js?v=202610221525","js/dialog.js?v=202610221525","js/icons.js?v=202610221525","js/field.js?v=202610221525","js/formations.js?v=202610221525","js/objects.js?v=202610221525","js/export.js?v=202610221525","vendor/supabase.min.js?v=202610221525","js/config.js?v=202610221525","js/offline.js?v=202610221525","js/demo.js?v=202610221525","js/editor.js?v=202610221525","js/account.js?v=202610221525","js/push.js?v=202610221525","js/profile.js?v=202610221525","js/compte.js?v=202610221525","js/admin.js?v=202610221525","js/agenda.js?v=202610221525","js/stats.js?v=202610221525","js/sponsors.js?v=202610221525","js/calimport.js?v=202610221525","js/sheets.js?v=202610221525","js/tour.js?v=202610221525","js/hub.js?v=202610221525","vendor/591.supabase.js","vendor/html2canvas.min.js","vendor/qrcode.min.js"];
const APP = 'rugbeo-app-' + VERSION, DATA = 'rugbeo-data', QUEUE = 'rugbeo-queue';
// Lectures par fonction (POST) gardées pour le hors ligne : uniquement des lectures
const READ_RPC = /\/rest\/v1\/rpc\/(team_view_counts|drawing_view_stats|attendance_stats|my_kids_login|guardian_contact|get_shared_drawing|club_creation_open|demo_snapshot)$/;

self.addEventListener('install', e => {
  // Une ressource manquante ne doit pas bloquer l'installation (chacune est mise en cache séparément)
  e.waitUntil(caches.open(APP).then(c => Promise.all(SHELL.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('rugbeo-app-') && k !== APP).map(k => caches.delete(k)))).then(() => self.clients.claim())
));

/* ---------- Hors ligne ---------- */
const offlineCopy = res => {
  const h = new Headers(res.headers); h.set('x-rugbeo-offline', '1');
  return res.blob().then(b => new Response(b, { status: res.status, statusText: res.statusText, headers: h }));
};
const tell = msg => self.clients.matchAll({ type: 'window' }).then(list => list.forEach(c => c.postMessage(msg)));
// Clé de cache d'une lecture : l'adresse, plus le corps pour une fonction (POST)
async function dataKey(req) {
  if (req.method === 'GET') return req.url;
  const body = await req.clone().text();
  return req.url + '?__body=' + encodeURIComponent(body).slice(0, 1500);
}
async function networkFirst(req) {
  const key = await dataKey(req);
  try {
    const res = await fetch(req);
    // Seulement les lectures d'un compte connecté (jeton de session), jamais celles d'un visiteur
    if (res.ok && /^Bearer ey/.test(req.headers.get('Authorization') || '')) { const c = await caches.open(DATA); c.put(key, res.clone()); }
    return res;
  } catch (err) {
    const hit = await (await caches.open(DATA)).match(key);
    if (!hit) throw err;
    tell({ type: 'offline-data' });
    return offlineCopy(hit);
  }
}
async function appFile(req) {
  const c = await caches.open(APP);
  const hit = await c.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok && res.type === 'basic') c.put(req, res.clone());
    return res;
  } catch (err) {
    const any = await c.match(req, { ignoreSearch: true });   // autre version du même fichier
    if (any) return any;
    throw err;
  }
}
async function page(req) {
  try {
    const res = await fetch(req);
    if (res.ok) (await caches.open(APP)).put('index.html', res.clone());
    return res;
  } catch (err) {
    const c = await caches.open(APP);
    return (await c.match('index.html')) || (await c.match('./')) || Response.error();
  }
}

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (url.origin === location.origin) {
    if (req.method !== 'GET' || url.pathname.endsWith('/version.json') || url.pathname.endsWith('/sw.js')) return;
    if (req.mode === 'navigate') { e.respondWith(page(req)); return; }
    e.respondWith(appFile(req));
    return;
  }
  // Base de données : on lit le réseau d'abord, la dernière réponse sinon (pas l'authentification, pas les écritures)
  if (url.pathname.startsWith('/rest/v1/') && (req.method === 'GET' || (req.method === 'POST' && READ_RPC.test(url.pathname)))) {
    e.respondWith(networkFirst(req));
  }
});

self.addEventListener('message', e => {
  const d = e.data || {};
  // Déconnexion : on efface les données gardées (un autre compte peut utiliser cet appareil)
  if (d.type === 'clear-data') e.waitUntil(Promise.all([caches.delete(DATA), caches.delete(QUEUE)]));
  if (d.type === 'flush') e.waitUntil(flushQueue());
});

/* ---------- Notifications ---------- */
const ICON = './icons/icon-192.png';
const STATUS = { yes: 'Présent', no: 'Absent', maybe: 'Peut-être' };

self.addEventListener('push', e => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch (_) { data = { body: e.data && e.data.text() }; }
  const title = data.title || 'Rugbeo';
  const opts = {
    body: data.body || '',
    icon: ICON,
    badge: ICON,
    tag: data.tag || 'rugby',
    data: { url: data.url || '#/', rsvp: data.rsvp || null }
  };
  if (data.rsvp) opts.actions = [{ action: 'yes', title: 'Présent' }, { action: 'no', title: 'Absent' }];
  e.waitUntil(self.registration.showNotification(title, opts));
});

function openApp(url) {
  const base = self.registration.scope;
  const target = base + 'index.html?from=notif' + (url || '#/');
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const open = list.find(c => c.url.startsWith(base));
    if (open) { open.navigate(target); return open.focus(); }
    return self.clients.openWindow(target);
  });
}

// Réponse sans réseau : gardée (une par personne et par événement), envoyée au retour du réseau
async function queue(t, status) {
  const c = await caches.open(QUEUE);
  await c.put(`queue/${t.u}/${t.e}`, new Response(JSON.stringify(Object.assign({}, t, { status }))));
  if (self.registration.sync) self.registration.sync.register('rsvp').catch(() => {});
}
async function flushQueue() {
  const c = await caches.open(QUEUE);
  const keys = await c.keys();
  let sent = 0;
  for (const k of keys) {
    const t = await (await c.match(k)).json();
    try {
      const res = await fetch(t.api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rsvp: t }) });
      if (res.ok || (res.status >= 400 && res.status < 500)) { await c.delete(k); if (res.ok) sent++; }   // refus définitif : inutile de réessayer
    } catch (_) { return sent; }   // toujours pas de réseau
  }
  if (sent) tell({ type: 'queue-sent', count: sent });
  return sent;
}
self.addEventListener('sync', e => { if (e.tag === 'rsvp') e.waitUntil(flushQueue()); });

async function answer(n, status) {
  const d = n.data || {}, t = d.rsvp;
  const done = (title, body, url) => self.registration.showNotification(title, { body, icon: ICON, badge: ICON, tag: n.tag, data: { url: url || d.url } });
  try {
    const res = await fetch(t.api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rsvp: Object.assign({}, t, { status }) }) });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) return done('Réponse non enregistrée', (out.error ? out.error.charAt(0).toUpperCase() + out.error.slice(1) : 'Erreur') + '. Ouvrez l’appli pour répondre.');
    return done(`Réponse enregistrée : ${STATUS[status]}`, `${out.label || ''}${out.when ? ', ' + out.when : ''}. Touchez pour changer.`, d.url);
  } catch (_) {
    await queue(t, status);
    return done('Pas de réseau', `Votre réponse (${STATUS[status]}) partira dès le retour du réseau.`);
  }
}

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const d = e.notification.data || {};
  if ((e.action === 'yes' || e.action === 'no') && d.rsvp) { e.waitUntil(answer(e.notification, e.action)); return; }
  e.waitUntil(openApp(d.url));
});
