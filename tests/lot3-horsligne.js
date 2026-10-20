/* Lot 3, hors ligne (base de test) : réseau coupé, l'appli se recharge depuis le cache avec les dernières données,
   bandeau « Hors ligne » ; une réponse donnée sans réseau attend puis part au retour du réseau. */
const { harness } = require('./lib');
const t = harness();
const view = process.argv[2] || 'telephone';
const MATCH = '30000000-0000-4000-8000-000000000002';
const waitRaw = (page, text, ms) => page.waitForFunction(x => document.body.textContent.includes(x), text, { timeout: ms || 20000 }).then(() => true, () => false);

(async () => {
  console.log(`== ${view} ==`);
  const page = await t.open(view);
  await t.login(page, 'joueur3@exemple.test');
  // Le service worker prend la main, puis on visite les écrans clés (leurs données sont gardées)
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 20000 }).catch(() => null);
  if (!await page.evaluate(() => !!(navigator.serviceWorker && navigator.serviceWorker.controller))) { await page.reload(); await page.waitForTimeout(3000); }
  t.check(await page.evaluate(() => !!navigator.serviceWorker.controller), 'service worker actif');
  for (const h of ['#/', '#/agenda', '#/agenda/' + MATCH, '#/team']) { await t.go(page, h); await page.waitForTimeout(2500); }
  await t.go(page, '#/agenda');
  await t.waitText(page, 'US Vallée Verte');

  // Réseau coupé : rechargement complet de la page
  await page.context().setOffline(true);
  await page.reload();
  t.check(await waitRaw(page, 'US Vallée Verte', 25000), 'hors ligne : l’appli se recharge et l’agenda s’affiche (dernières données)');
  t.check(await page.waitForSelector('#offline-banner', { timeout: 10000 }).then(() => true, () => false), 'bandeau « Hors ligne »');
  await t.shot(page, `${view}-lot3-8-hors-ligne`);

  // Réponse sans réseau : gardée sur l'appareil
  await t.go(page, `#/agenda/${MATCH}/repondre`);
  await page.waitForSelector('.quick-buttons .rsvp-btn.no', { timeout: 20000 });
  const before = await page.$eval('.quick-buttons .rsvp-btn.yes', b => b.getAttribute('aria-pressed'));
  const target = before === 'true' ? 'no' : 'yes';
  await page.click(`.quick-buttons .rsvp-btn.${target}`);
  t.check(await waitRaw(page, 'partira dès le retour du réseau'), 'réponse gardée sur l’appareil (message clair)');
  t.check(await waitRaw(page, 'en attente d’envoi'), 'bandeau : 1 réponse en attente');
  t.check(await page.waitForFunction(s => { const b = document.querySelector(`.quick-buttons .rsvp-btn.${s}`); return b && b.getAttribute('aria-pressed') === 'true'; }, target, { timeout: 15000 }).then(() => true, () => false), 'la réponse s’affiche déjà comme choisie');
  await t.shot(page, `${view}-lot3-9-reponse-attente`);

  // Retour du réseau : la réponse part toute seule
  await page.context().setOffline(false);
  t.check(await waitRaw(page, 'Réponse envoyée', 20000), 'retour du réseau : « Réponse envoyée »');
  t.check(await page.waitForFunction(() => !document.getElementById('offline-banner'), null, { timeout: 15000 }).then(() => true, () => false), 'le bandeau disparaît');
  t.check(await page.evaluate(() => !localStorage.getItem('rs-rsvp-queue')), 'plus rien en attente');
  // Vérification côté base, en relisant l'événement
  await t.go(page, '#/agenda/' + MATCH);
  await page.reload(); await page.waitForTimeout(3000);
  await t.go(page, `#/agenda/${MATCH}/repondre`);
  await page.waitForSelector('.quick-buttons .rsvp-btn', { timeout: 20000 });
  t.check(await page.$eval(`.quick-buttons .rsvp-btn.${target}`, b => b.getAttribute('aria-pressed')) === 'true', 'la réponse est bien dans la base');
  // On remet la réponse de départ
  if (before === 'true') { await page.click('.quick-buttons .rsvp-btn.yes'); await t.waitText(page, 'Réponse enregistrée'); }

  // Déconnexion : les données gardées sont effacées
  await t.go(page, '#/account');
  await page.click('#btn-logout');
  await page.waitForTimeout(1500);
  await page.waitForTimeout(1500);
  t.check(await page.evaluate(async () => { const c = await caches.open('rugbeo-data'); return !(await c.keys()).some(r => /team_events|event_responses|team_members/.test(r.url)); }), 'déconnexion : données de l’équipe effacées de l’appareil');
  await t.done();
})();
