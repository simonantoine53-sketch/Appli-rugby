/* Lot 1, Compos (base de test remise à zéro) : reprendre la compo du dernier match, absent surligné,
   échanger deux joueurs, déplacer un joueur, vider un poste. */
const { harness } = require('./lib');
const t = harness();
const view = process.argv[2] || 'telephone';
const MATCH2 = '30000000-0000-4000-8000-000000000006';

(async () => {
  console.log(`== ${view} ==`);
  const page = await t.open(view);
  await t.login(page, 'coach@exemple.test');
  await t.go(page, '#/compos/' + MATCH2);
  await t.waitText(page, 'Reprendre la compo du dernier match');
  await page.click('button:has-text("Reprendre la compo du dernier match")');
  t.check(await t.waitText(page, 'reprise'), 'reprise de la compo du match contre US Vallée Verte');
  await page.waitForSelector('.sheet-row input', { timeout: 15000 });
  await page.waitForTimeout(800);
  const rows = () => page.$$eval('.sheet-card .sheet-rows', ls => [...ls[0].querySelectorAll('.sheet-row input')].map(i => i.value));
  let names = await rows();
  t.check(names[0] === 'Léo Garnier' && names[1] === 'Kevin Durand', 'les joueurs sont repris à leur poste (n°1 Léo, n°2 Kevin)');
  t.check(await page.$eval('.sheet-row.is-absent', r => r.innerText.includes('Absent')).catch(() => false), 'Romain Fontaine, absent pour ce match, est surligné « Absent »');
  await t.shot(page, `${view}-lot1-1-compo-reprise`);

  // Échanger : Kevin (n°2) au n°6, Florian (n°6) part au n°2
  const input = n => page.locator('.sheet-card .sheet-rows').first().locator('.sheet-row input').nth(n - 1);
  await input(6).click(); await input(6).fill('Kevin Durand'); await input(6).press('Tab');
  t.check(await page.isVisible('.sheet-choice'), 'joueur déjà placé : choix « Déplacer ici » / « Échanger » proposé');
  await t.shot(page, `${view}-lot1-2-choix-deplacer-echanger`);
  await page.click('.sheet-choice button:has-text("Échanger")');
  await page.waitForTimeout(500);
  names = await rows();
  t.check(names[5] === 'Kevin Durand' && names[1] === 'Florian Girard', 'échange : Kevin au n°6, Florian au n°2');

  // Déplacer : Léo (n°1) au n°3, le n°1 se vide
  await input(3).click(); await input(3).fill('Léo Garnier'); await input(3).press('Tab');
  await page.click('.sheet-choice button:has-text("Déplacer ici")');
  await page.waitForTimeout(500);
  names = await rows();
  t.check(names[2] === 'Léo Garnier' && names[0] === '', 'déplacement : Léo au n°3, le n°1 est vide');

  // Vider un poste
  await page.locator('.sheet-card .sheet-rows').first().locator('.sheet-row').nth(2).locator('.sheet-clear').click();
  await page.waitForTimeout(500);
  names = await rows();
  t.check(names[2] === '', 'poste vidé avec la croix');
  await page.waitForTimeout(1500);   // enregistrement automatique
  await t.shot(page, `${view}-lot1-3-apres-echanges`);

  // L'enregistrement est bien en base : on recharge la feuille
  await t.go(page, '#/compos'); await t.go(page, '#/compos/' + MATCH2);
  await page.waitForSelector('.sheet-row input', { timeout: 15000 }); await page.waitForTimeout(800);
  names = await rows();
  t.check(names[5] === 'Kevin Durand' && names[1] === 'Florian Girard' && names[0] === '' && names[2] === '', 'après rechargement, la compo est bien enregistrée');
  await t.done();
})();
