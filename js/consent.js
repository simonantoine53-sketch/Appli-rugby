/* Consentement à la mesure d'usage (seul traitement de l'appli qui en demande un côté navigateur).
   Bandeau au premier passage : « Refuser » et « Accepter » ont le même poids ; le choix est gardé 13 mois.
   RugbyConsent.stats() : true seulement si la personne a accepté. RugbyConsent.ask(true) : rouvre le choix. */
(function () {
  const KEY = 'rs-consent';
  const MAX_AGE = 395 * 864e5;   // 13 mois
  const read = () => {
    try { const c = JSON.parse(localStorage.getItem(KEY) || 'null'); return c && Date.now() - c.at < MAX_AGE ? c : null; } catch (e) { return null; }
  };
  const write = stats => { try { localStorage.setItem(KEY, JSON.stringify({ stats: !!stats, at: Date.now(), v: 1 })); } catch (e) { /* ignore */ } };
  const stats = () => { const c = read(); return !!(c && c.stats); };
  const label = () => { const c = read(); return !c ? 'Pas encore choisi.' : c.stats ? `Mesure d’usage acceptée le ${new Date(c.at).toLocaleDateString('fr-FR')}.` : `Mesure d’usage refusée le ${new Date(c.at).toLocaleDateString('fr-FR')}.`; };

  let bar = null;
  function ask(force) {
    if (bar || (!force && read())) return;
    bar = document.createElement('div');
    bar.className = 'consent-bar'; bar.setAttribute('role', 'dialog'); bar.setAttribute('aria-labelledby', 'consent-title');
    bar.innerHTML = `<strong id="consent-title">Vos données, votre choix</strong>
      <p>Rugby Strat n’utilise ni cookie ni publicité. Avec votre accord, nous mesurons l’usage de l’appli (pages, fonctions, durée) pour l’améliorer. Refuser ne change rien au fonctionnement. <a href="#" data-legal="cookies">En savoir plus</a></p>
      <div class="consent-actions"><button type="button" class="btn outline" data-c="0">Refuser</button><button type="button" class="btn outline" data-c="1">Accepter</button></div>`;
    bar.querySelectorAll('[data-c]').forEach(b => b.onclick = () => {
      const ok = b.dataset.c === '1';
      write(ok); bar.remove(); bar = null;
      document.querySelectorAll('[data-consent-state]').forEach(s => { s.textContent = label(); });
      if (window.RugbyEditor && window.RugbyEditor.toast) window.RugbyEditor.toast(ok ? 'Merci : mesure d’usage acceptée.' : 'C’est noté : aucune mesure d’usage.');
    });
    document.body.appendChild(bar);
  }
  // Premier passage (ou choix de plus de 13 mois) : on demande, sans bloquer l'appli
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => ask(false)); else ask(false);

  window.RugbyConsent = { stats, ask, label };
})();
