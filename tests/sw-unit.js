/* Service worker (sw.js) sans navigateur : notification de convocation avec boutons, réponse envoyée au serveur,
   notification de confirmation ; erreurs et absence de réseau. Aucun appel réseau réel (fetch simulé). */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let fails = 0;
const check = (ok, msg) => { console.log((ok ? '  ✓ ' : '  ✗ ') + msg); if (!ok) fails++; };

function load(fetchImpl) {
  const handlers = {}, shown = [], opened = [];
  const self = {
    addEventListener: (n, f) => { handlers[n] = f; },
    registration: { scope: 'https://exemple.test/app/', showNotification: (title, opts) => { shown.push({ title, opts }); return Promise.resolve(); } },
    clients: { claim: () => Promise.resolve(), matchAll: () => Promise.resolve([]), openWindow: u => { opened.push(u); return Promise.resolve(); } },
    skipWaiting() {}
  };
  // Cache simulé (file d'attente des réponses sans réseau)
  const store = {};
  const caches = { open: async name => { const m = store[name] = store[name] || new Map(); return { put: async (k, r) => m.set(String(k), await r.text()), match: async k => (m.has(String(k)) ? { json: async () => JSON.parse(m.get(String(k))) } : undefined), keys: async () => [...m.keys()], delete: async k => m.delete(String(k)) }; }, keys: async () => Object.keys(store), delete: async n => delete store[n] };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8'), { self, fetch: fetchImpl, caches, location: { origin: 'https://exemple.test' }, Response: class { constructor(b) { this.b = b; } text() { return Promise.resolve(this.b); } }, JSON, Object, Promise });
  self.store = store;
  const fire = async (name, ev) => { let p; await handlers[name](Object.assign({ waitUntil: x => { p = x; } }, ev)); await p; };
  return { fire, shown, opened, store };
}
const token = { api: 'https://base.test/functions/v1/push-notify', u: 'u1', e: 'e1', x: 9999999999, s: 'sig' };
const push = data => ({ data: { json: () => data } });

(async () => {
  // 1. Convocation : boutons Présent / Absent
  let calls = [];
  let sw = load(async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return { ok: true, json: async () => ({ ok: true, label: 'Match contre US Vallée Verte', when: 'dim. 25 oct. à 15h00' }) }; });
  await sw.fire('push', push({ title: 'Convocation · Séniors', body: '…', url: '#/agenda/e1/repondre', tag: 'event-e1', rsvp: token }));
  const n = sw.shown[0];
  check(n && n.opts.actions && n.opts.actions.map(a => a.title).join('/') === 'Présent/Absent', 'convocation : boutons Présent et Absent');
  // 2. Appui sur « Présent » : réponse envoyée avec le jeton, confirmation
  await sw.fire('notificationclick', { action: 'yes', notification: { close() {}, tag: n.opts.tag, data: n.opts.data } });
  check(calls.length === 1 && calls[0].url === token.api && calls[0].body.rsvp.status === 'yes' && calls[0].body.rsvp.s === 'sig', 'réponse envoyée au serveur avec le jeton signé');
  check(sw.shown[1] && sw.shown[1].title === 'Réponse enregistrée : Présent' && sw.shown[1].opts.body.includes('US Vallée Verte'), 'confirmation : « Réponse enregistrée : Présent »');
  check(sw.opened.length === 0, 'l’appli ne s’ouvre pas pour une réponse par bouton');
  // 3. Appui sur la notification (iPhone, pas de boutons) : écran de réponse directe
  await sw.fire('notificationclick', { action: '', notification: { close() {}, tag: n.opts.tag, data: n.opts.data } });
  check(sw.opened[0] === 'https://exemple.test/app/index.html?from=notif#/agenda/e1/repondre', 'appui sur la notification : écran de réponse directe');
  // 4. Notification sans jeton (stratégie, compo) : pas de boutons
  await sw.fire('push', push({ title: 'Compo publiée', url: '#/compos/e1', tag: 'event-e1' }));
  check(!sw.shown[sw.shown.length - 1].opts.actions, 'autres notifications : pas de boutons');
  // 5. Refus du serveur (événement commencé) et absence de réseau
  sw = load(async () => ({ ok: false, json: async () => ({ error: "l'événement a commencé" }) }));
  await sw.fire('notificationclick', { action: 'no', notification: { close() {}, tag: 't', data: { url: '#/agenda/e1/repondre', rsvp: token } } });
  check(sw.shown[0].title === 'Réponse non enregistrée' && sw.shown[0].opts.body.startsWith('L\'événement a commencé'), 'refus du serveur : message clair');
  sw = load(async () => { throw new Error('offline'); });
  await sw.fire('notificationclick', { action: 'no', notification: { close() {}, tag: 't', data: { url: '#/agenda/e1/repondre', rsvp: token } } });
  check(sw.shown[0].title === 'Pas de réseau' && sw.shown[0].opts.body.includes('partira dès le retour du réseau'), 'pas de réseau : on prévient que la réponse partira plus tard');
  const q = sw.store['rugbeo-queue'];
  check(q && q.size === 1 && JSON.parse([...q.values()][0]).status === 'no', 'la réponse est gardée dans la file d’attente du service worker');
  console.log(fails ? `\n${fails} problème(s).` : '\nTout est bon.');
  process.exit(fails ? 1 : 0);
})();
