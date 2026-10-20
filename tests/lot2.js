/* Lot 2 (base de test) : écran de réponse directe (ouvert depuis la notification), réponses en temps réel côté staff,
   parent qui répond pour ses jeunes, réglage du rappel la veille (équipe et personnel), abonnement à l'agenda. */
const { harness } = require('./lib');
const t = harness();
// Texte brut (les titres en majuscules par CSS changent innerText)
const waitRaw = (page, text) => page.waitForFunction(x => document.body.textContent.includes(x), text, { timeout: 20000 }).then(() => true, () => false);
const view = process.argv[2] || 'telephone';
const MATCH = '30000000-0000-4000-8000-000000000002';   // Séniors, contre US Vallée Verte
const U16 = '30000000-0000-4000-8000-000000000005';     // entraînement U16 (Tom et Lina)

(async () => {
  console.log(`== ${view} ==`);
  // 1. Le coach regarde le match ; le joueur 1 répond depuis l'écran direct : le coach le voit sans recharger
  const coach = await t.open(view);
  await t.login(coach, 'coach@exemple.test');
  await t.go(coach, '#/agenda/' + MATCH);
  await t.waitText(coach, 'Sans réponse');
  const absents = () => coach.evaluate(() => (document.body.innerText.match(/Absents \((\d+)\)/) || [])[1] || '0');
  const before = +(await absents());

  const player = await t.open(view);
  await t.login(player, 'joueur@exemple.test');
  await t.go(player, `#/agenda/${MATCH}/repondre`);
  t.check(await waitRaw(player, 'Serez-vous là ?'), 'écran de réponse directe : la question et l’événement');
  t.check(await player.$$eval('.quick-buttons .rsvp-btn', b => b.length) === 3, 'trois grands boutons Présent / Peut-être / Absent');
  await t.shot(player, `${view}-lot2-1-repondre`);
  await player.click('.quick-buttons .rsvp-btn.no');
  t.check(await t.waitText(player, 'Réponse enregistrée : Absent'), 'réponse enregistrée, affichée en clair');
  await t.shot(player, `${view}-lot2-2-repondu`);
  const live = await coach.waitForFunction(n => +((document.body.innerText.match(/Absents \((\d+)\)/) || [])[1] || 0) === n + 1, before, { timeout: 15000 }).then(() => true, () => false);
  t.check(live, `staff : la réponse apparaît en temps réel (absents ${before} → ${before + 1})`);
  await t.shot(coach, `${view}-lot2-3-temps-reel`);
  // On remet la situation de départ
  await player.click('.quick-buttons .rsvp-btn.yes');
  await t.waitText(player, 'Réponse enregistrée : Présent');
  await player.close();

  // 2. Page Équipe : réglage du rappel la veille (staff)
  await t.go(coach, '#/team');
  await coach.click('.tabs .tab:has-text("Réglages")').catch(() => {});
  t.check(await waitRaw(coach, 'Rappel la veille'), 'Équipe → Réglages : carte « Rappel la veille »');
  const hourSel = await coach.waitForSelector('select[aria-label="Heure du rappel"]', { timeout: 10000 }).catch(() => null);
  if (t.check(!!hourSel, 'choix de l’heure du rappel')) {
    await hourSel.selectOption('19');
    t.check(await t.waitText(coach, 'Rappel envoyé la veille à 19 h'), 'heure enregistrée (19 h)');
    await hourSel.selectOption('18');
    await t.waitText(coach, 'Rappel envoyé la veille à 18 h');
  }
  await t.shot(coach, `${view}-lot2-4-rappel-equipe`);

  // 3. Abonnement à l'agenda depuis la page Agenda
  await t.go(coach, '#/agenda');
  await coach.click('.page-actions button:has-text("S’abonner")');
  t.check(await t.waitText(coach, 'Google Agenda peut mettre plusieurs heures'), 'abonnement : explication et délai de Google');
  const links = await coach.$$eval('#calendar-body a', as => as.map(a => a.href));
  t.check(links.some(h => h.startsWith('https://calendar.google.com/calendar/render?cid=webcal')), 'lien Google Agenda');
  t.check(links.some(h => h.startsWith('webcal://') && h.includes('/functions/v1/calendar?t=')), 'lien webcal (iPhone, Mac)');
  t.check(links.some(h => h.startsWith('https://outlook.live.com/calendar/0/addfromweb?url=')), 'lien Outlook');
  t.check(!!await coach.$('#calendar-body button:has-text("Copier le lien")') && !!await coach.$('#calendar-body button:has-text("Nouveau lien")'), 'boutons « Copier le lien » et « Nouveau lien »');
  await t.shot(coach, `${view}-lot2-5-abonnement`);
  const old = links.find(h => h.startsWith('webcal://'));
  await coach.click('#calendar-body button:has-text("Nouveau lien")');
  await coach.click('.dialog-modal .dialog-ok');
  await coach.waitForFunction(o => [...document.querySelectorAll('#calendar-body a')].some(a => a.href.startsWith('webcal://') && a.href !== o), old, { timeout: 15000 }).catch(() => {});
  const renewed = await coach.$$eval('#calendar-body a', as => as.map(a => a.href).find(h => h.startsWith('webcal://')));
  t.check(!!renewed && renewed !== old, 'nouveau lien : l’adresse change');
  await coach.close();

  // 4. Parent : l'écran direct propose une réponse pour chacun de ses jeunes convoqués ; réglage personnel du rappel
  const parent = await t.open(view);
  await t.login(parent, 'parent@exemple.test');
  await t.go(parent, `#/agenda/${U16}/repondre`);
  t.check(await waitRaw(parent, 'Réponse de Tom') && await waitRaw(parent, 'Réponse de Lina'), 'parent : une réponse pour Tom et une pour Lina');
  await t.shot(parent, `${view}-lot2-6-parent`);
  await t.go(parent, '#/account');
  t.check(await t.waitText(parent, 'Rappel la veille des matchs et entraînements'), 'Compte → Réglages : rappel la veille (personnel)');
  t.check(await t.waitText(parent, 'Pour vous et vos jeunes'), 'le réglage couvre aussi les jeunes');
  await parent.click('#reminders-row');
  t.check(await t.waitText(parent, 'Plus de rappel la veille'), 'rappel coupé');
  await parent.click('#reminders-row');
  t.check(await t.waitText(parent, 'Rappel de la veille activé'), 'rappel réactivé');
  t.check(!!await parent.$('#btn-calendar'), 'Compte → Réglages : « Ajouter l’agenda à mon calendrier »');
  await t.shot(parent, `${view}-lot2-7-reglages`);
  await t.done();
})();
