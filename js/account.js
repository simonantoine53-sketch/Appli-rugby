/* Comptes, équipes et partage des stratégies via Supabase.
   Inactif (mode local) tant que js/config.js ne contient pas d'URL et de clé. */
(function () {
  'use strict';

  const cfg = window.RUGBY_CONFIG || {};
  const E = window.RugbyEditor;
  const $ = s => document.querySelector(s);
  const active = !!(cfg.supabaseUrl && cfg.supabaseKey && window.supabase);
  const btnAccount = $('#btn-account');
  const accountButtons = [btnAccount, $('#home-account')];

  if (!active) {
    accountButtons.forEach(b => { b.onclick = () => E.toast('Mode local : aucun backend configuré (voir js/config.js).'); });
    window.RugbyAccount = { isActive: () => false };
    return;
  }

  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);
  const S = { user: null, profile: null, teams: [], team: null, channel: null, unseen: 0, current: { visibility: 'private', team_id: null, owner_id: null } };
  const isUuid = v => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v || '');
  const TEAM_KEY = 'rugby-current-team';
  const seenKey = t => 'rugby-seen-' + t;
  const fmtDate = d => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const esc = s => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const errMsg = e => {
    const m = (e && e.message) || String(e);
    if (/Invalid login credentials/i.test(m)) return 'E-mail ou mot de passe incorrect.';
    if (/Email not confirmed/i.test(m)) return 'Confirmez votre e-mail (lien reçu par mail) avant de vous connecter.';
    if (/already registered/i.test(m)) return 'Cet e-mail a déjà un compte.';
    if (/Password should be/i.test(m)) return 'Mot de passe trop court (6 caractères minimum).';
    return m;
  };

  /* ---------- Session ---------- */
  async function refreshSession(session) {
    S.user = session ? session.user : null;
    if (S.user) {
      const { data } = await sb.from('profiles').select('*').eq('id', S.user.id).maybeSingle();
      S.profile = data || { id: S.user.id, display_name: S.user.email.split('@')[0] };
      await loadTeams();
    } else { S.profile = null; S.teams = []; setTeam(null); }
    renderAccountButton();
  }
  sb.auth.getSession().then(({ data }) => refreshSession(data.session));
  sb.auth.onAuthStateChange((_evt, session) => { if ((session && session.user && session.user.id) !== (S.user && S.user.id)) refreshSession(session); });

  async function loadTeams() {
    const { data, error } = await sb.from('team_members').select('role, teams(id, name, join_code, created_by)').eq('user_id', S.user.id);
    if (error) { E.toast('Équipes : ' + errMsg(error)); return; }
    S.teams = (data || []).filter(r => r.teams).map(r => Object.assign({ role: r.role }, r.teams));
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
      else { lbl.textContent = (S.profile && S.profile.display_name) + (S.team ? ' · ' + S.team.name : ''); b.classList.add('logged'); }
      b.title = S.user ? 'Compte et équipe' : 'Se connecter';
    });
    if (!$('#view-home').classList.contains('hidden')) renderHome();
    ['#btn-library', '#mtab-library'].forEach(sel => { const el = $(sel); if (!el) return; el.classList.toggle('has-badge', S.unseen > 0); el.dataset.badge = S.unseen; });
    const mtab = $('#mtab-account span');
    if (mtab) { mtab.textContent = S.user ? (S.profile && S.profile.display_name) || 'Compte' : 'Compte'; }
    $('#mtab-account') && $('#mtab-account').classList.toggle('logged', !!S.user);
  }
  accountButtons.forEach(b => { b.onclick = () => S.user ? openTeams() : openAuth(); });

  /* ---------- Connexion / inscription ---------- */
  function openAuth(mode) {
    E.openModal('modal-auth');
    setAuthMode(mode || 'login');
  }
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
    const btn = $('#auth-submit'); btn.disabled = true; $('#auth-error').textContent = '';
    try {
      if (mode === 'signup') {
        const { data, error } = await sb.auth.signUp({ email, password, options: { data: { display_name: name || email.split('@')[0] } } });
        if (error) throw error;
        if (!data.session) { $('#auth-error').textContent = 'Compte créé. Confirmez votre e-mail via le lien reçu, puis connectez-vous.'; btn.disabled = false; return; }
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      E.closeModal('modal-auth'); E.toast('Connecté.');
    } catch (err) { $('#auth-error').textContent = errMsg(err); }
    btn.disabled = false;
  };

  /* ---------- Équipes ---------- */
  async function openTeams() {
    E.openModal('modal-team');
    $('#team-user').textContent = `${S.profile.display_name} (${S.user.email})`;
    const list = $('#team-list'); list.replaceChildren();
    if (!S.teams.length) { const p = document.createElement('p'); p.className = 'muted'; p.textContent = 'Vous n’êtes dans aucune équipe. Créez-en une (vous serez coach) ou rejoignez-en une avec un code.'; list.appendChild(p); }
    S.teams.forEach(t => {
      const row = document.createElement('div'); row.className = 'team-row' + (S.team && S.team.id === t.id ? ' active' : '');
      row.innerHTML = `<div><strong>${esc(t.name)}</strong> <span class="role-badge ${t.role}">${t.role === 'coach' ? 'Coach' : 'Joueur'}</span></div><button class="btn outline small">${S.team && S.team.id === t.id ? 'Équipe active' : 'Choisir'}</button>`;
      row.querySelector('button').onclick = () => { setTeam(t); openTeams(); };
      list.appendChild(row);
    });
    const box = $('#team-members'); box.replaceChildren();
    if (S.team) {
      const coach = S.team.role === 'coach';
      const head = document.createElement('div'); head.className = 'team-head';
      head.innerHTML = `<strong>${esc(S.team.name)}</strong>` + (coach ? ` <span class="muted">Code pour rejoindre : <code>${esc(S.team.join_code)}</code></span> <button class="btn outline small" id="copy-code">Copier</button>` : '');
      box.appendChild(head);
      if (coach) head.querySelector('#copy-code').onclick = () => { navigator.clipboard && navigator.clipboard.writeText(S.team.join_code); E.toast('Code copié : ' + S.team.join_code); };
      const { data: members } = await sb.from('team_members').select('user_id, role, profiles!team_members_user_profile_fk(display_name)').eq('team_id', S.team.id).order('role');
      (members || []).forEach(m => {
        const row = document.createElement('div'); row.className = 'member-row';
        const name = (m.profiles && m.profiles.display_name) || 'Membre';
        row.innerHTML = `<span>${esc(name)}${m.user_id === S.user.id ? ' (moi)' : ''}</span><span class="role-badge ${m.role}">${m.role === 'coach' ? 'Coach' : 'Joueur'}</span>`;
        if (coach && m.user_id !== S.user.id) {
          const b1 = document.createElement('button'); b1.className = 'btn outline small'; b1.textContent = m.role === 'coach' ? 'Rétrograder joueur' : 'Nommer coach';
          b1.onclick = async () => { const { error } = await sb.from('team_members').update({ role: m.role === 'coach' ? 'player' : 'coach' }).match({ team_id: S.team.id, user_id: m.user_id }); if (error) E.toast(errMsg(error)); openTeams(); };
          const b2 = document.createElement('button'); b2.className = 'btn outline small danger'; b2.textContent = 'Retirer';
          b2.onclick = async () => { if (!confirm(`Retirer ${name} de l'équipe ?`)) return; const { error } = await sb.from('team_members').delete().match({ team_id: S.team.id, user_id: m.user_id }); if (error) E.toast(errMsg(error)); openTeams(); };
          row.append(b1, b2);
        }
        box.appendChild(row);
      });
      const leave = document.createElement('button'); leave.className = 'btn outline small'; leave.textContent = 'Quitter cette équipe';
      leave.onclick = async () => { if (!confirm(`Quitter « ${S.team.name} » ?`)) return; const { error } = await sb.from('team_members').delete().match({ team_id: S.team.id, user_id: S.user.id }); if (error) return E.toast(errMsg(error)); await loadTeams(); openTeams(); };
      box.appendChild(leave);
    }
  }
  $('#team-create-form').onsubmit = async e => {
    e.preventDefault();
    const { data, error } = await sb.rpc('create_team', { p_name: $('#team-create-name').value });
    if (error) return E.toast(errMsg(error));
    $('#team-create-name').value = ''; await loadTeams(); setTeam(S.teams.find(t => t.id === data.id)); openTeams();
    E.toast(`Équipe créée. Code à partager : ${data.join_code}`);
  };
  $('#team-join-form').onsubmit = async e => {
    e.preventDefault();
    const { data, error } = await sb.rpc('join_team', { p_code: $('#team-join-code').value });
    if (error) return E.toast(errMsg(error));
    $('#team-join-code').value = ''; await loadTeams(); setTeam(S.teams.find(t => t.id === data.id)); openTeams();
    E.toast(`Vous avez rejoint « ${data.name} ».`);
  };
  $('#btn-logout').onclick = async () => { await sb.auth.signOut(); E.closeModal('modal-team'); E.toast('Déconnecté.'); };

  /* ---------- Sauvegarde dans le cloud ---------- */
  async function save() {
    if (!S.user) { openAuth(); return; }
    const d = E.drawing;
    if (!isUuid(d.id)) { d.id = crypto.randomUUID(); }
    d.title = $('#title').value.trim() || 'Sans titre';
    const row = { id: d.id, title: d.title, data: d, owner_id: S.current.owner_id || S.user.id, team_id: S.current.team_id || (S.team ? S.team.id : null), visibility: S.current.visibility || 'private' };
    const { error } = await sb.from('drawings').upsert(row);
    if (error) { E.toast('Sauvegarde impossible : ' + errMsg(error)); return; }
    S.current.owner_id = S.current.owner_id || S.user.id; S.current.team_id = row.team_id;
    E.afterChange();
    E.toast(row.visibility === 'team' ? 'Stratégie mise à jour pour l’équipe.' : 'Dessin enregistré dans votre compte.');
  }

  /* ---------- Bibliothèque ---------- */
  let libTab = 'mine';
  let renderSeq = 0;
  async function renderHome() {
    const seq = ++renderSeq;
    const tabs = $('#home-tabs'); tabs.replaceChildren();
    const root = $('#home-list'); root.replaceChildren();
    if (!S.user) {
      tabs.classList.add('hidden');
      const box = document.createElement('div'); box.className = 'home-login';
      box.innerHTML = `<p>Connectez-vous pour retrouver vos dessins sur tous vos appareils, rejoindre une équipe et recevoir les stratégies du coach.</p>`;
      const b = document.createElement('button'); b.className = 'btn primary'; b.textContent = 'Se connecter ou créer un compte'; b.onclick = () => openAuth(); box.appendChild(b);
      root.appendChild(box);
      const local = E.readLib();
      if (local.length) { const h = document.createElement('h4'); h.className = 'home-h4'; h.textContent = 'Sur cet appareil'; root.appendChild(h); local.forEach(d => root.appendChild(E.localCard(d, () => { S.current = { visibility: 'private', team_id: null, owner_id: null }; E.loadDrawing(E.clone(d)); E.go('editor'); }))); }
      return;
    }
    tabs.classList.remove('hidden');
    const defs = [['mine', 'Mes dessins'], ['team', S.team ? 'Équipe' : 'Équipe (aucune)']];
    if (S.team && S.team.role === 'coach') defs.push(['proposed', 'Propositions']);
    defs.push(['local', 'Sur cet appareil']);
    defs.forEach(([id, label]) => { const b = document.createElement('button'); b.className = 'tab' + (libTab === id ? ' active' : ''); b.textContent = label; if (id === 'team' && S.unseen) b.textContent += ` (${S.unseen})`; b.onclick = () => { libTab = id; renderHome(); }; tabs.appendChild(b); });
    if (libTab === 'local') { renderLocal(root); return; }
    if (libTab === 'team') markSeen();
    let q = sb.from('drawings').select('id, title, data, visibility, team_id, owner_id, published_at, updated_at, owner:profiles!drawings_owner_profile_fk(display_name)').order('updated_at', { ascending: false });
    if (libTab === 'mine') q = q.eq('owner_id', S.user.id);
    else if (!S.team) { empty(root, 'Rejoignez ou créez une équipe pour voir ses stratégies.'); return; }
    else q = q.eq('team_id', S.team.id).eq('visibility', libTab);
    const { data, error } = await q;
    if (seq !== renderSeq) return;
    if (error) { empty(root, 'Erreur : ' + errMsg(error)); return; }
    if (!data.length) { empty(root, libTab === 'mine' ? 'Aucun dessin enregistré. Cliquez « Enregistrer le dessin » dans l’éditeur.' : libTab === 'team' ? 'Aucune stratégie publiée par le coach pour le moment.' : 'Aucune proposition de joueur.'); return; }
    data.forEach(row => root.appendChild(cloudCard(row)));
  }
  function empty(root, msg) { const p = document.createElement('p'); p.className = 'library-empty'; p.textContent = msg; root.appendChild(p); }

  function cloudCard(row) {
    const c = document.createElement('div'); c.className = 'lib-card';
    const d = row.data || {}; const steps = (d.steps || []).length;
    const coach = S.team && S.team.role === 'coach' && row.team_id === S.team.id;
    const mine = row.owner_id === S.user.id;
    const vis = { private: 'Privé', proposed: 'Proposé au coach', team: 'Publié à l’équipe' }[row.visibility];
    c.innerHTML = `<div class="thumb"></div><div class="body"><span class="name"></span></div><div class="date"></div><div class="card-btns"></div>`;
    c.querySelector('.thumb').appendChild(E.sceneSvg(d.settings || {}, ((d.steps || [])[0] || {}).objects || []));
    c.querySelector('.name').textContent = row.title;
    c.querySelector('.date').innerHTML = `<span class="vis-badge ${row.visibility}">${vis}</span> ${esc((row.owner && row.owner.display_name) || '')} · ${steps} étape${steps > 1 ? 's' : ''} · ${fmtDate(row.updated_at)}`;
    c.querySelector('.thumb').onclick = c.querySelector('.body').onclick = () => { loadCloud(row); };
    const btns = c.querySelector('.card-btns');
    const add = (label, cls, fn) => { const b = document.createElement('button'); b.className = 'btn small ' + cls; b.textContent = label; b.onclick = e => { e.stopPropagation(); fn(); }; btns.appendChild(b); };
    const setVis = async (visibility) => {
      const patch = { visibility, team_id: row.team_id || (S.team ? S.team.id : null) };
      if (visibility === 'team') patch.published_at = new Date().toISOString();
      const { error } = await sb.from('drawings').update(patch).eq('id', row.id);
      if (error) return E.toast(errMsg(error));
      if (E.drawing.id === row.id) { S.current.visibility = visibility; S.current.team_id = patch.team_id; }
      E.toast(visibility === 'team' ? 'Publié : toute l’équipe peut la voir.' : visibility === 'proposed' ? 'Proposé au coach.' : 'Retiré, redevenu privé.');
      renderHome();
    };
    if (coach && row.visibility !== 'team') add('Publier à l’équipe', 'primary', () => setVis('team'));
    if (coach && row.visibility === 'team') add('Retirer', 'outline', () => setVis('private'));
    if (!coach && mine && S.team && row.visibility === 'private') add('Proposer au coach', 'secondary', () => setVis('proposed'));
    if (!coach && mine && row.visibility === 'proposed') add('Annuler la proposition', 'outline', () => setVis('private'));
    if (mine || coach) add('Supprimer', 'outline danger', async () => {
      if (!confirm(`Supprimer « ${row.title} » ?`)) return;
      const { error } = await sb.from('drawings').delete().eq('id', row.id);
      if (error) return E.toast(errMsg(error)); renderHome();
    });
    return c;
  }

  function loadCloud(row) {
    const d = E.clone(row.data); d.id = row.id; d.title = row.title;
    S.current = { visibility: row.visibility, team_id: row.team_id, owner_id: row.owner_id };
    E.loadDrawing(d); E.go('editor');
    if (row.owner_id !== S.user.id && !(S.team && S.team.role === 'coach')) E.toast('Stratégie du coach : vos modifications seront enregistrées comme copie personnelle.');
  }

  function renderLocal(root) {
    const list = E.readLib();
    if (!list.length) { empty(root, 'Aucun dessin stocké sur cet appareil.'); return; }
    list.forEach(d => {
      const c = document.createElement('div'); c.className = 'lib-card';
      c.innerHTML = `<div class="thumb"></div><div class="body"><span class="name"></span></div><div class="date"></div><div class="card-btns"></div>`;
      c.querySelector('.thumb').appendChild(E.sceneSvg(d.settings || {}, (d.steps[0] || {}).objects || []));
      c.querySelector('.name').textContent = d.title;
      c.querySelector('.date').textContent = `${d.steps.length} étape${d.steps.length > 1 ? 's' : ''} · ${new Date(d.updatedAt || 0).toLocaleDateString('fr-FR')}`;
      c.querySelector('.thumb').onclick = c.querySelector('.body').onclick = () => { S.current = { visibility: 'private', team_id: null, owner_id: null }; E.loadDrawing(E.clone(d)); E.go('editor'); };
      const b = document.createElement('button'); b.className = 'btn small secondary'; b.textContent = 'Envoyer dans mon compte';
      b.onclick = async () => { const copy = E.clone(d); copy.id = crypto.randomUUID(); const { error } = await sb.from('drawings').insert({ id: copy.id, owner_id: S.user.id, title: copy.title, data: copy, team_id: S.team ? S.team.id : null, visibility: 'private' }); E.toast(error ? errMsg(error) : 'Copié dans votre compte.'); };
      c.querySelector('.card-btns').appendChild(b);
      root.appendChild(c);
    });
  }

  // Un nouveau dessin repart privé
  function onNewDrawing() { S.current = { visibility: 'private', team_id: null, owner_id: null }; if (S.user) { const d = E.drawing; d.id = crypto.randomUUID(); } }
  // Les copies personnelles d'une stratégie du coach deviennent de nouveaux dessins à la sauvegarde
  const origSave = save;
  async function saveSmart() {
    if (S.user && S.current.owner_id && S.current.owner_id !== S.user.id && !(S.team && S.team.role === 'coach' && S.current.team_id === S.team.id)) {
      E.drawing.id = crypto.randomUUID(); S.current = { visibility: 'private', team_id: null, owner_id: S.user.id };
    }
    return origSave();
  }

  window.RugbyAccount = { isActive: () => true, save: saveSmart, renderHome, openAuth, openTeams, onNewDrawing };
  if (!$('#view-home').classList.contains('hidden')) renderHome();
})();
