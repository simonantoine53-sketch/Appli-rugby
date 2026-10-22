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
    agenda: { icon: 'agenda', title: 'Agenda et convocations', coach: 'Créez vos matchs et entraînements. Vos joueurs répondent présent, peut-être ou absent en un appui, reçoivent un rappel, et vous voyez tout de suite qui manque.', player: 'Tous les matchs et entraînements de votre équipe. Vous répondez présent, peut-être ou absent en un appui et recevez un rappel avant chaque rendez-vous.' },
    seances: { icon: 'seances', title: 'Séances d’entraînement', coach: 'Assemblez vos stratégies et vos exercices en une séance chronométrée, avec le matériel à prévoir, et rattachez-la à l’entraînement.', player: '' },
    compos: { icon: 'compos', title: 'Compositions et feuille de match', coach: 'Placez vos joueurs sur les 15 postes et les remplaçants, publiez la compo à l’équipe et imprimez la feuille de match aux couleurs du club.', player: '' }
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
  const NAV = [['home', 'Accueil'], ['agenda', 'Agenda'], ['strats', 'Stratégies'], ['compos', 'Compos'], ['team', 'Équipe']];
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
    const multiClub = new Set(teams.map(t => t.club_id)).size > 1;   // le nom du club seulement s'il y en a plusieurs
    if (teams.length > 1) {
      sel.replaceChildren(...teams.map(t => { const o = el('option'); o.value = A.teamKey(t); o.textContent = t.name + (t.kidName ? ' · ' + t.kidName : '') + (multiClub && t.clubName ? ' · ' + t.clubName : '') + (t.superadmin ? ' · super-admin' : t.notMember ? ' · bureau' : ''); o.selected = !!team && A.teamKey(team) === A.teamKey(t); return o; }));
      sel.classList.remove('hidden'); title.classList.add('hidden');
    } else {
      sel.classList.add('hidden'); title.classList.remove('hidden');
      title.textContent = team ? team.name + (team.kidName ? ' · ' + team.kidName : '') : 'Rugbeo';
    }
    // Une seule action principale : nouveau dessin (Stratégies, et accueil du staff)
    $('#home-new').classList.toggle('hidden', !(view === 'strats' || (view === 'home' && logged && A.isStaff() && team)));
    // Compte : avatar en haut à droite, ou « Se connecter » pour un visiteur
    const acc = $('#hub-account');
    acc.classList.toggle('hidden', !active);
    if (active) {
      const p = logged ? (A.ownProfile ? A.ownProfile() : A.profile()) : null;
      const initial = ((p && p.display_name) || '?').trim().slice(0, 1).toUpperCase() || '?';
      acc.classList.toggle('logged', !!logged);
      acc.classList.toggle('on', view === 'account' || view === 'admin');
      const photo = logged && p && /^data:image\/(png|jpeg|webp);base64,/.test(p.avatar || '') ? p.avatar : null;
      acc.innerHTML = logged ? (photo ? `<span class="avatar-dot photo"><img src="${photo}" alt=""></span>` : `<span class="avatar-dot">${esc(initial)}</span>`) : '<span>Se connecter</span>';
      acc.title = logged ? 'Mon compte' : 'Se connecter';
      acc.setAttribute('aria-label', acc.title);
    }
    // Onglets
    // Compos : pour les joueurs, seulement quand le coach en a publié une (sinon l'onglet reste caché)
    const showCompos = A.isStaff() || !!(data && (data.sheets || []).some(m => m.sheet === 'published'));
    const items = (active ? NAV : NAV.filter(([id]) => id === 'home' || id === 'strats')).filter(([id]) => id !== 'compos' || showCompos);
    const cur = view === 'soon' ? 'home' : view;
    const unanswered = data && data.agenda ? data.agenda.events.filter(e => e.convoked && !e.mine).length : 0;
    // Pastilles de l'équipe affichée seulement (pas celles de l'équipe ouverte juste avant)
    const fresh = data && data.team && A.team() && data.team.id === A.team().id;
    const badge = fresh ? { strats: !data.staff ? data.toWatch.length : 0, team: data.staff ? data.pending : 0, agenda: unanswered } : {};
    const make = withIcon => items.map(([id, label]) => {
      const b = el('button', 'nav-item', (withIcon ? ico(id) : '') + `<span>${label}</span>` + (badge[id] ? `<span class="nav-badge">${badge[id]}</span>` : ''));
      if (cur === id) b.setAttribute('aria-current', 'page');
      b.onclick = () => { if (window.RugbyNavSource) window.RugbyNavSource('nav'); E.go(id); };
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
    // Arrivé par le lien public d'une stratégie : on parle stratégies ; sinon, de toute l'appli.
    let fromStrat = false; try { fromStrat = sessionStorage.getItem('rs-from') === 'strat'; } catch (e) {}
    const pitch = fromStrat
      ? { h: 'Dessinez vos combinaisons de rugby, toute l’équipe les comprend.', pts: ['Placez joueurs, courses et passes en quelques secondes', 'Animez étape par étape, zoomez sur une touche ou une mêlée', 'Publiez à l’équipe et voyez qui a regardé avant le match'] }
      : { h: 'Tout votre club de rugby dans une seule appli.', pts: ['<b>Convocations</b> : chacun répond Présent, Peut-être ou Absent en un appui', '<b>Stratégies</b> : vos lancements de jeu animés, et vous savez qui les a vus', '<b>Compos</b> : la feuille de match prête en quelques minutes, aux couleurs du club'] };
    const box = el('div', 'hero', `<p class="hero-brand"><strong>Rugbeo</strong> · L’appli des clubs de rugby</p><h1>${pitch.h}</h1>
      <ul>${pitch.pts.map(t => `<li>${t}</li>`).join('')}</ul><p class="hero-slogan">De la convoc’ au maillot, Rugbeo.</p>`);
    const btns = el('div', 'hero-btns');
    if (active) btns.append(btn('Créer un compte gratuit', 'primary', () => A.openAuth('signup')), twoLines(btn('Voir la démo', 'outline', () => window.RugbyDemo && window.RugbyDemo.start()), 'visiter un club fictif, sans compte'), twoLines(btn('Essayer l’éditeur', 'ghost', () => E.go('editor')), 'dessiner une stratégie sans compte'));
    else btns.append(btn('Dessiner une stratégie', 'primary', () => E.go('editor')), btn('Mes dessins', 'outline', () => E.go('strats')));
    box.appendChild(btns);
    if (active) {
      const login = el('small', '', 'Déjà un compte ? <a href="#" class="link">Se connecter</a>');
      login.querySelector('a').onclick = e => { e.preventDefault(); A.openAuth('login'); };
      box.appendChild(login);
    }
    root.appendChild(box);
    if (active) root.appendChild(tour(fromStrat));
  }
  /* Visiteur : ce que fait l'appli, concrètement, écran par écran (captures du club fictif RC Démo). */
  function tour(fromStrat) {
    const parts = [
      { k: 'agenda', img: 'agenda', t: 'Les convocations', p: 'Matchs et entraînements arrivent dans l’agenda de chaque joueur, avec l’heure de rendez-vous et le lieu. Il répond Présent, Peut-être ou Absent en un appui ; le coach voit qui vient et relance seulement ceux qui n’ont pas répondu.' },
      { k: 'strats', img: 'strategies', t: 'Les stratégies', p: 'Le coach dessine ses lancements de jeu sur un vrai terrain de rugby, étape par étape. Les joueurs les voient s’animer sur leur téléphone, et le coach sait qui les a regardés avant le match.' },
      { k: 'compo', img: 'compo', t: 'La feuille de match', p: 'La compo se fait à partir des joueurs présents, sans recopier de noms. Feuille aux couleurs du club, à imprimer ou à envoyer en image ; chaque joueur voit tout de suite sa place.' },
      { k: 'home', img: 'accueil', t: 'Un accueil qui fait avancer l’équipe', p: 'En ouvrant l’appli, chacun voit ce qu’il a à faire cette semaine : répondre, regarder la stratégie, découvrir la compo. Des notifications préviennent de chaque nouveauté.' }
    ];
    if (fromStrat) parts.unshift(parts.splice(1, 1)[0]);
    const wrap = el('div', 'pres-page');
    wrap.appendChild(el('h2', 'pres-title', 'Comment ça marche'));
    parts.forEach((x, i) => {
      const card = el('section', 'pres-card', `<div class="pres-text"><span class="pres-n">${i + 1}</span><h3>${x.t}</h3><p>${x.p}</p></div><div class="pres-shot"><img src="img/accueil/${x.img}.jpg" alt="Capture : ${x.t.toLowerCase()}" loading="lazy" width="390" height="545"></div>`);
      wrap.appendChild(card);
    });
    wrap.appendChild(el('div', 'pres-club', '<h3>Tout le club, pas seulement une équipe</h3><ul><li>Autant d’équipes que vous voulez : séniors, réserve, jeunes, féminines…</li><li>Un seul code pour rejoindre le club ; le bureau gère toutes les équipes.</li><li>Moins de 15 ans : un parent gère le compte de ses enfants depuis le sien.</li></ul>'));
    wrap.appendChild(el('div', 'pres-why', '<span>Pensée pour le rugby</span><span>Données en France</span><span>Gratuit, sans publicité</span>'));
    const cta = el('div', 'pres-cta');
    cta.appendChild(el('p', '', '<strong>Prêt à essayer ?</strong> Créez votre compte en une minute.'));
    cta.appendChild(btn('Créer un compte gratuit', 'primary', () => A.openAuth('signup')));
    cta.appendChild(btn('Voir la démo', 'outline', () => window.RugbyDemo && window.RugbyDemo.start()));
    wrap.appendChild(cta);
    return wrap;
  }
  /* Parent de plusieurs jeunes : un seul jeune à la fois, mais un rappel si un autre a une convocation sans réponse. */
  async function kidsNudge(slot, team, my) {
    const others = A.teams().filter(t => t.who && A.teamKey(t) !== A.teamKey(team));
    if (!others.length) return;
    const soon = new Date(Date.now() + 7 * 86400e3).toISOString(), now = new Date(Date.now() - 3 * 3600e3).toISOString();
    const { data: evs } = await A.sb.from('team_events').select('id, team_id').in('team_id', [...new Set(others.map(t => t.id))]).eq('cancelled', false).gte('starts_at', now).lte('starts_at', soon);
    if (!evs || !evs.length || my !== seq) return;
    const { data: rs } = await A.sb.from('event_responses').select('event_id, user_id').in('event_id', evs.map(e => e.id)).in('user_id', [...new Set(others.map(t => t.who))]);
    if (my !== seq) return;
    const answered = new Set((rs || []).map(r => r.event_id + '|' + r.user_id));
    others.forEach(t => {
      const n = evs.filter(e => e.team_id === t.id && !answered.has(e.id + '|' + t.who)).length;
      if (!n) return;
      const box = el('div', 'kid-nudge', `<span><strong>${esc(t.kidName.split(' ')[0])}</strong> : ${n} convocation${n > 1 ? 's' : ''} sans réponse (${esc(t.name)})</span>`);
      box.appendChild(btn('Voir', 'outline small', () => { A.selectTeam(A.teamKey(t)); data = null; E.refreshView(); }));
      slot.insertBefore(box, slot.firstChild);
    });
  }
  /** Écran de chargement : quelques formes grises à la place des blocs de l'accueil. */
  function skeleton() {
    return el('div', 'skel', '<div class="skel-line title"></div><div class="todo-card"><div class="skel-line"></div><div class="skel-line"></div><div class="skel-line short"></div></div><div class="skel-tiles"><div></div><div></div><div></div><div></div></div><span class="sr-only">Chargement…</span>');
  }
  /** Bouton avec une précision en petit dessous (« Voir la démo » : visiter un club fictif). */
  const twoLines = (b, sub) => { b.classList.add('two-lines'); b.appendChild(el('small', '', sub)); return b; };
  /** « de » ou « d’ » devant un prénom (d’Emma, de Léo). */
  const de = name => (/^[aeiouyàâäéèêëîïôöùûü]/i.test(name || '') ? 'd’' : 'de ');
  function hello(root, sub) {
    const p = A.ownProfile ? A.ownProfile() : A.profile();   // un parent est salué lui-même, pas son jeune
    const name = ((p && p.display_name) || '').split(' ')[0];
    root.appendChild(el('div', 'hub-hello', `<h1>Bonjour ${esc(name)}</h1>${sub ? `<p class="muted">${sub}</p>` : ''}`));
  }

  async function renderHome() {
    const my = ++seq;
    const root = $('#hub-home'); root.replaceChildren();
    // Compte en cours de chargement (ouverture, juste après la connexion) : formes grises neutres, pas d'écran faux
    if (active && !A.isReady()) { root.appendChild(skeleton()); return; }
    if (!active || !A.isLoggedIn()) { hero(root); return; }
    const team = A.team();
    if (!team) {
      hello(root, 'Bienvenue sur Rugbeo.');
      // Déjà membre d'un club : il ne reste qu'à choisir ses équipes
      const club = A.clubs && A.clubs()[0];
      const kids = A.kids ? A.kids() : [];
      if (club) {
        const c = el('div', 'todo-card', kids.length
          ? `<div class="todo-head">Dernière étape : leurs équipes</div><p class="muted">Club « ${esc(club.name)} » : choisissez l’équipe de chaque jeune. Le coach ou le bureau du club validera la demande.</p>`
          : `<div class="todo-head">Dernière étape : vos équipes</div><p class="muted">Vous faites partie du club « ${esc(club.name)} ». Choisissez les équipes dont vous faites partie : le coach ou le bureau du club validera votre demande.</p>`);
        const pending = A.pendingTeams();
        if (kids.length) kids.forEach(k => {
          // Demande déjà envoyée pour ce jeune : on le dit, au lieu de reproposer le même bouton
          const sent = pending.filter(t => t.who === k.id);
          const first = (k.display_name || '').split(' ')[0];
          if (sent.length) {
            c.appendChild(el('p', 'kid-sent', `✓ Demande envoyée pour <strong>${esc(first)}</strong> à ${sent.map(t => '« ' + esc(t.name) + ' »').join(', ')} : le coach doit la valider.`));
            c.appendChild(btn(`Ajouter une autre équipe ${de(first)}${first}`, 'ghost small', () => A.openTeamPicker(club.id, k.id)));
          } else c.appendChild(btn(`Choisir l’équipe ${de(first)}${first}`, 'primary', () => A.openTeamPicker(club.id, k.id)));
        });
        else c.appendChild(btn('Choisir mes équipes', 'primary', () => A.openTeamPicker(club.id)));
        root.appendChild(c);
        pending.filter(t => !t.who).forEach(t => root.appendChild(el('p', 'muted', `Demande envoyée à « ${esc(t.name)} » : en attente de validation.`)));
        return;
      }
      const card = el('div', 'todo-card', kids.length
        ? `<div class="todo-head">Dernière étape : rejoignez le club</div><p class="muted">Entrez ci-dessous le code donné par le club ou le coach, et choisissez pour quel jeune : le code du club (vous choisirez ensuite son équipe) ou celui d’une équipe.</p>`
        : '<div class="todo-head">Dernière étape : rejoignez votre club</div><p class="muted">Entrez ci-dessous le code donné par votre club ou votre coach : le code du club (vous choisirez ensuite vos équipes) ou celui d’une équipe.</p>');
      root.appendChild(card);
      A.pendingTeams().forEach(t => root.appendChild(el('p', 'muted', `Demande envoyée à « ${esc(t.name)} »${t.kidName ? " pour " + esc(t.kidName) : ""} : en attente de validation par un coach.`)));
      root.appendChild(A.teamForms());
      return;
    }
    const staff = A.isStaff();
    const roleLabel = team.superadmin ? 'super-admin' : team.notMember ? 'bureau du club' : { coach: 'coach', admin: 'admin', player: 'joueur' }[team.role] || team.role;
    hello(root, `${esc(team.name)}${team.kidName ? ' · ' + esc(team.kidName) : ''} · ${roleLabel}`);
    const slot = el('div', 'hub-slots'); root.appendChild(slot);
    slot.appendChild(el('div', 'todo-card loading', '<div class="todo-head">À faire cette semaine</div><div class="skel-line"></div><div class="skel-line short"></div><span class="sr-only">Chargement…</span>'));
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
    if (staff && !team.notMember && !team.superadmin) { const ob = onboarding(d, notifOn); if (ob) slot.appendChild(ob); }
    slot.appendChild(todo(d, notifOn, staff));
    kidsNudge(slot, team, my);
    slot.appendChild(tiles(d, staff));
    // Partenaires du club : bloc discret en bas de l'accueil
    if (team.club_id && window.RugbySponsors) window.RugbySponsors.load(team.club_id).then(list => { if (my === seq && list.length) slot.appendChild(window.RugbySponsors.strip(list, { cls: 'home-sponsors' })); });
    // Première connexion : visite guidée proposée, une fois les bandeaux (mesure d'usage, conditions) refermés.
    // Les notifications sont proposées plus tard, après la première réponse à une convocation.
    setTimeout(async () => {
      await A.termsChecked();
      const go = () => { if (my === seq && E.currentView() === 'home' && window.RugbyTour) window.RugbyTour.maybeStart(A.user().id, staff ? 'coach' : 'player'); };
      if (window.RugbyConsent) window.RugbyConsent.whenFree(go); else go();
    }, 600);
  }

  /** Liste de démarrage du staff, masquée quand tout est fait. */
  function onboarding(d, notifOn) {
    const players = Math.max(0, d.members - 1);
    const steps = [
      { done: true, label: 'Créer votre équipe' },
      { done: players >= 5, label: `Inviter vos joueurs (${Math.min(players, 5)}/5)`, action: 'Inviter', fn: () => A.shareCode() },
      { done: d.published.length > 0, label: 'Publier votre première stratégie', action: 'Dessiner', fn: () => E.startNewDrawing() },
      { done: d.agenda.total > 0, label: 'Créer votre premier match ou entraînement', action: 'Créer', fn: () => AG().openForm() }
    ];
    const push = P();
    if (push && push.canAsk && push.canAsk()) steps.push({ done: notifOn, label: 'Activer les notifications sur ce téléphone', action: 'Activer', fn: () => push.enable().then(() => renderHome()) });
    else if (push && push.isIosNotInstalled && push.isIosNotInstalled()) steps.push({ done: false, label: 'Installer l’appli sur l’écran d’accueil', action: 'Comment ?', fn: () => E.toast('Dans Safari : Partager → « Sur l’écran d’accueil ». Les notifications marcheront ensuite.') });
    const n = steps.filter(s => s.done).length;
    if (n === steps.length) return null;
    const card = el('div', 'todo-card onboarding');
    card.appendChild(el('div', 'todo-head', `Démarrer avec votre équipe <span class="muted">${n}/${steps.length}</span>`));
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
    // Mes convocations sans réponse (joueur, ou coach / admin qui joue aussi) : réponse directe depuis l'accueil
    const rsvpItems = () => ag.events.filter(ev => ev.convoked && !ev.mine).forEach(ev => items.push({
      text: `${esc(AG().short(ev))} à ${AG().time(ev.starts_at)} : <strong>serez-vous là ?</strong>`,
      // Mêmes réponses que dans l'Agenda : présent, peut-être, absent (enregistrées dès le clic)
      buttons: [['Présent', 'rsvp-btn yes', 'yes'], ['Peut-être', 'rsvp-btn maybe', 'maybe'], ['Absent', 'rsvp-btn no', 'no']].map(([l, cls, st]) => [l, cls, go('rsvp-' + st, async () => { if (await AG().answer(ev.id, st)) { E.toast(`Réponse envoyée : ${l.toLowerCase()}.`); renderHome(); } })])
    }));
    if (staff) {
      rsvpItems();   // un coach ou un admin qui joue aussi répond d'abord pour lui-même
      // Convocations : les plus proches d'abord
      ag.events.filter(ev => new Date(ev.starts_at) < soon && ev.sum.none).forEach(ev => items.push({ text: `${esc(AG().short(ev))} : <strong>${plural(ev.sum.none, 'joueur', 'joueurs')} sans réponse</strong>`, action: 'Relancer', primary: true, fn: go('event-remind', () => AG().remind(ev)) }));
      if (d.pending) items.push({ text: `<strong>${plural(d.pending, 'demande', 'demandes')}</strong> pour rejoindre l’équipe`, action: 'Valider', primary: true, fn: go('requests', () => E.go('team')) });
      if (d.proposals) items.push({ text: `<strong>${plural(d.proposals, 'proposition', 'propositions')}</strong> de joueur à regarder`, action: 'Voir', fn: go('proposals', () => { A.setLibTab('proposed'); E.go('strats'); }) });
      d.lowViews.slice(0, 2).forEach(r => items.push({ text: `« ${esc(r.title)} » : <strong>${r.viewers}/${r.audience} ont vu</strong>`, action: 'Relancer', fn: go('low-views', () => A.openViews(r)) }));
      (d.sheets || []).filter(m => new Date(m.starts_at) < soon && m.sheet !== 'published').slice(0, 1).forEach(m => items.push({ text: `Compo du match ${esc(AG().label(m).toLowerCase())} : <strong>${m.sheet === 'draft' ? 'à publier' : 'à faire'}</strong>`, action: m.sheet === 'draft' ? 'Finir' : 'Composer', primary: true, fn: go('sheet', () => E.go('compos', m.id)) }));
      if (!ag.events.length) items.push({ text: 'Aucun match ni entraînement prévu', action: 'Créer', fn: go('event-create', () => AG().openForm()) });
    } else {
      rsvpItems();
      if (d.toWatch.length > 2) items.push({ text: `<strong>${d.toWatch.length} stratégies</strong> à regarder`, action: 'Voir', primary: true, fn: go('to-watch', () => { A.setLibTab('team'); E.go('strats'); }) });
      else d.toWatch.forEach(r => items.push({ text: `« ${esc(r.title)} » à regarder`, action: 'Regarder', primary: true, fn: go('to-watch', () => A.openById(r.id)) }));
      (d.sheets || []).filter(m => m.sheet === 'published' && new Date(m.starts_at) < soon).slice(0, 1).forEach(m => items.push({ text: m.mine ? `Compo publiée : <strong>vous êtes n°${m.mine.num}</strong>` : `Compo publiée pour le match ${esc(AG().label(m).toLowerCase())}`, action: 'Voir', primary: true, fn: go('sheet-view', () => E.go('compos', m.id)) }));
      if (A.profileIncomplete && A.profileIncomplete() && window.RugbyProfile) items.push({ text: 'Complétez votre profil : photo et poste', action: 'Compléter', fn: go('profile', () => window.RugbyProfile.openProfile()) });
      const push = P();
      if (!notifOn && push && push.canAsk && push.canAsk()) items.push({ text: 'Activez les notifications pour ne rien rater', action: 'Activer', fn: go('notifications', () => push.enable().then(() => renderHome())) });
    }
    const card = el('div', 'todo-card week');
    card.appendChild(el('div', 'todo-head', 'À faire cette semaine'));
    if (!items.length) card.appendChild(el('p', 'todo-empty', staff ? 'Rien d’urgent. ✓ Tout le monde est à jour.' : 'Rien d’urgent. ✓ Vous êtes à jour.'));
    const addRow = it => {
      const row = el('div', 'todo-row' + (it.buttons ? ' stack' : ''), `<span class="grow">${it.text}</span>`);
      if (it.buttons) { const g = el('div', 'todo-btns'); it.buttons.forEach(([l, cls, fn]) => g.appendChild(btn(l, cls + ' small', fn))); row.appendChild(g); }
      else row.appendChild(btn(it.action, it.primary ? 'primary small' : 'outline small', it.fn));
      return row;
    };
    items.slice(0, 3).forEach(it => card.appendChild(addRow(it)));
    if (items.length > 3) {
      // Les actions moins urgentes restent accessibles d'un appui
      const more = btn(`Voir ${items.length - 3} autre${items.length - 3 > 1 ? 's' : ''} tâche${items.length - 3 > 1 ? 's' : ''}`, 'ghost small todo-more', () => { more.replaceWith(...items.slice(3).map(addRow)); });
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
      t.dataset.tile = icon; t.onclick = () => { if (window.RugbyNavSource) window.RugbyNavSource('tile'); fn(); }; grid.appendChild(t);
    };
    if (staff) {
      tile('strats', 'Stratégies', d.published.length ? plural(d.published.length, 'publiée', 'publiées') : 'Aucune publiée pour l’instant', () => E.go('strats'));
      tile('team', 'Équipe', plural(d.members, 'membre', 'membres') + (d.pending ? ` · ${d.pending} en attente` : ''), () => E.go('team'), { badge: d.pending });
      tile('invite', 'Inviter', 'Joueurs, coachs, membres du club', () => A.shareCode());
      tile('agenda', 'Agenda', nextLabel(d), () => E.go('agenda'));
      tile('seances', 'Séances', 'Préparer l’entraînement', () => E.go('soon', 'seances'), { soon: true });
      tile('compos', 'Compos', sheetLabel(d), () => E.go('compos'));
    } else {
      tile('strats', 'Stratégies', d.toWatch.length ? plural(d.toWatch.length, 'à regarder', 'à regarder') : plural(d.published.length, 'de l’équipe', 'de l’équipe'), () => { A.setLibTab('team'); E.go('strats'); }, { badge: d.toWatch.length });
      tile('team', 'Équipe', plural(d.members, 'membre', 'membres'), () => E.go('team'));
      tile('agenda', 'Agenda', nextLabel(d), () => E.go('agenda'), { badge: d.agenda.events.filter(e => e.convoked && !e.mine).length });
      if ((d.sheets || []).some(m => m.sheet === 'published')) tile('compos', 'Compos', sheetLabel(d), () => E.go('compos'));
    }
    return grid;
  }

  /** Info vivante de la tuile Compositions : l'état de la feuille du prochain match. */
  function sheetLabel(d) {
    const m = (d.sheets || [])[0];
    if (!m) return 'Aucun match à venir';
    const st = { none: d.staff ? 'compo à faire' : 'compo bientôt', draft: d.staff ? 'brouillon' : 'compo bientôt', published: m.mine ? `vous êtes n°${m.mine.num}` : 'compo publiée' }[m.sheet];
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
    else if (v === 'agenda') { if (AG()) AG().render($('#hub-agenda'), (location.hash.split('/')[2] || '').split('?')[0], location.hash.split('/')[3] === 'repondre'); else renderSoon('agenda', '#hub-agenda'); }
    else if (v === 'soon') renderSoon(location.hash.split('/')[2] || 'agenda', '#hub-soon');
    else if (v === 'account' && active) A.renderAccountPage();
  }

  window.RugbyHub = { onView, renderChrome, logoChanged };
  // L'éditeur a affiché la première page avant le chargement de ce module : on la complète.
  const first = E.currentView();
  if (first !== 'editor' && first !== 'share') E.refreshView();
})();
