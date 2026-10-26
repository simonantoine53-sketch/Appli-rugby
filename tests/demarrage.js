/* Démarrage sur un réseau lent ou absent (base de test) : écran de démarrage, message « Connexion lente »,
   « Pas de réseau » quand on ouvre sans réseau, et écran « Pas de réseau » sur une page jamais ouverte. */
const { harness, BASE, PASSWORD } = require('./lib');
const t = harness();
const view = process.argv[2] || 'telephone';
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';
const pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const VIEWS = { telephone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, ordinateur: { viewport: { width: 1440, height: 900 } } };

(async () => {
  console.log(`== ${view} ==`);
  const b = await pw.chromium.launch();
  // 1. Réseau très lent : l'écran de démarrage s'affiche, puis dit que la connexion est lente
  const ctx = await b.newContext(Object.assign({ locale: 'fr-FR' }, VIEWS[view]));
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 1500, downloadThroughput: 60 * 1024 / 8, uploadThroughput: 60 * 1024 / 8 });
  await page.goto(BASE + '#/', { waitUntil: 'commit' });
  t.check(await page.waitForSelector('#boot .boot-name', { timeout: 30000 }).then(() => true, () => false), 'réseau lent : écran de démarrage Rugbeo');
  t.check(await page.waitForFunction(() => /Connexion lente|du mal/.test((document.querySelector('#boot .boot-msg') || {}).textContent || ''), null, { timeout: 15000 }).then(() => true, () => false), 'réseau lent : message « Connexion lente… » (puis « Réessayer »)');
  // Capture sans attendre les polices (la page est encore en train de charger)
  require('fs').writeFileSync(require('path').join(require('./lib').OUT, `${view}-demarrage-1-lent.png`), Buffer.from((await cdp.send('Page.captureScreenshot')).data, 'base64'));
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  t.check(await page.waitForFunction(() => !document.getElementById('boot') && /Tout ton club/.test(document.body.innerText), null, { timeout: 60000 }).then(() => true, () => false), 'une fois chargée : l’écran disparaît, l’accueil s’affiche');

  // 2. Le coach a déjà ouvert l'appli ; plus de réseau : l'appli s'ouvre quand même (gardée sur le téléphone)
  await page.evaluate(() => window.RugbyAccount.openAuth('login'));
  await page.fill('#auth-email', 'coach@exemple.test'); await page.fill('#auth-password', PASSWORD); await page.click('#auth-submit');
  await page.waitForFunction(() => window.RugbyAccount.isLoggedIn(), null, { timeout: 15000 });
  await page.waitForTimeout(4000);
  // Plus de réseau (les demandes du service worker aussi : PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1)
  const cut = route => route.abort('internetdisconnected');
  await ctx.route(/supabase\.co/, cut);
  await ctx.setOffline(true);
  await page.reload(); await page.waitForTimeout(3000);
  t.check(!(await page.$('#boot')) && await page.isVisible('#hub-bar'), 'sans réseau : l’appli déjà ouverte démarre quand même');
  // Une page jamais ouverte : écran « Pas de réseau » avec « Réessayer »
  await page.evaluate(() => { location.hash = '#/team'; });
  t.check(await page.waitForSelector('.offline-card', { timeout: 15000 }).then(() => true, () => false), 'page jamais ouverte sans réseau : écran « Pas de réseau »');
  await t.shot(page, `${view}-demarrage-2-pas-de-reseau`);
  await ctx.unroute(/supabase\.co/, cut);
  await ctx.setOffline(false);
  t.check(await page.waitForSelector('.member-row', { timeout: 20000 }).then(() => true, () => false), 'retour du réseau : la page se charge toute seule');
  await ctx.close();

  // 3. Ouverture sans réseau d'une appli pas encore gardée : l'écran de démarrage dit qu'il n'y a pas de réseau
  const ctx2 = await b.newContext(Object.assign({ locale: 'fr-FR' }, VIEWS[view]));
  const p2 = await ctx2.newPage();
  await p2.route(/\/(js|vendor)\//, route => route.abort('internetdisconnected'));
  await p2.addInitScript(() => Object.defineProperty(navigator, 'onLine', { get: () => false }));
  await p2.goto(BASE + '#/');
  t.check(await p2.waitForFunction(() => /Pas de réseau/.test(document.body.innerText) && !document.querySelector('.boot-retry.hidden'), null, { timeout: 10000 }).then(() => true, () => false), 'sans réseau ni appli gardée : « Pas de réseau » + « Réessayer »');
  await t.shot(p2, `${view}-demarrage-3-hors-ligne`);
  await ctx2.close();
  await b.close();
  await t.done();
})();
