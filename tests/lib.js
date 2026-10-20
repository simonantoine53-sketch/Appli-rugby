/* Outils communs des tests Playwright (base de test uniquement, voir README). */
const path = require('path');
const fs = require('fs');
let pw;
try { pw = require('playwright'); } catch (e) { pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); }

const BASE = process.env.RUGBEO_URL || 'http://localhost:8765/';
const PASSWORD = 'RugbeoTest2026!';
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const VIEWS = {
  telephone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  ordinateur: { viewport: { width: 1440, height: 900 } }
};

function harness() {
  const problems = [];
  let browser;
  const check = (ok, msg) => { if (!ok) problems.push(msg); console.log((ok ? '  ✓ ' : '  ✗ ') + msg); return ok; };
  async function open(view) {
    browser = browser || await pw.chromium.launch();
    const ctx = await browser.newContext(Object.assign({ locale: 'fr-FR', timezoneId: 'Europe/Paris' }, VIEWS[view]));
    const page = await ctx.newPage();
    page.on('pageerror', e => problems.push(`[${view}] erreur JS : ${e.message}`));
    // Pas de visite guidée ni de demande de notifications pendant les tests
    await page.addInitScript(() => { const o = Storage.prototype.getItem; Storage.prototype.getItem = function (k) { return /^(tour-done-|push-asked-)/.test(k) ? '1' : o.call(this, k); }; });
    await page.goto(BASE + '#/');
    await page.waitForTimeout(1500);
    const refuse = await page.$('.consent-bar button:has-text("Refuser")');
    if (refuse) { await refuse.click(); await page.waitForTimeout(300); }
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
  // Attend qu'un texte apparaisse (la vraie base répond moins vite qu'un faux serveur)
  const waitText = (page, text, ms) => page.waitForFunction(t => document.body.innerText.includes(t), text, { timeout: ms || 20000 }).then(() => true, () => false);
  const go = async (page, hash) => { await page.evaluate(h => { location.hash = h; }, hash); await page.waitForTimeout(800); };
  /** Répond à la fenêtre de saisie de l'appli (js/dialog.js). */
  async function dialog(page, value) {
    await page.waitForSelector('.dialog-modal:not(.hidden) .dialog-input', { timeout: 10000 });
    if (value != null) await page.fill('.dialog-modal .dialog-input', value);
    await page.click('.dialog-modal .dialog-ok');
    await page.waitForTimeout(400);
  }
  const shot = (page, name) => page.screenshot({ path: path.join(OUT, name + '.png') });
  async function done() {
    if (browser) await browser.close();
    console.log(problems.length ? `\n${problems.length} problème(s) :\n- ` + problems.join('\n- ') : '\nTout est bon.');
    process.exit(problems.length ? 1 : 0);
  }
  return { check, open, login, waitText, go, dialog, shot, done, problems };
}

module.exports = { harness, BASE, PASSWORD, OUT };
