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
  // Mesure d'audience anonyme (sans identifiant) : active sauf opposition
  const ANON_KEY = 'rs-anon-optout';
  const anon = () => { try { return localStorage.getItem(ANON_KEY) !== '1'; } catch (e) { return true; } };
  const setAnon = on => { try { if (on) localStorage.removeItem(ANON_KEY); else localStorage.setItem(ANON_KEY, '1'); } catch (e) { /* ignore */ } };
  const label = () => { const c = read(); return !c ? 'Pas encore choisi.' : c.stats ? `Mesure détaillée acceptée le ${new Date(c.at).toLocaleDateString('fr-FR')}.` : `Mesure détaillée refusée le ${new Date(c.at).toLocaleDateString('fr-FR')}.`; };

  let bar = null;
  function ask(force) {
    if (bar || (!force && read())) return;
    bar = document.createElement('div');
    bar.className = 'consent-bar'; bar.setAttribute('role', 'dialog'); bar.setAttribute('aria-labelledby', 'consent-title');
    bar.innerHTML = `<p><strong id="consent-title">Ni cookie ni publicité.</strong> On peut mesurer ton usage pour améliorer l’appli ? Refuser ne change rien. <a href="#" data-legal="cookies">En savoir plus</a></p>
      <div class="consent-actions"><button type="button" class="btn outline" data-c="0">Refuser</button><button type="button" class="btn outline" data-c="1">Accepter</button></div>`;
    bar.querySelectorAll('[data-c]').forEach(b => b.onclick = () => {
      const ok = b.dataset.c === '1';
      write(ok); bar.remove(); bar = null;
      document.querySelectorAll('[data-consent-state]').forEach(s => { s.textContent = label(); });
      if (force && window.RugbyEditor && window.RugbyEditor.toast) window.RugbyEditor.toast(ok ? 'Merci : mesure d’usage acceptée.' : 'C’est noté : pas de mesure détaillée.');
      free();
    });
    document.body.appendChild(bar);
  }
  /* Une seule fenêtre à la fois : les bandeaux suivants (conditions, visite guidée…) attendent
     que le bandeau affiché soit refermé. */
  let waiting = [];
  const busy = () => !!document.querySelector('.consent-bar');
  function free() { if (busy()) return; const w = waiting; waiting = []; w.forEach(cb => cb()); }
  function whenFree(cb) { if (busy()) waiting.push(cb); else cb(); }

  // Premier passage (ou choix de plus de 13 mois) : on demande, sans bloquer l'appli
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => ask(false)); else ask(false);

  window.RugbyConsent = { stats, ask, label, anon, setAnon, whenFree, free };
})();
