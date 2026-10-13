/* Import des matchs depuis un fichier agenda (.ics), par exemple le calendrier d'une poule exporté de
   Mon Club House (FFR). Le coach choisit son club parmi les équipes de la poule, voit l'aperçu, puis importe.
   Un nouvel import du même calendrier met à jour les matchs déjà importés (identifiés par leur UID). */
(function () {
  'use strict';

  const $ = s => document.querySelector(s);
  const E = window.RugbyEditor;
  const A = window.RugbyAccount;
  const AG = window.RugbyAgenda;
  if (!A || !A.isActive() || !AG) return;
  const sb = A.sb;
  const track = (name, props) => { if (window.RugbyTrack) window.RugbyTrack.track(name, props); };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  const btn = (label, cls, fn) => { const b = el('button', 'btn ' + cls); b.textContent = label; b.type = 'button'; b.onclick = e => { e.stopPropagation(); fn(b); }; return b; };
  const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;

  /* ---------- Lecture du fichier .ics ---------- */
  const unesc = v => String(v || '').replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1').trim();
  function parseIcs(text) {
    const lines = text.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');   // lignes repliées
    const events = []; let cur = null, calName = '';
    lines.forEach(line => {
      if (line === 'BEGIN:VEVENT') { cur = {}; return; }
      if (line === 'END:VEVENT') { if (cur) events.push(cur); cur = null; return; }
      const i = line.indexOf(':'); if (i < 0) return;
      const [name, ...params] = line.slice(0, i).split(';');
      const p = {}; params.forEach(x => { const [k, v] = x.split('='); p[(k || '').toUpperCase()] = v; });
      const key = name.toUpperCase(), value = line.slice(i + 1);
      if (!cur) { if (!calName && (key === 'X-WR-CALNAME' || key === 'NAME')) calName = unesc(value); return; }
      cur[key] = { value, params: p };
    });
    return { calName, events };
  }
  /** Décalage d'un fuseau (ms) à un instant donné. */
  function tzOffset(t, tz) {
    try {
      const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const p = Object.fromEntries(f.formatToParts(new Date(t)).map(x => [x.type, x.value]));
      return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - t;
    } catch (e) { return -new Date(t).getTimezoneOffset() * 60000; }
  }
  function parseDate(prop) {
    if (!prop) return null;
    const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(prop.value.trim());
    if (!m) return null;
    const [y, mo, d, h, mi] = [+m[1], +m[2], +m[3], +(m[4] || 15), +(m[5] || 0)];   // date sans heure : 15h par défaut
    if (m[7]) return new Date(Date.UTC(y, mo - 1, d, h, mi));
    const tz = prop.params.TZID;
    if (!tz) return new Date(y, mo - 1, d, h, mi);
    const guess = Date.UTC(y, mo - 1, d, h, mi);
    let t = guess - tzOffset(guess, tz);
    const off2 = tzOffset(t, tz); if (guess - off2 !== t) t = guess - off2;   // passage à l'heure d'été / d'hiver
    return new Date(t);
  }

  /** Matchs « Domicile - Extérieur | Compétition ». Les noms de clubs contiennent parfois « - » :
      on garde la coupure dont les deux noms reviennent le plus souvent dans le calendrier. */
  function extractMatches(events) {
    const raw = events.map(ev => {
      let summary = unesc(ev.SUMMARY && ev.SUMMARY.value);
      let comp = '';
      const bar = summary.lastIndexOf(' | ');
      if (bar > 0) { comp = summary.slice(bar + 3).trim(); summary = summary.slice(0, bar).trim(); }
      const cuts = []; let i = summary.indexOf(' - ');
      while (i > 0) { cuts.push([summary.slice(0, i).trim(), summary.slice(i + 3).trim()]); i = summary.indexOf(' - ', i + 1); }
      return { ev, comp, cuts };
    }).filter(r => r.cuts.length);
    const freq = new Map();
    raw.forEach(r => { const seen = new Set(); r.cuts.forEach(([h, a]) => { seen.add(h); seen.add(a); }); seen.forEach(n => freq.set(n, (freq.get(n) || 0) + 1)); });
    const score = ([h, a]) => (freq.get(h) || 0) + (freq.get(a) || 0) - Math.abs((freq.get(h) || 0) - (freq.get(a) || 0)) / 100;
    return raw.map(r => {
      const [home, away] = r.cuts.reduce((best, c) => score(c) > score(best) ? c : best, r.cuts[0]);
      const start = parseDate(r.ev.DTSTART);
      return {
        uid: unesc(r.ev.UID && r.ev.UID.value).slice(0, 200) || null,
        home, away, comp: r.comp, start,
        location: unesc(r.ev.LOCATION && r.ev.LOCATION.value),
        url: unesc(r.ev.URL && r.ev.URL.value),
        cancelled: /CANCELLED/i.test((r.ev.STATUS && r.ev.STATUS.value) || '')
      };
    }).filter(m => m.start && m.home && m.away && !/^exempt/i.test(m.home) && !/^exempt/i.test(m.away));
  }

  /* ---------- Choix du club ---------- */
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ');
  /** Devine le club d'après le nom de l'équipe dans l'appli (mots communs). */
  function guessClub(clubs, teamName, saved) {
    if (saved && clubs.includes(saved)) return saved;
    const words = norm(teamName).split(/\s+/).filter(w => w.length >= 3 && !['rugby', 'club', 'seniors', 'senior', 'equipe'].includes(w));
    let best = '', bestScore = 0;
    clubs.forEach(c => { const n = norm(c); const sc = words.filter(w => n.includes(w)).length; if (sc > bestScore) { best = c; bestScore = sc; } });
    return best;
  }

  /* ---------- Fenêtre d'import ---------- */
  let state = null;
  function open() {
    state = null;
    renderStart();
    E.openModal('modal-import');
  }
  function renderStart(error) {
    const body = $('#import-body'); body.replaceChildren();
    body.appendChild(el('p', '', 'Récupère le calendrier de ta poule dans <strong>Mon Club House</strong> (page de la compétition → Calendrier → « Ajouter à mon agenda »). Ton téléphone ou ton ordinateur télécharge un fichier <strong>.ics</strong> : choisis-le ici.'));
    body.appendChild(el('p', 'muted small', 'Tout fichier agenda .ics fonctionne (ligue, comité, autre fédération). Réimporter le même calendrier plus tard met à jour les matchs déplacés, sans doublon.'));
    const input = el('input'); input.type = 'file'; input.accept = '.ics,text/calendar'; input.id = 'import-file'; input.className = 'file-input';
    const label = el('label', 'btn primary wide file-btn', '📥 Choisir le fichier .ics');
    label.htmlFor = 'import-file';
    input.onchange = () => { const f = input.files[0]; if (f) read(f); };
    body.append(label, input);
    if (error) body.appendChild(el('p', 'form-error', esc(error)));
  }
  function read(file) {
    if (file.size > 2e6) return renderStart('Fichier trop gros pour un calendrier.');
    const r = new FileReader();
    r.onload = async () => {
      const text = String(r.result || '');
      if (!/BEGIN:VCALENDAR/.test(text)) return renderStart('Ce fichier n’est pas un calendrier .ics.');
      const { calName, events } = parseIcs(text);
      const matches = extractMatches(events);
      if (!matches.length) return renderStart('Aucun match « Équipe A - Équipe B » trouvé dans ce fichier.');
      const counts = {};
      matches.forEach(m => { counts[m.home] = (counts[m.home] || 0) + 1; counts[m.away] = (counts[m.away] || 0) + 1; });
      const clubs = Object.keys(counts).sort((a, b) => a.localeCompare(b, 'fr'));
      const team = A.team();
      const { data: t } = await sb.from('teams').select('calendar_club').eq('id', team.id).maybeSingle();
      const { data: existing } = await sb.from('team_events').select('id, external_id, starts_at, location, opponent, home, cancelled').eq('team_id', team.id).not('external_id', 'is', null);
      state = { calName, matches, clubs, existing: existing || [], club: guessClub(clubs, team.name, t && t.calendar_club), meet: 60 };
      renderPreview();
    };
    r.onerror = () => renderStart('Lecture du fichier impossible.');
    r.readAsText(file);
  }
  /** Matchs à venir du club choisi, comparés à ceux déjà importés. */
  function plan() {
    const byUid = {}; state.existing.forEach(e => { byUid[e.external_id] = e; });
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return state.matches.filter(m => (m.home === state.club || m.away === state.club) && m.start >= today)
      .sort((a, b) => a.start - b.start)
      .map(m => {
        const home = m.home === state.club, opponent = (home ? m.away : m.home).slice(0, 60);
        const row = { starts_at: m.start.toISOString(), opponent, home, location: (m.location || '').slice(0, 120) || null, cancelled: m.cancelled };
        const ex = m.uid && byUid[m.uid];
        const changed = ex && (new Date(ex.starts_at).getTime() !== m.start.getTime() || (ex.location || null) !== row.location || ex.opponent !== row.opponent || ex.home !== row.home || (!!ex.cancelled !== m.cancelled && m.cancelled));
        return { m, row, ex, state: !ex ? 'new' : changed ? 'changed' : 'same' };
      });
  }
  function renderPreview() {
    const body = $('#import-body'); body.replaceChildren();
    if (state.calName) body.appendChild(el('p', 'muted small', esc(state.calName)));
    const f1 = el('label', 'import-field', 'Ton club dans ce calendrier');
    const sel = el('select', 'select'); sel.id = 'import-club';
    sel.appendChild(Object.assign(el('option'), { value: '', textContent: 'Choisir…' }));
    state.clubs.forEach(c => sel.appendChild(Object.assign(el('option'), { value: c, textContent: c, selected: c === state.club })));
    sel.onchange = () => { state.club = sel.value; renderPreview(); };
    f1.appendChild(sel);
    const f2 = el('label', 'import-field', 'Heure de rendez-vous');
    const meet = el('select', 'select'); meet.id = 'import-meet';
    [[0, 'Aucune'], [45, '45 min avant le coup d’envoi'], [60, '1 h avant'], [90, '1 h 30 avant'], [120, '2 h avant']].forEach(([v, l]) => meet.appendChild(Object.assign(el('option'), { value: v, textContent: l, selected: v === state.meet })));
    meet.onchange = () => { state.meet = +meet.value; };
    f2.appendChild(meet);
    body.append(f1, f2);
    if (!state.club) { body.appendChild(el('p', 'muted', 'Choisis ton club pour voir ses matchs.')); return; }
    const items = plan();
    const nNew = items.filter(i => i.state === 'new').length, nChg = items.filter(i => i.state === 'changed').length;
    body.appendChild(el('p', 'import-sum', items.length
      ? `<strong>${plural(items.length, 'match à venir', 'matchs à venir')}</strong> : ${plural(nNew, 'nouveau', 'nouveaux')}${nChg ? `, ${plural(nChg, 'modifié', 'modifiés')}` : ''}${items.length - nNew - nChg ? `, ${items.length - nNew - nChg} déjà à jour` : ''}.`
      : 'Aucun match à venir pour ce club dans ce calendrier.'));
    const list = el('div', 'import-list');
    items.forEach(i => {
      const d = i.m.start;
      list.appendChild(el('div', 'import-row ' + i.state, `<span class="import-date">${d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })} · ${AG.time(d)}</span><span class="grow">${i.row.home ? 'Contre' : 'À'} ${esc(i.row.opponent)}${i.m.cancelled ? ' <em>(annulé)</em>' : ''}</span><span class="import-state">${{ new: 'Nouveau', changed: 'Modifié', same: 'À jour' }[i.state]}</span>`));
    });
    body.appendChild(list);
    const todo = items.filter(i => i.state !== 'same');
    if (todo.length) body.appendChild(btn(nNew && !nChg ? `Importer ${plural(nNew, 'match', 'matchs')}` : `Importer et mettre à jour (${todo.length})`, 'primary wide', b => run(todo, b)));
    else if (items.length) body.appendChild(el('p', 'todo-empty', 'Tout est déjà à jour. ✓'));
  }
  async function run(items, b) {
    b.disabled = true; b.textContent = 'Import en cours…';
    const team = A.team(), me = A.user().id;
    const notes = m => [m.comp, m.url ? `Fiche du match : ${m.url}` : ''].filter(Boolean).join('\n') || null;
    const fresh = items.filter(i => i.state === 'new').map(i => Object.assign({}, i.row, {
      team_id: team.id, kind: 'match', title: 'Match', created_by: me, external_id: i.m.uid, notes: notes(i.m),
      meet_at: state.meet ? new Date(i.m.start.getTime() - state.meet * 60000).toISOString() : null
    }));
    let failed = 0;
    if (fresh.length) { const { error } = await sb.from('team_events').insert(fresh); if (error) { b.disabled = false; b.textContent = 'Réessayer'; E.toast('Import impossible : ' + error.message); return; } }
    const updates = items.filter(i => i.state === 'changed');
    const res = await Promise.all(updates.map(i => {
      const patch = { starts_at: i.row.starts_at, opponent: i.row.opponent, home: i.row.home, location: i.row.location };
      if (i.m.cancelled) patch.cancelled = true;
      if (new Date(i.ex.starts_at).getTime() !== i.m.start.getTime() && state.meet) patch.meet_at = new Date(i.m.start.getTime() - state.meet * 60000).toISOString();
      return sb.from('team_events').update(patch).eq('id', i.ex.id);
    }));
    failed = res.filter(r => r.error).length;
    await sb.from('teams').update({ calendar_club: state.club }).eq('id', team.id);
    track('calendar_import', { created: fresh.length, updated: updates.length - failed });
    E.closeModal('modal-import');
    E.toast(`${plural(fresh.length, 'match importé', 'matchs importés')}${updates.length ? `, ${plural(updates.length - failed, 'mis à jour', 'mis à jour')}` : ''}${failed ? ` (${failed} en erreur)` : ''}.`);
    E.go('agenda'); E.refreshView();
  }

  AG.openImport = open;
  AG.parseIcs = parseIcs; AG.extractMatches = extractMatches;   // utiles pour les tests
})();
