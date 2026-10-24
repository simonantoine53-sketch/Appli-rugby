/* Partenaires du club (base de test, club RC Test) : ajout présenté en cartes, « réservé aux adultes », équipe de jeunes,
   annonce sur l'accueil et dans l'agenda, clic compté, tableau du super-admin. Les partenaires ajoutés sont retirés à la fin. */
const { harness } = require('./lib');
const t = harness();
const view = process.argv[2] || 'telephone';
const OK = 'Sport Test 2000', ADULT = 'Brasserie du Stade Test';

(async () => {
  console.log(`== ${view} ==`);
  const p = await t.open(view);
  const clicks = [];
  p.on('request', r => { if (/rpc\/count_sponsor/.test(r.url())) clicks.push(r.postData() || ''); });
  await t.login(p, 'presidente@exemple.test');
  const toClub = async () => { await t.go(p, '#/team'); await p.click('.tabs .tab:has-text("Club")').catch(() => {}); await p.waitForSelector('.sponsor-admin', { timeout: 15000 }); await p.waitForTimeout(800); };
  await toClub();

  // Deux partenaires, dont un réservé aux adultes
  for (const [name, adult] of [[OK, false], [ADULT, true]]) {
    await p.click('button:has-text("Ajouter un partenaire")');
    await p.fill('.sponsor-form input[name=name]', name);
    await p.fill('.sponsor-form input[name=url]', 'https://exemple.test/' + (adult ? 'brasserie' : 'sport'));
    if (adult) await p.check('.sponsor-form input[name=adults]');
    await p.click('.sponsor-form button[type=submit]');
    await p.waitForTimeout(1500);
  }
  const boxes = await p.$$eval('.sponsor-box', bs => bs.map(b => b.innerText));
  t.check(boxes.length >= 2 && boxes.some(b => b.includes(OK)) && boxes.some(b => b.includes(ADULT)), 'onglet Club : partenaires présentés en cartes');
  t.check(boxes.some(b => b.includes(ADULT) && b.includes('Réservé aux adultes')) && !boxes.some(b => b.includes(OK) && b.includes('Réservé aux adultes')), 'badge « Réservé aux adultes » sur le bon partenaire');
  t.check(boxes.some(b => b.includes('exemple.test') && !b.includes('https://')), 'site raccourci (sans https://)');
  await p.evaluate(() => { const g = document.querySelector('.sponsor-grid'); if (g) g.scrollIntoView(); });
  await t.shot(p, `${view}-partenaires-1-cartes`);

  // U16 : équipe de jeunes
  const u16 = p.locator('.club-team-row:has(.grow strong:text-is("U16")) .team-youth input').first();
  if (!(await u16.isChecked())) { await u16.check(); await p.waitForTimeout(1200); }
  t.check(await u16.isChecked(), 'U16 cochée « Jeunes »');

  // Accueil Séniors : carte « Partenaire du club », clic compté
  // Comme le sélecteur d'équipe de l'en-tête : on change d'équipe et la page affichée se recharge
  const pickTeam = name => p.evaluate(n => { const A = window.RugbyAccount, x = A.teams().find(t => t.name === n); if (x) { A.selectTeam(A.teamKey(x)); window.RugbyEditor.refreshView(); } }, name);
  await pickTeam('Séniors'); await t.go(p, '#/'); await p.waitForTimeout(2500);
  t.check(await p.waitForSelector('.sponsor-card', { timeout: 10000 }).then(() => true, () => false), 'accueil Séniors : carte « Partenaire du club »');
  await p.evaluate(() => { const c = document.querySelector('.sponsor-card'); if (c) c.scrollIntoView({ block: 'center' }); });
  await p.waitForTimeout(800);
  await t.shot(p, `${view}-partenaires-2-accueil`);
  const popup = p.context().waitForEvent('page', { timeout: 5000 }).catch(() => null);
  await p.click('.sponsor-card');
  const pg = await popup; if (pg) await pg.close();
  await p.waitForTimeout(800);
  t.check(clicks.some(c => /"click"/.test(c)), 'clic sur le partenaire compté');
  t.check(clicks.some(c => /"view"/.test(c)), 'affichage du partenaire compté');

  // Agenda Séniors : une annonce entre les événements
  await t.go(p, '#/agenda'); await p.waitForTimeout(2500);
  t.check(await p.waitForSelector('.agenda-sponsor', { timeout: 10000 }).then(() => true, () => false), 'agenda : annonce « Partenaire » entre les événements');
  await p.evaluate(() => { const c = document.querySelector('.agenda-sponsor'); if (c) c.scrollIntoView({ block: 'center' }); });
  await t.shot(p, `${view}-partenaires-3-agenda`);

  // Équipe de jeunes : jamais le partenaire réservé aux adultes
  await pickTeam('U16');
  let adultSeen = false;
  const visibleText = () => p.$$eval('.sponsor-card, .sponsor-item', ns => ns.filter(n => n.offsetParent).map(n => n.innerText + ' ' + (n.title || '') + ' ' + ((n.querySelector('img') || {}).alt || '')).join(' | '));
  for (let i = 0; i < 3; i++) {   // plusieurs ouvertures : les partenaires passent à tour de rôle
    for (const h of ['#/agenda', '#/']) {
      await t.go(p, h); await p.waitForTimeout(2500);
      const v = await visibleText();
      if (v.includes(ADULT)) { adultSeen = true; console.log('    ', h, 'équipe', await p.evaluate(() => window.RugbyAccount.team().name), ':', v.replace(/\s+/g, ' ').slice(0, 160)); }
    }
  }
  t.check(!adultSeen, 'U16 : le partenaire réservé aux adultes n’apparaît jamais');
  t.check(await p.$('.sponsor-card') !== null, 'U16 : les autres partenaires apparaissent');

  // Super-admin : tableau des partenaires
  const s = await t.open(view);
  await t.login(s, 'super@exemple.test');
  await t.go(s, '#/admin'); await s.waitForTimeout(5000);
  const table = await s.$$eval('.admin-card', cs => (cs.find(c => /Partenaires : affichages et clics/.test(c.innerText)) || {}).innerText || '');
  t.check(table.includes(OK) && table.includes(ADULT), 'back-office : tableau des partenaires (affichages, clics)');
  await s.evaluate(() => { const c = [...document.querySelectorAll('.admin-card')].find(x => /Partenaires : affichages/.test(x.innerText)); if (c) c.scrollIntoView(); });
  await t.shot(s, `${view}-partenaires-4-backoffice`);

  // Ménage : on retire les deux partenaires de test
  await pickTeam('Séniors'); await toClub();
  for (const name of [OK, ADULT]) {
    const box = p.locator(`.sponsor-box:has-text("${name}")`).first();
    if (await box.count()) { await box.locator('button:has-text("Retirer")').click(); await p.click('.dialog-modal .dialog-ok'); await p.waitForTimeout(1200); }
  }
  t.check(!(await p.$$eval('.sponsor-box', bs => bs.some(b => /Test 2000|Stade Test/.test(b.innerText)))), 'partenaires de test retirés');
  await t.done();
})();
