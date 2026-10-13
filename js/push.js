/* Notifications push (Web Push) : inscription du navigateur et envoi via la fonction Edge « push-notify ». */
(function () {
  const $ = s => document.querySelector(s);
  const cfg = window.RUGBY_CONFIG || {};
  const acc = () => window.RugbyAccount;
  const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && !!cfg.vapidPublicKey;
  const isIosNotInstalled = () => /iPhone|iPad|iPod/.test(navigator.userAgent) && !window.navigator.standalone;
  let reg = null;

  async function getReg() {
    if (reg) return reg;
    if (!('serviceWorker' in navigator)) return null;
    try { reg = await navigator.serviceWorker.register('sw.js'); await navigator.serviceWorker.ready; return reg; }
    catch (e) { console.warn('service worker', e); return null; }
  }
  if ('serviceWorker' in navigator) window.addEventListener('load', () => { getReg(); });

  function b64ToBytes(b64) {
    const pad = '='.repeat((4 - b64.length % 4) % 4);
    const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(raw, c => c.charCodeAt(0));
  }
  function b64url(buf) { return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }

  async function current() { const r = await getReg(); return r ? r.pushManager.getSubscription() : null; }

  async function enable() {
    const A = acc(); if (!A || !A.isLoggedIn()) return;
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { $('#push-help').textContent = 'Notifications refusées par le navigateur. Autorisez-les dans les réglages du site.'; return; }
    const r = await getReg(); if (!r) return;
    let sub = await r.pushManager.getSubscription();
    if (!sub) sub = await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(cfg.vapidPublicKey) });
    const j = sub.toJSON();
    const { error } = await A.sb.from('push_subscriptions').upsert({ user_id: A.user().id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, user_agent: navigator.userAgent.slice(0, 200) }, { onConflict: 'endpoint' });
    if (error) { console.warn(error); $('#push-help').textContent = 'Impossible d’enregistrer l’abonnement : ' + error.message; return; }
    renderButton(true);
  }
  async function disable() {
    const A = acc(); const sub = await current();
    if (sub) { if (A && A.isLoggedIn()) await A.sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint); await sub.unsubscribe(); }
    renderButton(true);
  }

  async function renderButton(hasTeam) {
    const block = $('#push-block'), btn = $('#btn-push'), help = $('#push-help');
    if (!block) return;
    if (!hasTeam || !supported()) { block.classList.toggle('hidden', !hasTeam || !isIosNotInstalled()); if (hasTeam && isIosNotInstalled()) { btn.classList.add('hidden'); help.textContent = 'Sur iPhone : ajoutez l’appli à l’écran d’accueil (Partager → Sur l’écran d’accueil) pour recevoir les notifications.'; } return; }
    block.classList.remove('hidden'); btn.classList.remove('hidden');
    const sub = await current();
    const on = !!sub && Notification.permission === 'granted';
    btn.textContent = on ? '🔕 Désactiver les notifications' : '🔔 Activer les notifications';
    btn.classList.toggle('on', on);
    help.textContent = on ? 'Vous serez prévenu quand une stratégie est publiée ou proposée dans votre équipe.' : Notification.permission === 'denied' ? 'Notifications bloquées dans le navigateur : autorisez-les dans les réglages du site.' : 'Recevez une alerte sur cet appareil à chaque nouvelle stratégie de votre équipe.';
    btn.onclick = () => (on ? disable() : enable()).catch(e => { console.warn(e); help.textContent = 'Erreur : ' + e.message; });
  }

  // Appelée après une publication / proposition : envoie la notification aux membres concernés
  async function notify(drawingId, kind) {
    const A = acc(); if (!A || !A.isLoggedIn() || !A.sb.functions) return;
    try { const { data, error } = await A.sb.functions.invoke('push-notify', { body: { drawing_id: drawingId, kind } }); if (error) console.warn('push-notify', error); else if (data && data.sent) console.log('push envoyées :', data.sent); }
    catch (e) { console.warn('push-notify', e); }
  }

  /** Notifications actives sur cet appareil (pour la liste de démarrage). */
  async function isOn() { if (!supported()) return false; try { const sub = await current(); return !!sub && Notification.permission === 'granted'; } catch (e) { return false; } }
  const canAsk = () => supported() && Notification.permission !== 'denied';

  window.RugbyPush = { enable, disable, renderButton, notify, supported, b64url, isOn, canAsk, isIosNotInstalled };
})();
