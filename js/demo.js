/* « Voir la démo » : l'appli tourne sur une copie en lecture seule du club démo (fonction demo_snapshot de la base),
   vue comme le coach de l'équipe. Rien n'est envoyé à la base : les écritures sont ignorées (toast « Mode démo »),
   aucune notification, aucun e-mail. Activé pour l'onglet en cours seulement (sessionStorage). */
(function () {
  'use strict';
  const KEY = 'rs-demo';
  let on = false;
  try { on = sessionStorage.getItem(KEY) === '1'; } catch (e) { /* stockage indisponible : pas de démo */ }
  const reload = () => { location.hash = '#/'; location.reload(); };
  window.RugbyDemo = {
    isOn: () => on,
    start() { try { sessionStorage.setItem(KEY, '1'); } catch (e) { return; } reload(); },
    stop() { try { sessionStorage.removeItem(KEY); } catch (e) { /* ignore */ } reload(); }
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
    const coach = snap.team_members.find(m => m.role === 'coach') || snap.team_members[0];
    ME = coach && coach.user_id;
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
    b.innerHTML = '<span><strong>Démo</strong> · club fictif, rien n’est enregistré</span>';
    const signup = document.createElement('button'); signup.type = 'button'; signup.className = 'btn primary small'; signup.textContent = 'Créer mon compte';
    signup.onclick = () => { try { sessionStorage.removeItem(KEY); sessionStorage.setItem('rs-after-demo', 'signup'); } catch (e) { /* ignore */ } reload(); };
    const quit = document.createElement('button'); quit.type = 'button'; quit.className = 'btn ghost small'; quit.textContent = 'Quitter la démo';
    quit.onclick = () => window.RugbyDemo.stop();
    b.append(signup, quit);
    document.body.appendChild(b);
    document.documentElement.classList.add('demo-on');
  };
  if (document.body) banner(); else document.addEventListener('DOMContentLoaded', banner);
})();
