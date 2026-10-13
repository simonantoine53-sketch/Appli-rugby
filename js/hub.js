/* Coquille de l'appli : en-tête commun, navigation (onglets sur ordinateur, barre en bas sur mobile),
   accueil hybride (« À faire », démarrage, tuiles), pages « Bientôt » et page Compte. */
(function () {
  'use strict';

  const $ = s => document.querySelector(s);
  const E = window.RugbyEditor;
  const A = window.RugbyAccount;
  const P = () => window.RugbyPush;
  const AG = () => window.RugbyAgenda;
  const SH = () => window.RugbySheets;
  const track = (name, props) => { if (window.RugbyTrack) window.RugbyTrack.track(name, props); };
  const active = !!(A && A.isActive());
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  const btn = (label, cls, fn) => { const b = el('button', 'btn ' + cls); b.textContent = label; b.onclick = e => { e.stopPropagation(); fn(b); }; return b; };
  const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;

  const ICON = {
    home: '<path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    agenda: '<rect x="3" y="5" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    strats: '<circle cx="6" cy="17" r="2.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="18" cy="7" r="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 15c3-1 4-6 8-7" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="3 2"/><path d="M14 5l2 3-3 1" fill="none" stroke="currentColor" stroke-width="2"/>',
    team: '<circle cx="9" cy="8" r="3.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17" cy="9" r="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M2 20c0-4 3-6.5 7-6.5s7 2.5 7 6.5M16 14.5c3 0 6 1.8 6 5.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    account: '<circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4 21c0-4 3.5-7 8-7s8 3 8 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    seances: '<circle cx="12" cy="13" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 9v4l3 2M9 2h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    compos: '<rect x="4" y="3" width="16" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="8" r="1.6" fill="currentColor"/><circle cx="8" cy="13" r="1.6" fill="currentColor"/><circle cx="16" cy="13" r="1.6" fill="currentColor"/><circle cx="12" cy="17" r="1.6" fill="currentColor"/>',
    invite: '<circle cx="9" cy="8" r="3.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M2 20c0-4 3-6.5 7-6.5 2 0 3.6.6 4.8 1.6M18 13v8M14 17h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
  };
  const ico = n => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[n]}</svg>`;

  /* ---------- Fonctionnalités à venir ---------- */
  const SOON = {
    agenda: { icon: 'agenda', title: 'Agenda et convocations', coach: 'Crée tes matchs et entraînements. Tes joueurs répondent présent ou absent en un appui, reçoivent un rappel, et tu vois tout de suite qui manque.', player: 'Tous les matchs et entraînements de ton équipe. Tu réponds présent ou absent en un appui et tu reçois un rappel avant chaque rendez-vous.' },
    seances: { icon: 'seances', title: 'Séances d’entraînement', coach: 'Assemble tes stratégies et tes exercices en une séance chronométrée, avec le matériel à prévoir, et rattache-la à l’entraînement.', player: '' },
    compos: { icon: 'compos', title: 'Compositions et feuille de match', coach: 'Place tes joueurs sur les 15 postes et les remplaçants, publie la compo à l’équipe et imprime la feuille de match aux couleurs du club.', player: '' }
  };
  const INTEREST_KEY = 'rugby-interest';
  const interested = () => { try { return JSON.parse(localStorage.getItem(INTEREST_KEY) || '[]'); } catch (e) { return []; } };
  function renderSoon(feature, rootSel) {
    const f = SOON[feature] || SOON.agenda;
    const coach = active && A.isLoggedIn() && A.isStaff();
    const root = $(rootSel); root.replaceChildren();
    const card = el('div', 'soon-card', `<span class="soon-icon">${ico(f.icon)}</span><span class="soon-tag">Bientôt</span><h2>${f.title}</h2><p>${coach || !f.player ? f.coach : f.player}</p>`);
    const done = interested().includes(feature);
    const b = btn(done ? '✓ Intérêt noté, merci' : 'Ça m’intéresse', done ? 'secondary' : 'primary', () => {
      if (interested().includes(feature)) return;
      track('interest', { feature });
      try { localStorage.setItem(INTEREST_KEY, JSON.stringify(interested().concat(feature))); } catch (e) { /* ignore */ }
      E.toast('Noté ! Les fonctions les plus demandées passent en premier.');
      renderSoon(feature, rootSel);
    });
    card.appendChild(b);
    card.appendChild(el('p', 'muted small', 'Votre clic nous aide à choisir quoi développer en premier.'));
    root.appendChild(card);
    if (feature === 'agenda') root.appendChild(el('p', 'muted center', 'En attendant, vos stratégies sont dans l’onglet Stratégies.'));
  }

  /* ---------- En-tête et navigation ---------- */
  let view = 'home';
  let data = null;
  // Le compte est en haut à droite (avatar), pas dans la barre : 4 entrées seulement
  const NAV = [['home', 'Accueil'], ['agenda', 'Agenda'], ['strats', 'Stratégies'], ['team', 'Équipe']];
  // Logo de l'équipe (celui des feuilles de match) à la place de l'icône générique
  const logos = {};
  async function loadLogo(team) {
    logos[team.id] = null;
    const { data } = await A.sb.from('teams').select('logo:sheet_settings->>logo').eq('id', team.id).maybeSingle();
    logos[team.id] = data && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(data.logo || '') ? data.logo : null;
    renderChrome();
  }
  function logoChanged(teamId, url) { logos[teamId] = url || null; renderChrome(); }
  function renderChrome() {
    const logged = active && A.isLoggedIn();
    const teams = logged ? A.teams() : [];
    const team = logged ? A.team() : null;
    if (team && !(team.id in logos)) loadLogo(team);
    const logoUrl = team && logos[team.id];
    $('#hub-logo').classList.toggle('hidden', !logoUrl); $('#hub-logo-default').classList.toggle('hidden', !!logoUrl);
    if (logoUrl && $('#hub-logo').getAttribute('src') !== logoUrl) $('#hub-logo').src = logoUrl;
    // Équipe : sélecteur s'il y en a plusieurs, sinon son nom
    const sel = $('#hub-team'), title = $('#hub-title');
    if (teams.length > 1) {
      sel.replaceChildren(...teams.map(t => { const o = el('option'); o.value = t.id; o.textContent = t.name + (t.superadmin ? ' · super-admin' : ''); o.selected = team && team.id === t.id; return o; }));
      sel.classList.remove('hidden'); title.classList.add('hidden');
    } else {
      sel.classList.add('hidden'); title.classList.remove('hidden');
      title.textContent = team ? team.name : 'Rugby Strat';
    }
    // Une seule action principale : nouveau dessin (Stratégies, et accueil du staff)
    $('#home-new').classList.toggle('hidden', !(view === 'strats' || (view === 'home' && logged && A.isStaff() && team)));
    // Compte : avatar en haut à droite, ou « Se connecter » pour un visiteur
    const acc = $('#hub-account');
    acc.classList.toggle('hidden', !active);
    if (active) {
      const p = logged ? A.profile() : null;
      const initial = ((p && p.display_name) || '?').trim().slice(0, 1).toUpperCase() || '?';
      acc.classList.toggle('logged', !!logged);
      acc.classList.toggle('on', view === 'account' || view === 'admin');
      const photo = logged && p && /^data:image\/(png|jpeg|webp);base64,/.test(p.avatar || '') ? p.avatar : null;
      acc.innerHTML = logged ? (photo ? `<span class="avatar-dot photo"><img src="${photo}" alt=""></span>` : `<span class="avatar-dot">${esc(initial)}</span>`) : '<span>Se connecter</span>';
      acc.title = logged ? 'Mon compte' : 'Se connecter';
      acc.setAttribute('aria-label', acc.title);
    }
    // Onglets
    const items = active ? NAV : NAV.filter(([id]) => id === 'home' || id === 'strats');
    const cur = view === 'soon' || view === 'compos' ? 'home' : view;
    const unanswered = data && data.agenda && !data.staff ? data.agenda.events.filter(e => !e.mine).length : 0;
    const badge = { strats: data && !data.staff ? data.toWatch.length : 0, team: data && data.staff ? data.pending : 0, agenda: unanswered };
    const make = withIcon => items.map(([id, label]) => {
      const b = el('button', 'nav-item', (withIcon ? ico(id) : '') + `<span>${label}</span>` + (badge[id] ? `<span class="nav-badge">${badge[id]}</span>` : ''));
      if (cur === id) b.setAttribute('aria-current', 'page');
      b.onclick = () => E.go(id);
      return b;
    });
    $('#hub-tabs').replaceChildren(...make(false));
    $('#app-nav').replaceChildren(...make(true));
  }
  // Logo et nom en haut à gauche : retour à l'accueil (convention des applis)
  const brand = $('#hub-bar .brand');
  brand.classList.add('home-link'); brand.setAttribute('role', 'link'); brand.tabIndex = 0; brand.title = 'Accueil'; brand.setAttribute('aria-label', 'Retour à l’accueil');
  brand.addEventListener('click', e => { if (e.target.closest('#hub-team')) return; E.go('home'); });
  brand.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('#hub-team')) { e.preventDefault(); E.go('home'); } });
  $('#hub-account').onclick = () => { if (A.isLoggedIn()) E.go('account'); else A.openAuth('login'); };
  $('#hub-team').onchange = e => { A.selectTeam(e.target.value); data = null; E.refreshView(); };

  /* ---------- Accueil ---------- */
  let seq = 0;
  function hero(root) {
    const box = el('div', 'hero', `<h1>Dessinez vos combinaisons de rugby, toute l’équipe les comprend.</h1>
      <ul><li>Placez joueurs, courses et passes en quelques secondes</li><li>Animez étape par étape, zoomez sur une touche ou une mêlée</li><li>Publiez à l’équipe et voyez qui a regardé avant le match</li></ul>`);
    const btns = el('div', 'hero-btns');
    if (active) btns.append(btn('Créer un compte gratuit', 'primary', () => A.openAuth('signup')), btn('Essayer sans compte', 'outline', () => E.go('editor')));
    else btns.append(btn('Dessiner une stratégie', 'primary', () => E.go('editor')), btn('Mes dessins', 'outline', () => E.go('strats')));
    box.appendChild(btns);
    if (active) {
      const login = el('small', '', 'Déjà un compte ? <a href="#" class="link">Se connecter</a>');
      login.querySelector('a').onclick = e => { e.preventDefault(); A.openAuth('login'); };
      box.appendChild(login);
    }
    root.appendChild(box);
  }
  function hello(root, sub) {
    const p = A.profile();
    const name = ((p && p.display_name) || '').split(' ')[0];
    root.appendChild(el('div', 'hub-hello', `<h1>Salut ${esc(name)}</h1>${sub ? `<p class="muted">${sub}</p>` : ''}`));
  }

  async function renderHome() {
    const my = ++seq;
    const root = $('#hub-home'); root.replaceChildren();
    if (!active || !A.isLoggedIn()) { if (active && !A.isReady()) { root.appendChild(el('p', 'muted center', 'Chargement…')); return; } hero(root); return; }
    const team = A.team();
    if (!team) {
      hello(root, 'Bienvenue sur Rugby Strat.');
      const card = el('div', 'todo-card', '<div class="todo-head">Dernière étape : rejoins ton club</div><p class="muted">Entre le code d’invitation donné par ton coach. Tu es coach ? Crée ton équipe, tu pourras inviter tes joueurs juste après.</p>');
      root.appendChild(card);
      A.pendingTeams().forEach(t => root.appendChild(el('p', 'muted', `Demande envoyée à « ${esc(t.name)} » : en attente de validation par un coach.`)));
      root.appendChild(A.teamForms());
      return;
    }
    const staff = A.isStaff();
    const roleLabel = team.superadmin ? 'super-admin' : { coach: 'coach', admin: 'admin', player: 'joueur' }[team.role] || team.role;
    hello(root, `${esc(team.name)} · ${roleLabel}`);
    const slot = el('div', 'hub-slots'); root.appendChild(slot);
    slot.appendChild(el('div', 'todo-card loading', '<div class="todo-head">À faire cette semaine</div><p class="muted">Chargement…</p>'));
    let d;
    try {
      const [hd, ag, sh] = await Promise.all([A.homeData(), AG() ? AG().upcoming(team).catch(() => null) : null, SH() ? SH().upcoming(team).catch(() => null) : null]);
      d = hd; if (d) { d.agenda = ag || { events: [], total: 0 }; d.sheets = sh || []; }
    } catch (e) { d = null; }
    if (my !== seq) return;
    data = d; renderChrome();
    slot.replaceChildren();
    if (!d) { slot.appendChild(el('p', 'library-empty', 'Impossible de charger l’accueil. Vérifiez la connexion.')); return; }
    let notifOn = false;
    try { notifOn = P() && P().isOn ? await P().isOn() : false; } catch (e) { /* notifications indisponibles */ }
    if (my !== seq) return;
    if (staff) { const ob = onboarding(d, notifOn); if (ob) slot.appendChild(ob); }
    slot.appendChild(todo(d, notifOn, staff));
    slot.appendChild(tiles(d, staff));
  }

  /** Liste de démarrage du staff, masquée quand tout est fait. */
  function onboarding(d, notifOn) {
    const players = Math.max(0, d.members - 1);
    const steps = [
      { done: true, label: 'Créer ton équipe' },
      { done: players >= 5, label: `Inviter tes joueurs (${Math.min(players, 5)}/5)`, action: 'Inviter', fn: () => A.shareCode() },
      { done: d.published.length > 0, label: 'Publier ta première stratégie', action: 'Dessiner', fn: () => E.startNewDrawing() },
      { done: d.agenda.total > 0, label: 'Créer ton premier match ou entraînement', action: 'Créer', fn: () => AG().openForm() }
    ];
    const push = P();
    if (push && push.canAsk && push.canAsk()) steps.push({ done: notifOn, label: 'Activer les notifications sur ce téléphone', action: 'Activer', fn: () => push.enable().then(() => renderHome()) });
    else if (push && push.isIosNotInstalled && push.isIosNotInstalled()) steps.push({ done: false, label: 'Installer l’appli sur l’écran d’accueil', action: 'Comment ?', fn: () => E.toast('Dans Safari : Partager → « Sur l’écran d’accueil ». Les notifications marcheront ensuite.') });
    const n = steps.filter(s => s.done).length;
    if (n === steps.length) return null;
    const card = el('div', 'todo-card onboarding');
    card.appendChild(el('div', 'todo-head', `Démarrer avec ton équipe <span class="muted">${n}/${steps.length}</span>`));
    card.appendChild(el('div', 'progress-line', `<i style="width:${Math.round(100 * n / steps.length)}%"></i>`));
    steps.forEach((s, i) => {
      const row = el('div', 'todo-row' + (s.done ? ' done' : ''), `<span class="todo-check">${s.done ? '✓' : ''}</span><span class="grow">${s.label}</span>`);
      if (!s.done && s.action) row.appendChild(btn(s.action, i === steps.findIndex(x => !x.done) ? 'primary small' : 'outline small', () => { track('home_action', { item: 'onboarding-' + i }); s.fn(); }));
      card.appendChild(row);
    });
    return card;
  }

  /** « À faire » : 3 actions au plus, les plus urgentes d'abord. */
  function todo(d, notifOn, staff) {
    const items = [];
    const go = (item, fn) => () => { track('home_action', { item }); fn(); };
    const ag = d.agenda || { events: [], total: 0 };
    const soon = Date.now() + 7 * 864e5;
    if (staff) {
      // Convocations : les plus proches d'abord
      ag.events.filter(ev => new Date(ev.starts_at) < soon && ev.sum.none).forEach(ev => items.push({ text: `${esc(AG().short(ev))} : <strong>${plural(ev.sum.none, 'joueur', 'joueurs')} sans réponse</strong>`, action: 'Relancer', primary: true, fn: go('event-remind', () => AG().remind(ev)) }));
      if (d.pending) items.push({ text: `<strong>${plural(d.pending, 'demande', 'demandes')}</strong> pour rejoindre l’équipe`, action: 'Valider', primary: true, fn: go('requests', () => E.go('team')) });
      if (d.proposals) items.push({ text: `<strong>${plural(d.proposals, 'proposition', 'propositions')}</strong> de joueur à regarder`, action: 'Voir', fn: go('proposals', () => { A.setLibTab('proposed'); E.go('strats'); }) });
      d.lowViews.slice(0, 2).forEach(r => items.push({ text: `« ${esc(r.title)} » : <strong>${r.viewers}/${r.audience} ont vu</strong>`, action: 'Relancer', fn: go('low-views', () => A.openViews(r)) }));
      (d.sheets || []).filter(m => new Date(m.starts_at) < soon && m.sheet !== 'published').slice(0, 1).forEach(m => items.push({ text: `Compo du match ${esc(AG().label(m).toLowerCase())} : <strong>${m.sheet === 'draft' ? 'à publier' : 'à faire'}</strong>`, action: m.sheet === 'draft' ? 'Finir' : 'Composer', primary: true, fn: go('sheet', () => E.go('compos', m.id)) }));
      if (!ag.events.length) items.push({ text: 'Aucun match ni entraînement prévu', action: 'Créer', fn: go('event-create', () => AG().openForm()) });
    } else {
      // Convocations sans réponse : on répond directement depuis l'accueil
      ag.events.filter(ev => !ev.mine).forEach(ev => items.push({
        text: `${esc(AG().short(ev))} à ${AG().time(ev.starts_at)} : <strong>tu viens ?</strong>`,
        buttons: [['Oui', 'primary pair', 'yes'], ['Non', 'outline pair', 'no']].map(([l, cls, st]) => [l, cls, go('rsvp-' + st, async () => { if (await AG().answer(ev.id, st)) { E.toast(st === 'yes' ? 'Super, à bientôt !' : 'Réponse envoyée : absent.'); renderHome(); } })])
      }));
      if (d.toWatch.length > 2) items.push({ text: `<strong>${d.toWatch.length} stratégies</strong> à regarder`, action: 'Voir', primary: true, fn: go('to-watch', () => { A.setLibTab('team'); E.go('strats'); }) });
      else d.toWatch.forEach(r => items.push({ text: `« ${esc(r.title)} » à regarder`, action: 'Regarder', primary: true, fn: go('to-watch', () => A.openById(r.id)) }));
      (d.sheets || []).filter(m => m.sheet === 'published' && new Date(m.starts_at) < soon).slice(0, 1).forEach(m => items.push({ text: m.mine ? `Compo publiée : <strong>tu es n°${m.mine.num}</strong>` : `Compo publiée pour le match ${esc(AG().label(m).toLowerCase())}`, action: 'Voir', primary: true, fn: go('sheet-view', () => E.go('compos', m.id)) }));
      if (A.profileIncomplete && A.profileIncomplete() && window.RugbyProfile) items.push({ text: 'Complète ton profil : photo et poste', action: 'Compléter', fn: go('profile', () => window.RugbyProfile.openProfile()) });
      const push = P();
      if (!notifOn && push && push.canAsk && push.canAsk()) items.push({ text: 'Active les notifications pour ne rien rater', action: 'Activer', fn: go('notifications', () => push.enable().then(() => renderHome())) });
    }
    const card = el('div', 'todo-card');
    card.appendChild(el('div', 'todo-head', 'À faire cette semaine'));
    if (!items.length) card.appendChild(el('p', 'todo-empty', staff ? 'Rien d’urgent. ✓ Tout le monde est à jour.' : 'Rien d’urgent. ✓ Tu es à jour.'));
    const addRow = it => {
      const row = el('div', 'todo-row', `<span class="grow">${it.text}</span>`);
      if (it.buttons) it.buttons.forEach(([l, cls, fn]) => row.appendChild(btn(l, cls + ' small', fn)));
      else row.appendChild(btn(it.action, it.primary ? 'primary small' : 'outline small', it.fn));
      return row;
    };
    items.slice(0, 3).forEach(it => card.appendChild(addRow(it)));
    if (items.length > 3) {
      // Les actions moins urgentes restent accessibles d'un appui
      const more = btn(`Voir ${items.length - 3 > 1 ? 'les ' + (items.length - 3) + ' autres' : 'l’autre'}`, 'ghost small todo-more', () => { more.replaceWith(...items.slice(3).map(addRow)); });
      card.appendChild(more);
    }
    return card;
  }

  /** Tuiles : accès direct aux fonctions, avec une info vivante ; « Bientôt » pour ce qui arrive. */
  function tiles(d, staff) {
    const grid = el('div', 'hub-tiles');
    const tile = (icon, title, sub, fn, opts) => {
      const o = opts || {};
      const t = el('button', 'hub-tile' + (o.soon ? ' soon' : ''), `${ico(icon)}<strong>${title}${o.badge ? ` <span class="nav-badge">${o.badge}</span>` : ''}</strong><small>${sub}</small>${o.soon ? '<span class="soon-tag">Bientôt</span>' : ''}`);
      t.onclick = fn; grid.appendChild(t);
    };
    if (staff) {
      tile('strats', 'Stratégies', d.published.length ? plural(d.published.length, 'publiée', 'publiées') : 'Aucune publiée pour l’instant', () => E.go('strats'));
      tile('team', 'Effectif', plural(d.members, 'membre', 'membres') + (d.pending ? ` · ${d.pending} en attente` : ''), () => E.go('team'), { badge: d.pending });
      tile('invite', 'Inviter', `Code ${esc(d.team.join_code)}`, () => A.shareCode());
      tile('agenda', 'Agenda', nextLabel(d), () => E.go('agenda'));
      tile('seances', 'Séances', 'Préparer l’entraînement', () => E.go('soon', 'seances'), { soon: true });
      tile('compos', 'Compositions', sheetLabel(d), () => E.go('compos'));
    } else {
      tile('strats', 'Stratégies', d.toWatch.length ? plural(d.toWatch.length, 'à regarder', 'à regarder') : plural(d.published.length, 'de l’équipe', 'de l’équipe'), () => { A.setLibTab('team'); E.go('strats'); }, { badge: d.toWatch.length });
      tile('team', 'Mon équipe', plural(d.members, 'membre', 'membres'), () => E.go('team'));
      tile('agenda', 'Agenda', nextLabel(d), () => E.go('agenda'), { badge: d.agenda.events.filter(e => !e.mine).length });
      tile('compos', 'Compositions', sheetLabel(d), () => E.go('compos'));
    }
    return grid;
  }

  /** Info vivante de la tuile Compositions : l'état de la feuille du prochain match. */
  function sheetLabel(d) {
    const m = (d.sheets || [])[0];
    if (!m) return 'Aucun match à venir';
    const st = { none: d.staff ? 'compo à faire' : 'compo bientôt', draft: d.staff ? 'brouillon' : 'compo bientôt', published: m.mine ? `tu es n°${m.mine.num}` : 'compo publiée' }[m.sheet];
    return `${AG().dayShort(m.starts_at)} · ${st}`;
  }

  /** Info vivante de la tuile Agenda : le prochain rendez-vous. */
  function nextLabel(d) {
    const ev = d.agenda && d.agenda.events[0];
    if (!ev) return d.staff ? 'Créer un match ou un entraînement' : 'Rien de prévu';
    return `${ev.kind === 'match' ? 'Match' : ev.kind === 'training' ? 'Entraînement' : esc(ev.title)} ${AG().dayShort(ev.starts_at)} · ${AG().time(ev.starts_at)}`;
  }

  /* ---------- Changement de page ---------- */
  function onView(v) {
    if (v !== view && v === 'home') data = null;   // l'accueil recharge ses données à chaque visite
    view = v;
    renderChrome();
    if (v === 'home') renderHome();
    else if (v === 'compos') { if (SH()) SH().render($('#hub-compos'), location.hash.split('/')[2] || ''); }
    else if (v === 'agenda') { if (AG()) AG().render($('#hub-agenda'), location.hash.split('/')[2] || ''); else renderSoon('agenda', '#hub-agenda'); }
    else if (v === 'soon') renderSoon(location.hash.split('/')[2] || 'agenda', '#hub-soon');
    else if (v === 'account' && active) A.renderAccountPage();
  }

  window.RugbyHub = { onView, renderChrome, logoChanged };
  // L'éditeur a affiché la première page avant le chargement de ce module : on la complète.
  const first = E.currentView();
  if (first !== 'editor' && first !== 'share') E.refreshView();
})();
