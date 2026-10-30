/* Visite guidée : une seule fois par compte, même sur un nouvel appareil ou après réinstallation de l'appli
   (stockage du navigateur vide). Base de test, compte joueur2 ; son « déjà vu » est effacé au début. */
const { harness } = require('./lib');
const t = harness();
const view = process.argv[2] || 'telephone';
const EMAIL = 'joueur2@exemple.test';

(async () => {
  console.log(`== ${view} ==`);
  // Appareil « neuf » : on retire le contournement des tests pour la visite (lib.js la marque comme vue)
  const fresh = async () => {
    return t.open(view, { tour: true });
  };
  const tourShown = p => p.waitForSelector('.tour', { timeout: 12000 }).then(() => true, () => false);

  const p1 = await fresh();
  await t.login(p1, EMAIL);
  await p1.evaluate(() => window.RugbyAccount.sb.auth.updateUser({ data: { tours: [] } }));
  await p1.evaluate(() => { for (const k of Object.keys(localStorage)) if (/^tour-/.test(k)) localStorage.removeItem(k); });
  await p1.reload(); await p1.waitForTimeout(2500);
  t.check(await tourShown(p1), 'première connexion : la visite guidée s’affiche');
  await p1.waitForTimeout(1500);
  const tours = await p1.evaluate(async () => ((await window.RugbyAccount.sb.auth.getUser()).data.user.user_metadata || {}).tours || []);
  t.check(tours.includes('home'), 'la visite vue est gardée dans le compte');
  await p1.close();

  // Autre appareil, ou appli réinstallée : stockage vide, même compte
  const p2 = await fresh();
  await t.login(p2, EMAIL);
  await t.go(p2, '#/'); await p2.waitForTimeout(3000);
  t.check(!(await tourShown(p2)), 'nouvelle connexion sur un appareil neuf : pas de visite guidée');
  await t.done();
})();
