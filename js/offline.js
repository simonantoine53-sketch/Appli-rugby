/* Hors ligne : bandeau « Hors ligne », réponses aux convocations gardées sur l'appareil et envoyées au retour du réseau.
   Les écrans affichent les dernières données lues (gardées par le service worker, sw.js). */
(function () {
  'use strict';
  const KEY = 'rs-rsvp-queue';
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; } };
  const write = q => { try { if (q.length) localStorage.setItem(KEY, JSON.stringify(q)); else localStorage.removeItem(KEY); } catch (e) { /* stockage plein ou bloqué */ } };
  const toast = m => { const E = window.RugbyEditor; if (E && E.toast) E.toast(m); };
  /** Erreur due au réseau (et pas un refus de la base). */
  const isNetwork = err => !navigator.onLine || /fetch|network|load failed|internet/i.test((err && (err.message || err.details)) || '');

  /** Réponse à envoyer plus tard (une seule par personne et par événement : la dernière compte). */
  function queueAnswer(row) {
    const q = read().filter(r => !(r.event_id === row.event_id && r.user_id === row.user_id));
    q.push(Object.assign({}, row, { at: new Date().toISOString() }));
    write(q); banner();
  }
  /** Réponses en attente pour ces événements : affichées comme si elles étaient déjà parties. */
  const pending = ids => read().filter(r => !ids || ids.includes(r.event_id));

  let flushing = false;
  async function flush() {
    const A = window.RugbyAccount;
    if (flushing || !navigator.onLine || !A || !A.isLoggedIn || !A.isLoggedIn()) return;
    const q = read(); if (!q.length) { askWorker(); return; }
    flushing = true;
    let sent = 0;
    const left = [];
    for (const r of q) {
      const row = { event_id: r.event_id, user_id: r.user_id, status: r.status, set_by: r.set_by };
      if (r.comment !== undefined) row.comment = r.comment;
      const { error } = await A.sb.from('event_responses').upsert(row);
      if (!error) sent++;
      else if (isNetwork(error)) left.push(r);
      else toast('Une réponse donnée hors ligne n’a pas pu partir : ' + (A.errMsg ? A.errMsg(error) : error.message));
    }
    write(left); flushing = false; banner();
    if (sent) { toast(sent > 1 ? `${sent} réponses envoyées.` : 'Réponse envoyée.'); if (window.RugbyEditor && window.RugbyEditor.refreshView) window.RugbyEditor.refreshView(); }
    askWorker();
  }
  // Réponses données depuis une notification sans réseau : c'est le service worker qui les garde
  const askWorker = () => { if (navigator.serviceWorker && navigator.serviceWorker.controller) navigator.serviceWorker.controller.postMessage({ type: 'flush' }); };
  /** Déconnexion : effacer les données gardées sur l'appareil. */
  async function clearData() {
    write([]);
    if (navigator.serviceWorker && navigator.serviceWorker.controller) navigator.serviceWorker.controller.postMessage({ type: 'clear-data' });
    try { if (window.caches) await Promise.all([caches.delete('rugbeo-data'), caches.delete('rugbeo-queue')]); } catch (e) { /* pas de cache */ }
  }

  /* ---------- Bandeau ---------- */
  let staleData = false, staleTimer = null;
  function banner() {
    let b = document.getElementById('offline-banner');
    const off = !navigator.onLine || staleData;
    const n = read().length;
    if (!off && !n) { if (b) b.remove(); document.documentElement.classList.remove('is-offline'); return; }
    if (!b) { b = document.createElement('div'); b.id = 'offline-banner'; b.className = 'offline-banner'; b.setAttribute('role', 'status'); document.body.appendChild(b); }
    document.documentElement.classList.toggle('is-offline', off);
    b.textContent = off
      ? `Hors ligne : dernières données enregistrées${n ? ` · ${n} réponse${n > 1 ? 's' : ''} en attente d’envoi` : ''}`
      : `${n} réponse${n > 1 ? 's' : ''} en attente d’envoi…`;
  }
  window.addEventListener('offline', banner);
  window.addEventListener('online', () => { staleData = false; banner(); flush(); });
  if (navigator.serviceWorker) navigator.serviceWorker.addEventListener('message', e => {
    const d = e.data || {};
    if (d.type === 'offline-data') { staleData = true; banner(); clearTimeout(staleTimer); staleTimer = setTimeout(() => { staleData = false; banner(); }, 30000); }
    if (d.type === 'queue-sent') { toast(d.count > 1 ? `${d.count} réponses envoyées.` : 'Réponse envoyée.'); if (window.RugbyEditor && window.RugbyEditor.refreshView) window.RugbyEditor.refreshView(); }
  });
  const start = () => { banner(); setTimeout(flush, 3000); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

  window.RugbyOffline = { queueAnswer, pending, flush, clearData, isNetwork };
})();
