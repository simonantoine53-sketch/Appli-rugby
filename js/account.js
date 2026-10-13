/* Comptes, équipes et partage des stratégies via Supabase.
   Inactif (mode local) tant que js/config.js ne contient pas d'URL et de clé. */
(function () {
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
    if (/error_code=|error=access_denied/.test(h)) return 'link-error';
    return '';
  })();
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
  const track = (name, props) => { if (window.RugbyTrack) window.RugbyTrack.track(name, props); };
  const errMsg = e => {
    const m = (e && e.message) || String(e), code = (e && e.code) || '';
    // Limites de Supabase : on dit pourquoi et combien de temps attendre
    const wait = m.match(/after (\d+) seconds?/i);
    if (wait) return `Patiente ${wait[1]} secondes avant de redemander un e-mail.`;
    if (code === 'over_email_send_rate_limit' || /email rate limit/i.test(m)) return 'Limite d’envoi d’e-mails atteinte : trop d’e-mails de confirmation ont été envoyés en peu de temps. Réessaie dans 1 heure environ. Si ton e-mail est déjà confirmé, tu peux te connecter normalement.';
    if (code === 'over_request_rate_limit' || /rate limit|too many requests/i.test(m) || (e && e.status === 429)) return 'Trop de tentatives depuis cet appareil. Réessaie dans 5 minutes.';
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
    if (window.RugbyAdmin) window.RugbyAdmin.onSession();
  }
  sb.auth.getSession().then(({ data }) => refreshSession(data.session));
  sb.auth.onAuthStateChange((_evt, session) => { if ((session && session.user && session.user.id) !== (S.user && S.user.id)) refreshSession(session); });
  // getSession attend que Supabase ait lu le jeton du lien : on peut ensuite nettoyer l'adresse
  if (authReturn) sb.auth.getSession().then(({ data }) => {
    history.replaceState(null, '', location.pathname + location.search + '#/');
    if (authReturn === 'confirmed' && data.session) E.toast('E-mail confirmé : bienvenue, tu es connecté !');
    else { openAuth('login'); setAuthMsg('Ce lien de confirmation a expiré ou a déjà servi. Connecte-toi : si ton e-mail n’est pas encore confirmé, tu pourras recevoir un nouveau lien.', 'info'); }
  });

  function refreshCurrentView() {
    if (!ready) return;   // la session n'est pas encore connue : on ne redirige pas
    E.refreshView();      // l'éditeur gère les pages réservées (connexion demandée) et les liens #/d/<id>
  }

  async function loadTeams() {
    const { data, error } = await sb.from('team_members').select('role, status, teams(id, name, join_code, created_by, share_default)').eq('user_id', S.user.id);
    if (error) { E.toast('Équipes : ' + errMsg(error)); return; }
    const rows = (data || []).filter(r => r.teams);
    S.pending = rows.filter(r => r.status === 'pending').map(r => r.teams);
    S.teams = rows.filter(r => r.status === 'active').map(r => Object.assign({ role: r.role }, r.teams));
    if (isSuper()) {
      const { data: all } = await sb.from('teams').select('id, name, join_code, created_by, share_default').order('name');
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
          if (payload.eventType === 'INSERT' || !wasTeam) { S.unseen++; renderAccountButton(); E.toast('Nouvelle stratégie publiée : ' + row.title); }
        }).subscribe();
      countUnseen(team.id);
    }
    renderAccountButton();
    if (ready && window.RugbyAdmin) window.RugbyAdmin.onSession();
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
    ['#btn-library', '#mtab-library'].forEach(sel => { const e = $(sel); if (!e) return; e.classList.toggle('has-badge', S.unseen > 0); e.dataset.badge = S.unseen; });
    const mtab = $('#mtab-account span');
    if (mtab) mtab.textContent = S.user ? (S.profile && S.profile.display_name) || 'Compte' : 'Compte';
    if (window.RugbyHub) window.RugbyHub.renderChrome();
  }
  accountButtons.forEach(b => { b.onclick = () => S.user ? openAccount() : openAuth(); });
  /** Profils incomplets : pour l'invitation « Complète ton profil » de l'accueil. */
  const profileIncomplete = () => !!(S.profile && (!S.profile.avatar || !(S.profile.positions || []).length));

  /* ---------- Connexion / inscription ---------- */
  function openAuth(mode) { E.openModal('modal-auth'); setAuthMode(mode || 'login'); }
  function setAuthMode(mode) {
    showPending(false);
    document.querySelectorAll('#modal-auth .tab').forEach(t => t.classList.toggle('active', t.dataset.mode === mode));
    $('#auth-name').closest('label').classList.toggle('hidden', mode !== 'signup');
    $('#auth-submit').textContent = mode === 'login' ? 'Se connecter' : 'Créer mon compte';
    $('#auth-form').dataset.mode = mode; setAuthMsg('');
  }
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
    stopPending(); E.closeModal('modal-auth'); E.toast('E-mail confirmé : bienvenue, tu es connecté !');
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
      if (mode === 'signup') {
        const { data, error } = await sb.auth.signUp({ email, password, options: { data: { display_name: name || email.split('@')[0] }, emailRedirectTo: location.origin + location.pathname } });
        if (error) throw error;
        // Supabase ne signale pas un e-mail déjà inscrit : il renvoie un compte sans identité
        if (data.user && Array.isArray(data.user.identities) && !data.user.identities.length) { setAuthMode('login'); $('#auth-email').value = email; setAuthMsg('Cet e-mail a déjà un compte : connecte-toi.', 'info'); b.disabled = false; return; }
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

  /* ---------- Page Compte ---------- */
  function openAccount() { E.go('account'); }
  function renderAccountPage() {
    if (!S.user) return;
    $('#account-name').textContent = S.profile.display_name;
    $('#team-user').textContent = S.user.email;
    const P = window.RugbyProfile;
    if (P) { $('#account-avatar').replaceChildren(P.avatar(S.profile.display_name, S.profile.avatar)); $('#account-summary').textContent = P.summary(S.profile) || 'Ajoute ta photo et ton poste pour que l’équipe te reconnaisse.'; }
    const box = $('#account-teams'); box.replaceChildren();
    S.teams.filter(t => !t.superadmin).forEach(t => box.appendChild(el('div', 'account-team', `${esc(t.name)} ${roleBadge(t.role)}`)));
    if (isSuper()) box.appendChild(el('div', 'account-team', '<span class="role-badge admin">Super-admin</span> accès à toutes les équipes'));
    $('#btn-goto-team').textContent = S.team ? `Voir l’équipe « ${S.team.name} »` : 'Créer ou rejoindre une équipe';
    // Mes équipes : rejoindre ou créer une autre équipe (quitter se fait dans la page de l'équipe concernée)
    const join = $('#account-join'); join.replaceChildren();
    const pend = pendingCard(); if (pend) join.appendChild(pend);
    const toggle = btn('Rejoindre ou créer une équipe', 'outline wide', () => {
      const forms = teamForms(() => { forms.replaceWith(toggle); toggle.focus(); });
      toggle.replaceWith(forms);
    });
    join.appendChild(toggle);
    if (window.RugbyPush) window.RugbyPush.renderButton(!!S.team);
    $('#btn-admin').classList.toggle('hidden', !isSuper());
  }
  $('#btn-goto-team').onclick = () => E.go('team');
  $('#btn-logout').onclick = async () => { await sb.auth.signOut(); E.go('home'); E.toast('Déconnecté.'); };
  $('#btn-privacy').onclick = () => E.openModal('modal-privacy');
  document.querySelectorAll('.link-privacy').forEach(a => { a.onclick = e => { e.preventDefault(); E.openModal('modal-privacy'); }; });
  // Droit à l'effacement : supprime le compte et toutes les données liées (côté serveur)
  $('#btn-delete-account').onclick = async () => {
    const D = window.RugbyDialog;
    if (!await D.confirm('Supprimer définitivement ton compte ? Tes dessins, formations, réponses aux convocations, ton profil et tes statistiques seront effacés, y compris les stratégies que tu as publiées dans une équipe. Si tu es le seul coach d’une équipe, le plus ancien membre devient coach.', { title: 'Supprimer mon compte', ok: 'Continuer', danger: true })) return;
    const typed = await D.prompt('Pour confirmer, tape SUPPRIMER', '', { title: 'Supprimer mon compte', placeholder: 'SUPPRIMER', ok: 'Supprimer mon compte', danger: true });
    if (typed == null) return;
    if (typed.trim().toUpperCase() !== 'SUPPRIMER') return E.toast('Suppression annulée : le mot de confirmation ne correspond pas.');
    const { error } = await sb.rpc('delete_my_account');
    if (error) return E.toast(errMsg(error));
    await sb.auth.signOut();
    E.go('home'); E.toast('Ton compte et tes données ont été supprimés.');
  };

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
    if (!data || !data.id) return E.toast('Code d’équipe invalide.');
    await loadTeams();
    const t = S.teams.find(x => x.id === data.id);
    if (t) { setTeam(t); E.toast(`Vous êtes membre de « ${data.name} ».`); }
    else E.toast(`Demande envoyée à « ${data.name} ». Un coach ou un admin doit la valider.`);
    E.go('team'); renderTeamPage();
  }
  /** onClose : si fourni, ajoute un bouton pour refermer le panneau. */
  function teamForms(onClose) {
    const box = el('div', 'team-forms-card');
    const head = el('div', 'forms-head'); head.appendChild(el('h4', '', S.teams.length ? 'Une autre équipe ?' : 'Commencer avec une équipe'));
    if (onClose) { const x = btn('✕', 'btn-close', onClose); x.className = 'btn-close'; x.title = 'Fermer'; x.setAttribute('aria-label', 'Fermer'); head.appendChild(x); }
    box.appendChild(head);
    const f1 = el('form', 'inline-form', '<input type="text" placeholder="Nom de la nouvelle équipe" required minlength="2" maxlength="60"><button class="btn primary small" type="submit">Créer (je serai coach)</button>');
    f1.onsubmit = e => { e.preventDefault(); createTeam(f1.querySelector('input').value); };
    const f2 = el('form', 'inline-form', '<input type="text" placeholder="Code d’équipe" required minlength="6" maxlength="8" style="text-transform:uppercase"><button class="btn secondary small" type="submit">Rejoindre (joueur)</button>');
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
  /** Inviter des joueurs : code à copier, message personnalisable, envoi par WhatsApp, SMS, e-mail ou copie. */
  function shareCode() {
    const t = window.RugbyAccount.team();
    if (!t) return;
    track('invite_open');
    const url = `${location.origin}${location.pathname}`;
    const body = $('#invite-body'); body.replaceChildren();
    const code = el('div', 'invite-code', `<span class="muted">Code de l’équipe</span><strong>${esc(t.join_code)}</strong>`);
    code.appendChild(btn('Copier le code', 'outline small', () => copy(t.join_code, 'Code copié.', 'code')));
    body.appendChild(code);
    const msg = el('textarea', 'admin-textarea invite-msg'); msg.rows = 6; msg.maxLength = 600; msg.setAttribute('aria-label', 'Message d’invitation');
    msg.value = `Salut ! Rejoins l’équipe « ${t.name} » sur Rugby Strat : stratégies, convocations et compos au même endroit.\n\n1. Ouvre ${url}\n2. Crée ton compte (gratuit)\n3. Entre le code ${t.join_code}`;
    body.append(el('label', 'invite-label', 'Message (tu peux le modifier)'), msg);
    const enc = () => encodeURIComponent(msg.value);
    const ICONS = {
      whatsapp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2a8.8 8.8 0 0 0-7.6 13.2L3.2 20.8l4.5-1.2A8.8 8.8 0 1 0 12 3.2z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9.1 7.9c.2-.4.4-.4.7-.4h.5c.2 0 .4 0 .5.4l.7 1.6c.1.2 0 .4-.1.6l-.5.6c-.1.1-.1.3 0 .5.6 1.1 1.5 2 2.6 2.6.2.1.4.1.5 0l.6-.5c.2-.1.4-.2.6-.1l1.6.7c.4.2.4.3.4.5v.5c0 .3 0 .5-.4.7-.5.3-1.5.6-2.8.1-2.3-.9-4.2-2.8-5.1-5.1-.4-1.3-.2-2.3.2-2.7z" fill="currentColor"/></svg>',
      sms: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="8" cy="11" r="1.2" fill="currentColor"/><circle cx="12" cy="11" r="1.2" fill="currentColor"/><circle cx="16" cy="11" r="1.2" fill="currentColor"/></svg>',
      email: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M4 7l8 6 8-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
      more: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="12" r="1.8" fill="currentColor"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/><circle cx="18" cy="12" r="1.8" fill="currentColor"/></svg>'
    };
    const links = el('div', 'invite-icons');
    const icon = (key, label, href) => {
      const a = el('a', 'invite-icon ' + key, ICONS[key]); a.href = href(); a.target = '_blank'; a.rel = 'noopener'; a.title = label; a.setAttribute('aria-label', label);
      a.onclick = () => { a.href = href(); track('invite', { channel: key }); };
      return a;
    };
    links.append(
      icon('whatsapp', 'Envoyer par WhatsApp', () => `https://wa.me/?text=${enc()}`),
      icon('sms', 'Envoyer par SMS', () => `sms:?&body=${enc()}`),
      icon('email', 'Envoyer par e-mail', () => `mailto:?subject=${encodeURIComponent('Rejoins l’équipe ' + t.name + ' sur Rugby Strat')}&body=${enc()}`)
    );
    if (navigator.share) {
      const more = el('button', 'invite-icon more', ICONS.more); more.type = 'button'; more.title = 'Autre application'; more.setAttribute('aria-label', 'Autre application');
      more.onclick = () => { track('invite', { channel: 'share' }); navigator.share({ title: 'Rugby Strat', text: msg.value }).catch(() => {}); };
      links.appendChild(more);
    }
    body.appendChild(links);
    body.appendChild(btn('Copier le message', 'primary wide', () => copy(msg.value, 'Message copié : colle-le où tu veux.', 'copy')));
    E.openModal('modal-invite');
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
      const pend = pendingCard(); if (pend) root.appendChild(pend);
      root.appendChild(teamForms()); return;
    }
    const staff = isStaff();
    root.appendChild(el('div', 'team-title', `<h2>${esc(S.team.name)}</h2>${S.team.superadmin ? '<span class="role-badge admin">Super-admin</span>' : roleBadge(S.team.role)}`));

    // Onglets (la pastille de Membres compte les demandes à valider pour le staff)
    let pending = 0;
    if (staff) { const { count } = await sb.from('team_members').select('user_id', { count: 'exact', head: true }).eq('team_id', S.team.id).eq('status', 'pending'); pending = count || 0; }
    if (seq !== teamSeq) return;
    const tabs = el('div', 'tabs small page-tabs');
    [['members', 'Membres', pending], ['settings', 'Réglages', 0]].forEach(([id, label, n]) => {
      const b = el('button', 'tab' + (teamTab === id ? ' active' : '')); b.textContent = label;
      if (n) b.appendChild(el('span', 'nav-badge tab-badge', String(n)));
      b.onclick = () => { teamTab = id; renderTeamPage(); }; tabs.appendChild(b);
    });
    root.appendChild(tabs);

    if (teamTab === 'settings') { root.appendChild(teamSettings(staff)); return; }
    const list = el('div', 'member-list');
    root.appendChild(list);
    await renderMembers(list, staff, seq);
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
    const code = card('Code d’invitation', staff ? 'Chaque nouvelle personne arrive « en attente » : tu valides sa demande dans Membres.' : 'Les personnes que tu invites devront être acceptées par le staff.');
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
    }
    // Mon appartenance : on quitte toujours l'équipe affichée, et on sait où l'on reste
    const others = S.teams.filter(x => x.id !== t.id && !x.superadmin).map(x => x.name);
    const me = card('Mon appartenance', `Tu es ${(ROLE_LABEL[t.role] || t.role).toLowerCase()} de ${esc(t.name)}${others.length ? ` et membre de ${others.map(esc).join(', ')}` : ''}.`);
    if (!t.superadmin) me.foot.appendChild(btn(`Quitter « ${t.name} »`, 'outline small danger', async () => {
      if (!await window.RugbyDialog.confirm(`Quitter « ${t.name} » ?${others.length ? ` Tu restes membre de ${others.join(', ')}.` : ''}`)) return;
      const { error } = await sb.from('team_members').delete().match({ team_id: t.id, user_id: S.user.id });
      if (error) return E.toast(errMsg(error));
      teamTab = 'members'; E.toast(`Tu as quitté « ${t.name} ».`); await loadTeams(); renderTeamPage();
    }));
    if (staff) {
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
    const { data: rows, error } = await sb.from('team_members').select('user_id, role, status, joined_at, profiles!team_members_user_profile_fk(display_name, avatar, positions, jersey_number)').eq('team_id', S.team.id);
    if (seq !== teamSeq) return;
    if (error) { list.appendChild(el('p', 'library-empty', 'Erreur : ' + errMsg(error))); return; }
    const nameOf = m => (m.profiles && m.profiles.display_name) || 'Membre';
    const order = { coach: 0, admin: 1, player: 2 };
    const members = rows.filter(m => m.status === 'active').sort((a, b) => (order[a.role] - order[b.role]) || nameOf(a).localeCompare(nameOf(b)));
    const pending = rows.filter(m => m.status === 'pending');
    const setMember = async (m, patch, confirmMsg) => {
      if (confirmMsg && !await window.RugbyDialog.confirm(confirmMsg)) return;
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
    }
    const head = el('div', 'members-head', `<span class="muted">${members.length} membre${members.length > 1 ? 's' : ''}</span>`);
    head.appendChild(btn('Inviter', 'primary small', shareCode));
    list.appendChild(head);
    members.forEach(m => {
      const name = nameOf(m);
      const row = el('div', 'member-row clickable');
      const P = window.RugbyProfile, pr = m.profiles || {};
      row.appendChild(P ? P.avatar(name, pr.avatar) : el('div', 'avatar', esc(name.trim().slice(0, 1).toUpperCase() || '?')));
      row.appendChild(el('div', 'who', `${esc(name)}${m.user_id === S.user.id ? ' (moi)' : ''}<small>${esc((P && P.summary(pr)) || 'Depuis le ' + new Date(m.joined_at).toLocaleDateString('fr-FR'))}</small>`));
      row.title = 'Voir la fiche';
      row.onclick = e => { if (e.target.closest('select, button')) return; if (P) P.viewMember(m.user_id, m.role); };
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
    track('save', { steps: (d.steps || []).length, visibility: row.visibility });
    E.toast(row.visibility === 'team' ? 'Stratégie mise à jour pour l’équipe.' : 'Dessin enregistré dans votre compte.');
  }
  async function saveSmart() {
    if (E.drawing.__share === 'app' && !isCoach()) { E.toast('Le coach a réservé cette stratégie à l’appli : elle ne peut pas être copiée.'); return; }
    if (S.user && S.current.owner_id && S.current.owner_id !== S.user.id && !(isCoach() && S.current.team_id === S.team.id)) {
      E.drawing.id = crypto.randomUUID(); S.current = { visibility: 'private', team_id: null, owner_id: S.user.id };
    }
    return save();
  }
  function onNewDrawing() { S.current = { visibility: 'private', team_id: null, owner_id: null }; if (S.user) E.drawing.id = crypto.randomUUID(); }

  /* ---------- Formations enregistrées (par équipe) ---------- */
  async function saveFormation(name, data) {
    const row = { owner_id: S.user.id, team_id: S.team ? S.team.id : null, name, data };
    const { error } = await sb.from('formations').insert(row);
    if (error) { E.toast('Enregistrement impossible : ' + errMsg(error)); return; }
    E.toast(S.team ? `Formation « ${name} » enregistrée pour « ${S.team.name} ».` : `Formation « ${name} » enregistrée dans votre compte.`);
  }
  async function listFormations() {
    if (!S.user) { openAuth(); return { list: [], scope: '' }; }
    let q = sb.from('formations').select('id, name, data, team_id, owner_id, created_at, owner:profiles!formations_owner_id_fkey(display_name)').order('created_at', { ascending: false });
    if (S.team) q = q.or(`team_id.eq.${S.team.id},owner_id.eq.${S.user.id}`);
    else q = q.eq('owner_id', S.user.id);
    const { data, error } = await q;
    if (error) { E.toast(errMsg(error)); return { list: [], scope: '' }; }
    const list = (data || []).map(f => ({
      id: f.id, name: f.name, data: f.data,
      team_name: f.team_id ? ((S.teams.find(t => t.id === f.team_id) || {}).name || 'équipe') : 'perso',
      owner_name: f.owner && f.owner.display_name,
      canDelete: f.owner_id === S.user.id || (isStaff() && S.team && f.team_id === S.team.id)
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
  async function setShareMode(row, mode, refresh) {
    const patch = { share_mode: mode };
    const eff = mode || teamDefault(row.team_id);
    const revoke = eff !== 'public' && row.share_token;
    if (revoke) patch.share_token = null;   // plus de lien public si le partage libre n'est plus autorisé
    const { error } = await sb.from('drawings').update(patch).eq('id', row.id);
    if (error) return E.toast(errMsg(error));
    track('share_mode', { mode: eff });
    E.toast(`Partage : ${SHARE[eff].label.toLowerCase()}${revoke ? ', le lien public est désactivé' : ''}.`);
    refresh();
  }
  function chooseShareMode(anchor, row, refresh) {
    const cur = row.share_mode, def = teamDefault(row.team_id);
    const items = [[`Réglage de l’équipe (${SHARE[def].label.toLowerCase()})${!cur ? ' ✓' : ''}`, () => setShareMode(row, null, refresh)]]
      .concat(['app', 'download', 'public'].map(m => [`${SHARE[m].label}${cur === m ? ' ✓' : ''}`, () => setShareMode(row, m, refresh)]));
    window.RugbySelect.openMenu(anchor, items, 'Partage de « ' + row.title + ' »');
  }

  /* ---------- Lien de partage public ---------- */
  async function fetchShared(token) {
    const { data, error } = await sb.rpc('get_shared_drawing', { p_token: token });
    if (error) { console.warn(error); return null; }
    return data;
  }
  const shareUrl = token => `${location.origin}${location.pathname}#/s/${token}`;
  async function toggleShare(row, enable) {
    const token = enable ? Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('') : null;
    const { error } = await sb.from('drawings').update({ share_token: token }).eq('id', row.id);
    if (error) return E.toast(errMsg(error));
    row.share_token = token;
    if (token) { track('share_link'); shareLink(row); } else E.toast('Partage arrêté : le lien ne fonctionne plus.');
  }
  function shareLink(row) {
    const url = shareUrl(row.share_token);
    const text = `Stratégie « ${row.title} » : ${url}`;
    if (navigator.share) navigator.share({ title: row.title, text, url }).catch(() => {});
    else if (navigator.clipboard) { navigator.clipboard.writeText(url); E.toast('Lien copié : ' + url); }
    else window.RugbyDialog.copy(url, { title: 'Lien de partage' });
  }

  /* ---------- Qui a vu quoi ---------- */
  // Chaque ouverture d'une stratégie publiée est enregistrée ; le staff voit qui l'a regardée.
  const markViewed = (id, played) => { sb.rpc('mark_drawing_viewed', { p_drawing: id, p_played: !!played }).then(({ error }) => { if (error) console.warn('vue', error.message); }); };
  function onPreview() {
    if (S.user && S.current.visibility === 'team' && S.current.owner_id && S.current.owner_id !== S.user.id && isUuid(E.drawing.id)) markViewed(E.drawing.id, true);
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
      if (c.user_id === S.user.id || isStaff()) { const del = el('button', 'del', '✕'); del.title = 'Supprimer'; del.onclick = async () => { if (!await window.RugbyDialog.confirm('Supprimer ce commentaire ?')) return; await sb.from('drawing_comments').delete().eq('id', c.id); renderComments(); }; who.appendChild(del); }
      item.appendChild(who); item.appendChild(el('div', 'body', esc(c.body)));
      list.appendChild(item);
    });
    list.scrollTop = list.scrollHeight;
  }
  $('#comments-form').onsubmit = async e => {
    e.preventDefault();
    const body = $('#comments-input').value.trim(); if (!body || !commentsFor) return;
    const { error } = await sb.from('drawing_comments').insert({ drawing_id: commentsFor.row.id, user_id: S.user.id, body });
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
  let libTab = 'mine';
  let renderSeq = 0;
  async function renderStrats() {
    const seq = ++renderSeq;
    const tabs = $('#home-tabs'); tabs.replaceChildren();
    const root = $('#home-list'); root.replaceChildren();
    if (!S.user) {
      tabs.classList.add('hidden');
      const box = el('div', 'home-login', '<p>Sans compte, vos dessins restent sur cet appareil. Créez un compte gratuit pour les retrouver partout et les partager à votre équipe.</p>');
      box.appendChild(btn('Créer un compte gratuit', 'primary', () => openAuth('signup')));
      root.appendChild(box);
      const local = E.readLib();
      if (local.length) { root.appendChild(el('h4', 'home-h4', 'Sur cet appareil')); local.forEach(d => root.appendChild(E.localCard(d, () => { S.current = { visibility: 'private', team_id: null, owner_id: null }; E.loadDrawing(E.clone(d)); E.go('editor'); }))); }
      return;
    }
    if (!isClubMember()) {
      tabs.classList.add('hidden');
      const box = el('div', 'home-login', '<p><strong>Dernière étape : rejoignez votre club.</strong><br>Entrez le code d’invitation donné par votre coach, ou créez le club si vous êtes coach. Ensuite vous pourrez enregistrer, exporter et partager vos dessins.</p>');
      box.appendChild(btn('Rejoindre ou créer mon club', 'primary', () => E.go('team')));
      root.appendChild(box);
      const pend = pendingCard(); if (pend) root.appendChild(pend);
      return;
    }
    tabs.classList.remove('hidden');
    // Propositions des joueurs : un onglet pour le coach (avec leur nombre)
    let proposals = 0;
    if (isCoach() && S.team) { const { count } = await sb.from('drawings').select('id', { count: 'exact', head: true }).eq('team_id', S.team.id).eq('visibility', 'proposed'); proposals = count || 0; }
    if (seq !== renderSeq) return;
    if (libTab === 'proposed' && !isCoach()) libTab = 'mine';
    const defs = [['mine', 'Mes dessins'], ['team', 'De l’équipe']];
    if (isCoach()) defs.push(['proposed', 'Propositions']);
    defs.push(['local', 'Sur cet appareil']);
    defs.forEach(([id, label]) => {
      const b = el('button', 'tab' + (libTab === id ? ' active' : '')); b.textContent = label;
      const n = id === 'team' ? S.unseen : id === 'proposed' ? proposals : 0;
      if (n) b.appendChild(el('span', 'nav-badge tab-badge', String(n)));
      b.onclick = () => { libTab = id; renderStrats(); }; tabs.appendChild(b);
    });
    if (libTab === 'local') { renderLocal(root); return; }
    if (libTab === 'team' || libTab === 'proposed') {
      if (!S.team) { root.appendChild(teamForms()); return; }
      if (libTab === 'team') markSeen();
    }
    let q = sb.from('drawings').select('id, title, data, visibility, team_id, owner_id, published_at, updated_at, share_token, share_mode, owner:profiles!drawings_owner_profile_fk(display_name)').order(libTab === 'team' ? 'published_at' : 'updated_at', { ascending: false });
    q = libTab === 'mine' ? q.eq('owner_id', S.user.id) : q.eq('team_id', S.team.id).eq('visibility', libTab === 'proposed' ? 'proposed' : 'team');
    const { data, error } = await q;
    if (seq !== renderSeq) return;
    if (error) { empty(root, 'Erreur : ' + errMsg(error)); return; }
    await Promise.all([loadCommentCounts(data.filter(r => r.visibility === 'team').map(r => r.id)), libTab === 'team' ? loadViewCounts() : null]);
    if (seq !== renderSeq) return;
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
    const mine = row.owner_id === S.user.id;
    const teamName = (S.teams.find(t => t.id === row.team_id) || {}).name;
    const vis = { private: 'Privé', proposed: 'Proposé au coach', team: 'Publié' + (teamName ? ' · ' + esc(teamName) : '') }[row.visibility];
    c.innerHTML = `<div class="thumb"></div><div class="body"><span class="name"></span></div><div class="date"></div><div class="card-btns"></div>`;
    c.querySelector('.thumb').appendChild(E.sceneSvg(d.settings || {}, ((d.steps || [])[0] || {}).objects || []));
    c.querySelector('.name').textContent = row.title;
    const cat = d.category ? `<span class="vis-badge cat">${esc(d.category)}</span> ` : '';
    const mode = row.visibility === 'team' ? shareMode(row) : null;
    const modeBadge = mode && mode !== 'public' ? `<span class="vis-badge share-${mode}">${SHARE[mode].label}</span> ` : '';
    c.querySelector('.date').innerHTML = `<span class="vis-badge ${row.visibility}">${vis}</span> ${modeBadge}${cat}${esc((row.owner && row.owner.display_name) || '')} · ${steps} étape${steps > 1 ? 's' : ''} · ${fmtDate(row.updated_at)}${d.tags ? ' · ' + esc(d.tags) : ''}`;
    c.querySelector('.thumb').onclick = c.querySelector('.body').onclick = () => loadCloud(row);
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
      const { error } = await sb.from('drawings').insert({ id: copy.id, owner_id: S.user.id, title: copy.title, data: copy, team_id: S.team ? S.team.id : null, visibility: 'private' });
      if (error) return E.toast(errMsg(error)); track('duplicate'); E.toast('Copie créée dans « Mes dessins ».'); libTab = 'mine'; refresh();
    };
    if (isCoach() && row.visibility !== 'team' && (mine || coachHere)) btns.appendChild(btn(row.visibility === 'proposed' ? 'Publier la proposition' : 'Publier à l’équipe', 'primary small', () => setVis('team')));
    if (!isCoach() && mine && S.team && row.visibility === 'private') btns.appendChild(btn('Proposer au coach', 'secondary small', () => setVis('proposed')));
    if (row.visibility === 'team') {
      const vc = viewCounts[row.id];
      if (vc && isStaff() && S.team && row.team_id === S.team.id) btns.appendChild(btn(`👁 ${vc.viewers}/${vc.audience}`, (vc.audience && vc.viewers >= vc.audience ? 'secondary' : 'outline') + ' small', () => openViews(row))).title = 'Qui a vu cette stratégie';
      const n = commentCounts[row.id] || 0;
      btns.appendChild(btn(`💬 ${n}`, 'outline small', () => openComments(row, refresh))).title = 'Commentaires';
    }
    menu.push(['Ouvrir', () => loadCloud(row)]);
    const canCopy = mine || isCoach() || mode !== 'app';
    if (canCopy) menu.push(['Dupliquer', duplicate]);
    if (row.visibility === 'team' && (mine || coachHere)) {
      menu.push([`Partage : ${SHARE[mode].label.toLowerCase()}…`, () => chooseShareMode(btns.querySelector('.card-more'), row, refresh)]);
      if (mode === 'public') {
        if (row.share_token) { menu.push(['Copier le lien public', () => shareLink(row)]); menu.push(['Arrêter le lien public', () => toggleShare(row, false).then(refresh)]); }
        else menu.push(['Créer un lien public', () => toggleShare(row, true).then(refresh)]);
      }
    } else if (row.visibility === 'team' && mode === 'public' && row.share_token) menu.push(['Copier le lien public', () => shareLink(row)]);
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

  function loadCloud(row) {
    const d = E.clone(row.data); d.id = row.id; d.title = row.title;
    // Joueur sur une stratégie du coach : on garde les droits choisis par le coach avec le dessin
    if (row.owner_id !== S.user.id && !isCoach() && row.visibility === 'team') d.__share = shareMode(row); else delete d.__share;
    S.current = { visibility: row.visibility, team_id: row.team_id, owner_id: row.owner_id };
    if (row.visibility === 'team' && row.owner_id !== S.user.id) markViewed(row.id, false);
    E.loadDrawing(d); E.go('editor');
    // Un joueur qui ouvre une stratégie du coach veut la regarder : l'animation démarre directement
    if (row.owner_id !== S.user.id && !isCoach()) setTimeout(() => E.openPreview(true), 150);
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
      sb.from('drawing_views').select('drawing_id').eq('user_id', S.user.id),
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
      toWatch: pub.filter(r => r.owner_id !== S.user.id && !seen.has(r.id)),
      proposals: proposals.count || 0,
      lowViews: pub.filter(r => { const c = byId[r.id]; return c && c.audience > 0 && c.viewers / c.audience < 0.7 && new Date(r.published_at || r.updated_at) > recent; })
        .map(r => Object.assign({ viewers: byId[r.id].viewers, audience: byId[r.id].audience }, r))
    };
  }
  function selectTeam(id) { const t = S.teams.find(x => x.id === id); if (t) setTeam(t); }

  window.RugbyAccount = { sb, user: () => S.user, profile: () => S.profile, profileIncomplete, team: () => S.team, teams: () => S.teams, pendingTeams: () => S.pending || [], isSuper, isCoach, isStaff, isClubMember, openTeam, onPreview, openViews, openById, homeData, selectTeam, shareCode, teamForms, renderAccountPage, setLibTab: t => { libTab = t; }, saveFormation, listFormations, deleteFormation, memberNames, fetchShared, isActive: () => true, isLoggedIn: () => !!S.user, isReady: () => ready, canUse, save: saveSmart, renderStrats, renderTeamPage, openAuth, openAccount, onNewDrawing };
  refreshCurrentView();
})();
