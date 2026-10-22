/* Lot 1, « Voir la démo » : visiteur sans compte, club démo en lecture seule (base de test).
   Option : DEMO_SNAPSHOT=fichier.json pour tester l'appli avec une copie locale (avant que la démo existe en base). */
const fs = require('fs');
const { harness, BASE } = require('./lib');
const t = harness();
const view = process.argv[2] || 'telephone';

(async () => {
  console.log(`== ${view} ==`);
  const page = await t.open(view);
  if (process.env.DEMO_SNAPSHOT) {
    const body = fs.readFileSync(process.env.DEMO_SNAPSHOT, 'utf8');
    await page.route('**/rest/v1/rpc/demo_snapshot*', r => r.fulfill({ status: 200, contentType: 'application/json', body }));
  }
  // Aucune écriture ne doit partir vers la base pendant la démo
  const writes = [];
  page.on('request', r => { if (/\/rest\/v1\//.test(r.url()) && !/demo_snapshot|count_demo/.test(r.url()) && r.method() !== 'GET' && r.method() !== 'HEAD') writes.push(r.method() + ' ' + r.url()); });
  await page.click('button:has-text("Voir la démo")');
  t.check(await page.waitForSelector('.dialog-choices button:has-text("Comme joueur")', { timeout: 5000 }).then(() => true, () => false), 'démo : choix « comme coach » ou « comme joueur »');
  await t.shot(page, `${view}-lot1-8-demo-choix`);
  const counted = page.waitForRequest(r => /count_demo/.test(r.url()) && /coach/.test(r.postData() || ''), { timeout: 5000 }).then(() => true, () => false);
  await page.click('.dialog-choices button:has-text("Comme coach")');
  t.check(await counted, 'démo : ouverture comptée (compteur anonyme)');
  await page.waitForLoadState('load');
  t.check(await t.waitText(page, 'Bonjour Julien'), 'démo : accueil du coach du club démo');
  t.check(await page.isVisible('.demo-banner'), 'bandeau « Démo » visible');
  await t.shot(page, `${view}-lot1-9-demo-accueil`);
  await t.go(page, '#/agenda');
  t.check(await t.waitText(page, 'US Vallée Verte'), 'démo : agenda avec le match');
  await t.go(page, '#/strategies');
  await page.click('.tabs .tab:has-text("De l’équipe")').catch(() => {});
  t.check(await t.waitText(page, 'Croisée 10-12') && await t.waitText(page, 'Touche à 5') && await t.waitText(page, 'Échauffement'), 'démo : les 3 stratégies');
  await t.shot(page, `${view}-lot1-10-demo-strategies`);
  await t.go(page, '#/compos');
  t.check(await page.waitForSelector('.sheet-st.pub', { timeout: 20000 }).then(() => true, () => false), 'démo : compo publiée');
  // Une action d'écriture : elle est refusée en douceur
  await t.go(page, '#/agenda');
  await t.waitText(page, 'US Vallée Verte');
  await page.click('.ev-card >> nth=0');
  await t.waitText(page, 'Qui vient');
  const relance = page.locator('button:has-text("Envoyer sur WhatsApp")');
  await t.shot(page, `${view}-lot1-11-demo-match`);
  await t.go(page, '#/team');
  await t.waitText(page, 'membres');
  await t.shot(page, `${view}-lot1-12-demo-equipe`);
  // Exporter une stratégie : pas de téléchargement, on propose de créer un compte
  await t.go(page, '#/strategies');
  await page.click('.tabs .tab:has-text("De l’équipe")').catch(() => {});
  await t.waitText(page, 'Croisée 10-12');
  await page.click('.lib-card:has-text("Croisée 10-12") .thumb');
  await page.waitForTimeout(1500);
  const tour = await page.$('.tour-card'); if (tour) { await page.click('.tour-skip'); await page.waitForTimeout(300); }
  await page.click('#btn-export');
  t.check(await page.waitForSelector('.dialog-modal:not(.hidden) >> text=créez votre compte gratuit', { timeout: 5000 }).then(() => true, () => false) && !(await page.isVisible('#export-menu:not(.hidden)')), 'démo : « Exporter » propose de créer un compte (rien n’est téléchargé)');
  t.check(!(await page.isVisible('.demo-banner')), 'démo : le bandeau ne cache pas la fenêtre');
  await t.shot(page, `${view}-lot1-12b-demo-exporter`);
  await page.click('.dialog-cancel');
  t.check(await page.evaluate(() => !(localStorage.getItem('rugby-drawing-current-v1') || '').includes('Croisée')), 'démo : la stratégie n’est pas gardée sur l’appareil');
  // Vue joueur
  await page.click('.demo-banner button:has-text("Voir comme joueur")');
  await page.waitForLoadState('load');
  t.check(await t.waitText(page, 'Bonjour Kevin'), 'démo comme joueur : accueil de Kevin (joueur)');
  t.check(await t.waitText(page, 'vue joueur'), 'démo comme joueur : bandeau « vue joueur »');
  await t.shot(page, `${view}-lot1-12c-demo-joueur`);
  t.check(writes.length === 0, `aucune écriture envoyée à la base (${writes.length})`);
  if (writes.length) console.log(writes.slice(0, 5).join('\n'));
  await page.click('.demo-banner button:has-text("Quitter la démo")');
  await page.waitForLoadState('load'); await page.waitForTimeout(1500);
  t.check(!(await page.isVisible('.demo-banner')) && await t.waitText(page, 'Tout votre club'), 'quitter la démo : retour à l’accueil visiteur');
  await t.done();
})();
