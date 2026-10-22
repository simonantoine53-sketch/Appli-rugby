/* Back-office super-admin, retours utilisateurs, statistiques d'usage, erreurs clients,
   annonces et drapeaux de fonctionnalités. Inactif en mode local (sans Supabase). */
(function () {
  const de = name => (/^[aeiouyàâäéèêëîïôöùûü]/i.test(name || '') ? 'd’' : 'de ');   // d’Emma, de Léo
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
  const build = (() => { const s = document.querySelector('script[src*="?v="]'); const m = s && /[?&]v=([^&]+)/.exec(s.src); return m ? m[1] : 'dev'; })();
  const view = () => location.hash.replace(/^#\/?/, '').split(/[/?]/)[0] || 'home';
  const loggedIn = () => A.isLoggedIn() && A.user();
  const teamId = () => { const t = A.team && A.team(); return t ? t.id : null; };
  // Mesure d'usage (événements, temps passé) : seulement avec l'accord de la personne (bandeau de consentement)
  const consentOk = () => !!(window.RugbyConsent && window.RugbyConsent.stats());

  /* ---------- Suivi d'usage : événements ---------- */
  const queue = [];
  function track(name, props) {
    if (!loggedIn() || !consentOk()) return;
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
    if (!loggedIn() || !consentOk() || document.visibilityState !== 'visible') return;
    if (sess.user !== A.user().id) Object.assign(sess, { id: crypto.randomUUID(), user: A.user().id, seconds: 0, editor: 0 });
    sess.seconds += TICK; if (view() === 'editor') sess.editor += TICK;
    sess.dirty = true;
    if (sess.seconds % 60 === 0) saveSession();
  }, TICK * 1000);
  async function saveSession() {
    if (!sess.dirty || !sess.id || !loggedIn() || !consentOk() || sess.user !== A.user().id) return;
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
    if (uid) { track('session_start', { view: view(), standalone: installed() }); touchActivity(uid); }
  }

  /* ---------- Mesure d'audience anonyme : onglets visités et personnes actives ----------
     Aucun identifiant n'est envoyé avec les onglets ; la personne peut s'y opposer (page Cookies).
     Le temps passé par onglet, lui, est lié au compte : seulement avec l'accord (bandeau). */
  const installed = () => !!(window.navigator.standalone || matchMedia('(display-mode: standalone)').matches);
  const anonOk = () => !(window.RugbyConsent && window.RugbyConsent.anon && !window.RugbyConsent.anon());
  const PAGE_OF = { home: 'home', agenda: 'agenda', strategies: 'strats', compos: 'compos', team: 'team', account: 'account', editor: 'editor', d: 'editor', admin: 'admin' };
  let navSource = /[?&]from=notif\b/.test(location.search) ? 'notif' : 'link';
  let curPage = null, pageSince = Date.now();
  // La barre du bas et les tuiles de l'accueil disent d'où vient le clic (sinon : lien dans une page)
  window.RugbyNavSource = s => { navSource = s; };
  function pageTime() {
    if (!curPage || !consentOk()) return;
    const s = Math.round((Date.now() - pageSince) / 1000);
    if (s >= 2) track('page_time', { page: curPage, s: Math.min(s, 3600) });
  }
  function onView() {
    const page = PAGE_OF[view()] || 'other';
    if (page === curPage) return;
    pageTime();
    curPage = page; pageSince = Date.now();
    if (anonOk()) sb.rpc('count_page', { p_page: page, p_source: navSource, p_device: device(), p_installed: installed() }).then(({ error }) => { if (error) console.warn('count_page', error.message); });
    navSource = 'link';
  }
  window.addEventListener('hashchange', onView);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { pageTime(); flush(); } else { pageSince = Date.now(); if (loggedIn()) touchActivity(A.user().id); } });
  setTimeout(onView, 1500);
  // Personne active aujourd'hui : une fois par jour et par appareil (compteurs anonymes + date de dernière activité)
  function touchActivity(uid) {
    const today = new Date().toISOString().slice(0, 10), key = 'rs-active-' + uid;
    try { if (localStorage.getItem(key) === today) return; localStorage.setItem(key, today); } catch (e) { /* ignore */ }
    sb.rpc('touch_activity').then(({ error }) => { if (error) console.warn('touch_activity', error.message); });
  }

  /* ---------- Retours utilisateurs ---------- */
  const KIND = { bug: '🐞 Bug', idea: '💡 Idée', other: '💬 Autre' };
  const STATUS = { new: 'Nouveau', seen: 'Vu', planned: 'Prévu', done: 'Fait', rejected: 'Écarté' };
  function openFeedback() {
    if (!loggedIn()) { A.openAuth(); E.toast('Connectez-vous pour donner votre avis.'); return; }
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
  const TABS = [['overview', 'Vue d’ensemble'], ['feedback', 'Retours'], ['clubs', 'Clubs'], ['teams', 'Équipes'], ['users', 'Comptes'], ['drawings', 'Stratégies'], ['requests', 'Demandes'], ['errors', 'Erreurs'], ['announce', 'Annonces & options']];

  async function render() {
    const root = $('#admin-page'); if (!root) return;
    if (!A.isSuper()) { root.replaceChildren(el('p', 'library-empty', 'Réservé aux super-admins.')); return; }
    const my = ++seq;
    root.replaceChildren(el('h1', 'admin-title', 'Back-office'));
    const tabs = el('div', 'tabs small admin-tabs');
    TABS.forEach(([id, label]) => {
      const b = el('button', 'tab' + (tab === id ? ' active' : ''));
      b.textContent = label + (id === 'feedback' && cache.feedbackNew ? ` (${cache.feedbackNew})` : '') + (id === 'requests' && cache.pending ? ` (${cache.pending})` : '');
      b.onclick = () => { tab = id; render(); };
      tabs.appendChild(b);
    });
    const refresh = btn('↻ Actualiser', 'outline small', () => render()); refresh.classList.add('admin-refresh');
    root.append(tabs, refresh);
    const body = el('div', 'admin-body');
    root.appendChild(body);
    body.appendChild(el('p', 'muted', 'Chargement…'));
    try {
      const fn = { overview: renderOverview, feedback: renderFeedback, clubs: renderClubs, teams: renderTeams, users: renderUsers, drawings: renderDrawings, requests: renderRequests, errors: renderErrors, announce: renderAnnounce }[tab];
      const content = await fn();
      if (my !== seq) return;
      body.replaceChildren(...[].concat(content));
    } catch (err) {
      if (my !== seq) return;
      body.replaceChildren(el('p', 'library-empty', 'Erreur : ' + esc(err.message || err)));
    }
  }
  const must = ({ data, error }) => { if (error) throw error; return data; };

  /* --- Vue d'ensemble : tableau de bord en 5 étages (santé, onglets, fonctions, démarrage et fidélité, clubs et qualité) --- */
  function kpi(label, value, sub) { return el('div', 'kpi', `<span class="kpi-label">${label}</span><strong>${value}</strong>${sub ? `<small>${sub}</small>` : ''}`); }
  function bars(title, rows, fmt, note) {
    const box = el('div', 'admin-card');
    box.appendChild(el('h4', '', title));
    if (note) box.appendChild(el('p', 'muted small dash-note', note));
    if (!rows || !rows.length || !rows.some(r => r.n)) { box.appendChild(el('p', 'muted small', 'Pas encore de données sur la période.')); return box; }
    const max = Math.max(...rows.map(r => r.n)) || 1;
    rows.forEach(r => box.appendChild(el('div', 'bar-row', `<span class="bar-name">${esc(fmt ? fmt(r.name) : r.name)}</span><span class="bar-track"><i style="width:${Math.max(2, 100 * r.n / max)}%"></i></span><span class="bar-n">${esc(r.label || String(r.n))}</span>`)));
    return box;
  }
  const pct = (a, b) => b ? Math.round(100 * a / b) + ' %' : '—';
  const wkLabel = w => new Date(w + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  const hrs = h => h == null ? '—' : h < 1 ? Math.round(h * 60) + ' min' : h < 48 ? Math.round(h) + ' h' : Math.round(h / 24) + ' j';

  // Infobulle commune aux graphiques (survol ou appui)
  let tip = null;
  function showTip(evt, html) {
    if (!tip) { tip = el('div', 'dash-tip'); document.body.appendChild(tip); }
    tip.innerHTML = html; tip.classList.remove('hidden');
    const x = Math.min(evt.clientX + 12, innerWidth - tip.offsetWidth - 8), y = Math.max(8, evt.clientY - tip.offsetHeight - 12);
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  }
  const hideTip = () => { if (tip) tip.classList.add('hidden'); };

  /** Frise par semaine : colonnes empilées (une ou plusieurs séries), axe des semaines, valeurs au survol. */
  function weekChart(title, weeks, series, opts) {
    const o = opts || {};
    const box = el('div', 'admin-card' + (o.wide ? ' wide' : ''));
    box.appendChild(el('h4', '', title));
    if (o.note) box.appendChild(el('p', 'muted small dash-note', o.note));
    const totals = weeks.map((_, i) => series.reduce((t, s) => t + (s.values[i] || 0), 0));
    if (!totals.some(Boolean)) { box.appendChild(el('p', 'muted small', 'Pas encore de données sur la période.')); return box; }
    // Largeur de dessin proche de la largeur affichée : le texte garde la même taille sur les petites et les grandes cartes
    const big = o.wide && innerWidth > 760;
    const W = big ? 1200 : 420, H = big ? 190 : 150, padL = 30, padB = 22, padT = 8, n = weeks.length, gap = n > 20 ? 2 : 4;
    const max = Math.max(...totals), step = max <= 5 ? 1 : Math.ceil(max / 4);
    const top = Math.ceil(max / step) * step, colW = (W - padL) / n;
    const y = v => padT + (H - padT - padB) * (1 - v / top);
    let svg = `<svg viewBox="0 0 ${W} ${H}" class="dash-svg" role="img" aria-label="${esc(title)}">`;
    for (let v = 0; v <= top; v += step) svg += `<line x1="${padL}" x2="${W}" y1="${y(v)}" y2="${y(v)}" class="dash-grid"/><text x="${padL - 6}" y="${y(v) + 4}" class="dash-tick" text-anchor="end">${v}</text>`;
    weeks.forEach((w, i) => {
      let base = 0; const x = padL + i * colW + gap / 2, cw = Math.max(2, colW - gap);
      series.forEach((s, k) => {
        const v = s.values[i] || 0; if (!v) return;
        const y0 = y(base), y1 = y(base + v); base += v;
        const last = !series.slice(k + 1).some(t => t.values[i]);
        svg += `<rect x="${x}" y="${y1}" width="${cw}" height="${Math.max(1, y0 - y1 - (last ? 0 : 2))}" rx="${last ? 3 : 0}" style="fill:${s.color}"/>`;
      });
      svg += `<rect x="${padL + i * colW}" y="0" width="${colW}" height="${H - padB}" fill="transparent" class="dash-hit" data-i="${i}"/>`;
      if (i === 0 || i === n - 1 || (n > 6 && i === Math.floor(n / 2))) svg += `<text x="${padL + i * colW + colW / 2}" y="${H - 6}" class="dash-tick" text-anchor="middle">${wkLabel(w)}</text>`;
    });
    svg += '</svg>';
    const wrap = el('div', 'dash-chart', svg); box.appendChild(wrap);
    wrap.querySelectorAll('.dash-hit').forEach(r => {
      const i = +r.dataset.i;
      const html = `<strong>Semaine du ${wkLabel(weeks[i])}</strong>` + (series.length > 1 ? series.map(s => `<span><i style="background:${s.color}"></i>${esc(s.name)} : ${s.values[i] || 0}</span>`).join('') + `<span>Total : ${totals[i]}</span>` : `<span>${totals[i]}</span>`);
      r.addEventListener('mousemove', e => showTip(e, html)); r.addEventListener('mouseleave', hideTip);
      r.addEventListener('click', e => showTip(e, html));
    });
    if (series.length > 1) {
      const lg = el('div', 'dash-legend');
      series.forEach(s => lg.appendChild(el('span', '', `<i style="background:${s.color}"></i>${esc(s.name)} <b>${s.values.reduce((a, b) => a + (b || 0), 0)}</b>`)));
      box.appendChild(lg);
    }
    return box;
  }
  /** Entonnoir : chaque étape en barre, avec le % de la première. */
  function funnel(title, steps, note) {
    const box = el('div', 'admin-card');
    box.appendChild(el('h4', '', title));
    if (note) box.appendChild(el('p', 'muted small dash-note', note));
    const first = steps[0] ? steps[0].n : 0;
    if (!first) { box.appendChild(el('p', 'muted small', 'Pas encore de données sur la période.')); return box; }
    steps.forEach((st, i) => box.appendChild(el('div', 'bar-row', `<span class="bar-name">${esc(st.name)}</span><span class="bar-track"><i style="width:${Math.max(2, 100 * st.n / first)}%"></i></span><span class="bar-n">${st.n}${i ? ` <small>${pct(st.n, first)}</small>` : ''}</span>`)));
    return box;
  }
  const section = (n, title, sub) => el('div', 'dash-section', `<span class="dash-step">${n}</span><div><h3>${title}</h3>${sub ? `<p class="muted small">${sub}</p>` : ''}</div>`);
  const PAGE_LABEL = { home: 'Accueil', agenda: 'Agenda', strats: 'Stratégies', compos: 'Compos', team: 'Équipe' };
  const PAGE_COLOR = { home: 'var(--chart-1)', agenda: 'var(--chart-2)', strats: 'var(--chart-3)', compos: 'var(--chart-4)', team: 'var(--chart-5)' };
  const SOURCE_LABEL = { nav: 'Barre du bas', tile: 'Tuile de l’accueil', notif: 'Notification', link: 'Lien dans une page', other: 'Autre' };
  let period = 12;

  async function renderOverview() {
    const [m, pend] = await Promise.all([
      sb.rpc('admin_metrics', { p_weeks: period }).then(must),
      sb.from('team_members').select('user_id', { count: 'exact', head: true }).eq('status', 'pending')
    ]);
    cache.feedbackNew = m.feedback_new; cache.pending = pend.count || 0;
    const W = m.weeks || [];
    const out = [];

    // Période des frises
    const seasonWeeks = (() => { const now = new Date(), y = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1; return Math.max(1, Math.ceil((now - new Date(y, 6, 1)) / (7 * 864e5))); })();
    const bar = el('div', 'admin-filters dash-period');
    [[4, '4 semaines'], [12, '12 semaines'], [seasonWeeks, 'Saison (depuis le 1er juillet)']].forEach(([w, label]) => bar.appendChild(btn(label, 'small ' + (period === w ? 'primary' : 'outline'), () => { period = w; render(); })));
    out.push(bar);

    // 1. Santé
    const a = m.active, delta = a.week - a.week_prev;
    out.push(section(1, 'Santé de l’appli', 'Personnes actives : toute personne connectée au moins une fois sur la période (compteur anonyme, tout le monde est compté).'));
    const g1 = el('div', 'kpi-grid');
    g1.append(
      kpi('Personnes actives cette semaine', a.week, a.week_prev || a.week ? `${delta >= 0 ? '+' : ''}${delta} par rapport à la semaine dernière` : 'semaine en cours'),
      kpi('Aujourd’hui', a.day, `${Number(a.avg_day_month || 0).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} par jour en moyenne ce mois-ci`),
      kpi('Ce mois-ci', a.month, 'personnes différentes'),
      kpi('Fidélité', pct(a.week, a.month), 'des actifs du mois sont venus cette semaine'),
      kpi('Comptes', m.new.total_accounts, `${m.new.total_teams} équipes · ${m.new.total_clubs} clubs`)
    );
    out.push(g1);
    const c1 = el('div', 'admin-grid');
    c1.append(
      weekChart('Personnes actives par semaine', W, [{ name: 'Actives', values: a.by_week, color: 'var(--chart-1)' }], { wide: true, note: 'Compteur démarré le 20 octobre 2026 : les semaines d’avant sont vides.' }),
      weekChart('Nouveaux comptes par semaine', W, [{ name: 'Comptes', values: m.new.accounts, color: 'var(--chart-1)' }]),
      weekChart('Nouvelles équipes et nouveaux clubs', W, [{ name: 'Équipes', values: m.new.teams, color: 'var(--chart-1)' }, { name: 'Clubs', values: m.new.clubs, color: 'var(--chart-2)' }])
    );
    out.push(c1);

    // 2. Onglets
    out.push(section(2, 'Ce qui est utilisé', 'Onglets ouverts et origine des clics : compteurs anonymes, sauf pour les personnes qui s’y opposent.'));
    const pw = m.pages.by_week || {};
    const main = ['home', 'agenda', 'strats', 'compos', 'team'];
    const others = W.map((_, i) => Object.keys(pw).filter(k => !main.includes(k)).reduce((t, k) => t + (pw[k][i] || 0), 0));
    const c2 = el('div', 'admin-grid');
    c2.append(weekChart('Onglets ouverts par semaine', W, main.map(k => ({ name: PAGE_LABEL[k], values: pw[k] || W.map(() => 0), color: PAGE_COLOR[k] })).concat([{ name: 'Autres (Compte, éditeur…)', values: others, color: 'var(--chart-other)' }]), { wide: true }));
    const time = m.pages.time || {}, tTot = Object.values(time).reduce((x, y) => x + y, 0);
    c2.append(bars('Temps passé par onglet', main.concat(['editor', 'account']).map(k => ({ name: k, n: time[k] || 0, label: tTot ? `${pct(time[k] || 0, tTot)} · ${fmtDur(time[k] || 0)}` : '0' })).sort((x, y) => y.n - x.n),
      k => PAGE_LABEL[k] || ({ editor: 'Éditeur de stratégies', account: 'Compte' })[k] || k, `Seulement les ${m.pages.time_people} personne(s) qui ont accepté la mesure détaillée.`));
    const src = m.pages.sources || {}, sTot = Object.values(src).reduce((x, y) => x + y, 0);
    c2.append(bars('D’où viennent les clics', Object.entries(src).map(([k, n]) => ({ name: k, n, label: pct(n, sTot) })).sort((x, y) => y.n - x.n), k => SOURCE_LABEL[k] || k));
    const dev = m.pages.devices || {}, inst = m.pages.installed || {};
    c2.append(bars('Appareils', [{ name: 'Téléphone', n: dev.mobile || 0, label: pct(dev.mobile || 0, (dev.mobile || 0) + (dev.desktop || 0)) }, { name: 'Ordinateur', n: dev.desktop || 0, label: pct(dev.desktop || 0, (dev.mobile || 0) + (dev.desktop || 0)) },
      { name: 'Téléphone : appli installée', n: inst.app || 0, label: pct(inst.app || 0, (inst.app || 0) + (inst.web || 0)) + ' des clics sur téléphone' }]));
    out.push(c2);

    // 3. Fonctions
    out.push(section(3, 'Chaque fonction sert-elle ?', 'Calculé sur les données de l’appli (tout le monde). Relances, impressions et invitations : seulement les personnes qui ont accepté la mesure détaillée.'));
    const st = m.strats, ag = m.agenda, co = m.compos, tm = m.team;
    const g3 = el('div', 'kpi-grid');
    g3.append(
      kpi('Stratégies vues sous 48 h', pct(st.seen48, st.audience), `des joueurs, sur ${st.pub_count} stratégie(s) publiée(s) · délai médian ${hrs(st.median_h)}`),
      kpi('Animations lues', pct(st.played, st.seen), `des joueurs qui ont ouvert une stratégie · ${st.proposals} proposition(s) de joueurs`),
      kpi('Réponses aux convocations', pct(ag.answered, ag.convoked), `${ag.past} événement(s) passé(s) · délai médian ${hrs(ag.median_h)} · ${ag.reminders} relance(s)`),
      kpi('Matchs avec compo publiée', `${co.published} / ${co.matches}`, `${co.prints} impression(s) · ${co.images} image(s) partagée(s)`),
      kpi('Notifications activées', pct(m.push.users, m.push.total), `${m.push.users} compte(s) sur ${m.push.total}`)
    );
    out.push(g3);
    const c3 = el('div', 'admin-grid');
    c3.append(
      weekChart('Stratégies créées et publiées', W, [{ name: 'Créées', values: st.created, color: 'var(--chart-1)' }, { name: 'Publiées', values: st.published, color: 'var(--chart-2)' }]),
      weekChart('Événements créés (agenda)', W, [{ name: 'Événements', values: ag.created, color: 'var(--chart-1)' }]),
      funnel('Invitations', [{ name: 'Invitations envoyées', n: tm.invites }, { name: 'Comptes créés', n: tm.accounts }, { name: 'Demandes pour une équipe', n: tm.requests }, { name: 'Membres acceptés', n: tm.accepted }], 'Les invitations ne comptent que les personnes qui ont accepté la mesure détaillée.')
    );
    // Intérêt pour les fonctions à venir (clics « Ça m'intéresse »)
    const { data: interest } = await sb.from('events').select('props, user_id').eq('name', 'interest').gte('created_at', new Date(Date.now() - period * 7 * 864e5).toISOString());
    const FEAT = { agenda: 'Agenda et convocations', seances: 'Séances d’entraînement', compos: 'Compositions et feuille de match' };
    const byFeat = {}; (interest || []).forEach(e => { const f = (e.props && e.props.feature) || '?'; (byFeat[f] = byFeat[f] || new Set()).add(e.user_id); });
    c3.append(bars('Demande pour les fonctions à venir (comptes)', Object.entries(byFeat).map(([k, v]) => ({ name: k, n: v.size })).sort((x, y) => y.n - x.n), k => FEAT[k] || k));
    out.push(c3);

    // 4. Démarrage et fidélité
    out.push(section(4, 'Est-ce que les gens restent ?', 'Comptes créés sur la période.'));
    const fc = m.funnel_coach, fp = m.funnel_player;
    const c4 = el('div', 'admin-grid');
    c4.append(
      funnel('Démarrage côté coach', [{ name: 'Comptes créés', n: fc[0] }, { name: 'Dans une équipe', n: fc[1] }, { name: 'Coach ou admin', n: fc[2] }, { name: 'Équipe de 5 membres ou plus', n: fc[3] }, { name: '1re stratégie publiée', n: fc[4] }, { name: '1er événement créé', n: fc[5] }]),
      funnel('Démarrage côté joueur', [{ name: 'Demande comme joueur', n: fp[0] }, { name: 'Accepté dans l’équipe', n: fp[1] }, { name: '1re réponse à une convocation', n: fp[2] }, { name: '1re stratégie vue', n: fp[3] }])
    );
    const ret = el('div', 'admin-card wide');
    ret.appendChild(el('h4', '', 'Retour des nouveaux inscrits'));
    ret.appendChild(el('p', 'muted small dash-note', 'Par semaine d’inscription : part de ceux qui ont été actifs 1 semaine puis 4 semaines après.'));
    if (!(m.retention || []).length) ret.appendChild(el('p', 'muted small', 'Pas encore d’inscriptions sur la période.'));
    else ret.appendChild(table(['Semaine d’inscription', 'Inscrits', 'Revenus à 1 semaine', 'Revenus à 4 semaines'], m.retention.map(r => [wkLabel(r.w), r.n, r.w1 == null ? '<span class="muted">trop tôt</span>' : `${pct(r.w1, r.n)} <span class="muted">(${r.w1})</span>`, r.w4 == null ? '<span class="muted">trop tôt</span>' : `${pct(r.w4, r.n)} <span class="muted">(${r.w4})</span>`])));
    c4.appendChild(ret);
    out.push(c4);

    // 5. Clubs et qualité
    out.push(section(5, 'Clubs et qualité'));
    const c5 = el('div', 'admin-grid');
    const cl = el('div', 'admin-card wide');
    cl.appendChild(el('h4', '', 'Clubs'));
    cl.appendChild(table(['Club', 'Équipes', 'Membres', 'Actifs cette semaine', 'Dernière activité'], (m.clubs || []).slice().sort((x, y) => y.active - x.active || y.members - x.members).map(c => [esc(c.name), c.teams, c.members, c.active ? `<strong>${c.active}</strong>` : 0, fmtDay(c.last)])));
    c5.append(cl, weekChart('Erreurs techniques par semaine', W, [{ name: 'Erreurs', values: m.errors, color: 'var(--chart-other)' }]));
    const fb = el('div', 'admin-card'); fb.appendChild(el('h4', '', 'Retours à lire')); fb.appendChild(el('p', 'dash-big', String(m.feedback_new)));
    fb.appendChild(btn('Ouvrir les retours', 'outline small', () => { tab = 'feedback'; render(); }));
    c5.appendChild(fb);
    out.push(c5);
    return out;
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
          if (!await window.RugbyDialog.confirm('Supprimer ce retour ?')) return;
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

  /* --- Clubs : création (interrupteur), direction de chaque club --- */
  async function renderClubs() {
    const [rows, flags, users] = await Promise.all([
      sb.rpc('admin_clubs').then(must),
      sb.from('feature_flags').select('id, enabled').eq('key', 'club_creation').is('team_id', null).then(must),
      sb.rpc('admin_users').then(must)
    ]);
    const flag = flags[0];
    // Interrupteur : création de club libre (payant plus tard) ou sur invitation (par défaut)
    const sw = el('div', 'admin-card wide');
    sw.appendChild(el('h4', '', 'Création de clubs'));
    const lab = el('label', 'row-wrap', `<input type="checkbox" class="switch"${flag && flag.enabled ? ' checked' : ''}> <span>${flag && flag.enabled ? 'Ouverte : tout le monde peut créer son club' : 'Sur invitation : seul le super-admin crée les clubs'}</span>`);
    lab.querySelector('input').onchange = async e => {
      const on = e.target.checked;
      const res = flag ? await sb.from('feature_flags').update({ enabled: on }).eq('id', flag.id) : await sb.from('feature_flags').insert({ key: 'club_creation', enabled: on, note: 'Création de clubs ouverte à tous' });
      if (res.error) { E.toast(res.error.message); e.target.checked = !on; return; }
      E.toast(on ? 'Création de clubs ouverte à tous.' : 'Création de clubs sur invitation.'); render();
    };
    sw.appendChild(lab);
    sw.appendChild(el('p', 'muted small', 'Fermée, le bouton « Créer un club » est grisé dans l’appli : les gens rejoignent un club existant avec son code.'));
    const add = btn('+ Créer un club', 'primary small', async () => {
      const name = await window.RugbyDialog.prompt('Nom du club', '', { title: 'Nouveau club', placeholder: 'Ex. SC Bernay', maxLength: 60 }); if (!name) return;
      const first = await window.RugbyDialog.prompt('Première équipe (facultatif)', 'Séniors', { title: `Club « ${name} »`, maxLength: 60, required: false });
      const { error } = await sb.rpc('create_club', { p_name: name, p_team: first || null });
      if (error) return E.toast(error.message);
      E.toast(`Club « ${name} » créé. Nommez son bureau ci-dessous.`); render();
    });
    const byName = users.slice().sort((a, b) => (a.display_name || '').localeCompare(b.display_name || ''));
    const t = table(['Club', 'Code', 'Équipes', 'Membres', 'Bureau', ''], rows.map(r => {
      const actions = el('div', 'admin-actions');
      // Nommer au bureau : la personne, puis sa fonction (Présidente, Secrétaire…), qui donne la gestion du club
      const TITLES = ['Président', 'Présidente', 'Vice-président(e)', 'Secrétaire', 'Trésorier', 'Trésorière', 'Membre du bureau'];
      const nominate = btn('Nommer au bureau', 'outline small', () => window.RugbySelect.openMenu(nominate,
        byName.filter(u => !r.responsables.find(x => x.user_id === u.id)).map(u => [`${u.display_name} · ${u.email}`, () => setTimeout(() => window.RugbySelect.openMenu(nominate,
          TITLES.map(title => [title, async () => {
            const { error } = await sb.rpc('set_club_function', { p_club: r.id, p_user: u.id, p_title: title });
            if (error) return E.toast(error.message); E.toast(`${u.display_name} : ${title} de « ${r.name} ».`); render();
          }]), `Fonction ${de(u.display_name)}${u.display_name}`), 50)]), `Bureau de « ${r.name} »`));
      actions.appendChild(nominate);
      if (r.responsables.length) {
        const removeBtn = btn('Retirer du bureau', 'outline small danger', () => window.RugbySelect.openMenu(removeBtn,
          r.responsables.map(x => [x.name, async () => {
            const { error } = await sb.rpc('set_club_role', { p_club: r.id, p_user: x.user_id, p_role: 'member' });
            if (error) return E.toast(error.message); E.toast(`${x.name} ne fait plus partie du bureau.`); render();
          }]), `Bureau de « ${r.name} »`));
        actions.appendChild(removeBtn);
      }
      return [esc(r.name), `<code>${esc(r.join_code)}</code>`, r.teams, r.members, r.responsables.length ? r.responsables.map(x => esc(x.name) + (x.title ? ` <span class="muted">(${esc(x.title)})</span>` : '')).join(', ') : '<span class="muted">à nommer</span>', actions];
    }));
    const addRow = el('div', 'admin-actions'); addRow.appendChild(add);
    return [sw, addRow, el('p', 'muted', `${rows.length} club${rows.length > 1 ? 's' : ''}`), t];
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
            const name = await window.RugbyDialog.prompt('Nouveau nom', r.name, { title: 'Renommer l’équipe', maxLength: 60 }); if (!name || name === r.name) return;
            const { error } = await sb.from('teams').update({ name: name.trim() }).eq('id', r.id);
            if (error) return E.toast(error.message); render();
          }),
          btn('Nouveau code', 'outline small', async () => {
            if (!await window.RugbyDialog.confirm(`Générer un nouveau code pour « ${r.name} » ? L’ancien (${r.join_code}) ne fonctionnera plus.`)) return;
            const code = must(await sb.rpc('regenerate_join_code', { p_team: r.id }));
            E.toast('Nouveau code : ' + code); render();
          }),
          btn('Supprimer', 'outline small danger', async () => {
            if (!await window.RugbyDialog.confirm(`Supprimer définitivement « ${r.name} », ses membres et ses stratégies publiées ?`)) return;
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
          if (!await window.RugbyDialog.confirm(r.is_superadmin ? `Retirer les droits super-admin ${de(r.display_name)}${r.display_name} ?` : `Donner à ${r.display_name} l’accès complet au back-office et à toutes les équipes ?`)) return;
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
          if (!await window.RugbyDialog.confirm(`Refuser la demande de ${r.user_name} pour « ${r.team_name} » ?`)) return;
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
      if (!await window.RugbyDialog.confirm('Effacer toutes les erreurs remontées ?')) return;
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
        btn('Supprimer', 'outline small danger', async () => { if (!await window.RugbyDialog.confirm('Supprimer cette annonce ?')) return; const { error } = await sb.from('announcements').delete().eq('id', r.id); if (error) return E.toast(error.message); loadAnnouncements(); render(); }));
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
        btn('Supprimer', 'outline small danger', async () => { if (!await window.RugbyDialog.confirm(`Supprimer l’option « ${r.key} » ?`)) return; const { error } = await sb.from('feature_flags').delete().eq('id', r.id); if (error) return E.toast(error.message); loadFlags(); render(); }));
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

  $('#btn-feedback').onclick = openFeedback;
  $('#btn-admin').onclick = () => E.go('admin');

  window.RugbyTrack = { track, flush };
  window.RugbyAdmin = { onSession, render, flag, openFeedback };
  onSession();
})();
