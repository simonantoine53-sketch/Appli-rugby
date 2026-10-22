/* Corrections du test utilisateur du 22 octobre 2026 (base de test) : arrivée sans fenêtres empilées,
   inscription (déjà un compte, moins de 15 ans, accord parental), stratégies côté joueur, agenda (sans réponse
   en premier, WhatsApp, menu ⋯, clavier), feuille de match (une seule heure, légende), équipe (rôle confirmé),
   accessibilité (Échap, titre d'onglet, contrastes du mode sombre). Aucune écriture dans la base. */
const { harness, BASE } = require('./lib');
const t = harness();
const view = process.argv[2] || 'telephone';
const has = (page, text) => page.waitForFunction(x => document.body.innerText.includes(x), text, { timeout: 20000 }).then(() => true, () => false);

(async () => {
  console.log(`== ${view} ==`);
  // 1. Visiteur : bandeau compact, masqué pendant la connexion ; boutons expliqués
  const pw = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
  const b = await pw.chromium.launch();
  const VIEWS = { telephone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, ordinateur: { viewport: { width: 1440, height: 900 } } };
  const ctx = await b.newContext(Object.assign({ locale: 'fr-FR' }, VIEWS[view]));
  const v = await ctx.newPage();
  await v.goto(BASE + '#/'); await v.waitForTimeout(1800);
  const barH = await v.$eval('.consent-bar', e => e.getBoundingClientRect().height).catch(() => 0);
  t.check(barH > 0 && barH < (view === 'telephone' ? 150 : 90), `bandeau de mesure compact (${Math.round(barH)} px)`);
  t.check(await has(v, 'visiter un club fictif'), 'accueil visiteur : « Voir la démo » expliqué');
  await t.shot(v, `${view}-corr-1-visiteur`);
  await v.evaluate(() => window.RugbyAccount.openAuth('login'));
  await v.waitForTimeout(400);
  t.check(!(await v.isVisible('.consent-bar')), 'bandeau masqué pendant la fenêtre de connexion');
  t.check(await v.evaluate(() => document.activeElement && document.activeElement.id === 'auth-email'), 'connexion : curseur dans le champ e-mail');
  await v.keyboard.press('Escape'); await v.waitForTimeout(300);
  t.check(await v.$eval('#modal-auth', e => e.classList.contains('hidden')), 'Échap ferme la fenêtre de connexion');
  t.check(await v.isVisible('.consent-bar'), 'le bandeau revient après la fenêtre');
  await v.click('.consent-bar button:has-text("Refuser")');
  // Lien d'invitation : « J'ai déjà un compte » en premier ; carte « moins de 15 ans » ; accord parental nommé
  await v.goto(BASE + '#/rejoindre/TESTSEN1'); await v.waitForTimeout(1500);
  t.check(await v.isVisible('#auth-who .who-login'), 'invitation : « J’ai déjà un compte Rugbeo » proposé');
  await v.click('#auth-who [data-who="kid"]');
  t.check(await v.isVisible('#auth-kid-share'), 'moins de 15 ans : explication et « Envoyer le lien à un parent »');
  await t.shot(v, `${view}-corr-2-invitation`);
  await v.click('#auth-who [data-who="parent"]');
  await v.fill('#auth-kid-list input', 'Emma Martin');
  t.check((await v.textContent('#auth-parent-who')).includes('d’Emma'), 'accord parental : « le parent (…) d’Emma »');
  await v.close(); await b.close();

  // 2. Joueur : les stratégies s'ouvrent sur « De l'équipe »
  const player = await t.open(view);
  await t.login(player, 'joueur@exemple.test');
  await t.go(player, '#/strategies');
  await player.waitForSelector('#home-tabs .tab.active', { timeout: 15000 });
  t.check((await player.textContent('#home-tabs .tab.active')).includes('De l’équipe'), 'joueur : Stratégies ouvre « De l’équipe »');
  t.check(/Stratégies – Séniors – Rugbeo/.test(await player.title()), `titre de l’onglet (${await player.title()})`);
  const card = await player.$('#home-list .lib-card .body');
  if (card) {
    await card.click(); await player.waitForTimeout(800);
    t.check(await player.isVisible('#modal-preview') && !(await player.isVisible('#view-editor')), 'joueur : la stratégie s’ouvre en lecture, sans l’éditeur');
    await player.keyboard.press('Escape'); await player.waitForTimeout(300);
    t.check(await player.isVisible('#view-strats'), 'en la fermant : retour à la liste');
  }
  await player.close();

  // 3. Coach : agenda (sans réponse en premier, WhatsApp, menu ⋯, clavier), feuille de match, équipe
  const coach = await t.open(view);
  await t.login(coach, 'coach@exemple.test');
  await t.go(coach, '#/agenda');
  await coach.waitForSelector('.ev-card', { timeout: 20000 });
  t.check(!(await coach.$('.ev-card button:has-text("Annuler l’événement")')), 'plus de « Annuler l’événement » sur les cartes');
  // Clavier : Tab jusqu'au titre d'une carte puis Entrée
  await coach.focus('.ev-card .ev-title[role="button"]');
  await coach.keyboard.press('Enter'); await coach.waitForTimeout(1200);
  t.check(/#\/agenda\/[0-9a-f-]{36}/.test(coach.url()), 'une carte s’ouvre au clavier (Entrée)');
  await t.go(coach, '#/agenda');
  await coach.waitForSelector('.ev-card', { timeout: 20000 });
  await coach.click('.ev-card:has(.ev-kind.match) .ev-title');
  await has(coach, 'Qui vient');
  const heads = await coach.$$eval('.ev-who h4', h => h.map(x => x.textContent));
  t.check(heads.length && /^Sans réponse/.test(heads[0]), `« Sans réponse » en premier (${heads[0]})`);
  t.check(await coach.isVisible('.pres-legend .linkish'), 'compteurs cliquables');
  t.check(await coach.isVisible('.ev-remind button:has-text("Envoyer sur WhatsApp")'), 'bouton « Envoyer sur WhatsApp »');
  t.check(await coach.isVisible('.ev-tools button[aria-haspopup="menu"]'), 'annuler / supprimer rangés dans le menu ⋯');
  t.check(await coach.$eval('.ev-person select', s => !!s.getAttribute('aria-label')).catch(() => true), 'listes de réponse nommées');
  const agendaMeet = await coach.$eval('.ev-info, .ev-detail, body', e => (e.innerText.match(/(?:RDV|[Rr]endez-vous)[^0-9]{0,6}(\d{1,2}h\d{2})/) || [])[1] || '').catch(() => '');
  await t.shot(coach, `${view}-corr-3-evenement`);
  await coach.click('button:has-text("Feuille de match")');
  await coach.waitForSelector('.sheet-card', { timeout: 20000 });
  const sheetMeet = await coach.$eval('.sheet-field input[type=time]', i => i.value);
  t.check(!!sheetMeet, `feuille de match : heure de rendez-vous ${sheetMeet} (agenda : ${agendaMeet || '—'})`);
  if (agendaMeet) t.check(agendaMeet.replace('h', ':').padStart(5, '0') === sheetMeet, 'même heure de rendez-vous que l’agenda');
  t.check(await coach.isVisible('.sheet-legend'), 'légende des ronds au-dessus de l’équipe');
  await t.shot(coach, `${view}-corr-4-feuille`);
  await t.go(coach, '#/team');
  await coach.waitForSelector('.member-row .member-actions select', { timeout: 20000 });
  t.check(/^Rôle (de |d’)/.test(await coach.$eval('.member-row .member-actions select', s => s.getAttribute('aria-label'))), 'liste « Rôle de … » nommée');
  t.check(!(await coach.$('.member-row .member-actions button:has-text("Retirer")')), '« Retirer » rangé dans le menu ⋯');
  await coach.selectOption('.member-row .member-actions select >> nth=0', 'admin');
  t.check(await coach.waitForSelector('.dialog-modal:not(.hidden)', { timeout: 4000 }).then(() => true, () => false), 'changer un rôle demande confirmation');
  await coach.click('.dialog-modal .dialog-cancel'); await coach.waitForTimeout(300);
  await t.shot(coach, `${view}-corr-5-equipe`);
  // Création de club fermée : pas de bouton grisé, une phrase claire
  await t.go(coach, '#/account');
  await coach.click('button:has-text("Rejoindre un club ou une équipe")');
  await coach.waitForTimeout(1500);
  t.check(!(await coach.isVisible('button:has-text("Créer le club")')), 'création fermée : pas de bouton grisé');
  t.check(await has(coach, 'Pas de code ?'), 'création fermée : « Pas de code ? » et l’adresse à qui écrire');
  await t.shot(coach, `${view}-corr-6-rejoindre`);
  // Mode sombre : contrastes ≥ 4,5 sur les boutons pleins et le texte d'état
  const ratios = await coach.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
    const rgb = s => s.match(/\d+/g).slice(0, 3).map(Number);
    const L = c => { const [r, g, b] = c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const cr = (a, b) => { const x = L(rgb(a)), y = L(rgb(b)); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const probe = (style) => { const d = document.createElement('div'); d.style.cssText = style; document.body.appendChild(d); const cs = getComputedStyle(d); const r = [cs.color, cs.backgroundColor]; d.remove(); return r; };
    const out = {};
    [['bleu', 'primary'], ['vert', 'success'], ['orange', 'warning'], ['rouge', 'danger']].forEach(([n, v]) => {
      const [fg, bg] = probe(`color: var(--on-color); background: var(--${v}-fill)`); out[n + ' plein'] = cr(fg, bg);
      const [fg2, bg2] = probe(`color: var(--${v}); background: var(--panel)`); out[n + ' texte'] = cr(fg2, bg2);
    });
    document.documentElement.removeAttribute('data-theme');
    return out;
  });
  Object.entries(ratios).forEach(([k, r]) => t.check(r >= 4.5, `mode sombre, ${k} : ${r.toFixed(2)}`));
  await coach.close();
  await t.done();
})();
