/* Lot 1, page Compte en cinq groupes (base de test) : profil, club et équipes, réglages, aide, compte ;
   changer son mot de passe (puis se reconnecter avec le nouveau). Remettre la base à zéro ensuite (test_seed). */
const { harness, BASE } = require('./lib');
const t = harness();
const view = process.argv[2] || 'telephone';

(async () => {
  console.log(`== ${view} ==`);
  let page = await t.open(view);
  await t.login(page, 'coach@exemple.test');
  await t.go(page, '#/account');
  await t.waitText(page, 'Mon club et mes équipes');
  const groups = await page.$$eval('#view-account .acc-label', hs => hs.map(h => h.textContent.trim()));
  t.check(groups.join(' | ') === 'Mon profil | Mon club et mes équipes | Réglages | Aide | Compte', 'cinq groupes dans l’ordre : ' + groups.join(' | '));
  t.check(await t.waitText(page, 'Séniors'), 'l’équipe du coach est dans « Mon club et mes équipes »');
  await t.shot(page, `${view}-lot1-13-compte-haut`);
  await page.click('#btn-password');
  t.check(await page.isVisible('#password-form'), 'changer de mot de passe : le formulaire s’ouvre sur place (1 touche)');
  await page.fill('#password-new', 'Nouveau2026!'); await page.fill('#password-again', 'Autre2026!');
  await page.click('#password-save');
  t.check(await t.waitText(page, 'ne sont pas identiques'), 'deux mots de passe différents : message clair');
  await page.fill('#password-again', 'Nouveau2026!');
  await page.locator('#password-form').scrollIntoViewIfNeeded();
  await t.shot(page, `${view}-lot1-14-compte-mot-de-passe`);
  await page.click('#password-save');
  t.check(await t.waitText(page, 'Mot de passe modifié'), 'mot de passe modifié');
  await page.click('#btn-logout');
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.RugbyAccount.openAuth('login'));
  await page.fill('#auth-email', 'coach@exemple.test'); await page.fill('#auth-password', 'Nouveau2026!'); await page.click('#auth-submit');
  t.check(await page.waitForFunction(() => window.RugbyAccount.isLoggedIn(), null, { timeout: 15000 }).then(() => true, () => false), 'reconnexion avec le nouveau mot de passe');
  await page.close();

  page = await t.open(view);
  await t.login(page, 'parent@exemple.test');
  await t.go(page, '#/account');
  t.check(await t.waitText(page, 'Mes jeunes') && await t.waitText(page, 'les équipes de vos jeunes'), 'parent : « Mes jeunes » sous Mon profil, explication dans Mon club et mes équipes');
  await t.shot(page, `${view}-lot1-15-compte-parent`);
  await t.done();
})();
