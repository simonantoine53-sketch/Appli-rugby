// Service worker : réception des notifications push et ouverture de l'appli au clic.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch (_) { data = { body: e.data && e.data.text() }; }
  const title = data.title || 'Rugbeo';
  e.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    tag: data.tag || 'rugby',
    data: { url: data.url || '#/' }
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const base = self.registration.scope;
  const target = base + 'index.html?from=notif' + ((e.notification.data && e.notification.data.url) || '#/');
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const open = list.find(c => c.url.startsWith(base));
    if (open) { open.navigate(target); return open.focus(); }
    return self.clients.openWindow(target);
  }));
});
