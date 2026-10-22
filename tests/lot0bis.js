/* Lot 0 bis, sur la base de test fraîchement remise à zéro (select public.test_seed();) :
   rappel parent multi-jeunes, compte transmis au jeune, parent visible du coach, page FFR du club, bouton Annuler de l'agenda.
   Le passage « première connexion du jeune » demande qu'un mot de passe lui soit posé côté base (voir tests/README dans README.md). */
const { harness } = require('./lib');
const t = harness();
const view = process.argv[2] || 'telephone';
const step = process.argv[3] || 'all';

(async () => {
  console.log(`== ${view} ==`);
  if (step === 'all' || step === 'parent') {
    const page = await t.open(view);
    await t.login(page, 'parent@exemple.test');
    const lina = await page.$$eval('#hub-team option', os => (os.find(o => o.textContent.includes('Lina')) || {}).value);
    if (lina) await page.selectOption('#hub-team', lina);
    await t.go(page, '#/');
    t.check(await t.waitText(page, 'convocation sans réponse'), 'parent : rappel « Tom : 1 convocation sans réponse » sur l’accueil de Lina');
    await t.shot(page, `${view}-0bis-1-parent-rappel`);
    await t.go(page, '#/account');
    await t.waitText(page, 'Mes jeunes');
    await page.click('.kid-row:has-text("Lina") button:has-text("Lui donner son compte")');
    await t.dialog(page, 'lina@exemple.test');
    await t.dialog(page, 'lina@exemple.test');
    t.check(await t.waitText(page, 'Compte transmis à lina@exemple.test'), 'parent : compte de Lina transmis, en attente de sa première connexion');
    await t.shot(page, `${view}-0bis-2-parent-transmis`);
  }
  if (step === 'all' || step === 'coach') {
    const page = await t.open(view);
    await t.login(page, 'admin@exemple.test');
    const u16 = await page.$$eval('#hub-team option', os => (os.find(o => o.textContent.includes('U16')) || {}).value);
    if (u16) await page.selectOption('#hub-team', u16);
    await t.go(page, '#/team');
    t.check(await t.waitText(page, 'compte géré par un parent'), 'coach U16 : les jeunes sont marqués « compte géré par un parent »');
    await t.shot(page, `${view}-0bis-3-coach-membres`);
    await page.click('.member-row:has-text("Tom Garnier") .who');
    t.check(await t.waitText(page, 'Sophie Garnier') && await t.waitText(page, 'parent@exemple.test'), 'coach U16 : la fiche de Tom donne le nom et l’e-mail du parent');
    await t.shot(page, `${view}-0bis-4-coach-fiche-jeune`);
  }
  if (step === 'all' || step === 'club') {
    const page = await t.open(view);
    await t.login(page, 'presidente@exemple.test');
    await t.go(page, '#/team');
    await page.click('.page-tabs .tab:has-text("Club")');
    await t.waitText(page, 'Code du club');
    await page.click('button:has-text("Ajouter la page FFR du club")');
    await t.dialog(page, 'https://competitions.ffr.fr/clubs/rc-test');
    t.check(await t.waitText(page, 'Page du club sur la FFR'), 'présidente : lien FFR enregistré et affiché dans l’onglet Club');
    await t.shot(page, `${view}-0bis-5-club-ffr`);
    await t.go(page, '#/agenda');
    await t.waitText(page, 'US Vallée Verte');
    await t.shot(page, `${view}-0bis-6-agenda-annuler`);
  }
  if (step === 'jeune') {
    const page = await t.open(view);
    await t.login(page, 'lina@exemple.test');
    t.check(await t.waitText(page, 'Bonjour Lina'), 'Lina : première connexion, elle arrive sur son accueil');
    await t.shot(page, `${view}-0bis-7-lina-premiere-connexion`);
  }
  await t.done();
})();
