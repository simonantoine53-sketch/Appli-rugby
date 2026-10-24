/* Comptes, équipes et partage des stratégies via Supabase.
   Inactif (mode local) tant que js/config.js ne contient pas d'URL et de clé. */
(function () {
  const de = name => (/^[aeiouyàâäéèêëîïôöùûü]/i.test(name || '') ? 'd’' : 'de ');   // d’Emma, de Léo
  'use strict';

  const cfg = window.RUGBY_CONFIG || {};
  const E = window.RugbyEditor;
  const $ = s => document.querySelector(s);
  const active = !!(cfg.supabaseUrl && cfg.supabaseKey && window.supabase);
  const accountButtons = [$('#btn-account')];

  if (!active) {
    accountButtons.forEach(b => { b.onclick = () => E.toast('Mode local : aucun backend configuré (voir js/config.js).'); });
    window.RugbyAccount = { isActive: () => false, isLoggedIn: () => false, isSuper: () => false };
    return;
  }

  // Retour du lien de confirmation reçu par e-mail : lu avant que Supabase n'efface l'adresse
  const authReturn = (() => {
    const h = location.hash;
    if (/access_token=/.test(h) && /type=signup/.test(h)) return 'confirmed';
    if (/access_token=/.test(h) && /type=recovery/.test(h)) return 'recovery';
    if (/error_code=|error=access_denied/.test(h)) return 'link-error';
    return '';
  })();
  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);
  const S = { user: null, profile: null, kids: [], teams: [], clubs: [], team: null, channel: null, unseen: 0, current: { visibility: 'private', team_id: null, owner_id: null } };
  const isUuid = v => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v || '');
  const TEAM_KEY = 'rugby-current-team';
  const seenKey = t => 'rugby-seen-' + t;
  const fmtDate = d => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const esc = s => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  const btn = (label, cls, fn) => { const b = el('button', 'btn ' + cls); b.textContent = label; b.onclick = e => { e.stopPropagation(); fn(); }; return b; };
  const isSuper = () => !!(S.profile && S.profile.is_superadmin);
  // Espace parent : un compte gère aussi des jeunes ; l'équipe choisie dit pour qui on agit (moi ou un jeune)
  const actorId = () => (S.team && S.team.who) || (S.user && S.user.id);
  const actorProfile = () => (S.team && S.team.who && S.kids.find(k => k.id === S.team.who)) || S.profile;
  const forArg = id => (id && S.user && id !== S.user.id ? { p_for: id } : {});
  const kidName = id => { const k = S.kids.find(x => x.id === id); return k ? k.display_name : ''; };
  const teamKey = t => t.id + (t.who ? '|' + t.who : '');
  // La direction du club a les droits d'un coach dans toutes les équipes du club (vérifié aussi par la base)
  const isCoach = () => isSuper() || !!(S.team && (S.team.role === 'coach' || S.team.clubAdmin));
  const isStaff = () => isSuper() || !!(S.team && (S.team.role === 'coach' || S.team.role === 'admin' || S.team.clubAdmin));
  const currentClub = () => (S.team && S.clubs.find(c => c.id === S.team.club_id)) || S.clubs[0] || null;
  const isClubAdmin = clubId => isSuper() || !!S.clubs.find(c => c.id === clubId && c.myRole === 'responsable');
  const isClubMember = () => isSuper() || S.teams.length > 0;
  const ROLE_LABEL = { coach: 'Coach', admin: 'Admin', player: 'Joueur' };
  // Rôle (droits) + fonction « joue aussi » : un coach qui joue affiche Coach + Joueur
const roleBadge = (r, plays) => `<span class="role-badge ${r}">${ROLE_LABEL[r] || r}</span>${plays && r !== 'player' ? ' <span class="role-badge player">Joueur</span>' : ''}`;
  const track = (name, props) => { if (window.RugbyTrack) window.RugbyTrack.track(name, props); };
  const errMsg = e => {
    const m = (e && e.message) || String(e), code = (e && e.code) || '';
    // Limites de Supabase : on dit pourquoi et combien de temps attendre
    const wait = m.match(/after (\d+) seconds?/i);
    if (wait) return `Patientez ${wait[1]} secondes avant de redemander un e-mail.`;
    if (code === 'over_email_send_rate_limit' || /email rate limit/i.test(m)) return 'Limite d’envoi d’e-mails atteinte : trop d’e-mails de confirmation ont été envoyés en peu de temps. Réessayez dans 1 heure environ. Si votre e-mail est déjà confirmé, vous pouvez vous connecter normalement.';
    if (code === 'over_request_rate_limit' || /rate limit|too many requests/i.test(m) || (e && e.status === 429)) return 'Trop de tentatives depuis cet appareil. Réessayez dans 5 minutes.';
    if (/Invalid login credentials/i.test(m)) return 'E-mail ou mot de passe incorrect.';
    if (/Email not confirmed/i.test(m)) return 'Confirmez votre e-mail (lien reçu par mail) avant de vous connecter.';
    if (/already registered/i.test(m)) return 'Cet e-mail a déjà un compte.';
    if (/different from the old/i.test(m)) return 'Le nouveau mot de passe doit être différent de l’ancien.';
    if (/Password should be/i.test(m)) return 'Mot de passe trop court (6 caractères minimum).';
    if (/row-level security/i.test(m)) return 'Action non autorisée pour votre rôle.';
    return m;
  };

  /** Nom du club en entier, ou son diminutif (ex. « SCB ») seulement s'il ne tient pas sur la ligne. */
  function fitName(node, full, short) {
    node.textContent = full;
    if (short) requestAnimationFrame(() => { if (node.scrollWidth > node.clientWidth + 1) node.textContent = short; });
    return node;
  }

  /* ---------- Session ---------- */
  let ready = false;
  async function refreshSession(session) {
    // Connexion en cours : écran de chargement neutre plutôt que la page visiteur ou « rejoignez votre club »
    if (session && !S.user && ready) { ready = false; if (E.currentView() === 'home') E.refreshView(); }
    S.user = session ? session.user : null;
    if (S.user) {
      const { data } = await sb.from('profiles').select('*').eq('id', S.user.id).maybeSingle();
      S.profile = data || { id: S.user.id, display_name: S.user.email.split('@')[0] };
      if (S.profile.guardian_id) {
        const { data: claimed } = await sb.rpc('claim_my_account');
        if (claimed) { S.profile.guardian_id = null; E.toast('Bienvenue : ce compte est maintenant le vôtre.'); }
      }
      await loadKids();
      await loadTeams();
      watchMyMemberships();
      checkTerms();
      claimDemoStrategy();
    } else { S.profile = null; S.kids = []; S.teams = []; S.clubs = []; setTeam(null); watchMyMemberships(); }
    renderAccountButton();
    ready = true;
    refreshCurrentView();
    usePendingJoin(false);
    // Sortie de la démo par « Créer mon compte »
    let afterDemo = null; try { afterDemo = sessionStorage.getItem('rs-after-demo'); sessionStorage.removeItem('rs-after-demo'); } catch (e) { /* ignore */ }
    if (afterDemo === 'signup' && !S.user) openAuth('signup');
    if (window.RugbyAdmin) window.RugbyAdmin.onSession();
  }
  sb.auth.getSession().then(({ data }) => refreshSession(data.session));
  sb.auth.onAuthStateChange((_evt, session) => { if ((session && session.user && session.user.id) !== (S.user && S.user.id)) refreshSession(session); });
  // getSession attend que Supabase ait lu le jeton du lien : on peut ensuite nettoyer l'adresse
  if (authReturn) sb.auth.getSession().then(({ data }) => {
    history.replaceState(null, '', location.pathname + location.search + '#/');
    if (authReturn === 'confirmed' && data.session) E.toast('E-mail confirmé : bienvenue, vous êtes connecté !');
    else if (authReturn === 'recovery' && data.session) openAuth('reset');
    else { openAuth('login'); setAuthMsg('Ce lien a expiré ou a déjà servi. Connectez-vous : si votre e-mail n’est pas encore confirmé, vous pourrez recevoir un nouveau lien.', 'info'); }
  });

  async function loadKids() {
    const { data } = await sb.from('profiles').select('*').eq('guardian_id', S.user.id).order('created_at');
    S.kids = data || [];
    // Comptes déjà transmis à un jeune de 15 ans (en attente de sa première connexion)
    S.kidLogins = {};
    if (S.kids.length) { const { data: lg } = await sb.rpc('my_kids_login'); (lg || []).forEach(r => { S.kidLogins[r.id] = r.email; }); }
  }

  /* Conditions et politique de confidentialité mises à jour : on le signale une fois aux comptes existants,
     après le bandeau de mesure d'usage (une seule fenêtre à la fois). */
  function checkTerms() {
    if (!S.termsCheck) S.termsCheck = showTerms().finally(() => { S.termsCheck = null; });
    return S.termsCheck;
  }
  async function showTerms() {
    const L = window.RugbyLegal; if (!L || !S.user || document.querySelector('.terms-bar')) return;
    const { data } = await sb.from('profile_private').select('terms_version').eq('user_id', S.user.id).maybeSingle();
    if (data && data.terms_version === L.version) return;
    await new Promise(res => (window.RugbyConsent ? window.RugbyConsent.whenFree(res) : res()));
    if (!S.user || document.querySelector('.terms-bar')) return;
    const bar = el('div', 'consent-bar terms-bar', `<p><strong>Nos conditions ont changé</strong>${L.changes ? ` : ${esc(L.changes)}` : ''}. <a href="#" data-legal="privacy">Les lire</a></p>`);
    bar.setAttribute('role', 'dialog');
    const ok = btn('J’ai compris', 'primary', async () => { ok.disabled = true; const { error } = await sb.rpc('accept_terms', { p_version: L.version }); if (error) { ok.disabled = false; return E.toast(errMsg(error)); } bar.remove(); if (window.RugbyConsent) window.RugbyConsent.free(); });
    const acts = el('div', 'consent-actions single'); acts.appendChild(ok); bar.appendChild(acts);
    document.body.appendChild(bar);
  }

  /* Demandes d'adhésion en temps réel : acceptée, refusée ou nouvelle demande à valider, sans recharger la page */
  let syncTimer = null, lastSync = 0;
  function syncTeams() {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(async () => {
      if (!S.user) return;
      lastSync = Date.now();
      const before = new Set((S.pending || []).map(t => t.id));
      await loadTeams();
      const joined = S.teams.find(t => before.has(t.id) && !t.notMember && !t.superadmin);
      if (joined) E.toast(`Demande acceptée : vous faites partie de « ${joined.name} ».`);
      // On ne redessine que les pages sans saisie en cours (accueil, équipe, compte)
      if (/^(#\/?|#\/(team|account))?$/.test(location.hash)) refreshCurrentView(); else renderAccountButton();
    }, 400);
  }
  function watchMyMemberships() {
    if (S.meChannel) { sb.removeChannel(S.meChannel); S.meChannel = null; }
    if (!S.user) return;
    S.meChannel = sb.channel('me-' + S.user.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_members', filter: S.kids.length ? `user_id=in.(${[S.user.id, ...S.kids.map(k => k.id)].join(',')})` : 'user_id=eq.' + S.user.id }, syncTeams)
      .subscribe();
  }
  // Retour sur l'appli (téléphone déverrouillé, onglet repris) : on remet les équipes à jour
  document.addEventListener('visibilitychange', () => { if (!document.hidden && S.user && Date.now() - lastSync > 30000) syncTeams(); });

  function refreshCurrentView() {
    if (!ready) return;   // la session n'est pas encore connue : on ne redirige pas
    E.refreshView();      // l'éditeur gère les pages réservées (connexion demandée) et les liens #/d/<id>
  }

  const TEAM_COLS = 'id, name, join_code, created_by, share_default, club_id, youth';
  async function loadTeams() {
    const ids = [S.user.id, ...S.kids.map(k => k.id)];
    const [{ data, error }, { data: cm }] = await Promise.all([
      sb.from('team_members').select(`user_id, role, status, plays, teams(${TEAM_COLS})`).in('user_id', ids),
      sb.from('club_members').select('user_id, role, title, clubs(id, name, short_name, join_code, season_start, settings)').in('user_id', ids)
    ]);
    if (error) { E.toast('Équipes : ' + errMsg(error)); return; }
    const rows = (data || []).filter(r => r.teams);
    // Équipe d'un jeune : on retient pour qui (who) et son prénom
    const whoOf = r => (r.user_id === S.user.id ? {} : { who: r.user_id, kidName: kidName(r.user_id) });
    S.pending = rows.filter(r => r.status === 'pending').map(r => Object.assign(whoOf(r), r.teams));
    S.teams = rows.filter(r => r.status === 'active').map(r => Object.assign({ role: r.role, plays: !!r.plays }, whoOf(r), r.teams));
    // Clubs : mes lignes d'abord (ma fonction), puis les clubs de mes jeunes
    const cmRows = (cm || []).filter(r => r.clubs).sort((a, b) => (a.user_id === S.user.id ? 0 : 1) - (b.user_id === S.user.id ? 0 : 1));
    S.clubs = [];
    cmRows.forEach(r => { if (!S.clubs.find(c => c.id === r.clubs.id)) S.clubs.push(Object.assign({ myRole: r.user_id === S.user.id ? r.role : 'member', myTitle: r.user_id === S.user.id ? r.title || '' : '' }, r.clubs)); });
    // Direction du club : toutes les équipes du club, avec les droits d'un coach
    const adminClubs = S.clubs.filter(c => c.myRole === 'responsable').map(c => c.id);
    if (adminClubs.length) {
      const { data: ct } = await sb.from('teams').select(TEAM_COLS).in('club_id', adminClubs);
      (ct || []).forEach(t => { const mine = S.teams.find(x => x.id === t.id && !x.who); if (mine) mine.clubAdmin = true; else S.teams.push(Object.assign({ role: 'coach', clubAdmin: true, notMember: true }, t)); });
    }
    if (isSuper()) {
      const [{ data: all }, { data: allClubs }] = await Promise.all([sb.from('teams').select(TEAM_COLS).order('name'), sb.from('clubs').select('id, name, short_name, join_code, season_start, settings').order('name')]);
      (all || []).forEach(t => { if (!S.teams.find(x => x.id === t.id && !x.who)) S.teams.push(Object.assign({ role: 'admin', superadmin: true }, t)); });
      (allClubs || []).forEach(c => { if (!S.clubs.find(x => x.id === c.id)) S.clubs.push(Object.assign({ myRole: 'superadmin' }, c)); });
    }
    S.teams.forEach(t => { const c = S.clubs.find(x => x.id === t.club_id); t.clubName = c ? c.name : ''; t.clubShort = (c && c.short_name) || ''; });
    S.teams.sort((a, b) => a.clubName.localeCompare(b.clubName) || a.name.localeCompare(b.name) || (a.kidName || '').localeCompare(b.kidName || ''));
    let wanted = null; try { wanted = localStorage.getItem(TEAM_KEY); } catch (e) { /* ignore */ }
    setTeam(S.teams.find(t => teamKey(t) === wanted) || S.teams.find(t => t.id === wanted) || S.teams[0] || null);
  }

  function setTeam(team) {
    S.team = team;
    try { if (team) localStorage.setItem(TEAM_KEY, teamKey(team)); } catch (e) { /* ignore */ }
    if (S.channel) { sb.removeChannel(S.channel); S.channel = null; }
    S.unseen = 0;
    if (team) {
      S.channel = sb.channel('drawings-' + team.id)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'drawings', filter: 'team_id=eq.' + team.id }, payload => {
          const row = payload.new;
          if (!row || row.visibility !== 'team' || row.owner_id === actorId()) return;
          const wasTeam = payload.old && payload.old.visibility === 'team';
          if (payload.eventType === 'INSERT' || !wasTeam) { S.unseen++; renderAccountButton(); E.toast('Nouvelle stratégie publiée : ' + row.title); }
        })
        // Nouvelle demande d'adhésion ou membre accepté : la page Équipe et les pastilles se mettent à jour
        .on('postgres_changes', { event: '*', schema: 'public', table: 'team_members', filter: 'team_id=eq.' + team.id }, syncTeams)
        .subscribe();
      countUnseen(team.id);
    }
    renderAccountButton();
    if (ready && window.RugbyAdmin) window.RugbyAdmin.onSession();
  }

  async function countUnseen(teamId) {
    let since = null; try { since = localStorage.getItem(seenKey(teamId)); } catch (e) { /* ignore */ }
    let q = sb.from('drawings').select('id', { count: 'exact', head: true }).eq('team_id', teamId).eq('visibility', 'team').neq('owner_id', actorId());
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
    const mtab = $('#mtab-account span');
    if (mtab) mtab.textContent = S.user ? (S.profile && S.profile.display_name) || 'Compte' : 'Compte';
    if (window.RugbyHub) window.RugbyHub.renderChrome();
  }
  accountButtons.forEach(b => { b.onclick = () => S.user ? openAccount() : openAuth(); });
  /** Profils incomplets : pour l'invitation « Complète ton profil » de l'accueil. */
  const profileIncomplete = () => { const p = actorProfile(); return !!(p && (!p.avatar || !(p.positions || []).length)); };

  /* ---------- Connexion / inscription ---------- */
  function openAuth(mode) { E.openModal('modal-auth'); setAuthMode(mode || 'login'); }
  /** Modes : login, signup, forgot (demande du lien de réinitialisation), reset (nouveau mot de passe après le lien). */
  /* Inscription en deux étapes : qui crée le compte (15 ans et plus, ou parent d'un jeune), puis le formulaire adapté. */
  let signupWho = '';   // '' (choix), 'adult' ou 'parent'
  function addKidInput(value) {
    const list = $('#auth-kid-list');
    if (list.children.length >= 6) return E.toast('6 jeunes au maximum par compte.');
    const i = el('input'); i.type = 'text'; i.maxLength = 60; i.className = 'auth-kid'; i.placeholder = 'Prénom et nom'; i.autocomplete = 'off'; i.value = value || '';
    i.setAttribute('aria-label', 'Prénom et nom du jeune');
    list.appendChild(i);
    $('#auth-kids .auth-kids-label').textContent = list.children.length > 1 ? 'Prénom et nom des jeunes' : 'Prénom et nom du jeune';
    i.oninput = parentWho; parentWho();
    return i;
  }
  /** Accord parental : on nomme le ou les jeunes (« Je suis le parent d’Emma »). */
  function parentWho() {
    const names = [...document.querySelectorAll('#auth-kid-list input')].map(i => i.value.trim().split(' ')[0]).filter(Boolean);
    const list = names.length > 1 ? names.slice(0, -1).join(', ') + ' et ' + names[names.length - 1] : names[0];
    $('#auth-parent-who').textContent = list ? `Je suis le parent (ou le représentant légal) ${de(list)}${list}` : 'Je suis son parent (ou son représentant légal)';
  }
  $('#auth-kid-add').onclick = () => { const i = addKidInput(); if (i) i.focus(); };
  function setSignupWho(who) {
    signupWho = who;
    const choose = !who, parent = who === 'parent';
    $('#auth-who').classList.toggle('hidden', !choose);
    $('#auth-form').classList.toggle('hidden', choose);
    $('#auth-who-back').classList.toggle('hidden', who !== 'parent');
    $('#auth-switch').classList.toggle('hidden', who !== 'adult');
    $('#auth-kids').classList.toggle('hidden', !parent);
    $('#auth-parent').classList.toggle('hidden', !parent);
    $('#auth-name-label').textContent = parent ? 'Votre prénom et nom (parent)' : 'Prénom et nom';
    $('#auth-submit').textContent = parent ? 'Créer le compte' : 'Créer mon compte';
    if (parent && !$('#auth-kid-list').children.length) addKidInput();
    setAuthMsg('');
  }
  document.querySelectorAll('#auth-who .who-card').forEach(b => { b.onclick = () => {
    const who = b.dataset.who;
    if (who === 'login') return setAuthMode('login');
    if (who === 'kid') { $('#auth-kid-info').classList.toggle('hidden'); return; }
    setSignupWho(who); const f = who === 'parent' ? $('#auth-kid-list input') : $('#auth-name'); if (f) f.focus();
  }; });
  // Moins de 15 ans : on envoie le lien (avec le code d'invitation s'il y en a un) à un parent
  $('#auth-kid-share').onclick = () => {
    const code = pendingJoin();
    const link = code ? joinLink(code) : `${location.origin}${location.pathname}`;
    const text = `Bonjour ! Pour que je puisse suivre mon équipe de rugby sur Rugbeo (convocations, compos), il faut qu’un parent crée mon compte. Choisissez « Je suis parent d’un joueur de moins de 15 ans » : ${link}`;
    track('kid_share_parent');
    if (navigator.share) navigator.share({ title: 'Rugbeo', text }).catch(() => {});
    else window.RugbyDialog.copy(text, { title: 'Message pour votre parent', message: 'Copiez ce message et envoyez-le à un parent (SMS, WhatsApp…).' });
  };
  $('#auth-who-back').onclick = e => { e.preventDefault(); setSignupWho('adult'); };
  // Cas moins fréquents (parent d'un enfant, moins de 15 ans) : un lien sous le formulaire, plutôt qu'une étape de choix
  document.querySelectorAll('#auth-switch [data-switch]').forEach(a => { a.onclick = e => { e.preventDefault(); setSignupWho(a.dataset.switch === 'parent' ? 'parent' : ''); }; });
  function setAuthMode(mode) {
    showPending(false);
    const tabs = mode === 'login' || mode === 'signup';
    document.querySelector('#modal-auth .tabs').classList.toggle('hidden', !tabs);
    document.querySelectorAll('#modal-auth .tab').forEach(t => t.classList.toggle('active', t.dataset.mode === mode));
    $('#auth-name').closest('label').classList.toggle('hidden', mode !== 'signup');
    $('#auth-signup-extra').classList.toggle('hidden', mode !== 'signup');
    $('#auth-email-field').classList.toggle('hidden', mode === 'reset');
    $('#auth-email').required = mode !== 'reset';
    $('#auth-password-field').classList.toggle('hidden', mode === 'forgot');
    $('#auth-password').required = mode !== 'forgot';
    $('#auth-password').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
    $('#auth-password-label').textContent = mode === 'reset' ? 'Nouveau mot de passe' : 'Mot de passe';
    $('#auth-pw-hint').classList.toggle('hidden', mode !== 'signup' && mode !== 'reset');
    renderPwMeter();
    $('#auth-forgot').classList.toggle('hidden', mode !== 'login');
    $('#auth-back').classList.toggle('hidden', mode !== 'forgot');
    $('#auth-title').textContent = { forgot: 'Mot de passe oublié', reset: 'Nouveau mot de passe' }[mode] || ''; $('#auth-title').classList.toggle('hidden', tabs);
    const intro = { forgot: 'Indiquez l’adresse e-mail de votre compte : vous recevrez un lien pour choisir un nouveau mot de passe.', reset: 'Choisissez votre nouveau mot de passe.' }[mode];
    $('#auth-intro').textContent = intro || ''; $('#auth-intro').classList.toggle('hidden', !intro);
    $('#auth-submit').textContent = { login: 'Se connecter', signup: 'Créer mon compte', forgot: 'Recevoir le lien', reset: 'Enregistrer le mot de passe' }[mode];
    $('#auth-form').dataset.mode = mode; setAuthMsg('');
    if (mode === 'signup') setSignupWho('adult');
    else { $('#auth-who').classList.add('hidden'); $('#auth-who-back').classList.add('hidden'); $('#auth-switch').classList.add('hidden'); $('#auth-kids').classList.add('hidden'); $('#auth-form').classList.remove('hidden'); }
  }
  /* Solidité du mot de passe : longueur, minuscules/majuscules, chiffres, symboles (indicatif, seul le minimum de 6 est imposé). */
  function pwStrength(pw) {
    if (!pw) return { level: 0, text: '6 caractères minimum.' };
    if (pw.length < 6) return { level: 1, text: `Trop court : encore ${6 - pw.length} caractère${6 - pw.length > 1 ? 's' : ''}.` };
    let score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
    if (/\d/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    if (/^(.)\1+$/.test(pw) || /^(123456|password|azerty|qwerty|motdepasse)/i.test(pw)) score = 0;
    if (score <= 1) return { level: 2, text: 'Faible : ajoutez des chiffres, des majuscules ou des symboles.' };
    if (score <= 3) return { level: 3, text: 'Moyen : un peu plus long ou avec un symbole, ce serait mieux.' };
    return { level: 4, text: 'Solide ✓' };
  }
  function renderPwMeter() {
    const st = pwStrength($('#auth-password').value), box = $('#auth-pw-hint');
    box.dataset.level = st.level; box.querySelector('.pw-label').textContent = st.text;
  }
  $('#auth-password').addEventListener('input', renderPwMeter);
  $('#auth-forgot').onclick = e => { e.preventDefault(); const em = $('#auth-email').value; setAuthMode('forgot'); $('#auth-email').value = em; $('#auth-email').focus(); };
  $('#auth-back').onclick = e => { e.preventDefault(); setAuthMode('login'); };
  /** Message sous le formulaire : rouge pour une erreur, neutre pour une information. */
  function setAuthMsg(text, kind) { const m = $('#auth-error'); m.textContent = text || ''; m.classList.toggle('info', kind === 'info'); }
  document.querySelectorAll('#modal-auth .tab').forEach(t => t.onclick = () => setAuthMode(t.dataset.mode));

  /* E-mail à confirmer : écran « vérifie ta boîte mail ». Dès que le lien est cliqué (ici ou sur un autre
     appareil), on retente la connexion en silence pour connecter la personne sans qu'elle ait à le refaire. */
  const pending = { email: '', password: '', timer: null, until: 0 };
  function showPending(on) {
    $('#auth-form').classList.toggle('hidden', on);
    $('#auth-pending').classList.toggle('hidden', !on);
    document.querySelector('#modal-auth .tabs').classList.toggle('hidden', on);
  }
  function startPending(email, password) {
    Object.assign(pending, { email, password, until: Date.now() + 30 * 60 * 1000 });
    $('#auth-pending-email').textContent = email;
    $('#auth-pending-next').textContent = pendingJoin() ? 'Ensuite, vous rejoindrez automatiquement l’équipe de l’invitation.' : 'Ensuite : entrez le code donné par votre club ou votre coach pour rejoindre votre équipe.';
    $('#auth-pending-msg').textContent = '';
    showPending(true);
    clearInterval(pending.timer);
    pending.timer = setInterval(tryPendingLogin, 20000);
  }
  function stopPending() { clearInterval(pending.timer); pending.timer = null; pending.password = ''; }
  async function tryPendingLogin() {
    if (!pending.password || S.user) return stopPending();
    if (Date.now() > pending.until) return stopPending();
    const { error } = await sb.auth.signInWithPassword({ email: pending.email, password: pending.password });
    if (error) return;   // pas encore confirmé (ou limite atteinte) : on réessaiera
    stopPending(); E.closeModal('modal-auth'); E.toast('E-mail confirmé : bienvenue, vous êtes connecté !');
  }
  // Retour sur l'onglet après avoir cliqué le lien dans la boîte mail : on vérifie tout de suite
  document.addEventListener('visibilitychange', () => { if (!document.hidden && pending.timer) tryPendingLogin(); });
  $('#auth-resend').onclick = async () => {
    const b = $('#auth-resend'); b.disabled = true;
    const { error } = await sb.auth.resend({ type: 'signup', email: pending.email, options: { emailRedirectTo: location.origin + location.pathname } });
    $('#auth-pending-msg').textContent = error ? errMsg(error) : 'Nouvel e-mail envoyé.';
    $('#auth-pending-msg').classList.toggle('info', !error);
    setTimeout(() => { b.disabled = false; }, 60000);
  };
  $('#auth-change').onclick = () => { stopPending(); setAuthMode('signup'); $('#auth-email').focus(); };

  $('#auth-form').onsubmit = async e => {
    e.preventDefault();
    const mode = e.target.dataset.mode, email = $('#auth-email').value.trim(), password = $('#auth-password').value, name = $('#auth-name').value.trim();
    const b = $('#auth-submit'); b.disabled = true; setAuthMsg('');
    try {
      if (mode === 'forgot') {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
        if (error) throw error;
        // Même message que le compte existe ou non : on ne révèle pas quelles adresses sont inscrites
        setAuthMsg(`Si un compte existe pour ${email}, un e-mail vient de vous être envoyé. Cliquez sur le lien qu’il contient pour choisir un nouveau mot de passe (pensez aux spams).`, 'info');
        b.disabled = false; return;
      }
      if (mode === 'reset') {
        const { error } = await sb.auth.updateUser({ password });
        if (error) throw error;
        E.closeModal('modal-auth'); E.toast('Mot de passe modifié : vous êtes connecté.');
        b.disabled = false; return;
      }
      if (mode === 'signup') {
        // Parent : les jeunes sont créés avec le compte ; l'accord du parent est enregistré pour chacun, comme preuve
        const parent = signupWho === 'parent';
        const kids = parent ? [...document.querySelectorAll('#auth-kid-list input')].map(i => i.value.trim()).filter(Boolean) : [];
        if (parent && !kids.length) { setAuthMsg('Indiquez le prénom et le nom du jeune.'); b.disabled = false; return; }
        if (!name) { setAuthMsg(parent ? 'Indiquez votre prénom et votre nom.' : 'Indiquez votre prénom et votre nom.'); b.disabled = false; return; }
        if (parent && !$('#auth-parent-ok').checked) { setAuthMsg('Cochez la case d’accord du parent.'); b.disabled = false; return; }
        const meta = Object.assign({ display_name: name, terms_version: window.RugbyLegal ? window.RugbyLegal.version : '' }, parent ? { kids } : {}, pendingJoin() ? { join_code: pendingJoin() } : {});
        const { data, error } = await sb.auth.signUp({ email, password, options: { data: meta, emailRedirectTo: location.origin + location.pathname } });
        if (error) throw error;
        // Supabase ne signale pas un e-mail déjà inscrit : il renvoie un compte sans identité
        if (data.user && Array.isArray(data.user.identities) && !data.user.identities.length) { setAuthMode('login'); $('#auth-email').value = email; setAuthMsg('Cet e-mail a déjà un compte : connectez-vous.', 'info'); b.disabled = false; return; }
        if (window.RugbyDemo) window.RugbyDemo.signedUp();   // mesure anonyme : compte créé après avoir vu la démo ?
        if (!data.session) { startPending(email, password); b.disabled = false; return; }
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) {
          if (error.code === 'email_not_confirmed' || /Email not confirmed/i.test(error.message)) { startPending(email, password); b.disabled = false; return; }
          throw error;
        }
      }
      E.closeModal('modal-auth'); E.toast('Connecté.');
    } catch (err) { setAuthMsg(errMsg(err)); }
    b.disabled = false;
  };

  /* ---------- Page Compte : js/compte.js ---------- */
  function openAccount() { E.go('account'); }
  const renderAccountPage = () => { if (window.RugbyCompte) window.RugbyCompte.render(); };

  /* ---------- Équipes : actions ---------- */
  /* ---------- Club et équipes : créer, rejoindre par code, demander ses équipes ---------- */
  let creationOpen = null;   // interrupteur du back-office « Création de clubs » (lu une fois)
  async function clubCreationOpen() {
    if (isSuper()) return true;
    if (creationOpen === null) { const { data } = await sb.rpc('club_creation_open'); creationOpen = !!data; }
    return creationOpen;
  }
  async function createClub(name) {
    const first = await window.RugbyDialog.prompt('Nom de la première équipe', 'Séniors', { title: 'Créer le club « ' + name.trim() + ' »', placeholder: 'Ex. Séniors, U16…', ok: 'Créer', maxLength: 60 });
    if (!first) return;
    const { data, error } = await sb.rpc('create_club', { p_name: name, p_team: first });
    if (error) return E.toast(errMsg(error));
    await loadTeams();
    const t = S.teams.find(x => x.club_id === data.id); if (t) setTeam(t);
    E.toast(`Club « ${data.name} » créé. Code du club : ${data.join_code}`); teamTab = 'club'; E.go('team'); renderTeamPage();
  }
  /** Un seul code : celui du club (on choisit ensuite ses équipes) ou celui d'une équipe (demande directe). */
  async function joinWithCode(code, forId, quiet) {
    forId = forId || S.user.id;
    const { data, error } = await sb.rpc('join_with_code', Object.assign({ p_code: code }, forArg(forId)));
    if (error) return E.toast(errMsg(error));
    if (!data || !data.kind) return E.toast('Code invalide : vérifiez-le auprès de votre club.');
    await loadTeams();
    const kid = forId !== S.user.id ? kidName(forId) : '';
    if (data.kind === 'club') { if (quiet) return; E.toast(kid ? `${kid} entre au club « ${data.name} » !` : `Bienvenue au club « ${data.name} » !`); return openTeamPicker(data.id, forId); }
    const t = S.teams.find(x => x.id === data.id && (x.who || S.user.id) === forId);
    if (t) { setTeam(t); E.toast(`${kid || 'Vous'} ${kid ? 'est' : 'êtes'} membre de « ${data.name} ».`); }
    else { pushJoin('join_request', data.id, undefined, forId); if (!quiet) E.toast(`Demande envoyée à « ${data.name} »${kid ? ' pour ' + kid : ''}. Un coach ou le bureau du club doit la valider.`); }
    if (quiet) return;
    E.go('team'); renderTeamPage();
  }
  /** Fenêtre « Quelles équipes rejoindre ? » : on coche ses équipes, comme joueur ou comme coach / encadrant. */
  async function openTeamPicker(clubId, forId) {
    forId = forId || actorId();
    const kid = forId !== S.user.id ? kidName(forId) : '';
    const club = S.clubs.find(c => c.id === clubId);
    const { data: teams, error } = await sb.from('teams').select('id, name').eq('club_id', clubId).order('name');
    if (error) return E.toast(errMsg(error));
    const isFor = t => (t.who || S.user.id) === forId;
    const mine = new Set(S.teams.filter(t => !t.notMember && isFor(t)).map(t => t.id)), asked = new Set((S.pending || []).filter(isFor).map(t => t.id));
    const body = $('#club-teams-body'); body.replaceChildren();
    $('#club-teams-title').textContent = (kid ? `Les équipes ${de(kid)}${kid}` : 'Rejoindre vos équipes') + (club ? ` · ${club.name}` : '');
    body.appendChild(el('p', 'muted', kid ? `Cochez les équipes ${de(kid)}${esc(kid)}. Chaque demande est validée par le coach de l’équipe ou le bureau du club.` : 'Cochez les équipes dont vous faites partie. Chaque demande est validée par le coach de l’équipe ou le bureau du club.'));
    const rows = [];
    // Pour un jeune : les équipes adultes (Séniors, Réserve, Loisirs…) sont rangées sous un repli, pas proposées d'emblée
    const adult = t => kid && /s[ée]nior|r[ée]serve|v[ée]t[ée]ran|loisir/i.test(t.name) && !/\b[UM]\s?-?\d{1,2}\b|-\s?\d{1,2}\s?ans/i.test(t.name);
    let adultBox = null;
    (teams || []).forEach(t => {
      const row = el('div', 'pick-row');
      if (adult(t) && !mine.has(t.id) && !asked.has(t.id)) {
        if (!adultBox) { adultBox = el('details', 'pick-adults', '<summary>Équipes adultes du club</summary>'); }
        adultBox.appendChild(row);
      }
      if (mine.has(t.id) || asked.has(t.id)) {
        row.innerHTML = `<span class="pick-name">${esc(t.name)}</span><span class="muted small">${mine.has(t.id) ? 'Déjà membre' : 'Demande envoyée'}</span>`;
      } else {
        const lab = el('label', 'pick-name', `<input type="checkbox"> ${esc(t.name)}`);
        const as = el('select', 'select small'); as.setAttribute('aria-label', 'En tant que');
        (kid ? [['player', 'Comme joueur']] : [['player', 'Comme joueur'], ['staff', 'Comme coach / encadrant']]).forEach(([v, l]) => as.appendChild(Object.assign(el('option'), { value: v, textContent: l })));
        row.append(lab, as);
        rows.push({ t, cb: lab.querySelector('input'), as });
      }
      if (!row.parentNode) body.appendChild(row);
    });
    if (adultBox) body.appendChild(adultBox);
    if (!(teams || []).length) body.appendChild(el('p', 'library-empty', 'Ce club n’a pas encore d’équipe.'));
    const go = btn('Envoyer mes demandes', 'primary wide', async () => {
      const picked = rows.filter(r => r.cb.checked);
      if (!picked.length) return E.toast('Cochez au moins une équipe.');
      go.disabled = true;
      for (const r of picked) {
        const { error: e } = await sb.rpc('request_team', Object.assign({ p_team: r.t.id, p_as: r.as.value }, forArg(forId)));
        if (e) { go.disabled = false; return E.toast(`${r.t.name} : ${errMsg(e)}`); }
        pushJoin('join_request', r.t.id, undefined, forId);
      }
      track('club_request', { count: picked.length });
      E.closeModal('modal-club-teams'); await loadTeams();
      E.toast(picked.length > 1 ? `${picked.length} demandes envoyées.` : `Demande envoyée à « ${picked[0].t.name} ».`);
      teamTab = 'club'; E.go('team'); renderTeamPage();
    });
    body.append(go, btn('Plus tard', 'ghost wide', () => { E.closeModal('modal-club-teams'); teamTab = 'club'; E.go('team'); renderTeamPage(); }));
    E.openModal('modal-club-teams');
  }
  /** onClose : si fourni, ajoute un bouton pour refermer le panneau. */
  function teamForms(onClose) {
    const box = el('div', 'team-forms-card');
    const head = el('div', 'forms-head'); head.appendChild(el('h4', '', S.teams.length || S.clubs.length ? 'Rejoindre un club ou une équipe' : 'Rejoindre votre club'));
    if (onClose) { const x = btn('✕', 'btn-close', onClose); x.className = 'btn-close'; x.title = 'Fermer'; x.setAttribute('aria-label', 'Fermer'); head.appendChild(x); }
    box.appendChild(head);
    const part = (title, help) => { const d = el('div', 'forms-part'); d.appendChild(el('strong', 'forms-part-title', title)); if (help) d.appendChild(el('p', 'help', help)); box.appendChild(d); return d; };

    // 1. Rejoindre : un seul champ pour le code du club ou de l'équipe
    const p1 = part('Rejoindre avec un code', 'Le code vous est donné par votre club ou votre coach. Avec le code du club, vous choisissez ensuite vos équipes.');
    let forSel = null;
    if (S.kids.length) {
      forSel = el('select', 'select'); forSel.setAttribute('aria-label', 'Pour qui ?');
      S.kids.forEach(k => forSel.appendChild(Object.assign(el('option'), { value: k.id, textContent: 'Pour ' + k.display_name })));
      forSel.appendChild(Object.assign(el('option'), { value: S.user.id, textContent: 'Pour moi' }));
      if (S.team && S.team.who) forSel.value = S.team.who;
      p1.appendChild(forSel);
    }
    const f2 = el('form', 'inline-form', '<input type="text" placeholder="Code d’invitation" required minlength="6" maxlength="8" style="text-transform:uppercase" aria-label="Code d’invitation"><button class="btn primary small" type="submit">Rejoindre</button>');
    f2.onsubmit = e => { e.preventDefault(); joinWithCode(f2.querySelector('input').value, forSel ? forSel.value : S.user.id); };
    p1.appendChild(f2);

    // 2. Direction du club : ajouter une équipe à son club (le super-admin : au club de l'équipe ouverte)
    const mineAdmin = S.clubs.filter(c => c.myRole === 'responsable' || (isSuper() && S.team && c.id === S.team.club_id));
    mineAdmin.forEach(c => {
      const p = part(`Ajouter une équipe à « ${c.name} »`, 'Vous dirigez ce club : la nouvelle équipe reçoit son propre code d’invitation.');
      const f = el('form', 'inline-form', '<input type="text" placeholder="Ex. U16, Féminines, Réserve…" required minlength="2" maxlength="60" aria-label="Nom de la nouvelle équipe"><button class="btn primary small" type="submit">Créer l’équipe</button>');
      f.onsubmit = async e => {
        e.preventDefault();
        const { data, error } = await sb.rpc('create_club_team', { p_club: c.id, p_name: f.querySelector('input').value });
        if (error) return E.toast(errMsg(error));
        track('club_team_create'); await loadTeams();
        const t = S.teams.find(x => x.id === data.id); if (t) setTeam(t);
        E.toast(`Équipe « ${data.name} » créée. Invitez ses joueurs avec son code.`); teamTab = 'members'; E.go('team'); renderTeamPage();
      };
      p.appendChild(f);
    });

    // 3. Nouveau club : seulement quand le back-office l'ouvre (création volontairement fermée pour l'instant,
    //    pour éviter les comptes et équipes en série). Fermée : pas de bouton grisé, on dit simplement quoi faire.
    const p3 = part('Créer un nouveau club', 'Vous serez au bureau du club et coach de sa première équipe.');
    const f1 = el('form', 'inline-form', '<input type="text" placeholder="Nom du club" required minlength="2" maxlength="60" aria-label="Nom du nouveau club"><button class="btn outline small" type="submit">Créer le club</button>');
    f1.onsubmit = e => { e.preventDefault(); createClub(f1.querySelector('input').value); };
    p3.appendChild(f1);
    p3.classList.add('hidden');
    const noCode = el('p', 'help forms-nocode', 'Pas de code ? Demandez-le au bureau de votre club ou à votre coach.');
    p1.appendChild(noCode);
    clubCreationOpen().then(open => {
      p3.classList.toggle('hidden', !open);
      head.firstChild.textContent = open && (S.teams.length || S.clubs.length) ? 'Rejoindre ou créer' : head.firstChild.textContent;
      if (open) return;
      noCode.innerHTML = 'Pas de code ? Demandez-le au bureau de votre club ou à votre coach. Votre club n’est pas encore sur Rugbeo ? L’ouverture se fait sur invitation pour le moment : <a href="#">écrivez-nous</a>.';
      noCode.querySelector('a').onclick = e => {
        e.preventDefault(); if (!window.RugbyAdmin) return;
        window.RugbyAdmin.openFeedback();
        const m = $('#feedback-message'); if (m && !m.value) m.value = 'Je voudrais ouvrir mon club sur Rugbeo. Nom du club : … Ville : … Mon rôle : …';
      };
    });
    return box;
  }
  function pendingCard() {
    if (!S.pending || !S.pending.length) return null;
    const box = el('div', 'team-forms-card');
    box.appendChild(el('h4', '', 'Demandes en attente'));
    S.pending.forEach(t => box.appendChild(el('p', 'muted', `« ${esc(t.name)} »${t.who ? ` pour ${esc(t.kidName)}` : ''} : en attente de validation par le coach ou le bureau du club.`)));
    return box;
  }
  /** Inviter des joueurs : code à copier, message personnalisable, envoi par WhatsApp, SMS, e-mail ou copie. */
  function shareCode(scope) {
    const t = window.RugbyAccount.team();
    if (!t) return;
    track('invite_open');
    const url = `${location.origin}${location.pathname}`;
    const club = S.clubs.find(c => c.id === t.club_id);
    // Deux codes : celui de l'équipe (demande directe pour cette équipe) et, pour le bureau, celui du club (on choisit ses équipes)
    const canClub = !!(club && isClubAdmin(club.id));
    const forClub = canClub && scope === 'club';
    const code = forClub ? club.join_code : t.join_code;
    const body = $('#invite-body'); body.replaceChildren();
    if (canClub) {
      const seg = el('div', 'invite-scope');
      [['team', `L’équipe ${t.name}`], ['club', `Tout le club ${club.name}`]].forEach(([id, label]) => {
        const b = btn(label, 'chip' + ((forClub ? 'club' : 'team') === id ? ' on' : ''), () => shareCode(id)); seg.appendChild(b);
      });
      body.appendChild(seg);
    }
    // Lien d'invitation (contient le code) : en un clic, la personne rejoint l'équipe ou le club
    const link = joinLink(code);
    const lk = el('div', 'invite-link', `<span class="muted">Lien d’invitation</span><a class="invite-url" href="${esc(link)}" target="_blank" rel="noopener">${esc(link.replace(/^https?:\/\//, ''))}</a>`);
    const lkActs = el('div', 'row-wrap');
    lkActs.appendChild(btn('Copier le lien', 'primary small', () => copy(link, 'Lien copié.', 'link')));
    if (navigator.share) lkActs.appendChild(btn('Partager', 'outline small', () => { track('invite', { channel: 'share-link' }); navigator.share({ title: 'Rugbeo', text: forClub ? `Rejoignez le club « ${club.name} » sur Rugbeo` : `Rejoignez l’équipe « ${t.name} » sur Rugbeo`, url: link }).catch(() => {}); }));
    lkActs.appendChild(btn('QR code', 'outline small', () => showQr(link, forClub ? club.name : t.name, code, forClub)));
    lk.appendChild(lkActs);
    body.appendChild(lk);
    const box = el('div', 'invite-code', `<span class="muted">${forClub ? `Code du club ${esc(club.name)}` : `Code de l’équipe ${esc(t.name)}`} (à taper si le lien ne s’ouvre pas)</span><strong>${esc(code)}</strong>`);
    box.appendChild(btn('Copier le code', 'outline small', () => copy(code, 'Code copié.', 'code')));
    // Nouveau lien : l'ancien lien et l'ancien code ne marchent plus (staff de l'équipe, ou bureau pour le club)
    if (forClub ? canClub : isStaff()) box.appendChild(btn('Nouveau lien', 'ghost small', async () => {
      if (!await window.RugbyDialog.confirm(`Créer un nouveau lien ? L’ancien lien et l’ancien code (${code}) ne marcheront plus.`, { title: 'Nouveau lien d’invitation', ok: 'Nouveau lien' })) return;
      const { data, error } = forClub ? await sb.rpc('regenerate_club_code', { p_club: club.id }) : await sb.rpc('regenerate_join_code', { p_team: t.id });
      if (error) return E.toast(errMsg(error));
      if (forClub) club.join_code = data; else { S.teams.forEach(x => { if (x.id === t.id) x.join_code = data; }); t.join_code = data; }
      E.toast('Nouveau lien créé : l’ancien ne marche plus.'); shareCode(scope);
    }));
    body.appendChild(box);
    body.appendChild(el('p', 'help invite-explain', forClub
      ? 'Avec ce code, la personne rejoint le club, puis choisit ses équipes (comme joueur ou comme coach). Chaque demande est validée par le coach de l’équipe ou le bureau.'
      : `Avec ce code, la personne demande directement à rejoindre « ${esc(t.name)} »${club ? ` (et entre dans le club ${esc(club.name)})` : ''}. Vous validez sa demande dans Équipe.`));
    const msg = el('textarea', 'admin-textarea invite-msg'); msg.rows = 6; msg.maxLength = 600; msg.setAttribute('aria-label', 'Message d’invitation');
    msg.value = forClub
      ? `Bonjour ! Rejoignez le club « ${club.name} » sur Rugbeo : stratégies, convocations et compos au même endroit.\n\nTouchez ce lien, créez votre compte (gratuit), puis choisissez vos équipes :\n${link}\n\n(Si le lien ne marche pas : ${url} puis le code ${code})`
      : `Bonjour ! Rejoignez l’équipe « ${t.name} » sur Rugbeo : stratégies, convocations et compos au même endroit.\n\nTouchez ce lien et créez votre compte (gratuit) :\n${link}\n\n(Si le lien ne marche pas : ${url} puis le code ${code})`;
    body.append(el('label', 'invite-label', 'Message (vous pouvez le modifier)'), msg);
    const enc = () => encodeURIComponent(msg.value);
    const ICONS = {
      whatsapp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2a8.8 8.8 0 0 0-7.6 13.2L3.2 20.8l4.5-1.2A8.8 8.8 0 1 0 12 3.2z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9.1 7.9c.2-.4.4-.4.7-.4h.5c.2 0 .4 0 .5.4l.7 1.6c.1.2 0 .4-.1.6l-.5.6c-.1.1-.1.3 0 .5.6 1.1 1.5 2 2.6 2.6.2.1.4.1.5 0l.6-.5c.2-.1.4-.2.6-.1l1.6.7c.4.2.4.3.4.5v.5c0 .3 0 .5-.4.7-.5.3-1.5.6-2.8.1-2.3-.9-4.2-2.8-5.1-5.1-.4-1.3-.2-2.3.2-2.7z" fill="currentColor"/></svg>',
      sms: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="8" cy="11" r="1.2" fill="currentColor"/><circle cx="12" cy="11" r="1.2" fill="currentColor"/><circle cx="16" cy="11" r="1.2" fill="currentColor"/></svg>',
      email: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M4 7l8 6 8-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
      more: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="12" r="1.8" fill="currentColor"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/><circle cx="18" cy="12" r="1.8" fill="currentColor"/></svg>'
    };
    const links = el('div', 'invite-icons');
    // Un mot sous chaque icône : on sait ce que fait le bouton sans le deviner
    const CAPTIONS = { whatsapp: 'WhatsApp', sms: 'SMS', email: 'E-mail', more: 'Autre' };
    const caption = (node, text) => { const w = el('div', 'invite-item'); w.append(node, el('span', '', text)); w.lastChild.setAttribute('aria-hidden', 'true'); return w; };
    const icon = (key, label, href) => {
      const a = el('a', 'invite-icon ' + key, ICONS[key]); a.href = href(); a.target = '_blank'; a.rel = 'noopener'; a.title = label; a.setAttribute('aria-label', label);
      a.onclick = () => { a.href = href(); track('invite', { channel: key }); };
      return caption(a, CAPTIONS[key]);
    };
    links.append(
      icon('whatsapp', 'Envoyer par WhatsApp', () => `https://wa.me/?text=${enc()}`),
      icon('sms', 'Envoyer par SMS', () => `sms:?&body=${enc()}`),
      icon('email', 'Envoyer par e-mail', () => `mailto:?subject=${encodeURIComponent((forClub ? 'Rejoignez le club ' + club.name : 'Rejoignez l’équipe ' + t.name) + ' sur Rugbeo')}&body=${enc()}`)
    );
    if (navigator.share) {
      const more = el('button', 'invite-icon more', ICONS.more); more.type = 'button'; more.title = 'Autre application'; more.setAttribute('aria-label', 'Autre application');
      more.onclick = () => { track('invite', { channel: 'share' }); navigator.share({ title: 'Rugbeo', text: msg.value }).catch(() => {}); };
      links.appendChild(caption(more, CAPTIONS.more));
    }
    body.appendChild(links);
    body.appendChild(btn('Copier le message', 'primary wide', () => copy(msg.value, 'Message copié : collez-le où vous voulez.', 'copy')));
    E.openModal('modal-invite');
  }
  const joinLink = code => `${location.origin}${location.pathname}#/rejoindre/${encodeURIComponent(code)}`;
  function loadQrLib() {
    if (window.qrcode) return Promise.resolve();
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'vendor/qrcode.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  }
  const qrSvg = text => { const q = window.qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ cellSize: 8, margin: 2, scalable: true }); };
  /** QR code du lien en grand, à montrer ou à imprimer pour le vestiaire. */
  async function showQr(link, name, code, forClub) {
    try { await loadQrLib(); } catch (e) { return E.toast('QR code indisponible : vérifiez la connexion.'); }
    track('invite', { channel: 'qr' });
    const body = $('#invite-body'); const prevNodes = [...body.childNodes];
    body.replaceChildren();
    const box = el('div', 'qr-box', `<div class="qr-img">${qrSvg(link)}</div><strong>${esc(name)}</strong><span class="muted">Scannez avec l’appareil photo du téléphone pour rejoindre ${forClub ? 'le club' : 'l’équipe'}. Code : ${esc(code)}</span>`);
    body.appendChild(box);
    const acts = el('div', 'row-wrap qr-acts');
    acts.appendChild(btn('Imprimer pour le vestiaire', 'primary', () => printQr(link, name, code, forClub)));
    acts.appendChild(btn('‹ Retour', 'ghost', () => body.replaceChildren(...prevNodes)));
    body.appendChild(acts);
  }
  function printQr(link, name, code, forClub) {
    const w = window.open('', '_blank');
    if (!w) return E.toast('Autorisez les fenêtres surgissantes pour imprimer.');
    // Page imprimée : noir sur blanc, indépendante des couleurs de l'appli
    w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Rejoindre ${esc(name)} sur Rugbeo</title><style>
      body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;text-align:center;margin:40px;color:#111}
      h1{font-size:34px;margin:0 0 8px}p{font-size:18px;margin:6px 0}.qr{width:360px;height:360px;margin:24px auto}.qr svg{width:100%;height:100%}
      .code{font-size:28px;font-weight:800;letter-spacing:.15em}.small{font-size:14px;color:#555}button{margin-top:24px;font-size:16px;padding:10px 18px}@media print{button{display:none}}
    </style></head><body><h1>Rejoignez ${forClub ? 'le club' : 'l’équipe'} ${esc(name)}</h1><p>sur Rugbeo : convocations, stratégies et compos</p>
    <div class="qr">${qrSvg(link)}</div><p>1. Ouvrez l’appareil photo du téléphone et visez le code.</p><p>2. Touchez le lien, puis créez votre compte (gratuit).</p>
    <p class="small">Sans QR code : ${esc(location.origin + location.pathname)} puis le code</p><p class="code">${esc(code)}</p>
    <button onclick="print()">Imprimer</button></body></html>`);
    w.document.close();
  }

  /* ---------- Lien d'invitation : #/rejoindre/CODE ---------- */
  const JOIN_KEY = 'rs-join-code';
  let joinFromLink = false;
  const pendingJoin = () => { try { return localStorage.getItem(JOIN_KEY) || ''; } catch (e) { return ''; } };
  const setPendingJoin = v => { try { if (v) localStorage.setItem(JOIN_KEY, v); else localStorage.removeItem(JOIN_KEY); } catch (e) { /* ignore */ } };
  function readJoinRoute() {
    const m = location.hash.match(/^#\/rejoindre\/([A-Za-z0-9]{6,8})/);
    if (!m) return;
    setPendingJoin(m[1].toUpperCase());
    joinFromLink = true;
    // On garde #/rejoindre/CODE dans l'adresse jusqu'à son usage : la personne peut ouvrir le lien dans
    // WhatsApp puis « Ouvrir dans le navigateur », ou recharger la page, sans perdre l'invitation.
    if (ready) usePendingJoin(true);
  }
  window.addEventListener('hashchange', readJoinRoute);
  readJoinRoute();
  /** Fenêtre d'inscription ouverte par un lien d'invitation : qui invite, et « J'ai déjà un compte ». */
  async function showInvite(code) {
    const note = $('#auth-note');
    const put = who => {
      note.innerHTML = `<strong>${who ? `Vous êtes invité à rejoindre ${who}` : 'Vous avez reçu une invitation'}</strong><br>Créez votre compte ci-dessous : vous rejoindrez ensuite l’équipe automatiquement. Déjà un compte ? <a href="#" data-login>Se connecter</a>`;
      note.querySelector('[data-login]').onclick = e => { e.preventDefault(); setAuthMode('login'); };
      note.classList.remove('hidden');
    };
    put('');
    const { data } = await sb.rpc('invite_info', { p_code: code });
    const i = data && data[0];
    if (i && !S.user) put(i.kind === 'team' ? `« ${esc(i.team)} »${i.club ? ` · ${esc(i.club)}` : ''}` : `le club « ${esc(i.club)} »`);
  }
  /** Connecté : on rejoint tout de suite. Visiteur : création de compte, le code est gardé (navigateur et compte). */
  async function usePendingJoin(fromLink) {
    const meta = (S.user && S.user.user_metadata) || {};
    const code = pendingJoin() || meta.join_code || '';
    if (!code) return;
    if (!S.user) {
      if (fromLink || joinFromLink) {
        joinFromLink = false;
        openAuth('signup');
        showInvite(code);
      }
      return;
    }
    setPendingJoin('');
    $('#auth-note').classList.add('hidden');
    if (/^#\/rejoindre\//.test(location.hash)) history.replaceState(null, '', location.pathname + location.search + '#/');   // invitation utilisée
    if (meta.join_code) sb.auth.updateUser({ data: { join_code: null } }).catch(() => {});
    track('join_link');
    if (S.kids.length) {
      // Parent : le lien vaut pour ses jeunes (chacun fait sa demande ; avec un code de club, on choisit ensuite leurs équipes)
      for (const k of S.kids) await joinWithCode(code, k.id, true);
      E.toast(`Demandes envoyées pour ${S.kids.map(k => k.display_name.split(' ')[0]).join(' et ')}.`);
      E.go('home');
      return;
    }
    await joinWithCode(code);
  }
  function copy(text, ok, channel) {
    track('invite', { channel });
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => E.toast(ok), () => window.RugbyDialog.copy(text));
    else window.RugbyDialog.copy(text);
  }

  /* ---------- Page équipe : onglets Membres et Réglages (les stratégies sont dans la page Stratégies) ---------- */
  let teamSeq = 0;
  let teamTab = 'members';
  async function renderTeamPage() {
    const seq = ++teamSeq;
    const root = $('#team-page'); root.replaceChildren();
    if (!S.team) {
      // Membre d'un club sans équipe encore : les équipes du club pour faire ses demandes
      const pend = pendingCard(); if (pend) root.appendChild(pend);
      if (S.clubs.length) { const box = el('div', 'club-pane'); root.appendChild(box); await renderClubTab(box, seq); }
      root.appendChild(teamForms()); return;
    }
    const staff = isStaff();
    const badges = S.team.superadmin ? '<span class="role-badge admin">Super-admin</span>'
      : (S.team.notMember ? '' : roleBadge(S.team.role, S.team.plays)) + (S.team.clubAdmin ? ` <span class="role-badge coach">${esc(((S.clubs.find(c => c.id === S.team.club_id) || {}).myTitle) || 'Bureau du club')}</span>` : '');
    if (S.team.clubName) root.appendChild(fitName(el('div', 'team-club muted small'), S.team.clubName, S.team.clubShort));
    root.appendChild(el('div', 'team-title', `<h2>${esc(S.team.name)}</h2>${badges}`));

    // Onglets (la pastille de Membres compte les demandes à valider pour le staff)
    let pending = 0;
    if (staff) { const { count } = await sb.from('team_members').select('user_id', { count: 'exact', head: true }).eq('team_id', S.team.id).eq('status', 'pending'); pending = count || 0; }
    if (seq !== teamSeq) return;
    // Onglets : Membres et Club pour tous ; les réglages de l'équipe pour le staff seulement
    // Présences : toute l'équipe pour le staff, ses propres chiffres pour un joueur (ou un parent pour son jeune)
    const plays = staff || S.team.role === 'player' || S.team.plays;
    const tabList = [['members', 'Membres', pending]].concat(window.RugbyStats && plays ? [['stats', 'Présences', 0]] : [], staff ? [['settings', 'Réglages', 0]] : [], [['club', 'Club', 0]]);
    if (!tabList.find(([id]) => id === teamTab)) teamTab = 'members';
    const tabs = el('div', 'tabs small page-tabs');
    tabList.forEach(([id, label, n]) => {
      const b = el('button', 'tab' + (teamTab === id ? ' active' : '')); b.textContent = label;
      if (n) b.appendChild(el('span', 'nav-badge tab-badge', String(n)));
      b.onclick = () => { teamTab = id; renderTeamPage(); }; tabs.appendChild(b);
    });
    root.appendChild(tabs);

    if (teamTab === 'settings') { root.appendChild(teamSettings(staff)); return; }
    if (teamTab === 'stats') { const box = el('div', 'stats-pane'); root.appendChild(box); await window.RugbyStats.renderTab(box, S.team.id, staff); return; }
    if (teamTab === 'club') { const box = el('div', 'club-pane'); root.appendChild(box); await renderClubTab(box, seq); return; }
    const list = el('div', 'member-list');
    root.appendChild(list);
    await renderMembers(list, staff, seq);
    // Les rôles d'équipe (coach, admin, joueur) ne concernent que l'équipe ; le bureau du club se règle dans l'onglet Club
    if (seq === teamSeq && S.team.club_id && isClubAdmin(S.team.club_id)) {
      const hint = el('div', 'club-hint', '<span>Présidente, secrétaire, bureau : ces fonctions donnent la gestion de tout le club.</span>');
      hint.appendChild(btn('Gérer le bureau du club', 'outline small', () => { teamTab = 'club'; renderTeamPage(); }));
      root.appendChild(hint);
    }
    if (!staff && !S.team.superadmin && !S.team.notMember && seq === teamSeq) {
      const leave = btn(`Quitter « ${S.team.name} »`, 'ghost small danger team-leave', () => leaveTeam(S.team));
      root.appendChild(leave);
    }
  }

  const CLUB_TITLES = ['Président', 'Présidente', 'Vice-président(e)', 'Secrétaire', 'Trésorier', 'Trésorière', 'Membre du bureau'];
  /* ---------- Onglet Club : équipes du club, demandes, et gestion pour la direction ---------- */
  const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  async function renderClubTab(root, seq) {
    const club = currentClub();
    if (!club) { root.appendChild(el('p', 'library-empty', 'Cette équipe n’est rattachée à aucun club.')); return; }
    const admin = isClubAdmin(club.id);
    const refresh = async () => { await loadTeams(); renderTeamPage(); };
    const [{ data: teams }, { data: heads }] = await Promise.all([
      sb.from('teams').select('id, name, youth').eq('club_id', club.id).order('name'),
      sb.from('club_members').select('user_id, role, title, joined_at, profiles(display_name)').eq('club_id', club.id).order('joined_at')
    ]);
    if (seq !== teamSeq) return;
    const teamIds = (teams || []).map(t => t.id);
    let counts = {};
    if (admin && teamIds.length) {
      const { data: tm } = await sb.from('team_members').select('team_id, status').in('team_id', teamIds);
      (tm || []).forEach(r => { const c = counts[r.team_id] = counts[r.team_id] || { active: 0, pending: 0 }; c[r.status === 'active' ? 'active' : 'pending']++; });
      if (seq !== teamSeq) return;
    }
    const nameOf = r => (r.profiles && r.profiles.display_name) || 'Membre';
    const direction = (heads || []).filter(r => r.role === 'responsable');

    // En-tête : nom, direction, code du club et date de saison (direction seulement)
    const card = el('div', 'club-card');
    card.appendChild(el('h3', '', esc(club.name)));
    card.appendChild(el('p', 'muted small', direction.length ? `Bureau du club : ${direction.map(r => esc(nameOf(r)) + (r.title ? ` (${esc(r.title)})` : '')).join(', ')}` : 'Bureau du club : pas encore nommé.'));
    const ffr = club.settings && club.settings.ffr_url;
    if (ffr) { const a = el('a', 'link club-ffr', 'Page du club sur la FFR ↗'); a.href = ffr; a.target = '_blank'; a.rel = 'noopener'; card.appendChild(a); }
    if (admin) {
      const code = el('div', 'row-wrap', `<span class="muted small">Code du club</span><span class="club-code">${esc(club.join_code)}</span>`);
      code.appendChild(btn('Copier', 'outline small', () => copy(club.join_code, 'Code du club copié.', 'club-code')));
      code.appendChild(btn('Nouveau code', 'outline small', async () => {
        if (!await window.RugbyDialog.confirm(`Générer un nouveau code ? L’ancien (${club.join_code}) ne marchera plus.`, { ok: 'Nouveau code' })) return;
        const { data, error } = await sb.rpc('regenerate_club_code', { p_club: club.id });
        if (error) return E.toast(errMsg(error));
        club.join_code = data; E.toast('Nouveau code : ' + data); renderTeamPage();
      }));
      card.appendChild(code);
      card.appendChild(el('p', 'help', 'Avec ce code, une personne rejoint le club puis demande à rejoindre ses équipes.'));
      const season = el('div', 'row-wrap', '<span class="muted small">La saison commence le 1er</span>');
      const month = el('select', 'select small'); month.setAttribute('aria-label', 'Mois de début de saison');
      MONTHS.forEach((m, i) => month.appendChild(Object.assign(el('option'), { value: String(i + 1).padStart(2, '0'), textContent: m, selected: (club.season_start || '07-01').slice(0, 2) === String(i + 1).padStart(2, '0') })));
      month.onchange = async () => {
        const { error } = await sb.from('clubs').update({ season_start: month.value + '-01' }).eq('id', club.id);
        if (error) return E.toast(errMsg(error));
        club.season_start = month.value + '-01'; E.toast(`Début de saison : 1er ${MONTHS[+month.value - 1]}.`);
      };
      season.appendChild(month);
      card.appendChild(season);
      card.appendChild(btn(ffr ? 'Modifier le lien FFR' : 'Ajouter la page FFR du club', 'outline small', async () => {
        const v = await window.RugbyDialog.prompt('Lien de la page du club (FFR, Mon Club House…)', ffr || 'https://', { title: 'Page FFR du club', placeholder: 'https://…', ok: 'Enregistrer', maxLength: 300, type: 'url' });
        if (v == null) return;
        const url = v.trim();
        if (url && !/^https:\/\/[^\s]+\.[^\s]+$/.test(url)) return E.toast('Adresse invalide : elle doit commencer par https://');
        const settings = Object.assign({}, club.settings || {}, { ffr_url: url && url !== 'https://' ? url : null });
        const { error } = await sb.from('clubs').update({ settings }).eq('id', club.id);
        if (error) return E.toast(errMsg(error));
        club.settings = settings; E.toast(settings.ffr_url ? 'Lien FFR enregistré : il s’affiche pour tous les membres du club.' : 'Lien FFR retiré.'); renderTeamPage();
      }));
      card.appendChild(btn(club.short_name ? `Diminutif : ${club.short_name}` : 'Ajouter un diminutif (ex. SCB)', 'outline small club-short', async () => {
        const v = await window.RugbyDialog.prompt('Diminutif du club (8 caractères au plus), utilisé quand le nom complet ne tient pas', club.short_name || '', { title: 'Diminutif du club', placeholder: 'Ex. SCB', ok: 'Enregistrer', maxLength: 8, required: false });
        if (v === null) return;
        const short = v.trim() || null;
        const { error } = await sb.from('clubs').update({ short_name: short }).eq('id', club.id);
        if (error) return E.toast(errMsg(error));
        E.toast(short ? `Diminutif enregistré : ${short}.` : 'Diminutif retiré.'); refresh();
      }));
      card.appendChild(btn('Renommer le club', 'outline small club-rename', async () => {
        const v = await window.RugbyDialog.prompt('Nom du club', club.name, { title: 'Renommer le club', ok: 'Renommer', maxLength: 60 });
        if (!v || v.trim() === club.name) return;
        const { error } = await sb.from('clubs').update({ name: v.trim() }).eq('id', club.id);
        if (error) return E.toast(errMsg(error));
        E.toast('Club renommé.'); refresh();
      }));
    }
    root.appendChild(card);

    // Partenaires du club (gérés par le bureau)
    if (window.RugbySponsors) await window.RugbySponsors.manage(root, club, admin);
    if (seq !== teamSeq) return;

    // Équipes du club
    const sec = el('div', 'club-section');
    const head = el('div', 'members-head', `<span class="muted">${teamIds.length} équipe${teamIds.length > 1 ? 's' : ''}</span>`);
    if (admin) head.appendChild(btn('+ Créer une équipe', 'primary small', async () => {
      const v = await window.RugbyDialog.prompt('Nom de l’équipe', '', { title: `Nouvelle équipe · ${club.name}`, placeholder: 'Ex. U16, Féminines, Réserve…', ok: 'Créer', maxLength: 60 });
      if (!v) return;
      const { data, error } = await sb.rpc('create_club_team', { p_club: club.id, p_name: v });
      if (error) return E.toast(errMsg(error));
      track('club_team_create');
      // Équipe créée : on dit quoi faire ensuite (inviter la ou le coach avec le code de l'équipe)
      await loadTeams();
      const nt = S.teams.find(x => x.id === data.id);
      if (nt && await window.RugbyDialog.confirm(`Prochaine étape : invitez la ou le coach de « ${data.name} » avec le code de l’équipe. Ensuite, le coach invite ses joueurs et crée le premier entraînement.`, { title: 'Équipe créée', ok: 'Inviter la ou le coach', cancel: 'Plus tard' })) { setTeam(nt); shareCode('team'); }
      refresh();
    }));
    else head.appendChild(btn('Rejoindre d’autres équipes', 'outline small', () => openTeamPicker(club.id)));
    sec.appendChild(head);
    const mine = new Set(S.teams.filter(t => !t.notMember && !t.superadmin).map(t => t.id)), asked = new Set((S.pending || []).map(t => t.id));
    (teams || []).forEach(t => {
      const row = el('div', 'club-team-row');
      const c = counts[t.id];
      row.appendChild(el('div', 'grow', `<strong>${esc(t.name)}</strong>${admin && c ? `<small>${c.active} membre${c.active > 1 ? 's' : ''}${c.pending ? ` · ${c.pending} en attente` : ''}</small>` : admin ? '<small>Aucun membre pour l’instant</small>' : ''}`));
      // Équipe de jeunes : les partenaires « réservés aux adultes » (bar, brasserie) n'y sont pas affichés
      if (admin) {
        const yl = el('label', 'check small team-youth', '<input type="checkbox"> Jeunes');
        const yc = yl.querySelector('input'); yc.checked = !!t.youth;
        yl.title = 'Équipe de jeunes : les partenaires réservés aux adultes n’y sont pas affichés';
        yc.onchange = async () => {
          const { error } = await sb.from('teams').update({ youth: yc.checked }).eq('id', t.id);
          if (error) { yc.checked = !yc.checked; return E.toast(errMsg(error)); }
          t.youth = yc.checked; const mt = S.teams.find(x => x.id === t.id); if (mt) mt.youth = yc.checked;
          E.toast(yc.checked ? `${t.name} : équipe de jeunes (pas de partenaire réservé aux adultes).` : `${t.name} : équipe adulte.`);
        };
        row.appendChild(yl);
      } else if (t.youth) row.appendChild(el('span', 'vis-badge private', 'Jeunes'));
      if (mine.has(t.id)) row.appendChild(el('span', 'role-badge player', 'Mon équipe'));
      else if (asked.has(t.id)) row.appendChild(el('span', 'vis-badge proposed', 'Demande envoyée'));
      const open = S.teams.find(x => x.id === t.id);
      if (open && S.team && S.team.id === t.id) row.appendChild(el('span', 'vis-badge team', 'Équipe affichée'));
      if (open && (S.team && S.team.id !== t.id)) row.appendChild(btn('Ouvrir', 'outline small', () => { setTeam(open); teamTab = 'members'; renderTeamPage(); }));
      if (!open && !asked.has(t.id)) {
        const ask = btn('Demander à rejoindre', 'secondary small', () => window.RugbySelect.openMenu(ask, [
          ['Comme joueur', () => requestTeam(t, 'player')], ['Comme coach / encadrant', () => requestTeam(t, 'staff')]
        ], `Rejoindre « ${t.name} »`));
        row.appendChild(ask);
      }
      sec.appendChild(row);
    });
    root.appendChild(sec);

    // Membres du club (direction seulement) : rôle dans le club, retrait du club
    if (admin) {
      const ms = el('div', 'club-section');
      ms.appendChild(el('div', 'members-head', `<span class="muted">${(heads || []).length} membre${(heads || []).length > 1 ? 's' : ''} du club</span>`));
      (heads || []).forEach(r => {
        const row = el('div', 'member-row');
        row.appendChild(el('div', 'avatar', esc(nameOf(r).trim().slice(0, 1).toUpperCase() || '?')));
        row.appendChild(el('div', 'who', `${esc(nameOf(r))}${r.user_id === actorId() ? ' (moi)' : ''}<small>Membre du club depuis le ${new Date(r.joined_at).toLocaleDateString('fr-FR')}</small>`));
        const acts = el('div', 'member-actions');
        // Fonction au bureau : donne les droits de gestion du club (toutes les équipes) ; « Membre » = aucun droit en plus
        const sel = el('select', 'select small'); sel.setAttribute('aria-label', 'Fonction au club');
        const cur = r.role === 'responsable' ? (r.title || 'Membre du bureau') : '';
        const titles = CLUB_TITLES.includes(cur) || !cur ? CLUB_TITLES : CLUB_TITLES.concat([cur]);
        [['', 'Membre']].concat(titles.map(x => [x, x])).forEach(([v, l]) => sel.appendChild(Object.assign(el('option'), { value: v, textContent: l, selected: cur === v })));
        sel.onchange = async () => {
          if (!sel.value && r.user_id === actorId() && !await window.RugbyDialog.confirm('Vous retirer du bureau du club ? Vous perdrez la gestion des équipes du club.')) { sel.value = cur; return; }
          const { error } = await sb.rpc('set_club_function', { p_club: club.id, p_user: r.user_id, p_title: sel.value || null });
          if (error) { sel.value = cur; return E.toast(errMsg(error)); }
          E.toast(sel.value ? `${nameOf(r)} : ${sel.value}. Gère maintenant toutes les équipes du club.` : `${nameOf(r)} n’est plus au bureau du club.`); refresh();
        };
        acts.appendChild(sel);
        if (r.user_id !== actorId()) acts.appendChild(moreMenu([[`Retirer ${nameOf(r)} du club`, async () => {
          if (!await window.RugbyDialog.confirm(`Retirer ${nameOf(r)} du club ? Cette personne quittera aussi toutes les équipes de « ${club.name} ».`, { title: 'Retirer du club', ok: 'Retirer', danger: true })) return;
          if (teamIds.length) { const { error: e1 } = await sb.from('team_members').delete().eq('user_id', r.user_id).in('team_id', teamIds); if (e1) return E.toast(errMsg(e1)); }
          const { error } = await sb.from('club_members').delete().match({ club_id: club.id, user_id: r.user_id });
          if (error) return E.toast(errMsg(error));
          E.toast(`${nameOf(r)} ne fait plus partie du club.`); refresh();
        }]], nameOf(r)));
        row.appendChild(acts);
        ms.appendChild(row);
      });
      root.appendChild(ms);
    }
  }
  /** Fenêtre « Partager » d'une stratégie : copie pour une autre équipe du club, lien public, téléchargement.
      Deux interrupteurs remplacent les trois modes : rien = dans l'appli seulement, Téléchargement = téléchargeable,
      Téléchargement + Lien public = partage libre. */
  async function openShare(row, refresh, canMode, canClub) {
    const body = $('#strat-share-body');
    $('#strat-share-title').textContent = 'Partager';
    let clubTeams = [];
    if (canClub && S.team.club_id) {
      const { data } = await sb.from('teams').select('id, name').eq('club_id', S.team.club_id).neq('id', row.team_id).order('name');
      clubTeams = data || [];
    }
    const sent = new Set();
    // Un seul enregistrement pour le mode et le lien (le lien public n'existe qu'en partage libre)
    const apply = async (mode, link, msg) => {
      const token = link ? (row.share_token || Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('')) : null;
      const { error } = await sb.from('drawings').update({ share_mode: mode, share_token: token }).eq('id', row.id);
      if (error) { E.toast(errMsg(error)); return draw(); }
      row.share_mode = mode; row.share_token = token;
      track('share_mode', { mode, link: !!token }); E.toast(msg); refresh(); draw();
    };
    const switchRow = (title, help, on, disabled, onToggle) => {
      const r = el('div', 'share-switch');
      r.appendChild(el('div', 'grow', `<strong>${esc(title)}</strong><small>${esc(help)}</small>`));
      const sw = el('button', 'switch'); sw.type = 'button'; sw.setAttribute('role', 'switch'); sw.setAttribute('aria-checked', String(on)); sw.setAttribute('aria-label', title); sw.disabled = disabled;
      sw.onclick = () => { sw.disabled = true; onToggle(!on); };
      r.appendChild(sw); return r;
    };
    const draw = () => {
      body.replaceChildren();
      body.appendChild(el('p', 'share-what', esc(row.title)));
      // 1. Copie pour une autre équipe du club (rangée qui défile quand le club a beaucoup d'équipes)
      if (canClub) {
        const c = el('div', 'share-part');
        c.appendChild(el('strong', 'share-part-title', 'Envoyer une copie à'));
        if (clubTeams.length) {
          const strip = el('div', 'team-strip');
          clubTeams.forEach(t => {
            const done = sent.has(t.id);
            const tb = btn(done ? `✓ ${t.name}` : t.name, 'chip' + (done ? ' sent' : ''), async () => {
              if (sent.has(t.id)) return;
              tb.disabled = true;
              const { data: nid, error: e } = await sb.rpc('share_drawing', { p_drawing: row.id, p_team: t.id });
              tb.disabled = false;
              if (e) return E.toast(errMsg(e));
              if (window.RugbyPush) window.RugbyPush.notify(nid, 'proposed');
              track('share_team'); sent.add(t.id);
              tb.textContent = `✓ ${t.name}`; tb.classList.add('sent');
              E.toast(`Copie envoyée à « ${t.name} ».`);
            });
            strip.appendChild(tb);
          });
          c.appendChild(strip);
          c.appendChild(el('p', 'help', 'L’équipe la reçoit dans ses propositions et peut la modifier. Votre original ne change pas.'));
        } else c.appendChild(el('p', 'help', 'Votre club n’a pas encore d’autre équipe.'));
        body.appendChild(c);
      }
      // 2. Lien public et 3. téléchargement
      if (canMode) {
        const eff = shareMode(row), dl = eff !== 'app', link = eff === 'public' && !!row.share_token;
        const p = el('div', 'share-part');
        p.appendChild(switchRow('Lien public', dl ? 'N’importe qui avec le lien la voit, même sans compte.' : 'Activez d’abord le téléchargement.', link, !dl,
          on => apply(on ? 'public' : 'download', on, on ? 'Lien public activé.' : 'Lien public arrêté : il ne fonctionne plus.')));
        if (link) p.appendChild(btn('Copier le lien', 'outline small share-copy', () => shareLink(row)));
        p.appendChild(switchRow('Téléchargement', 'Les joueurs peuvent télécharger (image, vidéo, PDF) et copier la stratégie.', dl, false,
          on => apply(on ? 'download' : 'app', false, on ? 'Téléchargement autorisé.' : `Dans l’appli seulement${link ? ', le lien public est arrêté' : ''}.`)));
        body.appendChild(p);
      } else if (canClub) body.appendChild(el('p', 'help', 'Lien public et téléchargement : publiez d’abord la stratégie à l’équipe.'));
      body.appendChild(btn('Terminé', 'ghost wide', () => E.closeModal('modal-strat-share')));
    };
    draw();
    E.openModal('modal-strat-share');
  }

  /** Notification push d'adhésion : nouvelle demande (au staff) ou demande acceptée (à la personne). */
  const pushJoin = (kind, teamId, userId, asUser) => { if (sb.functions) sb.functions.invoke('push-notify', { body: Object.assign({ kind, team_id: teamId, user_id: userId }, asUser && asUser !== S.user.id ? { as_user: asUser } : {}) }).catch(() => {}); };
  async function requestTeam(t, as) {
    const { error } = await sb.rpc('request_team', Object.assign({ p_team: t.id, p_as: as }, forArg(actorId())));
    if (error) return E.toast(errMsg(error));
    pushJoin('join_request', t.id, undefined, actorId());
    track('club_request', { count: 1 });
    E.toast(`Demande envoyée à « ${t.name} »${as === 'staff' ? ' comme coach / encadrant' : ''}.`);
    await loadTeams(); renderTeamPage();
  }

  async function leaveTeam(t) {
    const others = S.teams.filter(x => x.id !== t.id && !x.superadmin).map(x => x.name);
    if (!await window.RugbyDialog.confirm(`Quitter « ${t.name} » ?${others.length ? ` Vous restez membre de ${others.join(', ')}.` : ''}`, { title: 'Quitter l’équipe', ok: 'Quitter', danger: true })) return;
    const { error } = await sb.from('team_members').delete().match({ team_id: t.id, user_id: actorId() });
    if (error) return E.toast(errMsg(error));
    teamTab = 'members'; E.toast(`Vous avez quitté « ${t.name} ».`); await loadTeams(); renderTeamPage();
  }

  /** Onglet Réglages : l'équipe, le code d'invitation, le partage, la feuille, mon appartenance, la zone sensible. */
  function teamSettings(staff) {
    const t = S.team;
    const grid = el('div', 'settings-grid');
    // Toutes les cartes suivent le même plan : titre, explication, contenu, actions en bas
    const card = (title, help, cls) => {
      const c = el('div', 'team-forms-card set-card' + (cls ? ' ' + cls : ''));
      c.appendChild(el('h4', 'set-title', esc(title)));
      const p = el('p', 'set-help', help); c.appendChild(p); c.help = p;
      c.foot = el('div', 'set-foot'); c.appendChild(c.foot);
      grid.appendChild(c); return c;
    };
    if (staff) {
      const c = card('L’équipe', 'Le nom affiché à tous les membres, dans l’agenda et sur les feuilles de match.');
      const name = el('input', 'set-input'); name.value = t.name; name.maxLength = 60; name.setAttribute('aria-label', 'Nom de l’équipe');
      const save = btn('Enregistrer', 'outline small', async () => {
        const v = name.value.trim(); if (!v || v === t.name) return;
        const { error } = await sb.from('teams').update({ name: v }).eq('id', t.id);
        if (error) return E.toast(errMsg(error));
        S.teams.forEach(x => { if (x.id === t.id) x.name = v; }); t.name = v;
        track('team_rename'); E.toast('Nom enregistré.'); renderAccountButton(); renderTeamPage();
      });
      name.onkeydown = e => { if (e.key === 'Enter') save.click(); };
      c.foot.append(name, save);
    }
    // Le code est visible de tous : un joueur peut aussi inviter, le staff valide ensuite
    const code = card(`Code de l’équipe ${t.name}`, (staff ? 'Avec ce code, une personne demande directement à rejoindre cette équipe ; vous validez sa demande dans Membres.' : 'Les personnes que vous invitez devront être acceptées par le staff.') + (t.club_id ? ' Pour rejoindre le club et choisir ses équipes, c’est le code du club (onglet Club).' : ''));
    code.insertBefore(el('div', 'code-big', esc(t.join_code)), code.foot);
    code.foot.appendChild(btn('Inviter', 'primary small', shareCode));
    if (staff) code.foot.appendChild(btn('Nouveau code', 'outline small', async () => {
      if (!await window.RugbyDialog.confirm(`Générer un nouveau code ? L’ancien (${t.join_code}) ne marchera plus.`, { ok: 'Nouveau code' })) return;
      const { data, error } = await sb.rpc('regenerate_join_code', { p_team: t.id });
      if (error) return E.toast(errMsg(error));
      S.teams.forEach(x => { if (x.id === t.id) x.join_code = data; }); t.join_code = data;
      track('team_new_code'); E.toast('Nouveau code : ' + data); renderTeamPage();
    }));
    if (staff) {
      const cur = t.share_default || 'public';
      const share = card('Partage des stratégies', esc(SHARE[cur].desc) + ' Modifiable stratégie par stratégie.');
      share.foot.appendChild(shareDefaultSelect(desc => { share.help.textContent = desc + ' Modifiable stratégie par stratégie.'; }));
      const sheet = card('Feuille de match', 'Logo, couleurs, modèle, champs et repères imprimés sur la feuille de match.');
      sheet.foot.appendChild(btn('Personnaliser la feuille', 'outline small', () => { if (window.RugbySheets && window.RugbySheets.openSettings) window.RugbySheets.openSettings(); }));
      reminderCard(card('Rappel la veille', 'La veille de chaque match et entraînement, une notification : « À demain » pour les présents, « Vous n’avez pas répondu » pour les autres. Rien pour les absents.'), t);
    }
    // Mon appartenance : on quitte toujours l'équipe affichée, et on sait où l'on reste
    const others = S.teams.filter(x => x.id !== t.id && !x.superadmin).map(x => x.name);
    const me = card('Mon appartenance', `Vous êtes ${(ROLE_LABEL[t.role] || t.role).toLowerCase()} de ${esc(t.name)}${others.length ? ` et membre de ${others.map(esc).join(', ')}` : ''}.`);
    if (!t.superadmin) me.foot.appendChild(btn(`Quitter « ${t.name} »`, 'outline small danger', () => leaveTeam(t)));
    if (isClubAdmin(t.club_id)) {   // supprimer une équipe : direction du club seulement
      const z = card('Zone sensible', 'Supprime l’équipe, ses membres et ses stratégies publiées. Irréversible.', 'danger-zone');
      z.foot.appendChild(btn('Supprimer l’équipe', 'outline small danger', async () => {
        if (!await window.RugbyDialog.confirm(`Supprimer définitivement « ${t.name} », ses membres et ses stratégies publiées ?`)) return;
        const { error } = await sb.from('teams').delete().eq('id', t.id);
        if (error) return E.toast(errMsg(error));
        teamTab = 'members'; E.toast('Équipe supprimée.'); await loadTeams(); renderTeamPage();
      }));
    }
    return grid;
  }

  /** Rappel automatique la veille (staff) : activé ou non, et à quelle heure (heure de Paris). Chargé à part. */
  async function reminderCard(c, t) {
    const { data, error } = await sb.from('teams').select('reminder_enabled, reminder_hour').eq('id', t.id).maybeSingle();
    if (error || !data) { c.foot.appendChild(el('p', 'muted small', 'Réglage indisponible pour le moment.')); return; }
    const on = el('label', 'check', '<input type="checkbox"> Envoyer le rappel');
    const box = on.querySelector('input'); box.checked = data.reminder_enabled;
    const hour = el('select', 'select small'); hour.setAttribute('aria-label', 'Heure du rappel');
    for (let h = 8; h <= 21; h++) { const o = el('option'); o.value = h; o.textContent = `à ${h} h`; o.selected = h === data.reminder_hour; hour.appendChild(o); }
    if (![...hour.options].some(o => o.selected)) { const o = el('option'); o.value = data.reminder_hour; o.textContent = `à ${data.reminder_hour} h`; o.selected = true; hour.appendChild(o); }
    hour.disabled = !box.checked;
    const saveIt = async patch => {
      const { error: e } = await sb.from('teams').update(patch).eq('id', t.id);
      if (e) { E.toast(errMsg(e)); return false; }
      track('reminder_setting', patch); return true;
    };
    box.onchange = async () => { if (await saveIt({ reminder_enabled: box.checked })) { hour.disabled = !box.checked; E.toast(box.checked ? `Rappel activé, la veille à ${hour.value} h.` : 'Rappel de la veille désactivé.'); } else box.checked = !box.checked; };
    hour.onchange = async () => { if (await saveIt({ reminder_hour: +hour.value })) E.toast(`Rappel envoyé la veille à ${hour.value} h.`); };
    c.foot.append(on, hour);
  }

  /** Liste du partage par défaut des stratégies de l'équipe (staff). onDesc reçoit l'explication du mode choisi. */
  function shareDefaultSelect(onDesc) {
    const cur = S.team.share_default || 'public';
    const sel = el('select', 'select'); sel.setAttribute('aria-label', 'Partage des stratégies par défaut');
    ['app', 'download', 'public'].forEach(m => { const o = el('option'); o.value = m; o.textContent = SHARE[m].label; o.selected = m === cur; sel.appendChild(o); });
    sel.onchange = async () => {
      const { error } = await sb.from('teams').update({ share_default: sel.value }).eq('id', S.team.id);
      if (error) { E.toast(errMsg(error)); sel.value = S.team.share_default || 'public'; return; }
      S.team.share_default = sel.value; const t = S.teams.find(x => x.id === S.team.id); if (t) t.share_default = sel.value;
      onDesc(SHARE[sel.value].desc);
      track('share_default', { mode: sel.value });
      E.toast(`Par défaut : ${SHARE[sel.value].label.toLowerCase()}.`);
    };
    return sel;
  }

  async function renderMembers(list, staff, seq) {
    list.classList.remove('library-list'); list.classList.add('member-list');
    const { data: rows, error } = await sb.from('team_members').select('user_id, role, status, plays, requested_as, joined_at, profiles!team_members_user_profile_fk(display_name, avatar, positions, jersey_number, guardian_id)').eq('team_id', S.team.id);
    if (seq !== teamSeq) return;
    if (error) { list.appendChild(window.RugbyOffline && window.RugbyOffline.isNetwork(error) ? window.RugbyOffline.card(() => renderTeamPage()) : el('p', 'library-empty', 'Erreur : ' + errMsg(error))); return; }
    const nameOf = m => (m.profiles && m.profiles.display_name) || 'Membre';
    const order = { coach: 0, admin: 1, player: 2 };
    const members = rows.filter(m => m.status === 'active').sort((a, b) => (order[a.role] - order[b.role]) || nameOf(a).localeCompare(nameOf(b)));
    const pending = rows.filter(m => m.status === 'pending');
    const setMember = async (m, patch, confirmMsg) => {
      if (confirmMsg && !await window.RugbyDialog.confirm(confirmMsg)) return;
      const q = patch ? sb.from('team_members').update(patch) : sb.from('team_members').delete();
      const { error } = await q.match({ team_id: S.team.id, user_id: m.user_id });
      if (error) E.toast(errMsg(error));
      else if (patch && patch.status === 'active' && m.status === 'pending') pushJoin('join_accepted', S.team.id, m.user_id);
      renderTeamPage();
    };
    if (staff && pending.length) {
      list.appendChild(el('h4', 'home-h4', `Demandes d’adhésion (${pending.length})`));
      pending.forEach(m => {
        const row = el('div', 'member-row pending');
        row.appendChild(el('div', 'avatar', esc(nameOf(m).trim().slice(0, 1).toUpperCase() || '?')));
        const asStaff = m.requested_as === 'staff';
        row.appendChild(el('div', 'who', `${esc(nameOf(m))}<small>Demande du ${new Date(m.joined_at).toLocaleDateString('fr-FR')} · ${asStaff ? 'comme coach / encadrant' : 'comme joueur'}</small>`));
        const acts = el('div', 'member-actions');
        // Une demande « comme coach / encadrant » acceptée donne le rôle Coach (modifiable ensuite)
        acts.appendChild(btn('Accepter', 'primary small', () => setMember(m, asStaff ? { status: 'active', role: 'coach' } : { status: 'active' })));
        acts.appendChild(btn('Refuser', 'outline small danger', () => setMember(m, null, `Refuser la demande ${de(nameOf(m))}${nameOf(m)} ?`)));
        row.appendChild(acts);
        list.appendChild(row);
      });
    }
    const head = el('div', 'members-head', `<span class="muted">${members.length} membre${members.length > 1 ? 's' : ''}</span>`);
    head.appendChild(btn('Inviter', 'primary small', shareCode));
    list.appendChild(head);
    members.forEach(m => {
      const name = nameOf(m);
      const row = el('div', 'member-row clickable');
      const P = window.RugbyProfile, pr = m.profiles || {};
      row.appendChild(P ? P.avatar(name, pr.avatar) : el('div', 'avatar', esc(name.trim().slice(0, 1).toUpperCase() || '?')));
      row.appendChild(el('div', 'who', `${esc(name)}${m.user_id === actorId() ? ' (moi)' : ''}<small>${esc((P && P.summary(pr)) || 'Membre depuis le ' + new Date(m.joined_at).toLocaleDateString('fr-FR'))}${pr.guardian_id && staff ? ' · compte géré par un parent' : ''}</small>`));
      row.title = 'Voir la fiche';
      row.onclick = e => { if (e.target.closest('select, button')) return; if (P) P.viewMember(m.user_id, m.role); };
      if (window.RugbyA11y && window.RugbyA11y.clickable) window.RugbyA11y.clickable(row.querySelector('.who'), `Fiche de ${name}`);
      // « Joue aussi » : seul le staff le coche, pour un coach ou un admin (il devient convoqué comme un joueur)
      const playsToggle = () => {
        const l = el('label', 'plays-toggle' + (m.plays ? ' on' : ''), '<input type="checkbox"> Joue aussi');
        const cb = l.querySelector('input'); cb.checked = !!m.plays;
        l.title = 'Convoqué aux matchs et entraînements comme un joueur';
        l.onclick = e => e.stopPropagation();
        cb.onchange = () => setMember(m, { plays: cb.checked });
        return l;
      };
      if (staff && m.user_id !== actorId()) {
        const sel = el('select', 'select small');
        [['player', 'Joueur'], ['coach', 'Coach'], ['admin', 'Admin']].forEach(([v, l]) => { const o = el('option'); o.value = v; o.textContent = l; o.selected = m.role === v; sel.appendChild(o); });
        sel.setAttribute('aria-label', `Rôle ${de(name)}${name}`);
        sel.onclick = e => e.stopPropagation();
        // Changer un rôle donne ou retire des droits : on confirme (un geste de travers ne suffit plus)
        sel.onchange = async () => {
          const label = sel.options[sel.selectedIndex].textContent;
          if (!await window.RugbyDialog.confirm(`${name} devient ${label.toLowerCase()} de « ${S.team.name} ».`, { title: 'Changer le rôle ?', ok: 'Changer le rôle' })) { sel.value = m.role; return; }
          setMember(m, { role: sel.value });
        };
        // Rôle et « Joue aussi » visibles ; « Retirer » rangé dans le menu ⋯ (action rare et sensible)
        const acts = el('div', 'member-actions');
        acts.appendChild(sel);
        if (m.role !== 'player') acts.appendChild(playsToggle());
        const more = moreMenu([[`Retirer ${name} de l’équipe`, () => setMember(m, null, `Retirer ${name} de l’équipe ?`)]], name);
        more.addEventListener('click', e => e.stopPropagation());
        acts.appendChild(more);
        row.appendChild(acts);
      } else if (staff && m.role !== 'player') {
        // Ma propre ligne de coach / admin : mon rôle + la case pour me convoquer moi-même
        const acts = el('div', 'member-actions');
        acts.appendChild(el('span', 'role-badges', roleBadge(m.role)));
        acts.appendChild(playsToggle());
        row.appendChild(acts);
      } else row.appendChild(el('span', 'role-badges', roleBadge(m.role, m.plays)));
      list.appendChild(row);
    });
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
    const d = E.drawing, first = !S.current.owner_id;
    if (!isUuid(d.id)) d.id = crypto.randomUUID();
    // Premier enregistrement sans nom : on le demande (sinon tout s'appelle « Nouveau dessin »)
    let title = $('#title').value.trim();
    if (!title || /^(Nouveau dessin|Sans titre)$/.test(title)) {
      const v = await window.RugbyDialog.prompt('Nom de la stratégie', '', { title: 'Enregistrer', placeholder: 'Ex. Touche à 5, Croisée 10-12', ok: 'Enregistrer', maxLength: 60 });
      if (v === null) return;
      title = v; $('#title').value = v;
    }
    d.title = title;
    const row = { id: d.id, title: d.title, data: d, owner_id: S.current.owner_id || actorId(), team_id: S.current.team_id || (S.team ? S.team.id : null), visibility: S.current.visibility || 'private' };
    const { error } = await sb.from('drawings').upsert(row);
    if (error) { E.toast('Sauvegarde impossible : ' + errMsg(error)); return; }
    S.current.owner_id = S.current.owner_id || actorId(); S.current.team_id = row.team_id;
    E.afterChange(); if (E.markSaved) E.markSaved();
    track('save', { steps: (d.steps || []).length, visibility: row.visibility });
    // Coach, premier enregistrement d'un dessin : on propose tout de suite de le publier à l'équipe
    if (first && row.visibility === 'private' && isCoach() && S.team && row.owner_id === actorId()) {
      if (await window.RugbyDialog.confirm(`Dessin enregistré. Le publier à l’équipe « ${S.team.name} » ? Les joueurs seront prévenus.`, { title: 'Publier à l’équipe ?', ok: 'Publier à l’équipe', cancel: 'Plus tard' })) {
        const patch = { visibility: 'team', team_id: S.team.id, published_at: new Date().toISOString() };
        const { error: e2 } = await sb.from('drawings').update(patch).eq('id', d.id);
        if (e2) return E.toast(errMsg(e2));
        S.current.visibility = 'team'; S.current.team_id = S.team.id;
        if (window.RugbyPush) window.RugbyPush.notify(d.id, 'published');
        track('publish', { steps: (d.steps || []).length, category: d.category || '', from: 'editor' });
        E.toast(`Publié dans « ${S.team.name} » : toute l’équipe peut la voir.`);
      }
      return;
    }
    E.toast(row.visibility === 'team' ? 'Stratégie mise à jour pour l’équipe.' : 'Dessin enregistré dans votre compte.');
  }
  async function saveSmart() {
    if (E.drawing.__share === 'app' && !isCoach()) { E.toast('Le coach a réservé cette stratégie à l’appli : elle ne peut pas être copiée.'); return; }
    if (S.user && S.current.owner_id && S.current.owner_id !== actorId() && !(isCoach() && S.current.team_id === S.team.id)) {
      E.drawing.id = crypto.randomUUID(); S.current = { visibility: 'private', team_id: null, owner_id: actorId() };
    }
    return save();
  }
  function onNewDrawing() { S.current = { visibility: 'private', team_id: null, owner_id: null }; if (S.user) E.drawing.id = crypto.randomUUID(); }

  /* ---------- Formations enregistrées (par équipe) ---------- */
  async function saveFormation(name, data) {
    const row = { owner_id: actorId(), team_id: S.team ? S.team.id : null, name, data };
    const { error } = await sb.from('formations').insert(row);
    if (error) { E.toast('Enregistrement impossible : ' + errMsg(error)); return; }
    E.toast(S.team ? `Formation « ${name} » enregistrée pour « ${S.team.name} ».` : `Formation « ${name} » enregistrée dans votre compte.`);
  }
  async function listFormations() {
    if (!S.user) { openAuth(); return { list: [], scope: '' }; }
    let q = sb.from('formations').select('id, name, data, team_id, owner_id, created_at, owner:profiles!formations_owner_id_fkey(display_name)').order('created_at', { ascending: false });
    if (S.team) q = q.or(`team_id.eq.${S.team.id},owner_id.eq.${actorId()}`);
    else q = q.eq('owner_id', actorId());
    const { data, error } = await q;
    if (error) { E.toast(errMsg(error)); return { list: [], scope: '' }; }
    const list = (data || []).map(f => ({
      id: f.id, name: f.name, data: f.data,
      team_name: f.team_id ? ((S.teams.find(t => t.id === f.team_id) || {}).name || 'équipe') : 'perso',
      owner_name: f.owner && f.owner.display_name,
      canDelete: f.owner_id === actorId() || (isStaff() && S.team && f.team_id === S.team.id)
    }));
    return { list, scope: S.team ? `Équipe « ${S.team.name} » et mes formations` : 'Mes formations' };
  }
  async function deleteFormation(id) {
    const { error } = await sb.from('formations').delete().eq('id', id);
    if (error) E.toast(errMsg(error));
  }

  /* ---------- Droits de partage (choisis par le coach) ---------- */
  const SHARE = {
    app: { label: 'Dans l’appli seulement', desc: 'Les joueurs regardent dans l’appli : pas de téléchargement, pas de copie, pas de lien public.' },
    download: { label: 'Téléchargeable', desc: 'Les joueurs peuvent télécharger (image, GIF, vidéo, PDF) et en faire une copie. Pas de lien public.' },
    public: { label: 'Partage libre', desc: 'Téléchargement, copie et lien public autorisés.' }
  };
  const teamDefault = teamId => ((S.teams.find(t => t.id === teamId) || {}).share_default) || 'public';
  /** Mode effectif d'une stratégie : son propre réglage, sinon celui de l'équipe. */
  const shareMode = row => row.share_mode || teamDefault(row.team_id);


  /* ---------- Lien de partage public ---------- */
  async function fetchShared(token) {
    const { data, error } = await sb.rpc('get_shared_drawing', { p_token: token });
    if (error) { console.warn(error); return null; }
    return data;
  }
  const shareUrl = token => `${location.origin}${location.pathname}#/s/${token}`;

  function shareLink(row) {
    const url = shareUrl(row.share_token);
    const text = `Stratégie « ${row.title} » : ${url}`;
    if (navigator.share) navigator.share({ title: row.title, text, url }).catch(() => {});
    else if (navigator.clipboard) { navigator.clipboard.writeText(url); E.toast('Lien copié : ' + url); }
    else window.RugbyDialog.copy(url, { title: 'Lien de partage' });
  }

  /* ---------- Qui a vu quoi ---------- */
  // Chaque ouverture d'une stratégie publiée est enregistrée ; le staff voit qui l'a regardée.
  const markViewed = (id, played) => { sb.rpc('mark_drawing_viewed', Object.assign({ p_drawing: id, p_played: !!played }, forArg(actorId()))).then(({ error }) => { if (error) console.warn('vue', error.message); }); };
  function onPreview() {
    if (S.user && S.current.visibility === 'team' && S.current.owner_id && S.current.owner_id !== actorId() && isUuid(E.drawing.id)) markViewed(E.drawing.id, true);
  }
  let viewCounts = {};
  async function loadViewCounts() {
    viewCounts = {};
    if (!S.team || !isStaff()) return;
    const { data } = await sb.rpc('team_view_counts', { p_team: S.team.id });
    (data || []).forEach(r => { viewCounts[r.drawing_id] = r; });
  }
  let viewsFor = null;
  async function openViews(row) {
    viewsFor = row;
    $('#views-title').textContent = `Qui a vu · ${row.title}`;
    E.openModal('modal-views');
    const list = $('#views-list'); list.replaceChildren(el('p', 'muted', 'Chargement…'));
    const { data, error } = await sb.rpc('drawing_view_stats', { p_drawing: row.id });
    if (error) { list.replaceChildren(el('p', 'library-empty', errMsg(error))); return; }
    const seen = data.filter(r => r.first_seen_at), notSeen = data.filter(r => !r.first_seen_at);
    const pct = data.length ? Math.round(100 * seen.length / data.length) : 0;
    list.replaceChildren();
    const head = el('div', 'views-head', `<div><strong>${seen.length} sur ${data.length}</strong> ${seen.length > 1 ? 'ont' : 'a'} ouvert la stratégie</div><span class="views-bar"><i style="width:${pct}%"></i></span>`);
    list.appendChild(head);
    if (!data.length) { list.appendChild(el('p', 'muted', 'Aucun autre membre dans l’équipe pour le moment.')); return; }
    const section = (title, rows, fn) => { if (!rows.length) return; list.appendChild(el('h4', 'home-h4', title)); rows.forEach(r => list.appendChild(fn(r))); };
    const avatar = n => el('div', 'avatar', esc((n || '?').trim().slice(0, 1).toUpperCase() || '?'));
    section(`Pas encore vu (${notSeen.length})`, notSeen, r => {
      const row = el('div', 'member-row view-row no'); row.append(avatar(r.display_name), el('div', 'who', `${esc(r.display_name || 'Membre')}<small>${ROLE_LABEL[r.role] || r.role}</small>`), el('span', 'view-state no', 'Pas vu')); return row;
    });
    section(`Ont vu (${seen.length})`, seen.sort((a, b) => new Date(b.last_seen_at) - new Date(a.last_seen_at)), r => {
      const detail = `Vu le ${fmtDate(r.first_seen_at)}${r.views > 1 ? ` · ${r.views} ouvertures` : ''}${r.played ? ' · animation lue' : ''}`;
      const row = el('div', 'member-row view-row'); row.append(avatar(r.display_name), el('div', 'who', `${esc(r.display_name || 'Membre')}<small>${detail}</small>`), el('span', 'view-state', '✓ Vu')); return row;
    });
    const actions = $('#views-actions'); actions.replaceChildren();
    if (notSeen.length) {
      actions.appendChild(btn(`Relancer ${notSeen.length > 1 ? 'les ' + notSeen.length + ' joueurs' : 'le joueur'} qui n’${notSeen.length > 1 ? 'ont' : 'a'} pas vu`, 'primary', async () => {
        const { data: res, error: err } = await sb.functions.invoke('push-notify', { body: { drawing_id: row.id, kind: 'reminder' } });
        if (err) return E.toast('Relance impossible : ' + errMsg(err));
        track('reminder', { recipients: res && res.recipients });
        E.toast(res && res.sent ? `Rappel envoyé sur ${res.sent} téléphone${res.sent > 1 ? 's' : ''}.` : 'Aucun de ces joueurs n’a activé les notifications : utilisez « Copier la liste » pour WhatsApp.');
      }));
      actions.appendChild(btn('Copier la liste pour WhatsApp', 'outline', () => {
        const text = `À regarder avant le match : « ${row.title} » dans l’appli. Pas encore vu : ${notSeen.map(r => r.display_name).join(', ')}.`;
        if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => E.toast('Message copié : collez-le dans le groupe WhatsApp.'));
        else window.RugbyDialog.copy(text, { title: 'Message à copier' });
      }));
    }
  }

  /* ---------- Commentaires ---------- */
  let commentCounts = {};
  async function loadCommentCounts(ids) {
    commentCounts = {};
    if (!ids.length) return;
    const { data } = await sb.from('drawing_comments').select('drawing_id').in('drawing_id', ids);
    (data || []).forEach(c => { commentCounts[c.drawing_id] = (commentCounts[c.drawing_id] || 0) + 1; });
  }
  let commentsFor = null;
  async function openComments(row, refresh) {
    commentsFor = { row, refresh };
    $('#comments-title').textContent = `Commentaires · ${row.title}`;
    E.openModal('modal-comments');
    await renderComments();
  }
  async function renderComments() {
    const list = $('#comments-list'); list.replaceChildren();
    const { data, error } = await sb.from('drawing_comments').select('id, user_id, body, created_at, author:profiles!drawing_comments_user_id_fkey(display_name)').eq('drawing_id', commentsFor.row.id).order('created_at');
    if (error) { list.appendChild(el('p', 'library-empty', errMsg(error))); return; }
    if (!data.length) list.appendChild(el('p', 'muted', 'Aucun commentaire. Posez une question au coach ou faites une remarque.'));
    const coachIds = new Set();
    data.forEach(c => {
      const item = el('div', 'comment');
      const who = el('div', 'who', `<strong>${esc((c.author && c.author.display_name) || 'Membre')}</strong>${c.user_id === commentsFor.row.owner_id ? '<span class="role-badge coach">auteur</span>' : ''} <span>${fmtDate(c.created_at)}</span>`);
      if (c.user_id === actorId() || isStaff()) { const del = el('button', 'del', '✕'); del.title = 'Supprimer'; del.onclick = async () => { if (!await window.RugbyDialog.confirm('Supprimer ce commentaire ?')) return; await sb.from('drawing_comments').delete().eq('id', c.id); renderComments(); }; who.appendChild(del); }
      item.appendChild(who); item.appendChild(el('div', 'body', esc(c.body)));
      list.appendChild(item);
    });
    list.scrollTop = list.scrollHeight;
  }
  $('#comments-form').onsubmit = async e => {
    e.preventDefault();
    const body = $('#comments-input').value.trim(); if (!body || !commentsFor) return;
    const { error } = await sb.from('drawing_comments').insert({ drawing_id: commentsFor.row.id, user_id: actorId(), body });
    if (error) return E.toast(errMsg(error));
    $('#comments-input').value = ''; track('comment', { coach: isCoach() }); await renderComments();
    commentCounts[commentsFor.row.id] = (commentCounts[commentsFor.row.id] || 0) + 1;
    if (commentsFor.refresh) commentsFor.refresh();
  };

  /* ---------- Noms des membres (pour nommer les joueurs) ---------- */
  const namesCache = {};
  async function memberNames() {
    if (!S.user || !S.team) return [];
    if (namesCache[S.team.id]) return namesCache[S.team.id];
    const { data } = await sb.from('team_members').select('status, profiles!team_members_user_profile_fk(display_name)').eq('team_id', S.team.id);
    const names = (data || []).filter(m => m.status === 'active' && m.profiles).map(m => m.profiles.display_name).sort();
    namesCache[S.team.id] = names; return names;
  }

  /* ---------- Page Stratégies ---------- */
  let libTab = null;   // au premier affichage : « De l’équipe » pour un joueur, « Mes dessins » pour le staff
  let renderSeq = 0, lastStratsKey = '';
  async function renderStrats() {
    const seq = ++renderSeq;
    const tabs = $('#home-tabs'); tabs.replaceChildren();
    // Même onglet, même équipe (après une publication…) : on garde la liste affichée pendant le rechargement
    const root = $('#home-list'), key = `${libTab}|${S.team ? S.team.id : ''}|${S.user ? S.user.id : ''}`;
    if (key !== lastStratsKey) root.replaceChildren(); else root.classList.add('refreshing');
    lastStratsKey = key;
    if (!S.user) {
      root.replaceChildren();
      tabs.classList.add('hidden');
      const box = el('div', 'home-login', '<p>Sans compte, vos dessins restent sur cet appareil. Créez un compte gratuit pour les retrouver partout et les partager à votre équipe.</p>');
      box.appendChild(btn('Créer un compte gratuit', 'primary', () => openAuth('signup')));
      root.appendChild(box);
      const local = E.readLib();
      if (local.length) { root.appendChild(el('h4', 'home-h4', 'Sur cet appareil')); local.forEach(d => root.appendChild(E.localCard(d, () => { S.current = { visibility: 'private', team_id: null, owner_id: null }; E.loadDrawing(E.clone(d)); E.go('editor'); }))); }
      return;
    }
    if (!isClubMember()) {
      root.replaceChildren();
      tabs.classList.add('hidden');
      const box = el('div', 'home-login', '<p><strong>Dernière étape : rejoignez votre club.</strong><br>Entrez le code donné par votre club ou votre coach (code du club ou d’une équipe). Ensuite vous pourrez enregistrer, exporter et partager vos dessins.</p>');
      box.appendChild(btn('Rejoindre mon club', 'primary', () => E.go('team')));
      root.appendChild(box);
      const pend = pendingCard(); if (pend) root.appendChild(pend);
      return;
    }
    tabs.classList.remove('hidden');
    // Propositions des joueurs : un onglet pour le coach (avec leur nombre)
    let proposals = 0;
    if (isCoach() && S.team) { const { count } = await sb.from('drawings').select('id', { count: 'exact', head: true }).eq('team_id', S.team.id).eq('visibility', 'proposed'); proposals = count || 0; }
    if (seq !== renderSeq) return;
    if (!libTab) libTab = isStaff() ? 'mine' : 'team';
    if (libTab === 'proposed' && !isCoach()) libTab = 'mine';
    const defs = isStaff() ? [['mine', 'Mes dessins'], ['team', 'De l’équipe']] : [['team', 'De l’équipe'], ['mine', 'Mes dessins']];
    if (isCoach()) defs.push(['proposed', 'Propositions']);
    // « Sur cet appareil » : seulement s'il reste des dessins faits sans compte (pour les envoyer dans le compte)
    const localCount = E.readLib().length;
    if (localCount) defs.push(['local', 'Sur cet appareil']); else if (libTab === 'local') libTab = 'mine';
    defs.forEach(([id, label]) => {
      const b = el('button', 'tab' + (libTab === id ? ' active' : '')); b.textContent = label;
      const n = id === 'team' ? S.unseen : id === 'proposed' ? proposals : 0;
      if (n) b.appendChild(el('span', 'nav-badge tab-badge', String(n)));
      b.onclick = () => { libTab = id; renderStrats(); }; tabs.appendChild(b);
    });
    if (libTab === 'local') { root.replaceChildren(); root.classList.remove('refreshing'); renderLocal(root); return; }
    if (libTab === 'team' || libTab === 'proposed') {
      if (!S.team) { root.replaceChildren(); root.classList.remove('refreshing'); root.appendChild(teamForms()); return; }
      if (libTab === 'team') markSeen();
    }
    let q = sb.from('drawings').select('id, title, data, visibility, team_id, owner_id, published_at, updated_at, share_token, share_mode, owner:profiles!drawings_owner_profile_fk(display_name)').order(libTab === 'team' ? 'published_at' : 'updated_at', { ascending: false });
    q = libTab === 'mine' ? q.eq('owner_id', actorId()) : q.eq('team_id', S.team.id).eq('visibility', libTab === 'proposed' ? 'proposed' : 'team');
    const { data, error } = await q;
    if (seq !== renderSeq) return;
    if (error) { root.replaceChildren(); root.classList.remove('refreshing'); if (window.RugbyOffline && window.RugbyOffline.isNetwork(error)) root.appendChild(window.RugbyOffline.card(() => renderStrats())); else empty(root, 'Erreur : ' + errMsg(error)); return; }
    await Promise.all([loadCommentCounts(data.filter(r => r.visibility === 'team').map(r => r.id)), libTab === 'team' ? loadViewCounts() : null]);
    if (seq !== renderSeq) return;
    root.replaceChildren(); root.classList.remove('refreshing');
    if (!data.length) {
      empty(root, libTab === 'mine' ? 'Aucun dessin enregistré. Touchez « + Nouveau dessin », puis « Enregistrer » dans l’éditeur.'
        : libTab === 'proposed' ? 'Aucune proposition de joueur pour le moment. Les joueurs proposent leurs dessins depuis « Mes dessins ».'
        : isCoach() ? 'Aucune stratégie publiée dans cette équipe. Ouvrez un de vos dessins et touchez « Publier à l’équipe ».' : 'Le coach n’a encore rien publié dans cette équipe.');
      return;
    }
    const withMeta = data.map(r => Object.assign(r, { category: (r.data && r.data.category) || '', tags: (r.data && r.data.tags) || '' }));
    root.appendChild(E.filterBar(renderStrats, E.countByCat(withMeta)));
    const shown = E.filterDrawings(withMeta);
    if (!shown.length) { empty(root, 'Aucun dessin ne correspond à la recherche.'); return; }
    shown.forEach(row => root.appendChild(cloudCard(row, renderStrats)));
  }
  function empty(root, msg) { root.appendChild(el('p', 'library-empty', msg)); }

  function cloudCard(row, refresh) {
    const c = el('div', 'lib-card');
    const d = row.data || {}; const steps = (d.steps || []).length;
    const coachHere = isCoach() && S.team && row.team_id === S.team.id;
    const mine = row.owner_id === actorId();
    const vis = { private: 'Privé', proposed: 'Proposé au coach', team: 'Publié' }[row.visibility];
    c.innerHTML = `<div class="thumb"></div><div class="body"><span class="name"></span></div><div class="date"></div><div class="card-btns"></div>`;
    c.querySelector('.thumb').appendChild(E.thumbSvg(d.settings, ((d.steps || [])[0] || {}).objects || []));
    c.querySelector('.name').textContent = row.title;
    const cat = d.category ? `<span class="vis-badge cat">${esc(d.category)}</span> ` : '';
    const mode = row.visibility === 'team' ? shareMode(row) : null;
    const modeBadge = mode && mode !== 'public' ? `<span class="vis-badge share-${mode}">${SHARE[mode].label}</span> ` : '';
    c.querySelector('.date').innerHTML = `<span class="vis-badge ${row.visibility}">${vis}</span> ${modeBadge}${cat}${mine ? '' : esc((row.owner && row.owner.display_name) || '') + ' · '}${steps} étape${steps > 1 ? 's' : ''} · ${fmtDate(row.updated_at)}`;   // l'essentiel seulement : auteur (si ce n'est pas moi), étapes, date
    c.querySelector('.thumb').onclick = c.querySelector('.body').onclick = () => loadCloud(row);
    if (window.RugbyA11y && window.RugbyA11y.clickable) window.RugbyA11y.clickable(c.querySelector('.body'), `Ouvrir « ${row.title} »`);
    const btns = c.querySelector('.card-btns');
    const setVis = async visibility => {
      if (visibility !== 'private' && !S.team) { E.toast('Rejoignez ou créez d’abord une équipe.'); return; }
      const patch = { visibility, team_id: visibility === 'private' ? row.team_id : S.team.id };
      if (visibility === 'team') patch.published_at = new Date().toISOString();
      const { error } = await sb.from('drawings').update(patch).eq('id', row.id);
      if (error) return E.toast(errMsg(error));
      if (E.drawing.id === row.id) { S.current.visibility = visibility; S.current.team_id = patch.team_id; }
      if (visibility !== 'private' && window.RugbyPush) window.RugbyPush.notify(row.id, visibility === 'team' ? 'published' : 'proposed');
      if (visibility !== 'private') track(visibility === 'team' ? 'publish' : 'propose', { steps: ((row.data || {}).steps || []).length, category: (row.data || {}).category || '' });
      E.toast(visibility === 'team' ? `Publié dans « ${S.team.name} » : toute l’équipe peut la voir.` : visibility === 'proposed' ? `Proposé au coach de « ${S.team.name} ».` : 'Retiré, redevenu privé.');
      refresh();
    };
    // Une action principale visible ; le reste dans le menu « ⋯ » (la carte s'ouvre d'un appui)
    const menu = [];
    const duplicate = async () => {
      const copy = E.clone(row.data || {}); copy.id = crypto.randomUUID(); copy.title = row.title + ' (copie)';
      const { error } = await sb.from('drawings').insert({ id: copy.id, owner_id: actorId(), title: copy.title, data: copy, team_id: S.team ? S.team.id : null, visibility: 'private' });
      if (error) return E.toast(errMsg(error)); track('duplicate'); E.toast('Copie créée dans « Mes dessins ».'); libTab = 'mine'; refresh();
    };
    if (isCoach() && row.visibility !== 'team' && (mine || coachHere)) btns.appendChild(btn(row.visibility === 'proposed' ? 'Publier la proposition' : 'Publier à l’équipe', 'primary small', () => setVis('team')));
    if (!isCoach() && mine && S.team && row.visibility === 'private') btns.appendChild(btn('Proposer au coach', 'secondary small', () => setVis('proposed')));
    if (row.visibility === 'team') {
      const vc = viewCounts[row.id];
      if (vc && isStaff() && S.team && row.team_id === S.team.id) btns.appendChild(btn(`Vue par ${vc.viewers}/${vc.audience}`, (vc.audience && vc.viewers >= vc.audience ? 'secondary' : 'outline') + ' small', () => openViews(row))).title = 'Qui a vu cette stratégie';
      const n = commentCounts[row.id] || 0;
      btns.appendChild(btn(n ? `${n} commentaire${n > 1 ? 's' : ''}` : 'Commenter', 'outline small', () => openComments(row, refresh)));
    }
    if (row.owner_id !== actorId() && !isCoach()) menu.push(['Regarder', () => loadCloud(row)], ['Ouvrir dans l’éditeur', () => loadCloud(row, true)]);
    else menu.push(['Ouvrir', () => loadCloud(row)]);
    const canCopy = mine || isCoach() || mode !== 'app';
    if (canCopy) menu.push(['Dupliquer', duplicate]);
    // Tout le partage dans une seule fenêtre : ce que les joueurs peuvent faire, lien public, copie pour une autre équipe du club
    const canMode = row.visibility === 'team' && (mine || coachHere);
    const canClub = isStaff() && S.team && row.team_id === S.team.id;
    if (canMode || canClub) menu.push(['Partager…', () => openShare(row, refresh, canMode, canClub)]);
    else if (row.visibility === 'team' && mode === 'public' && row.share_token) menu.push(['Copier le lien public', () => shareLink(row)]);
    if (isCoach() && row.visibility === 'team' && coachHere) menu.push(['Retirer de l’équipe', () => setVis('private')]);
    if (!isCoach() && mine && row.visibility === 'proposed') menu.push(['Annuler la proposition', () => setVis('private')]);
    if (mine || coachHere) menu.push(['Supprimer', async () => {
      if (!await window.RugbyDialog.confirm(`Supprimer « ${row.title} » ?`)) return;
      const { error } = await sb.from('drawings').delete().eq('id', row.id);
      if (error) return E.toast(errMsg(error)); refresh();
    }, 'danger']);
    btns.appendChild(moreMenu(menu, row.title));
    return c;
  }

  /** Bouton « ⋯ » qui ouvre le menu des actions secondaires (même composant que les listes déroulantes). */
  function moreMenu(items, title) {
    const b = btn('⋯', 'outline small card-more', () => window.RugbySelect.openMenu(b, items, title));
    b.title = 'Plus d’actions'; b.setAttribute('aria-label', 'Plus d’actions'); b.setAttribute('aria-haspopup', 'menu');
    return b;
  }

  function loadCloud(row, toEditor) {
    const d = E.clone(row.data); d.id = row.id; d.title = row.title;
    // Joueur sur une stratégie du coach : on garde les droits choisis par le coach avec le dessin
    if (row.owner_id !== actorId() && !isCoach() && row.visibility === 'team') d.__share = shareMode(row); else delete d.__share;
    S.current = { visibility: row.visibility, team_id: row.team_id, owner_id: row.owner_id };
    if (row.visibility === 'team' && row.owner_id !== actorId()) markViewed(row.id, false);
    E.loadDrawing(d);
    // Un joueur qui ouvre une stratégie du coach veut la regarder : l'animation démarre directement,
    // en lecture seule, et il revient à la liste en la fermant (l'éditeur reste accessible par le menu ⋯)
    if (row.owner_id !== actorId() && !isCoach() && !toEditor) { E.openPreview(true); return; }
    E.go('editor');
  }

  function renderLocal(root) {
    const list = E.readLib();
    if (!list.length) { empty(root, 'Aucun dessin stocké sur cet appareil.'); return; }
    list.forEach(d => {
      const c = E.localCard(d, () => { S.current = { visibility: 'private', team_id: null, owner_id: null }; E.loadDrawing(E.clone(d)); E.go('editor'); });
      const b = btn('Envoyer dans mon compte', 'small secondary', async () => {
        const copy = E.clone(d); copy.id = crypto.randomUUID();
        const { error } = await sb.from('drawings').insert({ id: copy.id, owner_id: actorId(), title: copy.title, data: copy, team_id: S.team ? S.team.id : null, visibility: 'private' });
        E.toast(error ? errMsg(error) : 'Copié dans votre compte.');
      });
      const wrap = el('div', 'card-btns'); wrap.appendChild(b); c.appendChild(wrap);
      root.appendChild(c);
    });
  }

  /** « Exporter » dans la démo puis inscription : la stratégie du club démo est copiée dans le compte et ouverte, prête à exporter. */
  async function claimDemoStrategy() {
    if (!window.RugbyDemo || window.RugbyDemo.isOn() || !S.user) return;
    const copy = await window.RugbyDemo.claimStrategy(sb, actorId(), S.team ? S.team.id : null).catch(() => null);
    if (!copy) return;
    S.current = { visibility: 'private', team_id: S.team ? S.team.id : null, owner_id: actorId() };
    E.loadDrawing(E.clone(copy)); E.markSaved && E.markSaved(); E.go('editor');
    E.toast(`« ${copy.title} » a été ajoutée à vos stratégies : touchez « Exporter » pour la télécharger.`);
  }

  /** Ouvre la page d'une équipe (super-admin : n'importe quelle équipe). */
  async function openTeam(id) {
    if (!S.teams.find(t => t.id === id)) await loadTeams();
    const t = S.teams.find(x => x.id === id);
    if (!t) return E.toast('Équipe introuvable.');
    setTeam(t); E.go('team');
  }

  /* ---------- Lien direct vers une stratégie (#/d/<id>, ouvert depuis une notification) ---------- */
  async function openById(id) {
    if (!isUuid(id)) { E.go('strats'); return; }
    const { data, error } = await sb.from('drawings').select('id, title, data, visibility, team_id, owner_id, share_token, share_mode').eq('id', id).maybeSingle();
    if (error || !data) { E.toast('Cette stratégie n’existe plus ou n’est plus partagée avec vous.'); E.go('strats'); return; }
    if (data.team_id && S.team && data.team_id !== S.team.id) { const t = S.teams.find(x => x.id === data.team_id); if (t) setTeam(t); }
    track('open_link');
    loadCloud(data);
  }

  /* ---------- Données de l'accueil (« À faire », démarrage, tuiles) ---------- */
  async function homeData() {
    if (!S.user || !S.team) return null;
    const t = S.team.id, staff = isStaff(), coach = isCoach();
    const [members, published, myViews, proposals, counts] = await Promise.all([
      sb.from('team_members').select('user_id, status').eq('team_id', t),
      sb.from('drawings').select('id, title, data, visibility, team_id, owner_id, published_at, updated_at, share_token, share_mode').eq('team_id', t).eq('visibility', 'team').order('published_at', { ascending: false }),
      sb.from('drawing_views').select('drawing_id').eq('user_id', actorId()),
      coach ? sb.from('drawings').select('id', { count: 'exact', head: true }).eq('team_id', t).eq('visibility', 'proposed') : Promise.resolve({ count: 0 }),
      staff ? sb.rpc('team_view_counts', { p_team: t }) : Promise.resolve({ data: [] })
    ]);
    const rows = (members.data || []);
    const seen = new Set((myViews.data || []).map(v => v.drawing_id));
    const pub = published.data || [];
    const byId = {}; (counts.data || []).forEach(c => { byId[c.drawing_id] = c; });
    const recent = Date.now() - 14 * 864e5;
    return {
      team: S.team, staff, coach,
      members: rows.filter(m => m.status === 'active').length,
      pending: rows.filter(m => m.status === 'pending').length,
      published: pub,
      toWatch: pub.filter(r => r.owner_id !== actorId() && !seen.has(r.id)),
      proposals: proposals.count || 0,
      lowViews: pub.filter(r => { const c = byId[r.id]; return c && c.audience > 0 && c.viewers / c.audience < 0.7 && new Date(r.published_at || r.updated_at) > recent; })
        .map(r => Object.assign({ viewers: byId[r.id].viewers, audience: byId[r.id].audience }, r))
    };
  }
  /** Par clé « équipe|jeune » (sélecteur) ou par identifiant d'équipe (liens) : on garde la personne en cours si possible. */
  function selectTeam(key) { const t = S.teams.find(x => teamKey(x) === key) || S.teams.find(x => x.id === key && x.who === (S.team && S.team.who)) || S.teams.find(x => x.id === key); if (t) setTeam(t); }

  window.RugbyAccount = { sb, errMsg, fitName, termsChecked: () => S.termsCheck || Promise.resolve(), roleBadge, pendingCard, kidLogins: () => S.kidLogins || {}, reloadKids: async () => { await loadKids(); await loadTeams(); watchMyMemberships(); }, user: () => (S.user ? Object.assign({}, S.user, { id: actorId() }) : null), authUser: () => S.user, kids: () => S.kids, actorName: () => (S.team && S.team.who ? kidName(S.team.who) : ''), teamKey, profile: () => actorProfile(), ownProfile: () => S.profile, profileIncomplete, team: () => S.team, teams: () => S.teams, clubs: () => S.clubs, currentClub, isClubAdmin, openTeamPicker, pendingTeams: () => S.pending || [], isSuper, isCoach, isStaff, isClubMember, openTeam, onPreview, openViews, openById, homeData, selectTeam, shareCode, teamForms, renderAccountPage, setLibTab: t => { libTab = t; }, saveFormation, listFormations, deleteFormation, memberNames, fetchShared, isActive: () => true, isLoggedIn: () => !!S.user, isReady: () => ready, canUse, save: saveSmart, renderStrats, renderTeamPage, openAuth, openAccount, onNewDrawing };
  refreshCurrentView();
})();
