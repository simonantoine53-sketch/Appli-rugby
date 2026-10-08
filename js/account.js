/* Comptes, équipes et partage des stratégies via Supabase.
   Inactif (mode local) tant que js/config.js ne contient pas d'URL et de clé. */
(function () {
  'use strict';

  const cfg = window.RUGBY_CONFIG || {};
  const E = window.RugbyEditor;
  const $ = s => document.querySelector(s);
  const active = !!(cfg.supabaseUrl && cfg.supabaseKey && window.supabase);
  const accountButtons = [$('#btn-account'), $('#home-account')];

  if (!active) {
    accountButtons.forEach(b => { b.onclick = () => E.toast('Mode local : aucun backend configuré (voir js/config.js).'); });
    window.RugbyAccount = { isActive: () => false, isLoggedIn: () => false };
    return;
  }

  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);
  const S = { user: null, profile: null, teams: [], team: null, channel: null, unseen: 0, current: { visibility: 'private', team_id: null, owner_id: null } };
  const isUuid = v => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v || '');
  const TEAM_KEY = 'rugby-current-team';
  const seenKey = t => 'rugby-seen-' + t;
  const fmtDate = d => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const esc = s => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  const btn = (label, cls, fn) => { const b = el('button', 'btn ' + cls); b.textContent = label; b.onclick = e => { e.stopPropagation(); fn(); }; return b; };
  const isSuper = () => !!(S.profile && S.profile.is_superadmin);
  const isCoach = () => isSuper() || !!(S.team && S.team.role === 'coach');
  const isStaff = () => isSuper() || !!(S.team && (S.team.role === 'coach' || S.team.role === 'admin'));
  const isClubMember = () => isSuper() || S.teams.length > 0;
  const ROLE_LABEL = { coach: 'Coach', admin: 'Admin', player: 'Joueur' };
  const roleBadge = r => `<span class="role-badge ${r}">${ROLE_LABEL[r] || r}</span>`;
  const errMsg = e => {
    const m = (e && e.message) || String(e);
    if (/Invalid login credentials/i.test(m)) return 'E-mail ou mot de passe incorrect.';
    if (/Email not confirmed/i.test(m)) return 'Confirmez votre e-mail (lien reçu par mail) avant de vous connecter.';
    if (/already registered/i.test(m)) return 'Cet e-mail a déjà un compte.';
    if (/Password should be/i.test(m)) return 'Mot de passe trop court (6 caractères minimum).';
    if (/row-level security/i.test(m)) return 'Action non autorisée pour votre rôle.';
    return m;
  };

  /* ---------- Session ---------- */
  let ready = false;
  async function refreshSession(session) {
    S.user = session ? session.user : null;
    if (S.user) {
      const { data } = await sb.from('profiles').select('*').eq('id', S.user.id).maybeSingle();
      S.profile = data || { id: S.user.id, display_name: S.user.email.split('@')[0] };
      await loadTeams();
    } else { S.profile = null; S.teams = []; setTeam(null); }
    renderAccountButton();
    ready = true;
    refreshCurrentView();
  }
  sb.auth.getSession().then(({ data }) => refreshSession(data.session));
  sb.auth.onAuthStateChange((_evt, session) => { if ((session && session.user && session.user.id) !== (S.user && S.user.id)) refreshSession(session); });

  function refreshCurrentView() {
    if (!ready) return;   // la session n'est pas encore connue : on ne redirige pas
    if (location.hash.startsWith('#/team')) { if (S.user) { E.go('team'); } else { E.go('home'); openAuth(); } return; }
    if (!$('#view-home').classList.contains('hidden')) renderHome();
  }

  async function loadTeams() {
    const { data, error } = await sb.from('team_members').select('role, status, teams(id, name, join_code, created_by)').eq('user_id', S.user.id);
    if (error) { E.toast('Équipes : ' + errMsg(error)); return; }
    const rows = (data || []).filter(r => r.teams);
    S.pending = rows.filter(r => r.status === 'pending').map(r => r.teams);
    S.teams = rows.filter(r => r.status === 'active').map(r => Object.assign({ role: r.role }, r.teams));
    if (isSuper()) {
      const { data: all } = await sb.from('teams').select('id, name, join_code, created_by').order('name');
      (all || []).forEach(t => { if (!S.teams.find(x => x.id === t.id)) S.teams.push(Object.assign({ role: 'admin', superadmin: true }, t)); });
    }
    S.teams.sort((a, b) => a.name.localeCompare(b.name));
    let wanted = null; try { wanted = localStorage.getItem(TEAM_KEY); } catch (e) { /* ignore */ }
    setTeam(S.teams.find(t => t.id === wanted) || S.teams[0] || null);
  }

  function setTeam(team) {
    S.team = team;
    try { if (team) localStorage.setItem(TEAM_KEY, team.id); } catch (e) { /* ignore */ }
    if (S.channel) { sb.removeChannel(S.channel); S.channel = null; }
    S.unseen = 0;
    if (team) {
      S.channel = sb.channel('drawings-' + team.id)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'drawings', filter: 'team_id=eq.' + team.id }, payload => {
          const row = payload.new;
          if (!row || row.visibility !== 'team' || row.owner_id === S.user.id) return;
          const wasTeam = payload.old && payload.old.visibility === 'team';
          if (payload.eventType === 'INSERT' || !wasTeam) { S.unseen++; renderAccountButton(); E.toast('📣 Nouvelle stratégie publiée : ' + row.title); }
        }).subscribe();
      countUnseen(team.id);
    }
    renderAccountButton();
  }

  async function countUnseen(teamId) {
    let since = null; try { since = localStorage.getItem(seenKey(teamId)); } catch (e) { /* ignore */ }
    let q = sb.from('drawings').select('id', { count: 'exact', head: true }).eq('team_id', teamId).eq('visibility', 'team').neq('owner_id', S.user.id);
    if (since) q = q.gt('published_at', since);
    const { count } = await q;
    S.unseen = count || 0; renderAccountButton();
  }
  function markSeen() { if (S.team) { try { localStorage.setItem(seenKey(S.team.id), new Date().toISOString()); } catch (e) { /* ignore */ } S.unseen = 0; renderAccountButton(); } }

  function renderAccountButton() {
    accountButtons.forEach(b => {
      const lbl = b.querySelector('span');
      if (!S.user) { lbl.textContent = 'Se connecter'; b.classList.remove('logged'); }
      else { lbl.textContent = (S.profile && S.profile.display_name) || 'Mon compte'; b.classList.add('logged'); }
      b.title = S.user ? 'Mon compte' : 'Se connecter';
    });
    $('#home-team').classList.toggle('hidden', !S.user);
    ['#btn-library', '#mtab-library', '#home-team'].forEach(sel => { const e = $(sel); if (!e) return; e.classList.toggle('has-badge', S.unseen > 0); e.dataset.badge = S.unseen; });
    const mtab = $('#mtab-account span');
    if (mtab) mtab.textContent = S.user ? (S.profile && S.profile.display_name) || 'Compte' : 'Compte';
  }
  accountButtons.forEach(b => { b.onclick = () => S.user ? openAccount() : openAuth(); });
  $('#home-team').onclick = () => E.go('team');

  /* ---------- Connexion / inscription ---------- */
  function openAuth(mode) { E.openModal('modal-auth'); setAuthMode(mode || 'login'); }
  function setAuthMode(mode) {
    document.querySelectorAll('#modal-auth .tab').forEach(t => t.classList.toggle('active', t.dataset.mode === mode));
    $('#auth-name').closest('label').classList.toggle('hidden', mode !== 'signup');
    $('#auth-submit').textContent = mode === 'login' ? 'Se connecter' : 'Créer mon compte';
    $('#auth-form').dataset.mode = mode; $('#auth-error').textContent = '';
  }
  document.querySelectorAll('#modal-auth .tab').forEach(t => t.onclick = () => setAuthMode(t.dataset.mode));
  $('#auth-form').onsubmit = async e => {
    e.preventDefault();
    const mode = e.target.dataset.mode, email = $('#auth-email').value.trim(), password = $('#auth-password').value, name = $('#auth-name').value.trim();
    const b = $('#auth-submit'); b.disabled = true; $('#auth-error').textContent = '';
    try {
      if (mode === 'signup') {
        const { data, error } = await sb.auth.signUp({ email, password, options: { data: { display_name: name || email.split('@')[0] } } });
        if (error) throw error;
        if (!data.session) { $('#auth-error').textContent = 'Compte créé. Confirmez votre e-mail via le lien reçu, puis connectez-vous.'; b.disabled = false; return; }
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      E.closeModal('modal-auth'); E.toast('Connecté.');
    } catch (err) { $('#auth-error').textContent = errMsg(err); }
    b.disabled = false;
  };

  /* ---------- Compte (modale) ---------- */
  function openAccount() {
    E.openModal('modal-team');
    $('#team-user').textContent = `${S.profile.display_name} · ${S.user.email}`;
    $('#btn-goto-team').textContent = S.team ? `Voir l’équipe « ${S.team.name} »` : 'Créer ou rejoindre une équipe';
  }
  $('#btn-goto-team').onclick = () => { E.closeModal('modal-team'); E.go('team'); };
  $('#btn-logout').onclick = async () => { await sb.auth.signOut(); E.closeModal('modal-team'); E.go('home'); E.toast('Déconnecté.'); };

  /* ---------- Équipes : actions ---------- */
  async function createTeam(name) {
    const { data, error } = await sb.rpc('create_team', { p_name: name });
    if (error) return E.toast(errMsg(error));
    await loadTeams(); setTeam(S.teams.find(t => t.id === data.id));
    E.toast(`Équipe créée. Code à partager : ${data.join_code}`); E.go('team'); renderTeamPage();
  }
  async function joinTeam(code) {
    const { data, error } = await sb.rpc('join_team', { p_code: code });
    if (error) return E.toast(errMsg(error));
    await loadTeams();
    const t = S.teams.find(x => x.id === data.id);
    if (t) { setTeam(t); E.toast(`Vous êtes membre de « ${data.name} ».`); }
    else E.toast(`Demande envoyée à « ${data.name} ». Un coach ou un admin doit la valider.`);
    E.go('team'); renderTeamPage();
  }
  function teamForms() {
    const box = el('div', 'team-forms-card');
    box.appendChild(el('h4', '', S.teams.length ? 'Une autre équipe ?' : 'Commencer avec une équipe'));
    const f1 = el('form', 'inline-form', '<input type="text" placeholder="Nom de la nouvelle équipe" required minlength="2" maxlength="60"><button class="btn primary small" type="submit">Créer (je serai coach)</button>');
    f1.onsubmit = e => { e.preventDefault(); createTeam(f1.querySelector('input').value); };
    const f2 = el('form', 'inline-form', '<input type="text" placeholder="Code d’équipe (6 lettres)" required minlength="6" maxlength="6" style="text-transform:uppercase"><button class="btn secondary small" type="submit">Rejoindre (joueur)</button>');
    f2.onsubmit = e => { e.preventDefault(); joinTeam(f2.querySelector('input').value); };
    box.append(f1, f2);
    box.appendChild(el('p', 'help', 'Une demande d’adhésion par code doit être validée par un coach ou un admin du club. Le coach publie les stratégies ; l’admin gère les membres et les demandes ; le joueur consulte l’équipe, garde ses dessins privés et peut les proposer au coach.'));
    return box;
  }
  function pendingCard() {
    if (!S.pending || !S.pending.length) return null;
    const box = el('div', 'team-forms-card');
    box.appendChild(el('h4', '', 'Demandes en attente'));
    S.pending.forEach(t => box.appendChild(el('p', 'muted', `« ${esc(t.name)} » : en attente de validation par un coach ou un admin du club.`)));
    return box;
  }
  function teamSelect(onChange) {
    const sel = el('select', 'select');
    S.teams.forEach(t => { const o = el('option'); o.value = t.id; o.textContent = optLabel(t); o.selected = S.team && S.team.id === t.id; sel.appendChild(o); });
    sel.onchange = () => { setTeam(S.teams.find(t => t.id === sel.value)); onChange(); };
    return sel;
  }
  const optLabel = t => `${t.name} (${t.superadmin ? 'super-admin' : (ROLE_LABEL[t.role] || t.role).toLowerCase()})`;
  function shareCode() {
    const text = `Rejoins mon équipe « ${S.team.name} » sur Appli Rugby Strat avec le code ${S.team.join_code} : ${location.origin}${location.pathname}`;
    if (navigator.share) navigator.share({ title: 'Appli Rugby Strat', text }).catch(() => {});
    else if (navigator.clipboard) { navigator.clipboard.writeText(text); E.toast('Invitation copiée dans le presse-papiers.'); }
    else E.toast('Code : ' + S.team.join_code);
  }

  /* ---------- Page équipe ---------- */
  let teamTab = 'strats';
  let teamSeq = 0;
  async function renderTeamPage() {
    const seq = ++teamSeq;
    const root = $('#team-page'); root.replaceChildren();
    const sw = $('#team-switch'); sw.replaceChildren();
    $('#team-page-title').textContent = S.team ? S.team.name : 'Mon équipe';
    if (S.teams.length > 1) { S.teams.forEach(t => { const o = el('option'); o.value = t.id; o.textContent = t.name; o.selected = S.team && S.team.id === t.id; sw.appendChild(o); }); sw.classList.remove('hidden'); sw.onchange = () => { setTeam(S.teams.find(t => t.id === sw.value)); renderTeamPage(); }; }
    else sw.classList.add('hidden');
    const pend = pendingCard();
    if (!S.team) { if (pend) root.appendChild(pend); root.appendChild(teamForms()); return; }
    const coach = isCoach(), staff = isStaff();

    const card = el('div', 'team-card');
    card.appendChild(el('h2', '', `${esc(S.team.name)} ${S.team.superadmin ? '<span class="role-badge admin">Super-admin</span>' : roleBadge(S.team.role)}`));
    if (staff) {
      const code = el('div', 'code', `<span class="muted">Code d’invitation</span> <code>${esc(S.team.join_code)}</code>`);
      code.appendChild(btn('Inviter', 'secondary small', shareCode));
      card.appendChild(code);
    }
    root.appendChild(card);

    const tabs = el('div', 'tabs small team-tabs');
    const defs = [['strats', 'Stratégies'], ['members', 'Membres']];
    if (coach) defs.push(['proposed', 'Propositions']);
    defs.forEach(([id, label]) => { const b = el('button', 'tab' + (teamTab === id ? ' active' : '')); b.textContent = label; b.onclick = () => { teamTab = id; renderTeamPage(); }; tabs.appendChild(b); });
    root.appendChild(tabs);

    const list = el('div', 'library-list');
    root.appendChild(list);
    if (teamTab === 'members') await renderMembers(list, staff, seq);
    else await renderTeamDrawings(list, teamTab === 'proposed' ? 'proposed' : 'team', seq);
    if (seq !== teamSeq) return;

    if (pend) root.appendChild(pend);
    const foot = el('div', 'team-forms-card');
    foot.appendChild(btn('Quitter cette équipe', 'outline small', async () => {
      if (!confirm(`Quitter « ${S.team.name} » ?`)) return;
      const { error } = await sb.from('team_members').delete().match({ team_id: S.team.id, user_id: S.user.id });
      if (error) return E.toast(errMsg(error));
      await loadTeams(); renderTeamPage();
    }));
    if (staff) foot.appendChild(btn('Supprimer l’équipe', 'outline small danger', async () => {
      if (!confirm(`Supprimer définitivement « ${S.team.name} », ses membres et ses stratégies publiées ?`)) return;
      const { error } = await sb.from('teams').delete().eq('id', S.team.id);
      if (error) return E.toast(errMsg(error));
      E.toast('Équipe supprimée.'); await loadTeams(); renderTeamPage();
    }));
    root.appendChild(foot);
    root.appendChild(teamForms());
  }

  async function renderMembers(list, staff, seq) {
    list.classList.remove('library-list'); list.classList.add('member-list');
    const { data: rows, error } = await sb.from('team_members').select('user_id, role, status, joined_at, profiles!team_members_user_profile_fk(display_name)').eq('team_id', S.team.id);
    if (seq !== teamSeq) return;
    if (error) { list.appendChild(el('p', 'library-empty', 'Erreur : ' + errMsg(error))); return; }
    const nameOf = m => (m.profiles && m.profiles.display_name) || 'Membre';
    const order = { coach: 0, admin: 1, player: 2 };
    const members = rows.filter(m => m.status === 'active').sort((a, b) => (order[a.role] - order[b.role]) || nameOf(a).localeCompare(nameOf(b)));
    const pending = rows.filter(m => m.status === 'pending');
    const setMember = async (m, patch, confirmMsg) => {
      if (confirmMsg && !confirm(confirmMsg)) return;
      const q = patch ? sb.from('team_members').update(patch) : sb.from('team_members').delete();
      const { error } = await q.match({ team_id: S.team.id, user_id: m.user_id });
      if (error) E.toast(errMsg(error)); renderTeamPage();
    };
    if (staff && pending.length) {
      list.appendChild(el('h4', 'home-h4', `Demandes d’adhésion (${pending.length})`));
      pending.forEach(m => {
        const row = el('div', 'member-row pending');
        row.appendChild(el('div', 'avatar', esc(nameOf(m).trim().slice(0, 1).toUpperCase() || '?')));
        row.appendChild(el('div', 'who', `${esc(nameOf(m))}<small>Demande du ${new Date(m.joined_at).toLocaleDateString('fr-FR')}</small>`));
        row.appendChild(btn('Accepter', 'primary small', () => setMember(m, { status: 'active' })));
        row.appendChild(btn('Refuser', 'outline small danger', () => setMember(m, null, `Refuser la demande de ${nameOf(m)} ?`)));
        list.appendChild(row);
      });
      list.appendChild(el('h4', 'home-h4', 'Membres'));
    }
    list.appendChild(el('p', 'muted', `${members.length} membre${members.length > 1 ? 's' : ''}` + (staff ? ' · pour ajouter un joueur, partagez le code d’invitation puis validez sa demande ici.' : '')));
    members.forEach(m => {
      const name = nameOf(m);
      const row = el('div', 'member-row');
      row.appendChild(el('div', 'avatar', esc(name.trim().slice(0, 1).toUpperCase() || '?')));
      row.appendChild(el('div', 'who', `${esc(name)}${m.user_id === S.user.id ? ' (moi)' : ''}<small>Depuis le ${new Date(m.joined_at).toLocaleDateString('fr-FR')}</small>`));
      if (staff && m.user_id !== S.user.id) {
        const sel = el('select', 'select small');
        [['player', 'Joueur'], ['coach', 'Coach'], ['admin', 'Admin']].forEach(([v, l]) => { const o = el('option'); o.value = v; o.textContent = l; o.selected = m.role === v; sel.appendChild(o); });
        sel.onchange = () => setMember(m, { role: sel.value });
        row.appendChild(sel);
        row.appendChild(btn('Retirer', 'outline small danger', () => setMember(m, null, `Retirer ${name} de l'équipe ?`)));
      } else row.appendChild(el('span', 'role-badge ' + m.role, ROLE_LABEL[m.role] || m.role));
      list.appendChild(row);
    });
  }

  async function renderTeamDrawings(list, visibility, seq) {
    if (visibility === 'team') markSeen();
    const { data, error } = await sb.from('drawings').select('id, title, data, visibility, team_id, owner_id, published_at, updated_at, owner:profiles!drawings_owner_profile_fk(display_name)')
      .eq('team_id', S.team.id).eq('visibility', visibility).order(visibility === 'team' ? 'published_at' : 'updated_at', { ascending: false });
    if (seq !== teamSeq) return;
    if (error) { empty(list, 'Erreur : ' + errMsg(error)); return; }
    if (!data.length) { empty(list, visibility === 'team' ? (isCoach() ? 'Aucune stratégie publiée. Ouvrez un de vos dessins depuis l’accueil et cliquez « Publier à l’équipe ».' : 'Le coach n’a encore rien publié.') : 'Aucune proposition de joueur pour le moment.'); return; }
    data.forEach(row => list.appendChild(cloudCard(row, renderTeamPage)));
  }

  /* ---------- Restrictions ---------- */
  /** Enregistrer et exporter sont réservés aux membres d'un club. */
  function canUse(feature) {
    if (!S.user) { openAuth(); E.toast(feature === 'export' ? 'Connectez-vous et rejoignez un club pour exporter.' : 'Connectez-vous et rejoignez un club pour enregistrer.'); return false; }
    if (!isClubMember()) { E.toast((feature === 'export' ? 'L’export' : 'L’enregistrement') + ' est réservé aux membres d’un club. Rejoignez un club avec son code.'); E.go('team'); return false; }
    return true;
  }

  /* ---------- Sauvegarde dans le cloud ---------- */
  async function save() {
    if (!canUse('save')) return;
    const d = E.drawing;
    if (!isUuid(d.id)) d.id = crypto.randomUUID();
    d.title = $('#title').value.trim() || 'Sans titre';
    const row = { id: d.id, title: d.title, data: d, owner_id: S.current.owner_id || S.user.id, team_id: S.current.team_id || (S.team ? S.team.id : null), visibility: S.current.visibility || 'private' };
    const { error } = await sb.from('drawings').upsert(row);
    if (error) { E.toast('Sauvegarde impossible : ' + errMsg(error)); return; }
    S.current.owner_id = S.current.owner_id || S.user.id; S.current.team_id = row.team_id;
    E.afterChange();
    E.toast(row.visibility === 'team' ? 'Stratégie mise à jour pour l’équipe.' : 'Dessin enregistré dans votre compte.');
  }
  async function saveSmart() {
    if (S.user && S.current.owner_id && S.current.owner_id !== S.user.id && !(isCoach() && S.current.team_id === S.team.id)) {
      E.drawing.id = crypto.randomUUID(); S.current = { visibility: 'private', team_id: null, owner_id: S.user.id };
    }
    return save();
  }
  function onNewDrawing() { S.current = { visibility: 'private', team_id: null, owner_id: null }; if (S.user) E.drawing.id = crypto.randomUUID(); }

  /* ---------- Page d'accueil ---------- */
  let libTab = 'mine';
  let renderSeq = 0;
  async function renderHome() {
    const seq = ++renderSeq;
    const tabs = $('#home-tabs'); tabs.replaceChildren();
    const root = $('#home-list'); root.replaceChildren();
    if (!S.user) {
      tabs.classList.add('hidden');
      const box = el('div', 'home-login', '<p>Connectez-vous pour retrouver vos dessins sur tous vos appareils, rejoindre une équipe et recevoir les stratégies du coach.</p>');
      box.appendChild(btn('Se connecter ou créer un compte', 'primary', () => openAuth()));
      root.appendChild(box);
      const local = E.readLib();
      if (local.length) { root.appendChild(el('h4', 'home-h4', 'Sur cet appareil')); local.forEach(d => root.appendChild(E.localCard(d, () => { S.current = { visibility: 'private', team_id: null, owner_id: null }; E.loadDrawing(E.clone(d)); E.go('editor'); }))); }
      return;
    }
    if (!isClubMember()) {
      tabs.classList.add('hidden');
      const box = el('div', 'home-login', '<p><strong>Vous n’êtes membre d’aucun club.</strong><br>Vous pouvez dessiner et prévisualiser librement. L’enregistrement, l’export et le partage sont réservés aux membres d’un club : demandez son code d’invitation à votre coach.</p>');
      box.appendChild(btn('Rejoindre ou créer un club', 'primary', () => E.go('team')));
      root.appendChild(box);
      const pend = pendingCard(); if (pend) root.appendChild(pend);
      return;
    }
    tabs.classList.remove('hidden');
    const defs = [['mine', 'Mes dessins'], ['team', 'Équipe'], ['local', 'Sur cet appareil']];
    defs.forEach(([id, label]) => { const b = el('button', 'tab' + (libTab === id ? ' active' : '')); b.textContent = label; if (id === 'team' && S.unseen) b.textContent += ` (${S.unseen})`; b.onclick = () => { libTab = id; renderHome(); }; tabs.appendChild(b); });
    if (libTab === 'local') { renderLocal(root); return; }
    if (libTab === 'team') {
      if (!S.teams.length) { root.appendChild(teamForms()); return; }
      const bar = el('div', 'team-row-select home-login');
      bar.appendChild(el('span', '', 'Équipe :')); bar.appendChild(teamSelect(renderHome));
      bar.appendChild(btn('Voir l’équipe (membres, propositions)', 'secondary small', () => E.go('team')));
      root.appendChild(bar);
      markSeen();
    }
    let q = sb.from('drawings').select('id, title, data, visibility, team_id, owner_id, published_at, updated_at, owner:profiles!drawings_owner_profile_fk(display_name)').order('updated_at', { ascending: false });
    q = libTab === 'mine' ? q.eq('owner_id', S.user.id) : q.eq('team_id', S.team.id).eq('visibility', 'team');
    const { data, error } = await q;
    if (seq !== renderSeq) return;
    if (error) { empty(root, 'Erreur : ' + errMsg(error)); return; }
    if (!data.length) { empty(root, libTab === 'mine' ? 'Aucun dessin enregistré. Cliquez « Nouveau dessin », puis « Enregistrer le dessin » dans l’éditeur.' : (isCoach() ? 'Aucune stratégie publiée dans cette équipe. Ouvrez un de vos dessins et cliquez « Publier à l’équipe ».' : 'Le coach n’a encore rien publié dans cette équipe.')); return; }
    data.forEach(row => root.appendChild(cloudCard(row, renderHome)));
  }
  function empty(root, msg) { root.appendChild(el('p', 'library-empty', msg)); }

  function cloudCard(row, refresh) {
    const c = el('div', 'lib-card');
    const d = row.data || {}; const steps = (d.steps || []).length;
    const coachHere = isCoach() && S.team && row.team_id === S.team.id;
    const mine = row.owner_id === S.user.id;
    const teamName = (S.teams.find(t => t.id === row.team_id) || {}).name;
    const vis = { private: 'Privé', proposed: 'Proposé au coach', team: 'Publié' + (teamName ? ' · ' + esc(teamName) : '') }[row.visibility];
    c.innerHTML = `<div class="thumb"></div><div class="body"><span class="name"></span></div><div class="date"></div><div class="card-btns"></div>`;
    c.querySelector('.thumb').appendChild(E.sceneSvg(d.settings || {}, ((d.steps || [])[0] || {}).objects || []));
    c.querySelector('.name').textContent = row.title;
    c.querySelector('.date').innerHTML = `<span class="vis-badge ${row.visibility}">${vis}</span> ${esc((row.owner && row.owner.display_name) || '')} · ${steps} étape${steps > 1 ? 's' : ''} · ${fmtDate(row.updated_at)}`;
    c.querySelector('.thumb').onclick = c.querySelector('.body').onclick = () => loadCloud(row);
    const btns = c.querySelector('.card-btns');
    const setVis = async visibility => {
      if (visibility !== 'private' && !S.team) { E.toast('Rejoignez ou créez d’abord une équipe.'); return; }
      const patch = { visibility, team_id: visibility === 'private' ? row.team_id : S.team.id };
      if (visibility === 'team') patch.published_at = new Date().toISOString();
      const { error } = await sb.from('drawings').update(patch).eq('id', row.id);
      if (error) return E.toast(errMsg(error));
      if (E.drawing.id === row.id) { S.current.visibility = visibility; S.current.team_id = patch.team_id; }
      E.toast(visibility === 'team' ? `Publié dans « ${S.team.name} » : toute l’équipe peut la voir.` : visibility === 'proposed' ? `Proposé au coach de « ${S.team.name} ».` : 'Retiré, redevenu privé.');
      refresh();
    };
    if (mine || coachHere) btns.appendChild(btn('Ouvrir', 'outline', () => loadCloud(row)));
    if (isCoach() && row.visibility !== 'team' && (mine || coachHere)) btns.appendChild(btn(`Publier à l’équipe${S.teams.length > 1 ? ' « ' + S.team.name + ' »' : ''}`, 'primary', () => setVis('team')));
    if (isCoach() && row.visibility === 'team' && coachHere) btns.appendChild(btn('Retirer de l’équipe', 'outline', () => setVis('private')));
    if (!isCoach() && mine && S.team && row.visibility === 'private') btns.appendChild(btn('Proposer au coach', 'secondary', () => setVis('proposed')));
    if (!isCoach() && mine && row.visibility === 'proposed') btns.appendChild(btn('Annuler la proposition', 'outline', () => setVis('private')));
    if (mine || coachHere) btns.appendChild(btn('Supprimer', 'outline danger', async () => {
      if (!confirm(`Supprimer « ${row.title} » ?`)) return;
      const { error } = await sb.from('drawings').delete().eq('id', row.id);
      if (error) return E.toast(errMsg(error)); refresh();
    }));
    return c;
  }

  function loadCloud(row) {
    const d = E.clone(row.data); d.id = row.id; d.title = row.title;
    S.current = { visibility: row.visibility, team_id: row.team_id, owner_id: row.owner_id };
    E.loadDrawing(d); E.go('editor');
    if (row.owner_id !== S.user.id && !isCoach()) E.toast('Stratégie du coach : vos modifications seront enregistrées comme copie personnelle.');
  }

  function renderLocal(root) {
    const list = E.readLib();
    if (!list.length) { empty(root, 'Aucun dessin stocké sur cet appareil.'); return; }
    list.forEach(d => {
      const c = E.localCard(d, () => { S.current = { visibility: 'private', team_id: null, owner_id: null }; E.loadDrawing(E.clone(d)); E.go('editor'); });
      const b = btn('Envoyer dans mon compte', 'small secondary', async () => {
        const copy = E.clone(d); copy.id = crypto.randomUUID();
        const { error } = await sb.from('drawings').insert({ id: copy.id, owner_id: S.user.id, title: copy.title, data: copy, team_id: S.team ? S.team.id : null, visibility: 'private' });
        E.toast(error ? errMsg(error) : 'Copié dans votre compte.');
      });
      const wrap = el('div', 'card-btns'); wrap.appendChild(b); c.appendChild(wrap);
      root.appendChild(c);
    });
  }

  window.RugbyAccount = { isActive: () => true, isLoggedIn: () => !!S.user, isReady: () => ready, canUse, save: saveSmart, renderHome, renderTeamPage, openAuth, openAccount, onNewDrawing };
  refreshCurrentView();
})();
