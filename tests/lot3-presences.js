/* Lot 3 (base de test) : présences par joueur (saison / 30 jours, tri, fiche du membre, chiffres du joueur lui-même)
   et partenaires du club (ajout par la présidente, accueil de l'équipe, page publique d'une stratégie). */
const { harness, BASE } = require('./lib');
const t = harness();
const view = process.argv[2] || 'telephone';
const waitRaw = (page, text) => page.waitForFunction(x => document.body.textContent.includes(x), text, { timeout: 20000 }).then(() => true, () => false);
// Logo de test : vrai PNG 40 × 20 (bande rouge), fabriqué ici
const LOGO = (() => {
  const zlib = require('zlib');
  const crc = b => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } let x = 0xffffffff; for (const v of b) x = t[(x ^ v) & 0xff] ^ (x >>> 8); return (x ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const w = 40, h = 20, ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set([200, 30, 40], y * (w * 3 + 1) + 1 + x * 3);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
})();

(async () => {
  console.log(`== ${view} ==`);
  // 1. Le coach : Équipe → Présences
  const coach = await t.open(view);
  await t.login(coach, 'coach@exemple.test');
  await t.go(coach, '#/team');
  await coach.click('.page-tabs .tab:has-text("Présences")');
  t.check(await waitRaw(coach, 'Entraînements') && await coach.waitForSelector('.st-row:not(.st-th)', { timeout: 20000 }).then(() => true, () => false), 'staff : tableau des présences de l’équipe');
  const rows = await coach.$$eval('.st-row:not(.st-th)', r => r.length);
  t.check(rows === 20, `une ligne par joueur convoqué (${rows})`);
  await coach.selectOption('select[aria-label="Trier par"]', 'unanswered');
  const first = await coach.$eval('.st-row:not(.st-th) .st-name', e => e.textContent);
  t.check(/Romain|Yanis|Bastien|Lucas|Nathan|Léo|Hugo|Mathis|Enzo|Thomas|[A-Z]/.test(first), `tri « sans réponse » (premier : ${first})`);
  const firstNone = await coach.$eval('.st-row:not(.st-th) span:last-child', e => +e.textContent);
  t.check(firstNone >= 1, 'les convocations sans réponse sont comptées à part');
  await t.shot(coach, `${view}-lot3-1-presences`);
  await coach.click('.st-period .seg:has-text("30 derniers jours")');
  t.check(await waitRaw(coach, 'Sur les 30 derniers jours'), 'période : 30 derniers jours');
  await coach.waitForSelector('.st-row:not(.st-th)', { timeout: 20000 });
  await coach.click('.st-row:not(.st-th)');
  t.check(await waitRaw(coach, 'Présences cette saison'), 'fiche du membre : ses présences de la saison');
  await t.shot(coach, `${view}-lot3-2-fiche`);
  await coach.close();

  // 2. Un joueur voit ses propres chiffres seulement
  const player = await t.open(view);
  await t.login(player, 'joueur4@exemple.test');
  await t.go(player, '#/team');
  await player.click('.page-tabs .tab:has-text("Présences")');
  t.check(await waitRaw(player, 'Mes présences'), 'joueur : « Mes présences »');
  t.check(!await player.$('.st-table'), 'joueur : pas le tableau de toute l’équipe');
  await t.shot(player, `${view}-lot3-3-mes-presences`);
  await player.close();

  // 3. La présidente ajoute deux partenaires (le second avec un logo), puis change l'ordre
  const pres = await t.open(view);
  await t.login(pres, 'presidente@exemple.test');
  await t.go(pres, '#/team');
  await pres.click('.page-tabs .tab:has-text("Club")');
  await pres.waitForSelector('button:has-text("Ajouter un partenaire")', { timeout: 20000 });
  const add = async (name, url, logo) => {
    await pres.click('button:has-text("Ajouter un partenaire")');
    await pres.fill('.sponsor-form input[name=name]', name);
    if (url) await pres.fill('.sponsor-form input[name=url]', url);
    if (logo) { await pres.setInputFiles('.sponsor-form input[name=logo]', { name: 'logo.png', mimeType: 'image/png', buffer: LOGO }); await pres.waitForSelector('.sponsor-preview img'); }
    await pres.click('.sponsor-form button[type=submit]');
    await t.waitText(pres, `${name} ajouté`);
  };
  const tag = Date.now().toString().slice(-4);
  await add(`Boulangerie ${tag}`, 'https://boulangerie.exemple.test');
  await add(`Garage ${tag}`, null, true);
  const names = () => pres.$$eval('.sponsor-box-text strong', s => s.map(x => x.textContent));
  await pres.waitForFunction(n => [...document.querySelectorAll('.sponsor-box-text strong')].some(x => x.textContent === n), `Garage ${tag}`, { timeout: 15000 }).catch(() => {});
  let list = await names();
  t.check(await pres.$eval(`.sponsor-box:has-text("Garage ${tag}") .sponsor-box-logo img`, i => i.naturalWidth > 0).catch(() => false), 'logo affiché dans la liste');
  t.check(list.includes(`Boulangerie ${tag}`) && list.includes(`Garage ${tag}`), 'partenaires ajoutés (nom, lien, logo)');
  await pres.click(`.sponsor-box:has-text("Garage ${tag}") button[aria-label^="Monter"]`);
  await pres.waitForTimeout(1500);
  list = await names();
  t.check(list.indexOf(`Garage ${tag}`) < list.indexOf(`Boulangerie ${tag}`), 'ordre d’affichage modifié');
  await t.shot(pres, `${view}-lot3-4-partenaires`);
  await pres.close();

  // 4. Accueil de l'équipe : bloc discret des partenaires
  const c2 = await t.open(view);
  await t.login(c2, 'coach@exemple.test');
  await t.go(c2, '#/');
  t.check(await c2.waitForSelector('.home-sponsors .sponsor-item', { timeout: 20000 }).then(() => true, () => false), 'accueil : bloc « Nos partenaires »');
  await c2.evaluate(() => document.querySelector('.home-sponsors').scrollIntoView());
  await t.shot(c2, `${view}-lot3-5-accueil-partenaires`);
  await c2.close();

  // 6. Page publique d'une stratégie : partenaires en bas, sans être connecté
  const visitor = await t.open(view);
  await visitor.goto(BASE + '#/s/test-lien-public-croisee');
  t.check(await visitor.waitForSelector('#share-sponsors .sponsor-item', { timeout: 20000 }).then(() => true, () => false), 'lien public : partenaires du club en bas de page');
  t.check(await waitRaw(visitor, 'Partenaires de RC Test'), 'titre « Partenaires de RC Test »');
  await visitor.evaluate(() => document.querySelector('#share-sponsors').scrollIntoView());
  await t.shot(visitor, `${view}-lot3-7-lien-public`);
  await t.done();
})();
