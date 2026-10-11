/* Back-office super-admin, retours utilisateurs, statistiques d'usage, erreurs clients,
   annonces et drapeaux de fonctionnalités. Inactif en mode local (sans Supabase). */
(function () {
  'use strict';

  const $ = s => document.querySelector(s);
  const E = window.RugbyEditor;
  const A = window.RugbyAccount;
  if (!A || !A.isActive()) {
    window.RugbyTrack = { track: () => {} };
    window.RugbyAdmin = { onSession: () => {}, render: () => {}, flag: () => false, openFeedback: () => E.toast('Mode local : connectez un backend pour envoyer un avis.') };
    return;
  }
  const sb = A.sb;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  const btn = (label, cls, fn) => { const b = el('button', 'btn ' + cls); b.textContent = label; b.onclick = e => { e.stopPropagation(); fn(b); }; return b; };
  const fmtDate = d => d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
  const fmtDay = d => d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: '2-digit' }) : '—';
  const fmtDur = s => { s = Math.round(s || 0); if (s < 60) return s + ' s'; const m = Math.round(s / 60); return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0'); };
  const device = () => (matchMedia('(pointer: coarse)').matches || /Mobi|Android|iPhone|iPad/.test(navigator.userAgent)) ? 'mobile' : 'desktop';
  const build = (() => { const s = document.querySelector('script[src*="admin.js"]'); const m = s && /[?&]v=([^&]+)/.exec(s.src); return m ? m[1] : 'dev'; })();
  const view = () => location.hash.replace(/^#\/?/, '').split(/[/?]/)[0] || 'home';
  const loggedIn = () => A.isLoggedIn() && A.user();
  const teamId = () => { const t = A.team && A.team(); return t ? t.id : null; };

  /* ---------- Suivi d'usage : événements ---------- */
  const queue = [];
  function track(name, props) {
    if (!loggedIn()) return;
    queue.push({ user_id: A.user().id, team_id: teamId(), name: String(name).slice(0, 40), props: props || {}, device: device() });
    if (queue.length >= 20) flush();
  }
  async function flush() {
    if (!queue.length || !loggedIn()) return;
    const rows = queue.splice(0, queue.length);
    const { error } = await sb.from('events').insert(rows);
    if (error) console.warn('events', error.message);
  }
  setInterval(flush, 15000);

  /* ---------- Temps d'utilisation : une session par chargement, mise à jour chaque minute ---------- */
  const sess = { id: null, user: null, seconds: 0, editor: 0, dirty: false };
  const TICK = 15;
  setInterval(() => {
    if (!loggedIn() || document.visibilityState !== 'visible') return;
    if (sess.user !== A.user().id) Object.assign(sess, { id: crypto.randomUUID(), user: A.user().id, seconds: 0, editor: 0 });
    sess.seconds += TICK; if (view() === 'editor') sess.editor += TICK;
    sess.dirty = true;
    if (sess.seconds % 60 === 0) saveSession();
  }, TICK * 1000);
  async function saveSession() {
    if (!sess.dirty || !sess.id || !loggedIn() || sess.user !== A.user().id) return;
    sess.dirty = false;
    const { error } = await sb.from('usage_sessions').upsert({ id: sess.id, user_id: sess.user, device: device(), build, seconds: Math.min(sess.seconds, 86399), editor_seconds: Math.min(sess.editor, sess.seconds, 86399), last_seen_at: new Date().toISOString() });
    if (error) console.warn('usage_sessions', error.message);
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { flush(); saveSession(); } });

  /* ---------- Erreurs JavaScript (5 au maximum par chargement) ---------- */
  let errorsSent = 0;
  function reportError(message, stack) {
    if (!loggedIn() || errorsSent >= 5 || !message) return;
    errorsSent++;
    sb.from('client_errors').insert({ user_id: A.user().id, message: String(message).slice(0, 1000), stack: stack ? String(stack).slice(0, 4000) : null, url: location.href.slice(0, 300), build, user_agent: navigator.userAgent.slice(0, 300) })
      .then(({ error }) => { if (error) console.warn('client_errors', error.message); });
  }
  window.addEventListener('error', e => reportError(e.message, e.error && e.error.stack));
  window.addEventListener('unhandledrejection', e => { const r = e.reason; reportError((r && r.message) || String(r), r && r.stack); });

  /* ---------- Annonces et drapeaux ---------- */
  let flags = [];
  const DISMISS_KEY = 'rugby-dismissed-announcements';
  async function loadAnnouncements() {
    const bar = $('#announce-bar'); bar.replaceChildren(); bar.classList.add('hidden');
    if (!loggedIn()) return;
    const { data } = await sb.from('announcements').select('id, message, level, team_id, active, ends_at').eq('active', true).order('created_at', { ascending: false });
    let dismissed = []; try { dismissed = JSON.parse(localStorage.getItem(DISMISS_KEY) || '[]'); } catch (e) { /* ignore */ }
    const now = Date.now();
    const list = (data || []).filter(a => (!a.ends_at || new Date(a.ends_at) > now) && (!a.team_id || a.team_id === teamId()) && !dismissed.includes(a.id));
    list.forEach(a => {
      const item = el('div', 'announce ' + a.level, `<span>${esc(a.message)}</span>`);
      item.appendChild(btn('✕', 'ghost small', () => {
        dismissed.push(a.id); try { localStorage.setItem(DISMISS_KEY, JSON.stringify(dismissed.slice(-50))); } catch (e) { /* ignore */ }
        item.remove(); if (!bar.children.length) bar.classList.add('hidden');
      }));
      bar.appendChild(item);
    });
    bar.classList.toggle('hidden', !list.length);
  }
  async function loadFlags() {
    flags = [];
    if (!loggedIn()) return;
    const { data } = await sb.from('feature_flags').select('key, team_id, enabled');
    flags = data || [];
  }
  /** Drapeau actif pour l'équipe courante (la valeur de l'équipe l'emporte sur la valeur globale). */
  function flag(key) {
    const t = flags.find(f => f.key === key && f.team_id && f.team_id === teamId());
    if (t) return t.enabled;
    const g = flags.find(f => f.key === key && !f.team_id);
    return !!(g && g.enabled);
  }

  let lastUser = null;
  function onSession() {
    const uid = loggedIn() ? A.user().id : null;
    if (uid === lastUser) { loadAnnouncements(); return; }
    lastUser = uid;
    loadAnnouncements(); loadFlags();
    if (uid) track('session_start', { view: view(), standalone: !!(window.navigator.standalone || matchMedia('(display-mode: standalone)').matches) });
    if (view() === 'admin') E.go(A.isSuper() ? 'admin' : 'home');
  }

  /* ---------- Retours utilisateurs ---------- */
  const KIND = { bug: '🐞 Bug', idea: '💡 Idée', other: '💬 Autre' };
  const STATUS = { new: 'Nouveau', seen: 'Vu', planned: 'Prévu', done: 'Fait', rejected: 'Écarté' };
  function openFeedback() {
    if (!loggedIn()) { A.openAuth(); E.toast('Connectez-vous pour donner votre avis.'); return; }
    E.closeModal('modal-team');
    $('#feedback-error').textContent = '';
    E.openModal('modal-feedback');
    $('#feedback-message').focus();
    renderMyFeedback();
  }
  $('#feedback-form').onsubmit = async e => {
    e.preventDefault();
    const message = $('#feedback-message').value.trim();
    if (message.length < 3) { $('#feedback-error').textContent = 'Écrivez quelques mots.'; return; }
    const kind = document.querySelector('input[name=feedback-kind]:checked').value;
    const d = E.drawing;
    const context = { view: view(), device: device(), build, screen: `${innerWidth}x${innerHeight}`, ua: navigator.userAgent.slice(0, 200), drawing: view() === 'editor' && d ? d.title : undefined };
    const b = $('#feedback-submit'); b.disabled = true;
    const { error } = await sb.from('feedback').insert({ user_id: A.user().id, team_id: teamId(), kind, message, context });
    b.disabled = false;
    if (error) { $('#feedback-error').textContent = error.message; return; }
    $('#feedback-message').value = '';
    track('feedback', { kind });
    E.toast('Merci ! Votre avis a bien été envoyé.');
    renderMyFeedback();
  };
  async function renderMyFeedback() {
    const box = $('#feedback-mine'); box.replaceChildren();
    const { data } = await sb.from('feedback').select('id, kind, message, status, reply, created_at').eq('user_id', A.user().id).order('created_at', { ascending: false }).limit(20);
    if (!data || !data.length) return;
    box.appendChild(el('h4', 'home-h4', 'Mes avis envoyés'));
    data.forEach(f => {
      const item = el('div', 'comment');
      item.appendChild(el('div', 'who', `<strong>${KIND[f.kind]}</strong> <span class="fb-status ${f.status}">${STATUS[f.status]}</span> <span>${fmtDate(f.created_at)}</span>`));
      item.appendChild(el('div', 'body', esc(f.message)));
      if (f.reply) item.appendChild(el('div', 'body fb-reply', `<strong>Réponse :</strong> ${esc(f.reply)}`));
      box.appendChild(item);
    });
  }

  /* ---------- Page back-office ---------- */
  let tab = 'overview';
  let seq = 0;
  const cache = {};
  const TABS = [['overview', 'Vue d’ensemble'], ['feedback', 'Retours'], ['teams', 'Équipes'], ['users', 'Comptes'], ['drawings', 'Stratégies'], ['requests', 'Demandes'], ['errors', 'Erreurs'], ['announce', 'Annonces & options']];

  async function render() {
    const root = $('#admin-page'); if (!root) return;
    if (!A.isSuper()) { root.replaceChildren(el('p', 'library-empty', 'Réservé aux super-admins.')); return; }
    const my = ++seq;
    root.replaceChildren();
    const tabs = el('div', 'tabs small admin-tabs');
    TABS.forEach(([id, label]) => {
      const b = el('button', 'tab' + (tab === id ? ' active' : ''));
      b.textContent = label + (id === 'feedback' && cache.feedbackNew ? ` (${cache.feedbackNew})` : '') + (id === 'requests' && cache.pending ? ` (${cache.pending})` : '');
      b.onclick = () => { tab = id; render(); };
      tabs.appendChild(b);
    });
    root.appendChild(tabs);
    const body = el('div', 'admin-body');
    root.appendChild(body);
    body.appendChild(el('p', 'muted', 'Chargement…'));
    try {
      const fn = { overview: renderOverview, feedback: renderFeedback, teams: renderTeams, users: renderUsers, drawings: renderDrawings, requests: renderRequests, errors: renderErrors, announce: renderAnnounce }[tab];
      const content = await fn();
      if (my !== seq) return;
      body.replaceChildren(...[].concat(content));
    } catch (err) {
      if (my !== seq) return;
      body.replaceChildren(el('p', 'library-empty', 'Erreur : ' + esc(err.message || err)));
    }
  }
  const must = ({ data, error }) => { if (error) throw error; return data; };

  /* --- Vue d'ensemble --- */
  function kpi(label, value, sub) { return el('div', 'kpi', `<span class="kpi-label">${label}</span><strong>${value}</strong>${sub ? `<small>${sub}</small>` : ''}`); }
  function bars(title, rows, fmt) {
    const box = el('div', 'admin-card');
    box.appendChild(el('h4', '', title));
    if (!rows || !rows.length) { box.appendChild(el('p', 'muted small', 'Pas encore de données.')); return box; }
    const max = Math.max(...rows.map(r => r.n)) || 1;
    rows.forEach(r => box.appendChild(el('div', 'bar-row', `<span class="bar-name">${esc(fmt ? fmt(r.name) : r.name)}</span><span class="bar-track"><i style="width:${Math.max(2, 100 * r.n / max)}%"></i></span><span class="bar-n">${r.n}</span>`)));
    return box;
  }
  function columns(title, rows, key) {
    const box = el('div', 'admin-card wide');
    box.appendChild(el('h4', '', title));
    if (!rows || !rows.length) { box.appendChild(el('p', 'muted small', 'Pas encore de données.')); return box; }
    const max = Math.max(...rows.map(r => r.n)) || 1;
    const chart = el('div', 'col-chart');
    rows.forEach(r => { const c = el('div', 'col', `<i style="height:${Math.max(3, 100 * r.n / max)}%"></i>`); c.title = `${fmtDay(r[key])} : ${r.n}`; chart.appendChild(c); });
    box.appendChild(chart);
    box.appendChild(el('div', 'col-axis muted small', `<span>${fmtDay(rows[0][key])}</span><span>${fmtDay(rows[rows.length - 1][key])}</span>`));
    return box;
  }
  const TOOL_LABEL = id => { const t = window.RugbyPalette && window.RugbyPalette.TOOLS[id]; return t ? t.label : id; };
  const GROUP_LABEL = { formations: 'Formations', shapes: 'Formes', equip: 'Équipement', players: 'Joueurs' };
  const EVENT_LABEL = { session_start: 'Ouverture de l’appli', tool: 'Outil choisi', export: 'Export', preview: 'Aperçu', present: 'Mode présentation', save: 'Enregistrement', publish: 'Publication', propose: 'Proposition au coach', share_link: 'Lien public créé', comment: 'Commentaire', formation: 'Formation placée', duplicate: 'Duplication', step_add: 'Étape ajoutée', feedback: 'Avis envoyé', new_drawing: 'Nouveau dessin' };
  async function renderOverview() {
    const o = must(await sb.rpc('admin_overview'));
    cache.feedbackNew = o.feedback_new; cache.pending = o.members_pending;
    const vis = o.drawings_by_visibility || {};
    const dev = o.devices_30d || {};
    const devTotal = (dev.mobile || 0) + (dev.desktop || 0);
    const grid = el('div', 'kpi-grid');
    grid.append(
      kpi('Comptes', o.users, `+${o.users_7d} en 7 jours`),
      kpi('Équipes', o.teams, o.members_pending ? `${o.members_pending} demande(s) en attente` : 'aucune demande en attente'),
      kpi('Actifs', `${o.active_1d} / ${o.active_7d} / ${o.active_30d}`, 'jour / semaine / mois'),
      kpi('Dessins', o.drawings, `${vis.team || 0} publiés · ${vis.proposed || 0} proposés · ${vis.private || 0} privés`),
      kpi('Temps d’usage (30 j)', o.total_hours_30d + ' h', `${o.sessions_30d} sessions · ${fmtDur(o.avg_session_s)} en moyenne`),
      kpi('Part éditeur', o.editor_share + ' %', 'du temps passé dans l’éditeur'),
      kpi('Mobile', devTotal ? Math.round(100 * (dev.mobile || 0) / devTotal) + ' %' : '—', 'des sessions sur 30 jours'),
      kpi('Étapes par dessin', o.avg_steps, `${o.formations} formation(s) enregistrée(s)`),
      kpi('Retours', o.feedback_new, 'nouveaux à lire'),
      kpi('Erreurs (7 j)', o.errors_7d, 'remontées par les navigateurs')
    );
    const charts = el('div', 'admin-grid');
    charts.append(
      columns('Comptes actifs par jour (30 jours)', o.active_by_day, 'day'),
      columns('Inscriptions par semaine (12 semaines)', o.signups_by_week, 'week'),
      bars('Outils les plus utilisés (30 j)', o.tools_30d, TOOL_LABEL),
      bars('Familles d’outils (30 j)', o.tool_groups_30d, g => GROUP_LABEL[g] || g),
      bars('Actions (30 j)', o.events_30d, n => EVENT_LABEL[n] || n),
      bars('Exports (30 j)', o.exports_30d, k => k.toUpperCase()),
      bars('Terrains utilisés', o.fields, f => f.replace('full', 'complet').replace('half', 'demi').replace('empty', 'vide').replace('landscape', 'paysage').replace('portrait', 'portrait')),
      bars('Catégories des dessins', o.categories)
    );
    return [grid, charts];
  }

  /* --- Retours --- */
  let fbFilter = 'open';
  async function renderFeedback() {
    const rows = must(await sb.rpc('admin_feedback'));
    cache.feedbackNew = rows.filter(r => r.status === 'new').length;
    const bar = el('div', 'admin-filters');
    [['open', 'À traiter'], ['all', 'Tous'], ['new', 'Nouveaux'], ['planned', 'Prévus'], ['done', 'Faits'], ['bug', 'Bugs'], ['idea', 'Idées']].forEach(([id, label]) => {
      const b = btn(label, 'small ' + (fbFilter === id ? 'primary' : 'outline'), () => { fbFilter = id; render(); }); bar.appendChild(b);
    });
    const shown = rows.filter(r => fbFilter === 'all' ? true : fbFilter === 'open' ? ['new', 'seen', 'planned'].includes(r.status) : (STATUS[fbFilter] ? r.status === fbFilter : r.kind === fbFilter));
    const out = [bar];
    if (!shown.length) out.push(el('p', 'library-empty', 'Aucun retour dans ce filtre.'));
    shown.forEach(f => {
      const card = el('div', 'admin-card fb-card ' + f.status);
      const ctx = f.context || {};
      card.appendChild(el('div', 'fb-head', `<strong>${KIND[f.kind]}</strong> · ${esc(f.user_name || 'Compte supprimé')} <span class="muted">${esc(f.email)}</span>${f.team_name ? ` · <span class="vis-badge cat">${esc(f.team_name)}</span>` : ''} <span class="muted">· ${fmtDate(f.created_at)}</span>`));
      card.appendChild(el('p', 'fb-msg', esc(f.message)));
      card.appendChild(el('p', 'muted small', esc([ctx.view && 'page ' + ctx.view, ctx.drawing && '« ' + ctx.drawing + ' »', ctx.device, ctx.screen, ctx.build && 'version ' + ctx.build].filter(Boolean).join(' · '))));
      const form = el('div', 'fb-form');
      const sel = el('select', 'select small');
      Object.entries(STATUS).forEach(([v, l]) => { const o = el('option'); o.value = v; o.textContent = l; o.selected = f.status === v; sel.appendChild(o); });
      const note = el('textarea', 'admin-textarea'); note.placeholder = 'Note interne (visible des super-admins seulement)'; note.value = f.admin_note || ''; note.rows = 2;
      const reply = el('textarea', 'admin-textarea'); reply.placeholder = 'Réponse à l’auteur (il la verra dans « Donner mon avis »)'; reply.value = f.reply || ''; reply.rows = 2;
      const actions = el('div', 'admin-actions');
      actions.append(sel,
        btn('Enregistrer', 'primary small', async b => {
          b.disabled = true;
          const { error } = await sb.from('feedback').update({ status: sel.value, admin_note: note.value.trim() || null, reply: reply.value.trim() || null }).eq('id', f.id);
          b.disabled = false;
          if (error) return E.toast(error.message);
          E.toast('Retour mis à jour.'); render();
        }),
        btn('Supprimer', 'outline small danger', async () => {
          if (!confirm('Supprimer ce retour ?')) return;
          const { error } = await sb.from('feedback').delete().eq('id', f.id);
          if (error) return E.toast(error.message); render();
        }));
      form.append(note, reply, actions);
      card.appendChild(form);
      if (f.status === 'new') sb.from('feedback').update({ status: 'seen' }).eq('id', f.id).then(() => {});
      out.push(card);
    });
    return out;
  }

  /* --- Équipes --- */
  async function renderTeams() {
    const rows = must(await sb.rpc('admin_teams'));
    const t = table(['Équipe', 'Code', 'Créée par', 'Membres', 'Coachs', 'En attente', 'Publiées / total', 'Dernière activité', ''],
      rows.map(r => {
        const actions = el('div', 'admin-actions');
        actions.append(
          btn('Ouvrir', 'outline small', () => A.openTeam(r.id)),
          btn('Renommer', 'outline small', async () => {
            const name = prompt('Nouveau nom de l’équipe :', r.name); if (!name || name.trim() === r.name) return;
            const { error } = await sb.from('teams').update({ name: name.trim() }).eq('id', r.id);
            if (error) return E.toast(error.message); render();
          }),
          btn('Nouveau code', 'outline small', async () => {
            if (!confirm(`Générer un nouveau code pour « ${r.name} » ? L’ancien (${r.join_code}) ne fonctionnera plus.`)) return;
            const code = must(await sb.rpc('regenerate_join_code', { p_team: r.id }));
            E.toast('Nouveau code : ' + code); render();
          }),
          btn('Supprimer', 'outline small danger', async () => {
            if (!confirm(`Supprimer définitivement « ${r.name} », ses membres et ses stratégies publiées ?`)) return;
            const { error } = await sb.from('teams').delete().eq('id', r.id);
            if (error) return E.toast(error.message); render();
          }));
        return [esc(r.name), `<code>${esc(r.join_code)}</code>`, esc(r.created_by_name), r.members, r.coaches, r.pending ? `<strong>${r.pending}</strong>` : 0, `${r.published} / ${r.drawings}`, fmtDay(r.last_activity), actions];
      }));
    return [el('p', 'muted', `${rows.length} équipe${rows.length > 1 ? 's' : ''}`), t];
  }

  /* --- Comptes --- */
  let userFilter = '';
  async function renderUsers() {
    const rows = must(await sb.rpc('admin_users'));
    const ROLE = { coach: 'coach', admin: 'admin', player: 'joueur' };
    const search = el('input', 'admin-search'); search.type = 'search'; search.placeholder = 'Rechercher un nom, un e-mail, une équipe… (ou « sans équipe »)'; search.value = userFilter;
    const noTeam = rows.filter(r => !r.teams.length).length;
    const filtered = () => {
      const q = userFilter.toLowerCase().trim();
      if (!q) return rows;
      if (q === 'sans équipe' || q === 'sans equipe') return rows.filter(r => !r.teams.length);
      return rows.filter(r => [r.display_name, r.email, ...r.teams.map(t => t.name)].join(' ').toLowerCase().includes(q));
    };
    const holder = el('div');
    const draw = () => holder.replaceChildren(table(['Nom', 'E-mail', 'Équipes', 'Inscription', 'Dernière connexion', 'Vu dans l’appli', 'Dessins', 'Temps (30 j)', ''],
      filtered().map(r => {
        const teams = r.teams.length ? r.teams.map(t => `${esc(t.name)} <span class="muted">(${t.status === 'pending' ? 'en attente' : ROLE[t.role] || t.role})</span>`).join('<br>') : '<span class="muted">aucune</span>';
        const me = A.user().id === r.id;
        const actions = el('div', 'admin-actions');
        actions.appendChild(btn(r.is_superadmin ? 'Retirer super-admin' : 'Passer super-admin', 'outline small' + (r.is_superadmin ? ' danger' : ''), async () => {
          if (!confirm(r.is_superadmin ? `Retirer les droits super-admin de ${r.display_name} ?` : `Donner à ${r.display_name} l’accès complet au back-office et à toutes les équipes ?`)) return;
          const { error } = await sb.rpc('admin_set_superadmin', { p_user: r.id, p_on: !r.is_superadmin });
          if (error) return E.toast(error.message); render();
        }));
        if (me) actions.firstChild.disabled = true;
        return [`${esc(r.display_name)}${r.is_superadmin ? ' <span class="role-badge admin">Super-admin</span>' : ''}${me ? ' <span class="muted">(moi)</span>' : ''}`, esc(r.email), teams, fmtDay(r.created_at), fmtDate(r.last_sign_in_at), fmtDate(r.last_seen_at), r.drawings, fmtDur(r.seconds_30d), actions];
      })));
    search.oninput = () => { userFilter = search.value; draw(); };
    draw();
    return [el('p', 'muted', `${rows.length} compte${rows.length > 1 ? 's' : ''} · ${noTeam} sans équipe`), search, holder];
  }

  /* --- Stratégies (métadonnées : jamais le contenu des dessins privés) --- */
  let drawFilter = '';
  async function renderDrawings() {
    const rows = must(await sb.rpc('admin_drawings'));
    const VIS = { private: 'Privé', proposed: 'Proposé', team: 'Publié' };
    const search = el('input', 'admin-search'); search.type = 'search'; search.placeholder = 'Rechercher un titre, un auteur, une équipe, une catégorie…'; search.value = drawFilter;
    const holder = el('div');
    const draw = () => {
      const q = drawFilter.toLowerCase().trim();
      const list = q ? rows.filter(r => [r.title, r.owner_name, r.team_name, r.category, VIS[r.visibility]].join(' ').toLowerCase().includes(q)) : rows;
      holder.replaceChildren(table(['Titre', 'Auteur', 'Équipe', 'Visibilité', 'Catégorie', 'Étapes', 'Objets', 'Créé', 'Modifié'],
        list.map(r => [esc(r.title), esc(r.owner_name), esc(r.team_name) || '<span class="muted">—</span>', `<span class="vis-badge ${r.visibility}">${VIS[r.visibility] || r.visibility}</span>`, esc(r.category) || '<span class="muted">—</span>', r.steps, r.objects, fmtDay(r.created_at), fmtDate(r.updated_at)])));
    };
    search.oninput = () => { drawFilter = search.value; draw(); };
    draw();
    return [el('p', 'muted', `${rows.length} dessin${rows.length > 1 ? 's' : ''}. Le contenu des dessins privés reste visible uniquement par leur auteur.`), search, holder];
  }

  /* --- Demandes d'adhésion --- */
  async function renderRequests() {
    const rows = must(await sb.rpc('admin_pending_requests'));
    cache.pending = rows.length;
    if (!rows.length) return el('p', 'library-empty', 'Aucune demande en attente.');
    return table(['Équipe', 'Joueur', 'Demande du', ''], rows.map(r => {
      const actions = el('div', 'admin-actions');
      actions.append(
        btn('Accepter', 'primary small', async () => {
          const { error } = await sb.from('team_members').update({ status: 'active' }).match({ team_id: r.team_id, user_id: r.user_id });
          if (error) return E.toast(error.message); render();
        }),
        btn('Refuser', 'outline small danger', async () => {
          if (!confirm(`Refuser la demande de ${r.user_name} pour « ${r.team_name} » ?`)) return;
          const { error } = await sb.from('team_members').delete().match({ team_id: r.team_id, user_id: r.user_id });
          if (error) return E.toast(error.message); render();
        }));
      return [esc(r.team_name), esc(r.user_name), fmtDate(r.joined_at), actions];
    }));
  }

  /* --- Erreurs --- */
  async function renderErrors() {
    const rows = must(await sb.from('client_errors').select('id, message, stack, url, build, user_agent, created_at, user:profiles(display_name)').order('created_at', { ascending: false }).limit(200));
    const out = [];
    const head = el('div', 'admin-filters');
    head.appendChild(el('span', 'muted', `${rows.length} erreur${rows.length > 1 ? 's' : ''} (les 200 dernières)`));
    if (rows.length) head.appendChild(btn('Tout effacer', 'outline small danger', async () => {
      if (!confirm('Effacer toutes les erreurs remontées ?')) return;
      const { error } = await sb.from('client_errors').delete().gte('id', 0);
      if (error) return E.toast(error.message); render();
    }));
    out.push(head);
    rows.forEach(r => {
      const card = el('details', 'admin-card err-card');
      card.innerHTML = `<summary><strong>${esc(r.message)}</strong> <span class="muted">· ${esc((r.user && r.user.display_name) || '?')} · ${fmtDate(r.created_at)} · version ${esc(r.build || '?')}</span></summary><p class="muted small">${esc(r.url)}<br>${esc(r.user_agent)}</p>${r.stack ? `<pre>${esc(r.stack)}</pre>` : ''}`;
      out.push(card);
    });
    return out;
  }

  /* --- Annonces et drapeaux --- */
  async function renderAnnounce() {
    const [ann, fl, teams] = await Promise.all([
      sb.from('announcements').select('*').order('created_at', { ascending: false }).then(must),
      sb.from('feature_flags').select('*').order('key').then(must),
      sb.rpc('admin_teams').then(must)
    ]);
    const teamName = id => id ? ((teams.find(t => t.id === id) || {}).name || 'équipe supprimée') : 'Tout le monde';
    const teamSel = () => { const s = el('select', 'select small'); s.appendChild(Object.assign(el('option'), { value: '', textContent: 'Tout le monde' })); teams.forEach(t => s.appendChild(Object.assign(el('option'), { value: t.id, textContent: t.name }))); return s; };

    const a = el('div', 'admin-card wide');
    a.appendChild(el('h4', '', 'Bandeau d’annonce'));
    a.appendChild(el('p', 'muted small', 'Affiché en haut de l’appli pour les membres connectés (maintenance, nouvelle version, test terrain…). Chacun peut le fermer.'));
    const f = el('form', 'admin-form');
    const msg = el('input'); msg.placeholder = 'Message (300 caractères max.)'; msg.maxLength = 300; msg.required = true;
    const level = el('select', 'select small'); [['info', 'Info'], ['warning', 'Important']].forEach(([v, l]) => level.appendChild(Object.assign(el('option'), { value: v, textContent: l })));
    const ts = teamSel();
    const ends = el('input'); ends.type = 'date'; ends.title = 'Fin d’affichage (facultatif)';
    f.append(msg, level, ts, ends, Object.assign(el('button', 'btn primary small', 'Publier'), { type: 'submit' }));
    f.onsubmit = async e => {
      e.preventDefault();
      const { error } = await sb.from('announcements').insert({ message: msg.value.trim(), level: level.value, team_id: ts.value || null, ends_at: ends.value ? new Date(ends.value + 'T23:59:59').toISOString() : null, created_by: A.user().id });
      if (error) return E.toast(error.message); E.toast('Annonce publiée.'); loadAnnouncements(); render();
    };
    a.appendChild(f);
    a.appendChild(table(['Message', 'Pour', 'Niveau', 'Fin', 'Active', ''], ann.map(r => {
      const actions = el('div', 'admin-actions');
      actions.append(
        btn(r.active ? 'Désactiver' : 'Réactiver', 'outline small', async () => { const { error } = await sb.from('announcements').update({ active: !r.active }).eq('id', r.id); if (error) return E.toast(error.message); loadAnnouncements(); render(); }),
        btn('Supprimer', 'outline small danger', async () => { if (!confirm('Supprimer cette annonce ?')) return; const { error } = await sb.from('announcements').delete().eq('id', r.id); if (error) return E.toast(error.message); loadAnnouncements(); render(); }));
      return [esc(r.message), esc(teamName(r.team_id)), r.level === 'warning' ? 'Important' : 'Info', r.ends_at ? fmtDay(r.ends_at) : '—', r.active ? 'oui' : 'non', actions];
    })));

    const g = el('div', 'admin-card wide');
    g.appendChild(el('h4', '', 'Options de fonctionnalités'));
    g.appendChild(el('p', 'muted small', 'Pour tester une nouveauté avec un seul club avant de l’ouvrir à tous. La valeur d’une équipe l’emporte sur la valeur globale. Dans le code : RugbyAdmin.flag(\'cle\').'));
    const ff = el('form', 'admin-form');
    const key = el('input'); key.placeholder = 'clé (ex. cadrage-touche)'; key.pattern = '[a-z0-9_-]{2,40}'; key.required = true;
    const fts = teamSel();
    const note = el('input'); note.placeholder = 'Note (facultatif)';
    ff.append(key, fts, note, Object.assign(el('button', 'btn primary small', 'Ajouter'), { type: 'submit' }));
    ff.onsubmit = async e => {
      e.preventDefault();
      const { error } = await sb.from('feature_flags').insert({ key: key.value.trim(), team_id: fts.value || null, enabled: true, note: note.value.trim() || null });
      if (error) return E.toast(/duplicate/i.test(error.message) ? 'Cette option existe déjà pour ce périmètre.' : error.message); loadFlags(); render();
    };
    g.appendChild(ff);
    g.appendChild(table(['Clé', 'Pour', 'Active', 'Note', ''], fl.map(r => {
      const actions = el('div', 'admin-actions');
      actions.append(
        btn(r.enabled ? 'Désactiver' : 'Activer', 'outline small', async () => { const { error } = await sb.from('feature_flags').update({ enabled: !r.enabled }).eq('id', r.id); if (error) return E.toast(error.message); loadFlags(); render(); }),
        btn('Supprimer', 'outline small danger', async () => { if (!confirm(`Supprimer l’option « ${r.key} » ?`)) return; const { error } = await sb.from('feature_flags').delete().eq('id', r.id); if (error) return E.toast(error.message); loadFlags(); render(); }));
      return [`<code>${esc(r.key)}</code>`, esc(teamName(r.team_id)), r.enabled ? 'oui' : 'non', esc(r.note), actions];
    })));
    return [a, g];
  }

  /** Tableau : les cellules sont du HTML (déjà échappé) ou des éléments DOM. */
  function table(headers, rows) {
    const wrap = el('div', 'admin-table-wrap');
    const t = el('table', 'admin-table');
    t.appendChild(el('thead', '', '<tr>' + headers.map(h => `<th>${h}</th>`).join('') + '</tr>'));
    const tb = el('tbody');
    if (!rows.length) tb.appendChild(el('tr', '', `<td colspan="${headers.length}" class="muted">Aucune donnée.</td>`));
    rows.forEach(cells => {
      const tr = el('tr');
      cells.forEach((c, i) => { const td = el('td'); td.dataset.label = headers[i]; if (c instanceof Node) td.appendChild(c); else td.innerHTML = c == null ? '' : String(c); tr.appendChild(td); });
      tb.appendChild(tr);
    });
    t.appendChild(tb); wrap.appendChild(t);
    return wrap;
  }

  $('#admin-back').onclick = () => E.go('home');
  $('#admin-refresh').onclick = () => render();
  $('#home-feedback').onclick = openFeedback;
  $('#btn-feedback').onclick = openFeedback;
  $('#btn-admin').onclick = () => { E.closeModal('modal-team'); E.go('admin'); };

  window.RugbyTrack = { track, flush };
  window.RugbyAdmin = { onSession, render, flag, openFeedback };
  onSession();
})();
