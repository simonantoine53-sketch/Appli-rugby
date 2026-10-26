/* Lot 1, rejoindre en un clic (base de test) : lien et QR code dans « Inviter », lien ouvert connecté,
   lien ouvert par un visiteur (le code est gardé pour l'inscription et envoyé avec le compte). */
const { harness, BASE } = require('./lib');
const t = harness();
const view = process.argv[2] || 'telephone';

(async () => {
  console.log(`== ${view} ==`);
  // 1. Le coach ouvre « Inviter » : lien, QR code
  let page = await t.open(view);
  await t.login(page, 'coach@exemple.test');
  await t.go(page, '#/team');
  await t.waitText(page, 'Inviter');
  await page.click('.members-head button:has-text("Inviter")');
  t.check(await t.waitText(page, '#/rejoindre/TESTSEN1'), 'Inviter : lien d’invitation de l’équipe affiché');
  await t.shot(page, `${view}-lot1-5-inviter-lien`);
  await page.click('#invite-body button:has-text("QR code")');
  t.check(await page.waitForSelector('.qr-img svg', { timeout: 10000 }).then(() => true, () => false), 'QR code affiché en grand');
  await t.shot(page, `${view}-lot1-6-qr`);
  await page.close();

  // 2. Un joueur des Séniors, déjà connecté, ouvre le lien des U16 : demande envoyée tout de suite
  page = await t.open(view);
  await t.login(page, 'joueur2@exemple.test');
  await page.goto(BASE + '#/rejoindre/TESTU161');
  t.check(await t.waitText(page, 'Demande envoyée à « U16 »'), 'connecté : le lien envoie la demande pour U16');
  t.check(!(await page.evaluate(() => location.hash)).includes('rejoindre'), 'l’adresse est nettoyée après usage du lien');
  await t.shot(page, `${view}-lot1-7-lien-connecte`);
  await page.close();

  // 3. Un visiteur ouvre le lien : inscription proposée, le code est gardé et part avec le compte
  page = await t.open(view);
  let signupBody = null;
  await page.route('**/auth/v1/signup*', r => { signupBody = r.request().postDataJSON(); r.abort(); });
  await page.goto(BASE + '#/rejoindre/TESTSEN1');
  t.check(await t.waitText(page, 'tu rejoindras ensuite l’équipe automatiquement'), 'visiteur : la création de compte s’ouvre avec l’explication');
  await t.shot(page, `${view}-lot1-8-lien-visiteur`);
  t.check(await page.evaluate(() => localStorage.getItem('rs-join-code')) === 'TESTSEN1', 'le code est gardé dans le navigateur');
  t.check(await page.isVisible('#auth-name') && !(await page.isVisible('#auth-who')), 'le formulaire s’ouvre directement, sans étape « Qui crée le compte ? »');
  t.check(await t.waitText(page, 'Tu es invité à rejoindre « Séniors » · RC Test'), 'le nom de l’équipe qui invite est affiché');
  await page.fill('#auth-name', 'Nouveau Joueur');
  await page.fill('#auth-email', 'nouveau@exemple.test');
  await page.fill('#auth-password', 'UnMotDePasse123!');
  await page.click('#auth-submit');
  await page.waitForTimeout(1500);
  t.check(!!signupBody && signupBody.data && signupBody.data.join_code === 'TESTSEN1', 'le code part avec le compte (survit à la confirmation de l’e-mail sur un autre appareil)');
  await page.close();

  // 4. Le même visiteur se connecte plus tard avec un compte existant (joueur3) : il rejoint automatiquement
  page = await t.open(view);
  await page.goto(BASE + '#/rejoindre/TESTU161');
  await t.waitText(page, 'automatiquement');
  await page.click('#modal-auth .tab[data-mode="login"]');
  await page.fill('#auth-email', 'joueur3@exemple.test');
  await page.fill('#auth-password', 'RugbeoTest2026!');
  await page.click('#auth-submit');
  t.check(await t.waitText(page, 'Demande envoyée à « U16 »'), 'visiteur qui se connecte ensuite : la demande part automatiquement');
  await page.close();

  // 5. Un parent ouvre le lien des Séniors : une demande pour chacun de ses jeunes
  page = await t.open(view);
  await t.login(page, 'parent@exemple.test');
  await page.goto(BASE + '#/rejoindre/TESTSEN1');
  t.check(await t.waitText(page, 'Demandes envoyées pour Tom et Lina'), 'parent : le lien envoie une demande pour chacun de ses jeunes');
  await t.done();
})();
