/* Configuration du backend (Supabase). Les clés « publishable » et VAPID publiques sont publiques par conception :
   les données sont protégées par les politiques RLS côté base. La clé « service » n'est jamais ici.

   Deux bases :
   - production : uniquement sur les adresses de PROD_HOSTS ;
   - test : partout ailleurs (localhost, 127.0.0.1, fichier ouvert en local, aperçus *.pages.dev / *.vercel.app…).
   Un nouveau nom de domaine de production s'ajoute à PROD_HOSTS ; les aperçus restent sur la base de test sans retouche. */
(function () {
  const PROD_HOSTS = ['simonantoine53-sketch.github.io', 'rugbeo.fr', 'www.rugbeo.fr', 'app.rugbeo.fr'];
  const ENVS = {
    prod: {
      supabaseUrl: 'https://rnbsupogbesfngjfykyc.supabase.co',
      supabaseKey: 'sb_publishable_JtiH_AF7CbToELN6OAupew_oo9sn5gL',
      vapidPublicKey: 'BCt12h_eNLuuI-RQkZ13pI5fdXmm_yYf7tzTW2xQxTEw8PgbAyfWkP4kKKgztCi_BErkWB-loR0cUiSyzrD2j5s'
    },
    test: {
      supabaseUrl: 'https://qrldtcbzsewvjdrzzsdf.supabase.co',
      supabaseKey: 'sb_publishable_IdxuZ5azzOX663c4YYHhbA_2lS82AJE',
      vapidPublicKey: 'BJaUpPO-DQDwTRNinvSPk2Uf3HeJZMQqtVjklxkBZ5feq1x2hfjJKrE4dMWtv21RodKsBuQERnRHq5m3ac2NgPg'
    }
  };
  const env = PROD_HOSTS.includes(location.hostname) ? 'prod' : 'test';
  window.RUGBY_CONFIG = Object.assign({ env }, ENVS[env]);

  // Bandeau toujours visible sur la base de test, pour ne jamais la confondre avec la production
  if (env === 'test') {
    const show = () => {
      if (document.getElementById('env-banner')) return;
      const b = document.createElement('div');
      b.id = 'env-banner'; b.className = 'env-banner'; b.setAttribute('role', 'status');
      b.textContent = 'Environnement de test';
      document.body.appendChild(b);
      document.documentElement.classList.add('env-test');
    };
    if (document.body) show(); else document.addEventListener('DOMContentLoaded', show);
  }
})();
