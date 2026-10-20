/* Présences : par joueur, sur la saison (début fixé par le club) ou les 30 derniers jours, entraînements et matchs séparés.
   Taux = présent / convocations passées ; les convocations restées sans réponse sont comptées à part.
   Le staff voit toute l'équipe (tri au choix) ; un joueur, ou le parent d'un jeune, ne voit que ses propres chiffres. */
(function () {
  'use strict';
  const A = window.RugbyAccount;
  if (!A || !A.isActive()) return;
  const sb = A.sb;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  const track = (name, props) => { if (window.RugbyTrack) window.RugbyTrack.track(name, props); };

  let period = 'season', sort = 'training';
  const PERIODS = [['season', 'Saison'], ['30', '30 derniers jours']];
  const SORTS = [['training', 'Présence aux entraînements'], ['match', 'Présence aux matchs'], ['unanswered', 'Sans réponse'], ['name', 'Nom']];

  /** Une ligne par joueur : { id, name, training: {total, present, maybe, absent, unanswered}, match: {…} } */
  async function load(teamId, days) {
    const { data, error } = await sb.rpc('attendance_stats', days ? { p_team: teamId, p_days: days } : { p_team: teamId });
    if (error) throw error;
    const by = {};
    (data || []).forEach(r => {
      const p = by[r.user_id] || (by[r.user_id] = { id: r.user_id, name: r.display_name || 'Membre' });
      p[r.kind] = r;
    });
    return Object.values(by);
  }
  const rate = s => (s && s.total ? s.present / s.total : null);
  const pct = s => (rate(s) == null ? '—' : Math.round(rate(s) * 100) + ' %');
  const level = s => { const r = rate(s); return r == null ? '' : r >= 0.75 ? 'good' : r >= 0.5 ? 'mid' : 'low'; };

  function cell(s) {
    if (!s || !s.total) return '<span class="muted">Aucun</span>';
    return `<strong class="st-rate ${level(s)}">${pct(s)}</strong><small>${s.present}/${s.total}${s.maybe ? ` · ${s.maybe} peut-être` : ''}</small>`;
  }
  const unanswered = p => ((p.training && p.training.unanswered) || 0) + ((p.match && p.match.unanswered) || 0);

  function periodTabs(onChange) {
    const tabs = el('div', 'segmented small st-period');
    PERIODS.forEach(([id, label]) => {
      const b = el('button', 'seg' + (period === id ? ' active' : '')); b.type = 'button'; b.textContent = label;
      b.setAttribute('aria-pressed', String(period === id));
      b.onclick = () => { period = id; track('stats_period', { period: id }); onChange(); };
      tabs.appendChild(b);
    });
    return tabs;
  }
  const days = () => (period === 'season' ? null : +period);

  /** Onglet « Présences » de la page Équipe. */
  async function renderTab(root, teamId, staff) {
    root.replaceChildren();
    const head = el('div', 'st-head');
    head.appendChild(periodTabs(() => renderTab(root, teamId, staff)));
    let sel = null;
    if (staff) {
      sel = el('select', 'select small'); sel.setAttribute('aria-label', 'Trier par');
      SORTS.forEach(([v, l]) => { const o = el('option'); o.value = v; o.textContent = 'Trier : ' + l.toLowerCase(); o.selected = v === sort; sel.appendChild(o); });
      head.appendChild(sel);
    }
    root.appendChild(head);
    const box = el('div', 'st-list'); root.appendChild(box);
    box.appendChild(el('p', 'muted', 'Chargement…'));
    let rows;
    try { rows = await load(teamId, days()); } catch (e) { box.replaceChildren(el('p', 'muted', 'Statistiques indisponibles pour le moment.')); return; }
    root.appendChild(el('p', 'help st-help', `${period === 'season' ? 'Depuis le début de la saison' : 'Sur les 30 derniers jours'} : matchs et entraînements passés, sans les annulés, depuis l’arrivée de chacun dans l’équipe. « Peut-être » ne compte pas comme présent ; les convocations sans réponse sont comptées à part.`));
    const draw = () => {
      box.replaceChildren();
      if (!rows.length) { box.appendChild(el('p', 'muted', staff ? 'Pas encore de joueur dans l’équipe.' : 'Vous n’êtes pas convoqué dans cette équipe.')); return; }
      const list = rows.slice();
      const by = k => (a, b) => ((rate(b[k]) == null ? -1 : rate(b[k])) - (rate(a[k]) == null ? -1 : rate(a[k]))) || a.name.localeCompare(b.name);
      list.sort(sort === 'name' ? (a, b) => a.name.localeCompare(b.name) : sort === 'unanswered' ? (a, b) => unanswered(b) - unanswered(a) || a.name.localeCompare(b.name) : by(sort));
      if (staff) {
        const t = el('div', 'st-table');
        t.appendChild(el('div', 'st-row st-th', '<span>Joueur</span><span><span class="st-long">Entraînements</span><span class="st-short">Entraîn.</span></span><span>Matchs</span><span><span class="st-long">Sans réponse</span><span class="st-short">Sans rép.</span></span>'));
        list.forEach(p => {
          const r = el('button', 'st-row'); r.type = 'button';
          r.innerHTML = `<span class="st-name">${esc(p.name)}</span><span>${cell(p.training)}</span><span>${cell(p.match)}</span><span class="${unanswered(p) ? 'st-none' : 'muted'}">${unanswered(p)}</span>`;
          r.onclick = () => window.RugbyProfile && window.RugbyProfile.viewMember && window.RugbyProfile.viewMember(p.id, 'player');
          t.appendChild(r);
        });
        box.appendChild(t);
      } else list.forEach(p => box.appendChild(card(p, rows.length > 1)));
    };
    if (sel) sel.onchange = () => { sort = sel.value; track('stats_sort', { sort }); draw(); };
    draw();
  }

  /** Carte d'une personne : ses présences (fiche du membre, ou « Mes présences » d'un joueur). */
  function card(p, named) {
    const c = el('div', 'st-card');
    c.appendChild(el('div', 'facts-title', named ? `Présences de ${esc(p.name.split(' ')[0])}` : 'Mes présences'));
    const grid = el('div', 'st-grid');
    [['Entraînements', p.training], ['Matchs', p.match]].forEach(([label, s]) => {
      grid.appendChild(el('div', 'st-box', `<span class="muted small">${label}</span>${cell(s)}${s && s.total ? `<div class="pres-bar"><i class="y" style="width:${100 * s.present / s.total}%"></i><i class="m" style="width:${100 * s.maybe / s.total}%"></i><i class="n" style="width:${100 * s.absent / s.total}%"></i></div>` : ''}`));
    });
    c.appendChild(grid);
    const n = unanswered(p);
    if (n) c.appendChild(el('p', 'small st-none', `${n} convocation${n > 1 ? 's' : ''} sans réponse`));
    return c;
  }

  /** Bloc pour la fiche d'un membre (saison en cours) ; null si rien à montrer ou pas le droit de voir. */
  async function memberBlock(teamId, userId) {
    try {
      const rows = await load(teamId, null);
      const p = rows.find(r => r.id === userId);
      if (!p || (!(p.training && p.training.total) && !(p.match && p.match.total))) return null;
      const c = card(p, false);
      c.querySelector('.facts-title').textContent = 'Présences cette saison';
      return c;
    } catch (e) { return null; }
  }

  window.RugbyStats = { renderTab, memberBlock };
})();
