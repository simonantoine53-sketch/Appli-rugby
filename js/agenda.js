/* Agenda et convocations : matchs, entraînements et autres rendez-vous de l'équipe.
   Chaque membre répond présent, absent ou peut-être (avec un commentaire) ; le staff crée les événements,
   voit qui vient, relance les joueurs sans réponse et peut saisir une réponse à la place d'un joueur. */
(function () {
  'use strict';

  const $ = s => document.querySelector(s);
  const E = window.RugbyEditor;
  const A = window.RugbyAccount;
  if (!A || !A.isActive()) { window.RugbyAgenda = { render: () => {}, upcoming: async () => null }; return; }
  const sb = A.sb;
  const track = (name, props) => { if (window.RugbyTrack) window.RugbyTrack.track(name, props); };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  const btn = (label, cls, fn) => { const b = el('button', 'btn ' + cls); b.textContent = label; b.onclick = e => { e.stopPropagation(); fn(b); }; return b; };
  const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;

  /* ---------- Dates ---------- */
  const time = d => { d = new Date(d); return `${d.getHours()}h${String(d.getMinutes()).padStart(2, '0')}`; };
  const dayShort = d => new Date(d).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  const dayLong = d => new Date(d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const startOfDay = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const monday = d => { const x = startOfDay(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
  function weekLabel(d) {
    const w = monday(d).getTime(), now = monday(new Date()).getTime(), week = 7 * 864e5;
    if (w === now) return 'Cette semaine';
    if (w === now + week) return 'La semaine prochaine';
    if (w === now - week) return 'La semaine dernière';
    return 'Semaine du ' + new Date(w).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
  }
  const toInputDate = d => { d = new Date(d); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const toInputTime = d => { d = new Date(d); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

  /* ---------- Libellés ---------- */
  const KIND = { match: 'Match', training: 'Entraînement', other: 'Rendez-vous' };
  const label = ev => ev.kind === 'match' ? `${ev.home === false ? 'À' : 'Contre'} ${ev.opponent || 'adversaire à définir'}` : ev.title;
  const short = ev => `${ev.kind === 'match' ? 'Match' : ev.kind === 'training' ? 'Entraînement' : ev.title} ${dayShort(ev.starts_at)}`;
  const STATUS = { yes: 'Présent', no: 'Absent', maybe: 'Peut-être' };

  /* ---------- Données ---------- */
  async function members(teamId) {
    const { data } = await sb.from('team_members').select('user_id, role, status, profiles!team_members_user_profile_fk(display_name)').eq('team_id', teamId).eq('status', 'active');
    return (data || []).map(m => ({ id: m.user_id, role: m.role, name: (m.profiles && m.profiles.display_name) || 'Membre' })).sort((a, b) => a.name.localeCompare(b.name));
  }
  async function responsesFor(ids) {
    if (!ids.length) return [];
    const { data } = await sb.from('event_responses').select('event_id, user_id, status, comment, set_by, updated_at').in('event_id', ids);
    return data || [];
  }
  /** Compteurs : les joueurs sont les convoqués ; le staff peut répondre mais n'entre pas dans « sans réponse ». */
  function summarize(ev, resp, team) {
    const players = team.filter(m => m.role === 'player');
    const mine = resp.filter(r => r.event_id === ev.id);
    const byUser = {}; mine.forEach(r => { byUser[r.user_id] = r; });
    const count = s => mine.filter(r => r.status === s && team.find(m => m.id === r.user_id)).length;
    return { yes: count('yes'), no: count('no'), maybe: count('maybe'), none: players.filter(p => !byUser[p.id]).length, players: players.length, byUser };
  }

  /** Événements à venir (14 jours) pour l'accueil. */
  async function upcoming(team) {
    if (!team) return null;
    const me = A.user().id;
    const from = startOfDay(new Date()).toISOString(), to = new Date(Date.now() + 14 * 864e5).toISOString();
    const [{ data: evs, error }, { count }] = await Promise.all([
      sb.from('team_events').select('*').eq('team_id', team.id).eq('cancelled', false).gte('starts_at', from).lte('starts_at', to).order('starts_at'),
      sb.from('team_events').select('id', { count: 'exact', head: true }).eq('team_id', team.id)
    ]);
    if (error) return { events: [], total: 0 };
    const list = (evs || []).filter(e => new Date(e.starts_at) > Date.now() - 3 * 3600e3);
    const [resp, team_] = await Promise.all([responsesFor(list.map(e => e.id)), members(team.id)]);
    return {
      total: count || 0,
      events: list.map(ev => { const s = summarize(ev, resp, team_); return Object.assign({}, ev, { sum: s, mine: s.byUser[me] ? s.byUser[me].status : null }); })
    };
  }

  async function answer(evId, status, userId, comment) {
    const me = A.user().id, uid = userId || me;
    const row = { event_id: evId, user_id: uid, status, set_by: me };
    if (comment !== undefined) row.comment = comment || null;
    const { error } = await sb.from('event_responses').upsert(row);
    if (error) { E.toast('Réponse impossible : ' + error.message); return false; }
    track('rsvp', { status, for_other: uid !== me });
    return true;
  }
  async function clearAnswer(evId, userId) {
    const { error } = await sb.from('event_responses').delete().match({ event_id: evId, user_id: userId });
    if (error) E.toast(error.message);
  }
  async function notify(evId, kind) {
    try {
      const { data, error } = await sb.functions.invoke('push-notify', { body: { event_id: evId, kind } });
      if (error) throw error;
      return data || {};
    } catch (e) { console.warn('push-notify', e); return null; }
  }
  async function remind(ev) {
    const res = await notify(ev.id, 'event_reminder');
    track('event_reminder', { recipients: res && res.recipients });
    if (!res) E.toast('Relance impossible pour le moment.');
    else if (!res.recipients) E.toast('Tous les joueurs ont déjà répondu.');
    else if (res.sent) E.toast(`Rappel envoyé sur ${plural(res.sent, 'téléphone', 'téléphones')}. Pour les autres, utilise « Copier pour WhatsApp ».`);
    else E.toast('Aucun de ces joueurs n’a activé les notifications : utilise « Copier pour WhatsApp ».');
  }

  /* ---------- Page Agenda ---------- */
  let tab = 'next';
  let seq = 0;
  async function render(root, eventId) {
    const my = ++seq;
    root.replaceChildren();
    const team = A.team();
    if (!A.isLoggedIn()) return;
    if (!team) {
      const box = el('div', 'soon-card', '<h2>Agenda</h2><p>Rejoins ou crée ton équipe pour voir les matchs et entraînements.</p>');
      box.appendChild(btn('Rejoindre ou créer mon équipe', 'primary', () => E.go('team')));
      root.appendChild(box); return;
    }
    if (eventId) return renderEvent(root, eventId, my);
    const staff = A.isStaff();
    // Actions sur leur ligne, puis les onglets posés sur le trait de séparation
    if (staff) {
      const acts = el('div', 'page-actions');
      if (window.RugbyAgenda.openImport) acts.appendChild(btn('Importer les matchs', 'outline', () => window.RugbyAgenda.openImport()));
      acts.appendChild(btn('+ Nouvel événement', 'primary', () => openForm()));
      root.appendChild(acts);
    }
    const tabs = el('div', 'tabs small page-tabs');
    [['next', 'À venir'], ['past', 'Passés']].forEach(([id, l]) => { const b = el('button', 'tab' + (tab === id ? ' active' : '')); b.textContent = l; b.onclick = () => { tab = id; render(root); }; tabs.appendChild(b); });
    root.appendChild(tabs);
    const list = el('div', 'agenda-list'); root.appendChild(list);
    list.appendChild(el('p', 'muted', 'Chargement…'));
    const now = new Date();
    let q = sb.from('team_events').select('*').eq('team_id', team.id);
    q = tab === 'next' ? q.gte('starts_at', new Date(now - 3 * 3600e3).toISOString()).order('starts_at').limit(60) : q.lt('starts_at', new Date(now - 3 * 3600e3).toISOString()).order('starts_at', { ascending: false }).limit(40);
    const { data: evs, error } = await q;
    if (my !== seq) return;
    if (error) { list.replaceChildren(el('p', 'library-empty', 'Erreur : ' + esc(error.message))); return; }
    const [resp, team_] = await Promise.all([responsesFor(evs.map(e => e.id)), members(team.id)]);
    if (my !== seq) return;
    list.replaceChildren();
    if (!evs.length) {
      const empty = el('div', 'soon-card agenda-empty', tab === 'next'
        ? (staff ? '<h2>Rien de prévu</h2><p>Crée le prochain entraînement ou match. Tes joueurs sont prévenus et répondent présent ou absent en un appui.</p>' : '<h2>Rien de prévu</h2><p>Les matchs et entraînements apparaîtront ici dès que le coach les aura créés.</p>')
        : '<h2>Aucun événement passé</h2>');
      if (staff && tab === 'next') {
        empty.appendChild(btn('+ Créer un événement', 'primary', () => openForm()));
        if (window.RugbyAgenda.openImport) empty.appendChild(btn('Importer les matchs de la fédération', 'outline', () => window.RugbyAgenda.openImport()));
      }
      list.appendChild(empty); return;
    }
    let lastWeek = '';
    evs.forEach(ev => {
      const w = weekLabel(ev.starts_at);
      if (w !== lastWeek) { list.appendChild(el('h4', 'home-h4 agenda-week', w)); lastWeek = w; }
      list.appendChild(card(ev, summarize(ev, resp, team_), staff, () => render(root)));
    });
  }

  function dateBlock(ev) {
    const d = new Date(ev.starts_at);
    return el('div', 'ev-date ' + ev.kind, `<span>${d.toLocaleDateString('fr-FR', { weekday: 'short' })}</span><strong>${d.getDate()}</strong><span>${d.toLocaleDateString('fr-FR', { month: 'short' })}</span>`);
  }
  function rsvpButtons(ev, current, onDone, big) {
    const row = el('div', 'rsvp' + (big ? ' big' : ''));
    [['yes', 'Présent'], ['maybe', 'Peut-être'], ['no', 'Absent']].forEach(([s, l]) => {
      const b = btn(l, 'rsvp-btn ' + s, async () => {
        if (ev.cancelled) return;
        const ok = current === s ? (await clearAnswer(ev.id, A.user().id), true) : await answer(ev.id, s);
        if (ok) { E.toast(current === s ? 'Réponse retirée.' : `Réponse envoyée : ${STATUS[s].toLowerCase()}.`); onDone(); }
      });
      b.setAttribute('aria-pressed', String(current === s));
      if (ev.cancelled) b.disabled = true;
      row.appendChild(b);
    });
    return row;
  }
  function counts(sum) {
    const total = sum.yes + sum.no + sum.maybe + sum.none || 1;
    return el('div', 'ev-counts', `<div class="pres-bar"><i class="y" style="width:${100 * sum.yes / total}%"></i><i class="m" style="width:${100 * sum.maybe / total}%"></i><i class="n" style="width:${100 * sum.no / total}%"></i></div>
      <div class="pres-legend"><span class="y">${sum.yes} présent${sum.yes > 1 ? 's' : ''}</span>${sum.maybe ? `<span class="m">${sum.maybe} peut-être</span>` : ''}<span class="n">${sum.no} absent${sum.no > 1 ? 's' : ''}</span>${sum.none ? `<span class="w">${sum.none} sans réponse</span>` : ''}</div>`);
  }
  function card(ev, sum, staff, refresh) {
    const c = el('div', 'ev-card' + (ev.cancelled ? ' cancelled' : ''));
    c.appendChild(dateBlock(ev));
    const body = el('div', 'ev-body');
    const meta = el('div', 'ev-meta', `<span class="ev-kind ${ev.kind}">${KIND[ev.kind]}</span><span>${time(ev.starts_at)}${ev.meet_at ? ` · RDV ${time(ev.meet_at)}` : ''}</span>${ev.cancelled ? '<span class="ev-cancel">Annulé</span>' : ''}`);
    // Annulation en un appui (vacances, terrain impraticable…) ; « Rétablir » si on s'est trompé
    if (staff && new Date(ev.starts_at) > Date.now()) meta.appendChild(btn(ev.cancelled ? 'Rétablir' : 'Annuler', 'ghost ev-quick', () => setCancelled([ev], !ev.cancelled, refresh)));
    body.appendChild(meta);
    body.appendChild(el('div', 'ev-title', esc(label(ev))));
    if (ev.location) body.appendChild(el('div', 'ev-place', esc(ev.location)));
    const mine = sum.byUser[A.user().id];
    if (!ev.cancelled && new Date(ev.starts_at) > Date.now() - 3 * 3600e3) body.appendChild(rsvpButtons(ev, mine && mine.status, refresh));
    if (!ev.cancelled && (staff || sum.yes)) body.appendChild(counts(sum));
    c.appendChild(body);
    c.onclick = () => E.go('agenda', ev.id);
    return c;
  }

  /* ---------- Détail d'un événement ---------- */
  async function renderEvent(root, id, my) {
    const { data: ev, error } = await sb.from('team_events').select('*').eq('id', id).maybeSingle();
    if (my !== seq) return;
    if (error || !ev) { root.appendChild(el('p', 'library-empty', 'Cet événement n’existe plus.')); root.appendChild(btn('‹ Retour à l’agenda', 'outline', () => E.go('agenda'))); return; }
    if (A.team() && ev.team_id !== A.team().id) A.selectTeam(ev.team_id);
    const [resp, team_] = await Promise.all([responsesFor([ev.id]), members(ev.team_id)]);
    if (my !== seq) return;
    const staff = A.isStaff();
    const sum = summarize(ev, resp, team_);
    const me = A.user().id, mine = sum.byUser[me];
    const refresh = () => render(root, id);
    root.appendChild(btn('‹ Agenda', 'ghost back-link', () => E.go('agenda')));

    const info = el('div', 'ev-detail' + (ev.cancelled ? ' cancelled' : ''));
    info.appendChild(el('div', 'ev-meta', `<span class="ev-kind ${ev.kind}">${KIND[ev.kind]}</span>${ev.cancelled ? '<span class="ev-cancel">Annulé</span>' : ''}`));
    info.appendChild(el('h2', '', esc(label(ev))));
    const lines = [`<strong>${cap(dayLong(ev.starts_at))} · ${time(ev.starts_at)}</strong>`];
    if (ev.meet_at) lines.push(`Rendez-vous à ${time(ev.meet_at)}`);
    if (ev.location) lines.push(`<a class="link" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ev.location)}" target="_blank" rel="noopener">${esc(ev.location)}</a>`);
    info.appendChild(el('div', 'ev-lines', lines.map(l => `<div>${l}</div>`).join('')));
    if (ev.notes) info.appendChild(el('p', 'ev-notes', esc(ev.notes)));
    const tools = el('div', 'ev-tools');
    if (ev.kind === 'match' && window.RugbySheets) tools.appendChild(btn(staff ? 'Feuille de match' : 'Voir la compo', 'secondary small', () => E.go('compos', ev.id)));
    tools.appendChild(btn('Ajouter à mon agenda', 'outline small', () => downloadIcs(ev)));
    if (staff) {
      tools.appendChild(btn('Modifier', 'outline small', () => openForm(ev)));
      // Pour une séance d'un planning : « seulement celle-ci » ou « celle-ci et les suivantes »
      const scope = (question, run) => async () => {
        if (!ev.series_id) { if (confirm(question)) run([ev]); return; }
        const next = await seriesFrom(ev);
        choose(info, question, [[`Seulement le ${dayShort(ev.starts_at)}`, () => run([ev])], [`Celle-ci et les ${next.length - 1} suivantes`, () => run(next)]]);
      };
      tools.appendChild(btn(ev.cancelled ? 'Rétablir' : 'Annuler', 'outline small', ev.cancelled ? () => setCancelled([ev], false, refresh)
        : scope(`Annuler « ${label(ev)} » ? Les membres seront prévenus.`, list => setCancelled(list, true, refresh))));
      tools.appendChild(btn('Supprimer', 'outline small danger', scope(`Supprimer définitivement « ${label(ev)} » et les réponses ?`, async list => {
        const { error: err } = await sb.from('team_events').delete().in('id', list.map(x => x.id));
        if (err) return E.toast(err.message);
        E.toast(list.length > 1 ? `${list.length} séances supprimées.` : 'Événement supprimé.'); E.go('agenda');
      })));
    }
    info.appendChild(tools);
    root.appendChild(info);

    // Ma réponse
    if (!ev.cancelled && new Date(ev.starts_at) > Date.now() - 3 * 3600e3) {
      const box = el('div', 'ev-answer');
      box.appendChild(el('div', 'todo-head', 'Ta réponse'));
      box.appendChild(rsvpButtons(ev, mine && mine.status, refresh, true));
      const f = el('form', 'inline-form ev-comment');
      const input = el('input'); input.type = 'text'; input.maxLength = 140; input.placeholder = 'Un mot pour le coach (facultatif) : retard, blessure…'; input.value = (mine && mine.comment) || '';
      f.append(input, Object.assign(el('button', 'btn outline small', 'Enregistrer'), { type: 'submit' }));
      f.onsubmit = async e => {
        e.preventDefault();
        if (!mine) { E.toast('Choisis d’abord présent, peut-être ou absent.'); return; }
        if (await answer(ev.id, mine.status, me, input.value.trim())) { E.toast('Commentaire enregistré.'); refresh(); }
      };
      box.appendChild(f);
      root.appendChild(box);
    }

    // Qui vient
    const players = team_.filter(m => m.role === 'player'), staffList = team_.filter(m => m.role !== 'player');
    const groups = [['yes', 'Présents'], ['maybe', 'Peut-être'], ['no', 'Absents']];
    const who = el('div', 'ev-who');
    who.appendChild(counts(sum));
    if (staff && sum.none && !ev.cancelled) {
      const nonRep = players.filter(p => !sum.byUser[p.id]);
      const acts = el('div', 'ev-remind');
      acts.appendChild(btn(`Relancer ${nonRep.length > 1 ? 'les ' + nonRep.length + ' joueurs' : 'le joueur'} sans réponse`, 'primary', () => remind(ev)));
      acts.appendChild(btn('Copier pour WhatsApp', 'outline', () => {
        const text = `${short(ev)} à ${time(ev.starts_at)}${ev.location ? ' (' + ev.location + ')' : ''} : merci de répondre dans l’appli. Pas encore de réponse : ${nonRep.map(p => p.name).join(', ')}.`;
        if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => E.toast('Message copié : colle-le dans le groupe WhatsApp.'));
        else prompt('Message à copier :', text);
      }));
      who.appendChild(acts);
    }
    const person = (m, r) => {
      const row = el('div', 'member-row ev-person');
      row.appendChild(el('div', 'avatar', esc(m.name.trim().slice(0, 1).toUpperCase() || '?')));
      const set = r && r.set_by && r.set_by !== m.id ? ' · saisi par le staff' : '';
      row.appendChild(el('div', 'who', `${esc(m.name)}${m.id === me ? ' (moi)' : ''}${m.role !== 'player' ? ` <span class="role-badge ${m.role}">${m.role === 'coach' ? 'Coach' : 'Admin'}</span>` : ''}${r && r.comment ? `<small>« ${esc(r.comment)} »</small>` : ''}${set ? `<small>${set.slice(3)}</small>` : ''}`));
      if (staff && m.id !== me && !ev.cancelled) {
        const sel = el('select', 'select small');
        [['', '—'], ['yes', 'Présent'], ['maybe', 'Peut-être'], ['no', 'Absent']].forEach(([v, l]) => { const o = el('option'); o.value = v; o.textContent = l; o.selected = (r ? r.status : '') === v; sel.appendChild(o); });
        sel.onclick = e => e.stopPropagation();
        sel.onchange = async () => { if (sel.value) await answer(ev.id, sel.value, m.id); else await clearAnswer(ev.id, m.id); refresh(); };
        sel.title = 'Saisir la réponse à sa place';
        row.appendChild(sel);
      }
      return row;
    };
    groups.forEach(([s, l]) => {
      const list = team_.filter(m => sum.byUser[m.id] && sum.byUser[m.id].status === s);
      if (!list.length) return;
      who.appendChild(el('h4', 'home-h4', `${l} (${list.length})`));
      list.forEach(m => who.appendChild(person(m, sum.byUser[m.id])));
    });
    const none = players.filter(p => !sum.byUser[p.id]);
    if (none.length) { who.appendChild(el('h4', 'home-h4', `Sans réponse (${none.length})`)); none.forEach(m => who.appendChild(person(m, null))); }
    const staffNone = staffList.filter(m => !sum.byUser[m.id]);
    if (staffNone.length && staff) { who.appendChild(el('h4', 'home-h4 muted', `Staff (${staffNone.length})`)); staffNone.forEach(m => who.appendChild(person(m, null))); }
    root.appendChild(who);
  }

  /** Séances d'un planning à partir de celle-ci (incluse), dans l'ordre. */
  async function seriesFrom(ev) {
    if (!ev.series_id) return [ev];
    const { data } = await sb.from('team_events').select('*').eq('series_id', ev.series_id).gte('starts_at', ev.starts_at).order('starts_at');
    return data && data.length ? data : [ev];
  }
  /** Annule (ou rétablit) des événements ; les membres sont prévenus d'une annulation isolée. */
  async function setCancelled(list, cancelled, refresh) {
    const { error } = await sb.from('team_events').update({ cancelled }).in('id', list.map(x => x.id));
    if (error) return E.toast(error.message);
    if (cancelled && list.length === 1) notify(list[0].id, 'event_cancelled');
    track('event_cancel', { cancelled, count: list.length });
    E.toast(!cancelled ? 'Séance rétablie.' : list.length > 1 ? `${list.length} séances annulées.` : 'Annulé, les membres sont prévenus.');
    refresh();
  }
  /** Petit choix en ligne (les fenêtres du navigateur ne proposent que oui / non). */
  function choose(container, question, options) {
    const old = container.querySelector('.choice-panel'); if (old) old.remove();
    const panel = el('div', 'choice-panel', `<p>${esc(question)}</p>`);
    const row = el('div', 'row');
    options.forEach(([l, fn], i) => row.appendChild(btn(l, i === 0 ? 'primary small' : 'outline small', () => { panel.remove(); fn(); })));
    row.appendChild(btn('Retour', 'ghost small', () => panel.remove()));
    panel.appendChild(row);
    container.appendChild(panel);
  }

  /* ---------- Ajout au calendrier du téléphone (.ics) ---------- */
  function downloadIcs(ev) {
    const z = d => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const start = new Date(ev.meet_at || ev.starts_at), end = new Date(new Date(ev.starts_at).getTime() + (ev.kind === 'match' ? 2.5 : 1.5) * 3600e3);
    const txt = s => String(s || '').replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
    const team = A.team() ? A.team().name : '';
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Rugby Strat//FR', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
      `UID:${ev.id}@rugby-strat`, `DTSTAMP:${z(new Date())}`, `DTSTART:${z(start)}`, `DTEND:${z(end)}`,
      `SUMMARY:${txt(`${team ? team + ' · ' : ''}${KIND[ev.kind]} ${ev.kind === 'match' ? label(ev).toLowerCase() : ''}`.trim())}`,
      ev.location ? `LOCATION:${txt(ev.location)}` : '', `DESCRIPTION:${txt([ev.meet_at ? 'Rendez-vous ' + time(ev.meet_at) + ', début ' + time(ev.starts_at) : '', ev.notes].filter(Boolean).join('\n'))}`,
      ev.cancelled ? 'STATUS:CANCELLED' : '', 'END:VEVENT', 'END:VCALENDAR'].filter(Boolean).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    a.download = `${KIND[ev.kind].toLowerCase()}-${toInputDate(ev.starts_at)}.ics`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    track('event_ics');
  }

  /* ---------- Création / modification ---------- */
  let editing = null;
  function openForm(ev) {
    editing = ev || null;
    const f = $('#event-form');
    f.reset();
    $('#event-form-title').textContent = ev ? 'Modifier l’événement' : 'Nouvel événement';
    const kind = ev ? ev.kind : 'training';
    f.querySelectorAll('input[name=ev-kind]').forEach(r => { r.checked = r.value === kind; });
    const d = ev ? new Date(ev.starts_at) : nextSlot();
    $('#ev-date').value = toInputDate(d);
    $('#ev-time').value = toInputTime(d);
    $('#ev-meet').value = ev && ev.meet_at ? toInputTime(ev.meet_at) : '';
    $('#ev-title').value = ev && ev.kind !== 'match' ? ev.title : '';
    $('#ev-opponent').value = ev ? ev.opponent || '' : '';
    f.querySelectorAll('input[name=ev-home]').forEach(r => { r.checked = r.value === (ev && ev.home === false ? 'away' : 'home'); });
    $('#ev-location').value = ev ? ev.location || '' : lastLocation();
    $('#ev-notes').value = ev ? ev.notes || '' : '';
    $('#ev-recurring').checked = false;
    $('#ev-repeat').value = toInputDate(seasonEnd(d));
    document.querySelectorAll('input[name=ev-days]').forEach(c => { c.checked = +c.value === d.getDay(); });
    $('#ev-series-field').classList.toggle('hidden', !(ev && ev.series_id));
    $('#ev-apply-series').checked = false;
    $('#ev-notify').checked = !ev;
    $('#ev-error').textContent = '';
    syncKind();
    syncRecur();
    E.openModal('modal-event');
  }
  /** Fin de saison par défaut : 30 juin (de l'année suivante à partir de juillet). */
  function seasonEnd(d) { const y = d.getMonth() >= 6 ? d.getFullYear() + 1 : d.getFullYear(); return new Date(y, 5, 30); }
  const DAY_NAMES = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  /** Dates du planning : chaque jour coché, de la date de départ jusqu'à la fin (150 séances au plus). */
  function recurDates(start, days, until) {
    const out = [];
    const d = new Date(start);
    while (d <= until && out.length < 150) { if (days.includes(d.getDay())) out.push(new Date(d)); d.setDate(d.getDate() + 1); }
    return out;
  }
  function syncRecur() {
    const on = $('#ev-recurring').checked;
    $('#ev-recur-box').classList.toggle('hidden', !on);
    if (!on) return;
    const days = [...document.querySelectorAll('input[name=ev-days]:checked')].map(c => +c.value);
    const date = $('#ev-date').value, t = $('#ev-time').value || '19:00', until = $('#ev-repeat').value;
    if (!days.length) { $('#ev-recur-help').textContent = 'Coche au moins un jour.'; return; }
    if (!date || !until) { $('#ev-recur-help').textContent = ''; return; }
    const n = recurDates(new Date(`${date}T${t}`), days, new Date(`${until}T23:59`)).length;
    const names = [1, 2, 3, 4, 5, 6, 0].filter(x => days.includes(x)).map(x => DAY_NAMES[x]);
    $('#ev-recur-help').textContent = `${plural(n, 'entraînement', 'entraînements')} : chaque ${names.join(' et ')} à ${t.replace(':', 'h')}, jusqu’au ${new Date(until).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}. Tu pourras annuler une séance (vacances, terrain gelé) en un appui.`;
  }
  ['#ev-recurring', '#ev-date', '#ev-time', '#ev-repeat'].forEach(sel => { $(sel).addEventListener('change', syncRecur); });
  document.querySelectorAll('input[name=ev-days]').forEach(c => { c.onchange = syncRecur; });
  /** Proposition par défaut : demain à 19h. */
  function nextSlot() { const d = new Date(Date.now() + 864e5); d.setHours(19, 0, 0, 0); return d; }
  const LOC_KEY = 'rugby-last-location';
  const lastLocation = () => { try { return localStorage.getItem(LOC_KEY) || ''; } catch (e) { return ''; } };
  function syncKind() {
    const kind = (document.querySelector('input[name=ev-kind]:checked') || {}).value || 'training';
    $('#ev-match-fields').classList.toggle('hidden', kind !== 'match');
    $('#ev-title-field').classList.toggle('hidden', kind === 'match');
    $('#ev-title').placeholder = kind === 'training' ? 'Entraînement' : 'Ex. Réunion, repas d’équipe, tournoi';
    $('#ev-repeat-field').classList.toggle('hidden', !!editing || kind !== 'training');
  }
  document.querySelectorAll('input[name=ev-kind]').forEach(r => { r.onchange = syncKind; });
  $('#event-form').onsubmit = async e => {
    e.preventDefault();
    const team = A.team(); if (!team) return;
    const kind = document.querySelector('input[name=ev-kind]:checked').value;
    const date = $('#ev-date').value, t = $('#ev-time').value;
    if (!date || !t) { $('#ev-error').textContent = 'Indique la date et l’heure.'; return; }
    const start = new Date(`${date}T${t}`);
    const meet = $('#ev-meet').value ? new Date(`${date}T${$('#ev-meet').value}`) : null;
    if (meet && meet > start) { $('#ev-error').textContent = 'Le rendez-vous doit être avant le début.'; return; }
    const opponent = $('#ev-opponent').value.trim();
    if (kind === 'match' && !opponent) { $('#ev-error').textContent = 'Indique l’adversaire.'; return; }
    const base = {
      team_id: team.id, kind,
      title: kind === 'match' ? 'Match' : ($('#ev-title').value.trim() || (kind === 'training' ? 'Entraînement' : 'Rendez-vous')),
      opponent: kind === 'match' ? opponent : null,
      home: kind === 'match' ? document.querySelector('input[name=ev-home]:checked').value === 'home' : null,
      location: $('#ev-location').value.trim() || null,
      notes: $('#ev-notes').value.trim() || null
    };
    try { if (base.location) localStorage.setItem(LOC_KEY, base.location); } catch (err) { /* ignore */ }
    const b = $('#ev-submit'); b.disabled = true;
    let firstId = null, n = 1;
    if (editing) {
      const { error } = await sb.from('team_events').update(Object.assign({}, base, { starts_at: start.toISOString(), meet_at: meet ? meet.toISOString() : null })).eq('id', editing.id);
      if (error) { b.disabled = false; $('#ev-error').textContent = error.message; return; }
      let extra = 0;
      if (editing.series_id && $('#ev-apply-series').checked) {
        // Mêmes horaires, lieu et infos pour les séances suivantes ; chaque séance garde sa date
        const next = (await seriesFrom(editing)).filter(x => x.id !== editing.id);
        const at = (iso, hhmm) => { const d = new Date(iso); const [h, m] = hhmm.split(':'); d.setHours(+h, +m, 0, 0); return d.toISOString(); };
        const results = await Promise.all(next.map(x => sb.from('team_events').update({
          title: base.title, location: base.location, notes: base.notes,
          starts_at: at(x.starts_at, t), meet_at: meet ? at(x.starts_at, $('#ev-meet').value) : null
        }).eq('id', x.id)));
        const failed = results.filter(r => r.error).length;
        extra = next.length - failed;
        if (failed) E.toast(`${failed} séance(s) n’ont pas pu être modifiées.`);
      }
      b.disabled = false;
      firstId = editing.id;
      E.toast(extra ? `Séance et ${plural(extra, 'suivante modifiée', 'suivantes modifiées')}.` : 'Événement modifié.');
    } else {
      // Planning de la saison : chaque jour coché, à la même heure, jusqu'à la date de fin
      const recurring = kind === 'training' && $('#ev-recurring').checked;
      let dates = [start];
      if (recurring) {
        const days = [...document.querySelectorAll('input[name=ev-days]:checked')].map(c => +c.value);
        if (!days.length) { b.disabled = false; $('#ev-error').textContent = 'Coche au moins un jour d’entraînement.'; return; }
        if (!$('#ev-repeat').value) { b.disabled = false; $('#ev-error').textContent = 'Indique la date de fin du planning.'; return; }
        dates = recurDates(start, days, new Date(`${$('#ev-repeat').value}T23:59`));
        if (!dates.length) { b.disabled = false; $('#ev-error').textContent = 'Aucune date ne correspond : vérifie les jours et la date de fin.'; return; }
      }
      const series = dates.length > 1 ? crypto.randomUUID() : null;
      const meetDelta = meet ? start - meet : 0;
      const rows = dates.map(s => Object.assign({}, base, { id: crypto.randomUUID(), starts_at: s.toISOString(), meet_at: meet ? new Date(s - meetDelta).toISOString() : null, series_id: series, created_by: A.user().id }));
      const { error } = await sb.from('team_events').insert(rows);
      b.disabled = false;
      if (error) { $('#ev-error').textContent = error.message; return; }
      firstId = rows[0].id; n = rows.length;
      track('event_create', { kind, repeat: n });
      if ($('#ev-notify').checked) notify(firstId, 'event_new');
      E.toast(n > 1 ? `Planning créé : ${n} entraînements.` : `${KIND[kind]} créé${$('#ev-notify').checked ? ', l’équipe est prévenue' : ''}.`);
    }
    E.closeModal('modal-event');
    if (location.hash === '#/agenda/' + firstId) E.refreshView(); else E.go('agenda', n > 1 ? '' : firstId);
  };

  window.RugbyAgenda = { render, upcoming, answer, remind, openForm, label, short, time, dayShort };
})();
