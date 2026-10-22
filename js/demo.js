/* « Voir la démo » : l'appli tourne sur une copie en lecture seule du club démo (fonction demo_snapshot de la base),
   vue comme le coach de l'équipe ou comme un joueur, au choix. Rien n'est envoyé à la base : les écritures sont ignorées
   (toast « Mode démo »), aucune notification, aucun e-mail. Activé pour l'onglet en cours seulement (sessionStorage).
   Mesure anonyme (count_demo) : ouvertures de la démo par rôle, et comptes créés sur un appareil où elle a été ouverte. */
(function () {
  'use strict';
  const KEY = 'rs-demo', SEEN = 'rs-demo-vu', WANT = 'rs-demo-strategie', MONTH = 30 * 864e5;
  let role = null;
  try { const v = sessionStorage.getItem(KEY); role = v === 'joueur' ? 'joueur' : v ? 'coach' : null; } catch (e) { /* stockage indisponible : pas de démo */ }
  const on = !!role;
  try { const t = +localStorage.getItem(SEEN) || 0; if (t && Date.now() - t > MONTH) localStorage.removeItem(SEEN); } catch (e) { /* ignore */ }
  const toSignup = () => { try { sessionStorage.removeItem(KEY); sessionStorage.setItem('rs-after-demo', 'signup'); } catch (e) { /* ignore */ } reload(); };
  const reload = () => { location.hash = '#/'; location.reload(); };
  // Compteur anonyme (sans identifiant), sauf si la personne s'est opposée à la mesure d'audience ; keepalive : survit au rechargement
  function count(kind) {
    const C = window.RUGBY_CONFIG, consent = window.RugbyConsent;
    if (!C || (consent && consent.anon && !consent.anon())) return;
    try {
      fetch(C.supabaseUrl + '/rest/v1/rpc/count_demo', { method: 'POST', keepalive: true, headers: { apikey: C.supabaseKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_kind: kind }) }).catch(() => {});
    } catch (e) { /* ignore */ }
  }
  function open(r) {
    try { sessionStorage.setItem(KEY, r); localStorage.setItem(SEEN, String(Date.now())); } catch (e) { return; }
    count(r); reload();
  }
  window.RugbyDemo = {
    isOn: () => on,
    role: () => role,
    /** Sans rôle : demande « comme coach » ou « comme joueur ». */
    start(r) {
      if (r === 'coach' || r === 'joueur') { open(r); return; }
      const D = window.RugbyDialog;
      if (!D || !D.choose) { open('coach'); return; }
      D.choose('Voir la démo', 'Visitez le RC Démo, un club fictif. Rien n’est enregistré.', [
        { value: 'coach', label: 'Comme coach', sub: 'convoquer, dessiner les stratégies, faire la compo' },
        { value: 'joueur', label: 'Comme joueur', sub: 'répondre aux convocations, voir les stratégies et la compo' }
      ]).then(v => { if (v) open(v); });
    },
    stop() { try { sessionStorage.removeItem(KEY); } catch (e) { /* ignore */ } reload(); },
    /** Exporter dans la démo : on propose de créer un compte ; la stratégie y sera copiée à la première connexion. */
    wantExport(id, title) {
      window.RugbyDialog.confirm(`Pour télécharger « ${title} » (image, GIF, vidéo ou PDF), créez votre compte gratuit : la stratégie sera ajoutée à vos stratégies dès votre inscription.`,
        { title: 'Créez votre compte', ok: 'Créer mon compte', cancel: 'Plus tard' }).then(ok => {
        if (!ok) return;
        try { localStorage.setItem(WANT, JSON.stringify({ id, at: Date.now() })); } catch (e) { /* ignore */ }
        toSignup();
      });
    },
    /** Première connexion après « Exporter » dans la démo : copie la stratégie du club démo dans le compte. Renvoie la copie, ou null. */
    async claimStrategy(sb, owner, team) {
      let w = null;
      try { w = JSON.parse(localStorage.getItem(WANT) || 'null'); } catch (e) { /* ignore */ }
      if (!w || !w.id) return null;
      const drop = () => { try { localStorage.removeItem(WANT); } catch (e) { /* ignore */ } };
      if (Date.now() - (w.at || 0) > MONTH) { drop(); return null; }
      const { data } = await sb.rpc('demo_snapshot');
      const row = data && (data.drawings || []).find(d => d.id === w.id);
      if (!row) { drop(); return null; }
      const copy = JSON.parse(JSON.stringify(row.data || {}));
      copy.id = crypto.randomUUID(); copy.title = row.title;
      const { error } = await sb.from('drawings').insert({ id: copy.id, owner_id: owner, title: copy.title, data: copy, team_id: team, visibility: 'private' });
      if (error) return null;   // réessayé à la prochaine connexion
      drop();
      return copy;
    },
    /** Compte créé : compté « après démo » si la démo a été ouverte sur cet appareil dans les 30 derniers jours. */
    signedUp() {
      let t = 0;
      try { t = +localStorage.getItem(SEEN) || 0; localStorage.removeItem(SEEN); } catch (e) { return; }
      if (t && Date.now() - t < MONTH) count('inscription');
    }
  };
  if (!on || !window.supabase || !window.supabase.createClient) return;

  // Mesure d'usage, erreurs : ignorées sans rien dire ; le reste est une action de l'utilisateur
  const SILENT = new Set(['events', 'usage_sessions', 'client_errors', 'page_counts', 'activity_last', 'push_subscriptions']);
  let warned = 0;
  const warn = () => { if (Date.now() - warned < 4000) return; warned = Date.now(); const E = window.RugbyEditor; if (E && E.toast) E.toast('Mode démo : rien n’est enregistré. Créez votre compte pour essayer avec votre équipe.'); };

  let DB = null, ME = null;
  function build(snap) {
    if (!snap) { DB = {}; return; }
    DB = {
      clubs: [snap.club], teams: snap.teams, team_members: snap.team_members, club_members: snap.club_members, profiles: snap.profiles,
      team_events: snap.team_events, event_responses: snap.event_responses, drawings: snap.drawings, drawing_views: snap.drawing_views,
      drawing_comments: snap.drawing_comments, match_sheets: snap.match_sheets, formations: [], announcements: [], feature_flags: [], feedback: []
    };
    // Vue joueur : un joueur de l'équipe (le premier par ordre d'arrivée), sinon le coach
    const players = snap.team_members.filter(m => m.role === 'player' && m.status === 'active').sort((a, b) => String(a.user_id).localeCompare(String(b.user_id)));
    const me = (role === 'joueur' && players[0]) || snap.team_members.find(m => m.role === 'coach') || snap.team_members[0];
    ME = me && me.user_id;
    const legal = window.RugbyLegal;
    DB.profile_private = [{ user_id: ME, terms_version: legal ? legal.version : '' }];
  }

  // Relations demandées dans select('…, owner:profiles!fk(display_name), teams(…)') : on les reconstitue
  function relations(sel) {
    const out = []; const re = /(?:(\w+):)?(\w+)(?:!\w+)?\(/g; let m;
    while ((m = re.exec(sel || ''))) out.push({ as: m[1] || m[2], table: m[2] });
    return out;
  }
  function join(row, rel) {
    const list = DB[rel.table] || [];
    if (rel.table === 'teams') return list.find(t => t.id === row.team_id) || null;
    if (rel.table === 'clubs') return list.find(c => c.id === row.club_id) || null;
    if (rel.table === 'profiles') return list.find(p => p.id === (row.owner_id || row.user_id)) || null;
    return null;
  }
  const cmp = (a, b) => (a == null ? -1 : b == null ? 1 : a < b ? -1 : a > b ? 1 : 0);

  function query(ready, table) {
    let sel = '*', single = null, head = false, count = false, write = false, limit = null;
    const filters = [], orders = [];
    const api = {
      select(s, o) { if (!write) sel = s || '*'; if (o && o.head) head = true; if (o && o.count) count = true; return api; },
      eq(k, v) { filters.push(r => String(r[k]) === String(v)); return api; },
      neq(k, v) { filters.push(r => String(r[k]) !== String(v)); return api; },
      in(k, vs) { const set = new Set((vs || []).map(String)); filters.push(r => set.has(String(r[k]))); return api; },
      gt(k, v) { filters.push(r => r[k] != null && r[k] > v); return api; },
      gte(k, v) { filters.push(r => r[k] != null && r[k] >= v); return api; },
      lt(k, v) { filters.push(r => r[k] != null && r[k] < v); return api; },
      lte(k, v) { filters.push(r => r[k] != null && r[k] <= v); return api; },
      is(k, v) { filters.push(r => (v === null ? r[k] == null : r[k] === v)); return api; },
      not(k, op, v) { if (op === 'is' && v === null) filters.push(r => r[k] != null); return api; },
      or() { return api; }, ilike() { return api; }, filter() { return api; }, match(o) { Object.entries(o || {}).forEach(([k, v]) => api.eq(k, v)); return api; },
      order(k, o) { orders.push([k, !(o && o.ascending === false)]); return api; },
      limit(n) { limit = n; return api; }, range(a, b) { limit = b - a + 1; return api; },
      maybeSingle() { single = 'maybe'; return api; }, single() { single = 'one'; return api; },
      insert() { write = true; return api; }, upsert() { write = true; return api; }, update() { write = true; return api; }, delete() { write = true; return api; },
      then(res, rej) {
        return ready.then(() => {
          if (write) { if (!SILENT.has(table)) warn(); return { data: null, error: null, count: null }; }
          let rows = (DB[table] || []).filter(r => filters.every(f => f(r)));
          orders.forEach(([k, asc]) => { rows = rows.slice().sort((a, b) => (asc ? 1 : -1) * cmp(a[k], b[k])); });
          if (limit != null) rows = rows.slice(0, limit);
          const rels = relations(sel);
          const out = rows.map(r => { const o = Object.assign({}, r); rels.forEach(rel => { o[rel.as] = join(r, rel); }); return o; });
          return { data: head ? null : single ? (out[0] || null) : out, error: null, count: count ? rows.length : null };
        }).then(res, rej);
      }
    };
    return api;
  }

  function rpc(ready, name, args) {
    return ready.then(() => {
      const a = args || {};
      if (name === 'team_view_counts') {
        const members = DB.team_members.filter(m => m.team_id === a.p_team && m.status === 'active' && (m.role === 'player' || m.plays));
        return { data: DB.drawings.filter(d => d.team_id === a.p_team).map(d => ({ drawing_id: d.id, viewers: DB.drawing_views.filter(v => v.drawing_id === d.id).length, audience: members.length })), error: null };
      }
      if (name === 'drawing_view_stats') {
        const d = DB.drawings.find(x => x.id === a.p_drawing); if (!d) return { data: [], error: null };
        const members = DB.team_members.filter(m => m.team_id === d.team_id && (m.role === 'player' || m.plays));
        return { data: members.map(m => { const v = DB.drawing_views.find(x => x.drawing_id === d.id && x.user_id === m.user_id); const p = DB.profiles.find(x => x.id === m.user_id) || {};
          return { user_id: m.user_id, display_name: p.display_name, role: m.role, views: v ? v.views : 0, played: !!(v && v.played), first_seen_at: v && v.first_seen_at, last_seen_at: v && v.last_seen_at }; }), error: null };
      }
      if (name === 'club_creation_open') return { data: false, error: null };
      // Présences de la saison : la démo n'a pas d'historique, on en fabrique un, stable d'une visite à l'autre
      if (name === 'attendance_stats') {
        const members = DB.team_members.filter(m => m.team_id === a.p_team && m.status === 'active' && (m.role === 'player' || m.plays));
        const seed = id => [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
        const rows = [];
        members.forEach(m => {
          const p = DB.profiles.find(x => x.id === m.user_id) || {}, h = seed(m.user_id);
          [['training', 14], ['match', 5]].forEach(([kind, total], k) => {
            const present = Math.max(0, total - (h >> (k * 3)) % (kind === 'match' ? 3 : 6)), absent = Math.min(total - present, (h >> 7) % 3);
            const maybe = Math.min(total - present - absent, (h >> 9) % 2);
            rows.push({ user_id: m.user_id, display_name: p.display_name, kind, total, present, maybe, absent, unanswered: total - present - absent - maybe });
          });
        });
        return { data: rows, error: null };
      }
      if (!['touch_activity', 'count_page', 'mark_drawing_viewed', 'my_kids_login', 'claim_my_account'].includes(name)) warn();
      return { data: null, error: null };
    });
  }

  const realCreate = window.supabase.createClient;
  window.supabase = Object.assign({}, window.supabase, {
    createClient(url, key, opts) {
      const real = realCreate(url, key, opts);
      const ready = real.rpc('demo_snapshot').then(({ data, error }) => { if (error) console.warn('démo', error.message); build(data); });
      const session = () => ready.then(() => (ME ? { access_token: 'demo', user: { id: ME, email: 'demo@rugbeo.fr', user_metadata: {}, created_at: new Date().toISOString() } } : null));
      const noop = { on() { return noop; }, subscribe() { return noop; }, unsubscribe() {} };
      return {
        from: t => query(ready, t),
        rpc: (n, a) => rpc(ready, n, a),
        channel: () => noop, removeChannel() {},
        functions: { invoke: () => ready.then(() => { warn(); return { data: { sent: 0 }, error: null }; }) },
        auth: {
          getSession: () => session().then(s => ({ data: { session: s } })),
          getUser: () => session().then(s => ({ data: { user: s && s.user } })),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
          signInWithPassword: () => Promise.resolve({ data: {}, error: { message: 'Quittez la démo pour vous connecter.' } }),
          signUp: () => Promise.resolve({ data: {}, error: { message: 'Quittez la démo pour créer votre compte.' } }),
          signOut: () => { window.RugbyDemo.stop(); return Promise.resolve({ error: null }); },
          resend: () => Promise.resolve({ error: null }), resetPasswordForEmail: () => Promise.resolve({ error: null }), updateUser: () => Promise.resolve({ data: {}, error: null })
        }
      };
    }
  });

  // Bandeau : on sait toujours qu'on est dans la démo, et comment en sortir
  const banner = () => {
    const b = document.createElement('div');
    b.className = 'demo-banner'; b.setAttribute('role', 'status');
    b.innerHTML = `<span><strong>Démo</strong> · vue ${role === 'joueur' ? 'joueur' : 'coach'}, rien n’est enregistré</span>`;
    const other = role === 'joueur' ? 'coach' : 'joueur';
    const swap = document.createElement('button'); swap.type = 'button'; swap.className = 'btn outline small'; swap.textContent = 'Voir comme ' + other;
    swap.onclick = () => window.RugbyDemo.start(other);
    const signup = document.createElement('button'); signup.type = 'button'; signup.className = 'btn primary small'; signup.textContent = 'Créer mon compte';
    signup.onclick = toSignup;
    const quit = document.createElement('button'); quit.type = 'button'; quit.className = 'btn ghost small'; quit.textContent = 'Quitter la démo';
    quit.onclick = () => window.RugbyDemo.stop();
    b.append(swap, signup, quit);
    document.body.appendChild(b);
    document.documentElement.classList.add('demo-on');
  };
  if (document.body) banner(); else document.addEventListener('DOMContentLoaded', banner);
})();
