/* Lot 3, mode sombre (base de test) : réglage Clair / Sombre / Automatique, captures des écrans principaux,
   l'impression reste claire. Captures à relire dans tests/out/. */
const { harness, BASE } = require('./lib');
const t = harness();
const view = process.argv[2] || 'telephone';
const MATCH = '30000000-0000-4000-8000-000000000002';

(async () => {
  console.log(`== ${view} ==`);
  const page = await t.open(view);
  await page.emulateMedia({ colorScheme: 'dark' });
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  // Fond de page de la charte « Terrain » (craie en clair, vert très sombre en sombre)
  const LIGHT = 'rgb(244, 246, 241)', DARK = 'rgb(12, 23, 18)';
  t.check(await bg() === DARK, 'automatique : suit le téléphone (sombre)');
  await t.shot(page, `${view}-sombre-0-visiteur`);
  await page.evaluate(() => window.RugbyAccount.openAuth('signup')); await page.waitForTimeout(600);
  await t.shot(page, `${view}-sombre-1-inscription`);
  await page.evaluate(() => document.querySelectorAll('.modal:not(.hidden) [data-close]').forEach(b => b.click()));
  await t.login(page, 'coach@exemple.test');
  for (const [h, n] of [['#/', 'accueil'], ['#/agenda', 'agenda'], ['#/agenda/' + MATCH, 'evenement'], ['#/agenda/' + MATCH + '/repondre', 'repondre'], ['#/compos/' + MATCH, 'compo'], ['#/strategies', 'strategies'], ['#/team', 'equipe'], ['#/account', 'compte']]) {
    await t.go(page, h); await page.waitForTimeout(2500); await t.shot(page, `${view}-sombre-${n}`);
  }
  await page.click('.page-tabs .tab:has-text("Présences")').catch(() => {});
  await t.go(page, '#/team'); await page.click('.page-tabs .tab:has-text("Présences")'); await page.waitForTimeout(2500); await t.shot(page, `${view}-sombre-presences`);
  // Réglage manuel : Clair puis Sombre, gardé après rechargement
  await t.go(page, '#/account');
  await page.click('[data-theme-set="light"]');
  t.check(await bg() === LIGHT, 'Clair : forcé même si le téléphone est en sombre');
  await page.click('[data-theme-set="dark"]');
  await page.emulateMedia({ colorScheme: 'light' });
  t.check(await bg() === DARK, 'Sombre : forcé même si le téléphone est en clair');
  await page.reload(); await page.waitForTimeout(2500);
  t.check(await page.evaluate(() => document.documentElement.getAttribute('data-theme')) === 'dark', 'choix gardé après rechargement');
  await t.shot(page, `${view}-sombre-reglages`);
  // Impression : toujours claire
  await page.emulateMedia({ media: 'print' });
  t.check(await bg() === LIGHT, 'impression : couleurs claires');
  await page.emulateMedia({ media: 'screen' });
  // Éditeur, mentions légales
  await t.go(page, '#/editor'); await page.waitForTimeout(2000); await t.shot(page, `${view}-sombre-editeur`);
  await page.evaluate(() => window.RugbyLegal.open('privacy')); await page.waitForTimeout(800); await t.shot(page, `${view}-sombre-legal`);
  await page.evaluate(() => document.querySelectorAll('.modal:not(.hidden) [data-close]').forEach(b => b.click()));
  // Lien public
  await page.goto(BASE + '#/s/test-lien-public-croisee'); await page.waitForTimeout(3500); await t.shot(page, `${view}-sombre-lien-public`);
  await page.evaluate(() => { try { localStorage.removeItem('rs-theme'); } catch (e) {} });
  // Back-office (super-admin)
  const sup = await t.open(view);
  await sup.emulateMedia({ colorScheme: 'dark' });
  await t.login(sup, 'super@exemple.test');
  await t.go(sup, '#/admin'); await sup.waitForTimeout(4000); await t.shot(sup, `${view}-sombre-backoffice`);
  await t.done();
})();
