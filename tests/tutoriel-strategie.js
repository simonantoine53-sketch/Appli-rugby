/* Tutoriel de l'éditeur de stratégies : lancé à la première ouverture de l'éditeur, une seule fois,
   chaque étape pointe un élément visible (téléphone et ordinateur), relançable par le bouton Aide. */
const pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path');
const { BASE, OUT } = require('./lib');
const view = process.argv[2] || 'telephone';
const VIEWS = { telephone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, ordinateur: { viewport: { width: 1440, height: 900 } } };
const problems = [];
const check = (ok, msg) => { if (!ok) problems.push(msg); console.log((ok ? '  ✓ ' : '  ✗ ') + msg); };

(async () => {
  console.log(`== ${view} ==`);
  const b = await pw.chromium.launch();
  const p = await (await b.newContext(Object.assign({ locale: 'fr-FR' }, VIEWS[view]))).newPage();
  p.on('pageerror', e => problems.push('erreur JS : ' + e.message));
  await p.goto(BASE + '#/'); await p.waitForTimeout(1500);
  const refuse = await p.$('.consent-bar button:has-text("Refuser")'); if (refuse) await refuse.click();
  await p.evaluate(() => window.RugbyEditor.startNewDrawing());
  check(await p.waitForSelector('.tour-card', { timeout: 6000 }).then(() => true, () => false), 'première ouverture de l’éditeur : le tutoriel se lance');
  check((await p.textContent('#tour-title')).includes('Dessiner une stratégie'), 'il commence par « Dessiner une stratégie »');
  const total = +(await p.textContent('.tour-count')).split('/')[1];
  check(total >= 7, `toutes les étapes sont présentes (${total})`);
  for (let i = 1; i <= total; i++) {
    await p.waitForTimeout(500);
    const title = await p.textContent('#tour-title');
    const spot = await p.$eval('.tour-spot', e => { const r = e.getBoundingClientRect(), c = document.querySelector('.tour-card').getBoundingClientRect();
      // visible, dans l'écran, et pas caché par la bulle
      return getComputedStyle(e).display !== 'none' && r.top < innerHeight && r.bottom > 0 && (r.bottom <= c.top + 8 || r.top >= c.bottom - 8 || r.right <= c.left || r.left >= c.right || r.height > 300); });
    if (i > 1) check(spot, `étape ${i} « ${title} » : l’élément est mis en valeur`);
    await p.screenshot({ path: path.join(OUT, `${view}-tuto-strat-${i}.png`) });
    await p.click('.tour-next');
  }
  check(!(await p.$('.tour')), 'le tutoriel se ferme à la fin');
  await p.evaluate(() => { location.hash = '#/'; }); await p.waitForTimeout(600);
  await p.evaluate(() => window.RugbyEditor.startNewDrawing()); await p.waitForTimeout(1500);
  check(!(await p.$('.tour')), 'deuxième ouverture : il ne revient pas tout seul');
  await p.click(view === 'telephone' ? '#fab-help-m' : '#fab-help');
  check(await p.waitForSelector('.tour-card', { timeout: 4000 }).then(() => true, () => false), 'le bouton Aide le relance');
  await b.close();
  console.log(problems.length ? `\n${problems.length} problème(s) :\n- ` + problems.join('\n- ') : '\nTout est bon.');
  process.exit(problems.length ? 1 : 0);
})();
