// Service worker : réception des notifications push et ouverture de l'appli au clic.
// Convocation : boutons Présent / Absent dans la notification (Android, ordinateur) ; la réponse part avec un jeton
// signé par le serveur (une personne, un événement). Sur iPhone, pas de boutons : l'appui ouvre l'écran de réponse.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

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

async function answer(n, status) {
  const d = n.data || {}, t = d.rsvp;
  const done = (title, body, url) => self.registration.showNotification(title, { body, icon: ICON, badge: ICON, tag: n.tag, data: { url: url || d.url } });
  try {
    const res = await fetch(t.api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rsvp: Object.assign({}, t, { status }) }) });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) return done('Réponse non enregistrée', (out.error ? out.error.charAt(0).toUpperCase() + out.error.slice(1) : 'Erreur') + '. Ouvrez l’appli pour répondre.');
    return done(`Réponse enregistrée : ${STATUS[status]}`, `${out.label || ''}${out.when ? ', ' + out.when : ''}. Touchez pour changer.`, d.url);
  } catch (_) {
    return done('Pas de réseau', 'Votre réponse n’est pas partie. Touchez pour ouvrir l’appli et répondre.');
  }
}

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const d = e.notification.data || {};
  if ((e.action === 'yes' || e.action === 'no') && d.rsvp) { e.waitUntil(answer(e.notification, e.action)); return; }
  e.waitUntil(openApp(d.url));
});
