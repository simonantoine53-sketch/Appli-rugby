/* Tests de bout en bout sur la BASE DE TEST (jamais la production) : vue téléphone et ordinateur.
   Prérequis :
   - la base de test remplie (select public.test_seed(); dans l'éditeur SQL du projet rugbeo-test) ;
   - un serveur local : python3 -m http.server 8765 (depuis la racine du dépôt) ;
   - Playwright installé (npm i -g playwright, ou la version fournie par l'environnement).
   Usage : node tests/e2e.js            → captures dans tests/out/, erreurs listées à la fin
   L'appli choisit la base de test toute seule sur localhost (js/config.js) ; le test vérifie le bandeau. */
const path = require('path');
const fs = require('fs');
let pw;
try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }
const BASE = process.env.RUGBEO_URL || 'http://localhost:8765/';
const PASSWORD = 'RugbeoTest2026!';
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

const problems = [];
const check = (ok, msg) => { if (!ok) problems.push(msg); console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };

(async () => {
  const browser = await pw.chromium.launch();
  const views = [['telephone', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }], ['ordinateur', { viewport: { width: 1440, height: 900 } }]];

  async function open(view, opts) {
    const ctx = await browser.newContext(Object.assign({ locale: 'fr-FR', timezoneId: 'Europe/Paris' }, opts));
    const page = await ctx.newPage();
    page.on('pageerror', e => problems.push(`[${view}] erreur JS : ${e.message}`));
    // Pas de visite guidée ni de demande de notifications pendant les tests
    await page.addInitScript(() => { const o = Storage.prototype.getItem; Storage.prototype.getItem = function (k) { return /^(tour-done-|push-asked-)/.test(k) ? '1' : o.call(this, k); }; });
    await page.goto(BASE + '#/');
    await page.waitForTimeout(1500);
    return page;
  }
  async function login(page, email) {
    await page.evaluate(() => window.RugbyAccount.openAuth('login'));
    await page.fill('#auth-email', email);
    await page.fill('#auth-password', PASSWORD);
    await page.click('#auth-submit');
    await page.waitForFunction(() => window.RugbyAccount.isLoggedIn(), null, { timeout: 15000 });
    await page.waitForTimeout(2000);
  }
  const shot = (page, view, name) => page.screenshot({ path: path.join(OUT, `${view}-${name}.png`) });

  for (const [view, opts] of views) {
    console.log(`\n== ${view} ==`);
    // Visiteur
    let page = await open(view, opts);
    check(await page.evaluate(() => window.RUGBY_CONFIG.env === 'test'), 'la base de test est utilisée sur localhost');
    check(await page.isVisible('#env-banner'), 'bandeau « Environnement de test » visible');
    check((await page.$$('.pres-card')).length === 4, 'page de présentation : 4 parties');
    await shot(page, view, '01-visiteur');

    // Coach
    await login(page, 'coach@exemple.test');
    check(await page.isVisible('.hub-hello'), 'coach : accueil affiché');
    await shot(page, view, '02-coach-accueil');
    await page.evaluate(() => { location.hash = '#/agenda'; }); await page.waitForTimeout(2000);
    check((await page.$$('.ev-card, .agenda-card, [data-ev]')).length > 0 || (await page.textContent('body')).includes('US Vallée Verte'), 'coach : le match apparaît dans l’agenda');
    await shot(page, view, '03-coach-agenda');
    await page.evaluate(() => { location.hash = '#/team'; }); await page.waitForTimeout(2000);
    check((await page.textContent('body')).includes('Demandes d’adhésion'), 'coach : demande d’adhésion en attente visible');
    await shot(page, view, '04-coach-equipe');
    await page.close();

    // Joueur
    page = await open(view, opts);
    await login(page, 'joueur@exemple.test');
    check((await page.textContent('body')).includes('serez-vous là'), 'joueur : convocation à répondre sur l’accueil');
    await shot(page, view, '05-joueur-accueil');
    await page.close();

    // Parent de deux jeunes
    page = await open(view, opts);
    await login(page, 'parent@exemple.test');
    const options = await page.$$eval('#hub-team option', os => os.map(o => o.textContent));
    check(options.some(o => o.includes('Tom')) && options.some(o => o.includes('Lina')) || (await page.textContent('#hub-title')).includes('U16'), 'parent : ses jeunes apparaissent dans le sélecteur');
    await shot(page, view, '06-parent-accueil');
    await page.evaluate(() => { location.hash = '#/account'; }); await page.waitForTimeout(1500);
    check((await page.textContent('body')).includes('Mes jeunes'), 'parent : carte « Mes jeunes » dans Compte');
    await shot(page, view, '07-parent-compte');
    await page.close();
  }
  await browser.close();
  console.log(problems.length ? `\n${problems.length} problème(s) :\n- ` + problems.join('\n- ') : '\nTout est bon.');
  process.exit(problems.length ? 1 : 0);
})();
