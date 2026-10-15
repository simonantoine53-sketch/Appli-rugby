/* Mise à jour automatique : l'appli installée sur le téléphone reste ouverte en mémoire et ne recharge pas d'elle-même.
   À chaque retour sur l'appli (et toutes les 30 min), on compare sa version à celle en ligne (version.json, écrit par build.js) ;
   si elle a changé, on recharge, sauf pendant un dessin (on attend que la personne quitte l'éditeur). */
(function () {
  const link = document.querySelector('link[rel="stylesheet"][href*="?v="]');
  const mine = link ? (link.getAttribute('href').split('?v=')[1] || '') : '';
  if (!mine || !window.fetch) return;   // version hors ligne (dist) : pas de mise à jour à chercher
  let latest = null, last = 0;
  const busy = () => /^#\/(editor|d\/|s\/)/.test(location.hash) || !!document.querySelector('.modal:not(.hidden)');
  function apply() {
    if (!latest || latest === mine || busy()) return;
    let tried = null; try { tried = sessionStorage.getItem('update-tried'); } catch (e) { /* ignore */ }
    if (tried === latest) return;   // une seule tentative par version (évite une boucle si le serveur sert encore l'ancienne page)
    try { sessionStorage.setItem('update-tried', latest); } catch (e) { /* ignore */ }
    // Adresse différente pour contourner le cache de la page
    location.replace(location.pathname + '?u=' + latest + location.hash);
  }
  async function check() {
    if (Date.now() - last < 15000) return apply();
    last = Date.now();
    try {
      const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
      if (r.ok) latest = (await r.json()).v || null;
    } catch (e) { /* hors ligne */ }
    apply();
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  window.addEventListener('hashchange', check);   // sortie de l'éditeur : on applique une mise à jour en attente
  setInterval(() => { if (!document.hidden) check(); }, 30 * 60 * 1000);
  setTimeout(check, 5000);
})();
