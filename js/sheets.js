/* Feuilles de match : composition de chaque match de l'agenda, à l'image de la feuille papier du club.
   Chaque équipe règle sa feuille (modèle, logo, couleurs, champs d'en-tête, équipes A / B…, repères comme
   1re ligne, capitaine ou direct au stade). Le staff remplit, imprime (PDF), partage l'image sur WhatsApp
   et publie aux joueurs, qui voient la compo et leur ligne en surbrillance. */
(function () {
  'use strict';

  const $ = s => document.querySelector(s);
  const E = window.RugbyEditor;
  const A = window.RugbyAccount;
  if (!A || !A.isActive()) { window.RugbySheets = { render: () => {}, upcoming: async () => null }; return; }
  const sb = A.sb;
  const AG = () => window.RugbyAgenda;
  const track = (name, props) => { if (window.RugbyTrack) window.RugbyTrack.track(name, props); };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  const btn = (label, cls, fn) => { const b = el('button', 'btn ' + cls); b.type = 'button'; b.textContent = label; b.onclick = e => { e.stopPropagation(); fn(b); }; return b; };
  const uid = () => Math.random().toString(36).slice(2, 9);
  const time = d => { d = new Date(d); return `${d.getHours()}h${String(d.getMinutes()).padStart(2, '0')}`; };
  const dayLong = d => { const s = new Date(d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }); return s.charAt(0).toUpperCase() + s.slice(1); };

  /* ---------- Réglages de la feuille (par équipe) ---------- */
  const POSITIONS = ['Pilier gauche', 'Talonneur', 'Pilier droit', '2e ligne', '2e ligne', '3e ligne aile', '3e ligne aile', 'Numéro 8', 'Demi de mêlée', 'Demi d’ouverture', 'Ailier gauche', 'Premier centre', 'Second centre', 'Ailier droit', 'Arrière'];
  const TEMPLATES = [
    { id: 'classic', name: 'Classique', desc: 'Comme la feuille papier : champs en haut, logo, équipes côte à côte' },
    { id: 'modern', name: 'Moderne', desc: 'Bandeau aux couleurs du club, numéros en pastilles' },
    { id: 'pitch', name: 'Terrain', desc: 'Les 15 placés sur un terrain, remplaçants en dessous : idéal pour WhatsApp' }
  ];
  const DEFAULTS = () => ({
    template: 'classic', primary: '#1f4f96', accent: '#ffffff', logo: null, showPositions: false,
    fields: [
      { id: 'rouge', label: 'Entraîneur (rouge)' }, { id: 'blanc', label: 'Soigneur (blanc)' }, { id: 'jaune', label: 'Adjoint terrain (jaune)' },
      { id: 'ballons', label: 'Resp. ballons' }, { id: 'pharma', label: 'Resp. pharmacie' }
    ],
    squads: [{ id: 'a', label: 'Équipe A', size: 22 }, { id: 'b', label: 'Équipe B', size: 22 }],
    squadFields: [{ id: 'maillots', label: 'Resp. maillots' }],
    // « Double » se coche tout seul quand un joueur figure dans deux équipes (il joue en B puis en A)
    marks: [{ code: '1', label: '1re ligne' }, { code: 'C', label: 'Capitaine' }, { code: 'D', label: 'Double (joue en A et en B)', auto: 'double' }]
  });
  function normSettings(raw) {
    const d = DEFAULTS(), s = Object.assign({}, d, raw || {});
    delete s.__share;
    if (!TEMPLATES.find(t => t.id === s.template)) s.template = 'classic';
    // Sécurité : le logo doit être une vraie image et les couleurs des couleurs (ils sont insérés dans la page)
    if (s.logo && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s.logo)) s.logo = null;
    if (!/^#[0-9a-f]{6}$/i.test(s.primary)) s.primary = d.primary;
    if (!/^#[0-9a-f]{6}$/i.test(s.accent)) s.accent = d.accent;
    ['fields', 'squads', 'squadFields', 'marks'].forEach(k => { if (!Array.isArray(s[k])) s[k] = d[k]; });
    s.fields = s.fields.filter(f => f && f.label).map(f => ({ id: f.id || uid(), label: (/^arbitre de touche \(jaune\)$/i.test(f.label) ? 'Adjoint terrain (jaune)' : String(f.label)).slice(0, 40) }));
    s.squadFields = s.squadFields.filter(f => f && f.label).map(f => ({ id: f.id || uid(), label: String(f.label).slice(0, 40) }));
    s.squads = s.squads.filter(q => q && q.label).slice(0, 3).map(q => ({ id: q.id || uid(), label: String(q.label).slice(0, 30), size: Math.min(30, Math.max(5, +q.size || 22)) }));
    if (!s.squads.length) s.squads = d.squads.slice(0, 1);
    s.marks = s.marks.filter(m => m && m.code).slice(0, 6).map(m => {
      const out = { code: String(m.code).slice(0, 2), label: String(m.label || '').slice(0, 30) };
      if (m.auto === 'double' || (out.code === 'D' && /^direct au stade$/i.test(out.label))) { out.auto = 'double'; if (/^direct au stade$/i.test(out.label)) out.label = 'Double (joue en A et en B)'; }
      return out;
    });
    return s;
  }
  async function loadSettings(teamId) {
    const { data } = await sb.from('teams').select('sheet_settings').eq('id', teamId).maybeSingle();
    return normSettings(data && data.sheet_settings);
  }

  /* ---------- Contenu d'une feuille ---------- */
  function normSheet(data, settings, ev) {
    const s = Object.assign({ opponent: ev ? (ev.opponent || ev.title || '') : '', meet: ev && ev.meet_at ? toHHMM(ev.meet_at) : '', values: {}, squads: {}, squadValues: {}, notes: '' }, data || {});
    // Une seule heure de rendez-vous : celle de l'événement (agenda) fait foi
    if (ev && ev.meet_at) s.meet = toHHMM(ev.meet_at);
    settings.squads.forEach(q => {
      const list = Array.isArray(s.squads[q.id]) ? s.squads[q.id] : [];
      s.squads[q.id] = Array.from({ length: q.size }, (_, i) => Object.assign({ name: '', user_id: null, marks: [] }, list[i] || {}));
      s.squadValues[q.id] = s.squadValues[q.id] || {};
    });
    return s;
  }
  const toHHMM = d => { d = new Date(d); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const hhmm = v => v ? v.replace(':', 'h').replace(/^0(\d)/, '$1') : '';

  /* ---------- Rendu des modèles ---------- */
  const CSS = `
  .ms-sheet{width:760px;box-sizing:border-box;background:#fff;color:#111;font-family:Arial,Helvetica,sans-serif;padding:28px 30px;--c1:#1f4f96;--c2:#fff}
  .ms-sheet *{box-sizing:border-box}
  .ms-mark{display:inline-grid;place-items:center;width:20px;height:20px;border:1.6px solid #222;border-radius:50%;font-size:11px;font-weight:700;margin-left:3px;line-height:1}
  .ms-legend{margin-top:14px;font-size:12px;color:#444;display:flex;flex-wrap:wrap;gap:4px 14px;align-items:center}
  .ms-notes{margin-top:10px;font-size:13px;white-space:pre-wrap;border-top:1px solid #ddd;padding-top:8px}
  .ms-me td,.ms-me .ms-name,.ms-me{background:#fff3c4!important}
  .ms-logo img{max-width:100%;max-height:100%;object-fit:contain}
  /* Classique */
  .ms-classic .ms-top{display:flex;gap:24px;align-items:flex-start;justify-content:space-between}
  .ms-classic .ms-fields{display:flex;flex-direction:column;gap:7px;font-size:16px;flex:1}
  .ms-classic .ms-f{display:flex;gap:8px;align-items:baseline}
  .ms-classic .ms-f span{color:#333;white-space:nowrap}
  .ms-classic .ms-f b{font-weight:700;border-bottom:1px dotted #999;flex:1;min-height:20px;color:#0b2a5b;font-size:17px}
  .ms-classic .ms-gap{height:8px}
  .ms-classic .ms-logo{width:200px;height:200px;background:var(--c1);color:var(--c2);display:grid;place-items:center;padding:14px;font-weight:800;font-size:24px;text-align:center}
  .ms-classic .ms-squads{display:grid;gap:14px;margin-top:22px}
  .ms-classic table{width:100%;border-collapse:collapse;font-size:14px}
  .ms-classic th{background:var(--c1);color:var(--c2);padding:7px;font-size:16px}
  .ms-classic td{border:1px solid #333;padding:4px 6px;height:26px}
  .ms-classic td.n{width:32px;text-align:right;font-weight:700}
  .ms-classic td.m{width:64px;text-align:right;white-space:nowrap}
  .ms-classic .ms-sq-foot{font-size:13px;margin-top:6px}
  /* Moderne */
  .ms-modern{padding:0}
  .ms-modern .ms-banner{background:var(--c1);color:var(--c2);display:flex;gap:18px;align-items:center;padding:20px 26px}
  .ms-modern .ms-logo{width:92px;height:92px;flex:0 0 auto;background:var(--c2);border-radius:14px;display:grid;place-items:center;padding:8px;color:var(--c1);font-weight:800;font-size:15px;text-align:center}
  .ms-modern .ms-banner small{opacity:.85;font-size:13px;text-transform:uppercase;letter-spacing:.08em}
  .ms-modern .ms-banner h1{margin:2px 0 4px;font-size:28px;line-height:1.1}
  .ms-modern .ms-banner p{margin:0;font-size:14px;opacity:.95}
  .ms-modern .ms-body{padding:18px 26px 24px}
  .ms-modern .ms-chips{display:flex;flex-wrap:wrap;gap:6px 8px}
  .ms-modern .ms-chip{border:1.5px solid #d5dbe5;border-radius:999px;padding:4px 10px;font-size:13px}
  .ms-modern .ms-chip span{color:#666}
  .ms-modern .ms-squads{display:grid;gap:16px;margin-top:16px}
  .ms-modern h2{margin:0 0 6px;font-size:17px;color:var(--c1);border-bottom:3px solid var(--c1);padding-bottom:4px}
  .ms-modern .ms-row{display:flex;align-items:center;gap:8px;padding:3px 0;font-size:14px;border-bottom:1px solid #eef0f3;min-height:28px}
  .ms-modern .ms-num{width:24px;height:24px;border-radius:50%;background:var(--c1);color:var(--c2);display:grid;place-items:center;font-size:12px;font-weight:700;flex:0 0 auto}
  .ms-modern .ms-row.bench .ms-num{background:#8a94a6}
  .ms-modern .ms-pos{color:#777;font-size:11px;display:block}
  .ms-modern .ms-name{flex:1}
  .ms-modern .ms-sq-foot{font-size:12px;color:#444;margin-top:6px}
  /* Terrain */
  .ms-pitch{padding:0}
  .ms-pitch .ms-banner{background:var(--c1);color:var(--c2);display:flex;gap:14px;align-items:center;padding:14px 22px}
  .ms-pitch .ms-logo{width:64px;height:64px;background:var(--c2);border-radius:12px;display:grid;place-items:center;padding:6px;color:var(--c1);font-weight:800;font-size:12px;text-align:center}
  .ms-pitch .ms-banner h1{margin:0;font-size:24px}
  .ms-pitch .ms-banner p{margin:2px 0 0;font-size:13px}
  .ms-pitch .ms-body{padding:14px 22px 22px}
  .ms-pitch h2{margin:6px 0 8px;font-size:17px;color:var(--c1)}
  .ms-pitch .ms-field{position:relative;height:540px;border-radius:14px;background:repeating-linear-gradient(0deg,#4a9e4f 0 54px,#529f57 54px 108px);border:3px solid #fff;outline:2px solid #3c8a41}
  .ms-pitch .ms-line{position:absolute;left:0;right:0;border-top:2px solid rgba(255,255,255,.75)}
  .ms-pitch .ms-p{position:absolute;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;width:130px;text-align:center}
  .ms-pitch .ms-p i{font-style:normal;width:34px;height:34px;border-radius:50%;background:var(--c1);color:var(--c2);border:2px solid #fff;display:grid;place-items:center;font-weight:800;font-size:14px}
  .ms-pitch .ms-p b{margin-top:3px;background:rgba(255,255,255,.95);border-radius:6px;padding:1px 6px;font-size:12px;max-width:128px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .ms-pitch .ms-p.ms-me b{background:#ffe27a}
  .ms-pitch .ms-bench{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;font-size:13px}
  .ms-pitch .ms-bench span{border:1.5px solid #d5dbe5;border-radius:999px;padding:3px 9px}
  .ms-pitch .ms-info{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:13px;margin-top:12px;color:#333}
  `;
  const PITCH = [[30, 9], [50, 7], [70, 9], [40, 21], [60, 21], [20, 31], [80, 31], [50, 35], [43, 49], [28, 59], [10, 76], [42, 70], [60, 74], [90, 76], [50, 90]];

  function marksHtml(p, settings) { return (p.marks || []).filter(c => settings.marks.find(m => m.code === c)).map(c => `<span class="ms-mark">${esc(c)}</span>`).join(''); }
  function legend(settings) {
    if (!settings.marks.length) return '';
    return `<div class="ms-legend">${settings.marks.map(m => `<span><span class="ms-mark">${esc(m.code)}</span> ${esc(m.label)}</span>`).join('')}</div>`;
  }
  function logoHtml(settings, clubName) { return settings.logo ? `<img src="${settings.logo}" alt="">` : esc(clubName); }

  /** HTML de la feuille (largeur fixe 760 px) pour l'aperçu, l'impression et l'image. */
  function sheetHtml(settings, sheet, ev, team, me) {
    const club = team ? team.name : '';
    const when = ev ? `${dayLong(ev.starts_at)} · ${time(ev.starts_at)}` : '';
    const vars = `--c1:${esc(settings.primary)};--c2:${esc(settings.accent)}`;
    const fieldVal = f => esc(sheet.values[f.id] || '');
    const isMe = p => me && p.user_id === me;
    const nSq = settings.squads.length;
    let h = '';
    if (settings.template === 'classic') {
      h += `<div class="ms-top"><div class="ms-fields">`;
      h += `<div class="ms-f"><span>Match :</span><b>${esc(sheet.opponent)}</b></div>`;
      if (when) h += `<div class="ms-f"><span>Date :</span><b>${esc(when)}</b></div>`;
      h += `<div class="ms-f"><span>H RDV :</span><b>${esc(hhmm(sheet.meet))}</b></div><div class="ms-gap"></div>`;
      settings.fields.forEach(f => { h += `<div class="ms-f"><span>${esc(f.label)} :</span><b>${fieldVal(f)}</b></div>`; });
      h += `</div><div class="ms-logo">${logoHtml(settings, club)}</div></div>`;
      h += `<div class="ms-squads" style="grid-template-columns:repeat(${nSq},1fr)">`;
      settings.squads.forEach(q => {
        h += `<div><table><tr><th colspan="3">${esc(q.label)}</th></tr>`;
        sheet.squads[q.id].forEach((p, i) => { h += `<tr class="${isMe(p) ? 'ms-me' : ''}"><td class="n">${i + 1}</td><td>${esc(p.name)}</td><td class="m">${marksHtml(p, settings)}</td></tr>`; });
        h += `</table>${settings.squadFields.map(f => `<div class="ms-sq-foot">${esc(f.label)} : <b>${esc((sheet.squadValues[q.id] || {})[f.id] || '')}</b></div>`).join('')}</div>`;
      });
      h += `</div>`;
    } else {
      const banner = settings.template === 'modern'
        ? `<div class="ms-banner"><div class="ms-logo">${logoHtml(settings, club)}</div><div><small>Feuille de match</small><h1>${esc(club)} – ${esc(sheet.opponent)}</h1><p>${esc(when)}${sheet.meet ? ` · RDV ${esc(hhmm(sheet.meet))}` : ''}${ev && ev.location ? ` · ${esc(ev.location)}` : ''}</p></div></div>`
        : `<div class="ms-banner"><div class="ms-logo">${logoHtml(settings, club)}</div><div><h1>${esc(club)} – ${esc(sheet.opponent)}</h1><p>${esc(when)}${sheet.meet ? ` · RDV ${esc(hhmm(sheet.meet))}` : ''}</p></div></div>`;
      h += banner + `<div class="ms-body">`;
      const filled = settings.fields.filter(f => sheet.values[f.id]);
      if (settings.template === 'modern') {
        if (filled.length) h += `<div class="ms-chips">${filled.map(f => `<span class="ms-chip"><span>${esc(f.label)} :</span> <b>${fieldVal(f)}</b></span>`).join('')}</div>`;
        h += `<div class="ms-squads" style="grid-template-columns:repeat(${Math.min(nSq, 2)},1fr)">`;
        settings.squads.forEach(q => {
          h += `<div><h2>${esc(q.label)}</h2>`;
          sheet.squads[q.id].forEach((p, i) => {
            const pos = settings.showPositions ? `<span class="ms-pos">${i < 15 ? POSITIONS[i] : 'Remplaçant'}</span>` : '';
            h += `<div class="ms-row${i >= 15 ? ' bench' : ''}${isMe(p) ? ' ms-me' : ''}"><span class="ms-num">${i + 1}</span><span class="ms-name">${pos}${esc(p.name) || '<span style="color:#bbb">—</span>'}</span>${marksHtml(p, settings)}</div>`;
          });
          h += `${settings.squadFields.map(f => `<div class="ms-sq-foot">${esc(f.label)} : <b>${esc((sheet.squadValues[q.id] || {})[f.id] || '')}</b></div>`).join('')}</div>`;
        });
        h += `</div>`;
      } else {
        // Une équipe encore vide n'est pas dessinée sur le terrain
        settings.squads.filter((q, i) => i === 0 || sheet.squads[q.id].some(p => p.name)).forEach(q => {
          const list = sheet.squads[q.id];
          h += `<h2>${esc(q.label)}</h2><div class="ms-field"><div class="ms-line" style="top:50%"></div><div class="ms-line" style="top:28%;border-top-style:dashed"></div><div class="ms-line" style="top:72%;border-top-style:dashed"></div>`;
          PITCH.forEach(([x, y], i) => { const p = list[i]; if (!p) return; h += `<div class="ms-p${isMe(p) ? ' ms-me' : ''}" style="left:${x}%;top:${y}%"><i>${i + 1}</i><b>${esc(p.name) || '—'}${p.marks && p.marks.length ? ' ' + p.marks.map(esc).join(' ') : ''}</b></div>`; });
          h += `</div>`;
          const bench = list.slice(15).map((p, j) => p.name ? `<span${isMe(p) ? ' class="ms-me"' : ''}><b>${j + 16}</b> ${esc(p.name)}</span>` : '').join('');
          if (bench) h += `<div class="ms-bench"><b>Remplaçants :</b>${bench}</div>`;
        });
        const info = filled.map(f => `<span>${esc(f.label)} : <b>${fieldVal(f)}</b></span>`).concat(settings.squads.flatMap(q => settings.squadFields.filter(f => (sheet.squadValues[q.id] || {})[f.id]).map(f => `<span>${esc(f.label)} (${esc(q.label)}) : <b>${esc(sheet.squadValues[q.id][f.id])}</b></span>`)));
        if (info.length) h += `<div class="ms-info">${info.join('')}</div>`;
      }
      h += legend(settings);
      if (sheet.notes) h += `<div class="ms-notes">${esc(sheet.notes)}</div>`;
      h += `</div>`;
      return `<div class="ms-sheet ms-${settings.template}" style="${vars}">${h}</div>`;
    }
    h += legend(settings);
    if (sheet.notes) h += `<div class="ms-notes">${esc(sheet.notes)}</div>`;
    return `<div class="ms-sheet ms-${settings.template}" style="${vars}">${h}</div>`;
  }
  /** Aperçu mis à l'échelle de la largeur disponible. */
  function previewInto(frame, html) {
    frame.innerHTML = `<style>${CSS}</style><div class="ms-scale">${html}</div>`;
    const inner = frame.querySelector('.ms-scale'), sheetEl = inner.firstElementChild;
    const fit = () => { const k = Math.min(1, frame.clientWidth / 760); inner.style.transform = `scale(${k})`; inner.style.transformOrigin = 'top left'; frame.style.height = Math.ceil(sheetEl.offsetHeight * k) + 'px'; };
    requestAnimationFrame(fit);
    return fit;
  }

  /* ---------- Impression, image, partage ---------- */
  function printSheet(html, title) {
    const w = window.open('', '_blank');
    if (!w) { E.toast('Autorisez les fenêtres surgissantes pour imprimer la feuille.'); return; }
    w.document.open();
    w.document.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${CSS}@page{size:A4;margin:8mm}body{margin:0}.ms-sheet{width:100%;margin:0 auto}.bar{font-family:Arial;padding:10px;text-align:center}@media print{.bar{display:none}}</style></head><body><div class="bar"><button onclick="window.print()">Imprimer / enregistrer en PDF</button></div>${html}</body></html>`);
    w.document.close(); w.focus();
    setTimeout(() => { try { w.print(); } catch (e) { /* bouton dans la page */ } }, 500);
    track('sheet_print');
  }
  let h2c = null;
  function loadHtml2canvas() {
    if (window.html2canvas) return Promise.resolve(window.html2canvas);
    if (h2c) return h2c;
    h2c = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'vendor/html2canvas.min.js';
      s.onload = () => resolve(window.html2canvas); s.onerror = () => { h2c = null; reject(new Error('chargement')); };
      document.head.appendChild(s);
    });
    return h2c;
  }
  async function imageSheet(html, name) {
    E.toast('Création de l’image…');
    try {
      const lib = await loadHtml2canvas();
      const host = el('div', 'ms-offscreen', `<style>${CSS}</style>${html}`);
      document.body.appendChild(host);
      const canvas = await lib(host.querySelector('.ms-sheet'), { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false });
      host.remove();
      const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
      const file = new File([blob], `${name}.png`, { type: 'image/png' });
      track('sheet_image');
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }).catch(() => {}); return; }
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (e) { E.toast('Image impossible pour le moment : utilisez « Imprimer / PDF ».'); }
  }

  /* ---------- Données ---------- */
  async function loadMembers(teamId) {
    const { data } = await sb.from('team_members').select('user_id, role, status, plays, profiles!team_members_user_profile_fk(display_name)').eq('team_id', teamId).eq('status', 'active');
    // Joueurs proposés dans la compo : les convoqués (joueurs + coach / admin qui joue aussi)
    return (data || []).filter(m => m.role === 'player' || m.plays).map(m => ({ id: m.user_id, role: m.role, name: (m.profiles && m.profiles.display_name) || '' })).filter(m => m.name).sort((a, b) => a.name.localeCompare(b.name));
  }
  async function loadPresent(eventId) {
    const { data } = await sb.from('event_responses').select('user_id, status').eq('event_id', eventId).eq('status', 'yes');
    return new Set((data || []).map(r => r.user_id));
  }
  async function loadAbsent(eventId) {
    const { data } = await sb.from('event_responses').select('user_id').eq('event_id', eventId).eq('status', 'no');
    return new Set((data || []).map(r => r.user_id));
  }
  /** Réponse de chacun à la convocation (pour signaler « Sans réponse » et « Peut-être » dans la compo). */
  async function loadAnswers(eventId) {
    const { data } = await sb.from('event_responses').select('user_id, status').eq('event_id', eventId);
    return new Map((data || []).map(r => [r.user_id, r.status]));
  }
  /** Joueurs placés dans la compo qui n'ont pas dit « Présent » (sans réponse ou peut-être). */
  function unsure() {
    if (!cur || !cur.answers) return [];
    return cur.settings.squads.flatMap(q => cur.sheet.squads[q.id]).filter(p => p.user_id && cur.answers.get(p.user_id) !== 'yes' && cur.answers.get(p.user_id) !== 'no');
  }
  /** Avant d'imprimer ou de publier : on signale les joueurs incertains. true : on continue. */
  async function checkUnsure(verb) {
    const list = unsure(); if (!list.length) return true;
    const names = list.map(p => p.name).join(', ');
    return window.RugbyDialog.confirm(`${list.length > 1 ? `${list.length} joueurs de la compo n’ont` : '1 joueur de la compo n’a'} pas confirmé sa présence : ${names}.`, { title: 'Joueurs non confirmés', ok: verb + ' quand même', cancel: 'Revenir à la compo' });
  }
  /** Matchs à venir avec l'état de leur feuille (pour l'accueil). */
  async function upcoming(team) {
    if (!team) return null;
    const from = new Date(); from.setHours(0, 0, 0, 0);
    const { data: evs } = await sb.from('team_events').select('id, kind, title, opponent, home, starts_at, meet_at, location, cancelled').eq('team_id', team.id).eq('kind', 'match').eq('cancelled', false).gte('starts_at', from.toISOString()).order('starts_at').limit(10);
    const ids = (evs || []).map(e => e.id);
    const { data: sheets } = ids.length ? await sb.from('match_sheets').select('event_id, published, data').in('event_id', ids) : { data: [] };
    const byEv = {}; (sheets || []).forEach(s => { byEv[s.event_id] = s; });
    const me = A.user().id;
    return (evs || []).map(ev => {
      const s = byEv[ev.id];
      let mine = null;
      if (s && s.published && s.data && s.data.squads) Object.entries(s.data.squads).forEach(([sq, list]) => { (list || []).forEach((p, i) => { if (p && p.user_id === me) mine = { squad: sq, num: i + 1 }; }); });
      return Object.assign({}, ev, { sheet: s ? (s.published ? 'published' : 'draft') : 'none', mine });
    });
  }

  /* ---------- Pages ---------- */
  let seq = 0;
  async function render(root, eventId) {
    const my = ++seq;
    root.replaceChildren();
    const team = A.team();
    if (!A.isLoggedIn() || !team) { root.appendChild(el('p', 'library-empty', 'Rejoignez votre équipe pour voir les compos.')); return; }
    if (eventId) return renderSheetPage(root, eventId, my);
    const staff = A.isStaff();
    const head = el('div', 'agenda-head');
    head.appendChild(el('h2', 'page-title', 'Compos'));
    if (staff) head.appendChild(btn('Personnaliser la feuille', 'outline', () => openSettings()));
    root.appendChild(head);
    const list = await upcoming(team);
    if (my !== seq) return;
    const shown = staff ? list : list.filter(e => e.sheet === 'published');
    if (!shown.length) {
      const box = el('div', 'soon-card', staff ? '<h2>Aucun match à venir</h2><p>Ajoutez vos matchs dans l’Agenda (ou importez le calendrier de la fédération), puis préparez la feuille de match ici.</p>' : '<h2>Pas encore de compo publiée</h2><p>Le coach publiera la composition avant le match. Vous recevrez une notification.</p>');
      if (staff) box.appendChild(btn('Aller à l’agenda', 'primary', () => E.go('agenda')));
      root.appendChild(box); return;
    }
    const wrap = el('div', 'agenda-list');
    shown.forEach(ev => {
      const c = el('div', 'ev-card');
      const d = new Date(ev.starts_at);
      c.appendChild(el('div', 'ev-date match', `<span>${d.toLocaleDateString('fr-FR', { weekday: 'short' })}</span><strong>${d.getDate()}</strong><span>${d.toLocaleDateString('fr-FR', { month: 'short' })}</span>`));
      const st = { none: '<span class="sheet-st none">À faire</span>', draft: '<span class="sheet-st draft">Brouillon</span>', published: '<span class="sheet-st pub">Publiée</span>' }[ev.sheet];
      const body = el('div', 'ev-body', `<div class="ev-meta"><span class="ev-kind match">Match</span><span>${time(ev.starts_at)}</span>${st}</div><div class="ev-title">${esc(AG() ? AG().label(ev) : ev.opponent)}</div>${ev.mine ? `<div class="ev-place">Vous êtes n°${ev.mine.num}</div>` : ''}`);
      c.appendChild(body);
      c.onclick = () => E.go('compos', ev.id);
      wrap.appendChild(c);
    });
    root.appendChild(wrap);
  }

  /* ---------- Feuille d'un match ---------- */
  let cur = null;   // { ev, team, settings, sheet, row, members, present }
  let saveTimer = null;
  async function renderSheetPage(root, eventId, my) {
    const team = A.team();
    const [{ data: ev }, settings, { data: row }] = await Promise.all([
      sb.from('team_events').select('*').eq('id', eventId).maybeSingle(),
      loadSettings(team.id),
      sb.from('match_sheets').select('*').eq('event_id', eventId).maybeSingle()
    ]);
    if (my !== seq) return;
    if (!ev) { root.appendChild(el('p', 'library-empty', 'Ce match n’existe plus.')); return; }
    const staff = A.isStaff();
    root.appendChild(btn('‹ Compos', 'ghost back-link', () => E.go('compos')));
    if (!staff) {
      if (!row || !row.published) { root.appendChild(el('div', 'soon-card', '<h2>Compo pas encore publiée</h2><p>Vous serez prévenu dès que le coach l’aura publiée.</p>')); return; }
      const sheet = normSheet(row.data, settings, ev);
      const html = sheetHtml(settings, sheet, ev, team, A.user().id);
      const tools = el('div', 'sheet-actions');
      tools.append(btn('Partager en image', 'primary', () => imageSheet(html, fileName(ev))), btn('Imprimer / PDF', 'outline', () => printSheet(html, 'Feuille de match')));
      root.appendChild(tools);
      const frame = el('div', 'sheet-frame'); root.appendChild(frame);
      const fit = previewInto(frame, html); window.addEventListener('resize', fit, { once: true });
      track('sheet_view');
      return;
    }
    const [members, present, absent, answers] = await Promise.all([loadMembers(team.id), loadPresent(ev.id), loadAbsent(ev.id), loadAnswers(ev.id)]);
    if (my !== seq) return;
    cur = { ev, team, settings, sheet: normSheet(row && row.data, settings, ev), row, members, present, absent, answers, markButtons: [] };
    syncDoubles();
    buildEditor(root);
  }
  const fileName = ev => `feuille-de-match-${(ev.opponent || 'match').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-')}`;

  function buildEditor(root) {
    const { ev, settings, sheet } = cur;
    const head = el('div', 'sheet-head');
    head.appendChild(el('div', '', `<div class="ev-meta"><span class="ev-kind match">Match</span><span>${esc(dayLong(ev.starts_at))} · ${time(ev.starts_at)}</span></div><h2 class="page-title">${esc(AG() ? AG().label(ev) : ev.opponent)}</h2>`));
    const status = el('span', 'sheet-status sheet-st ' + (cur.row ? (cur.row.published ? 'pub' : 'draft') : 'none'), cur.row ? (cur.row.published ? 'Publiée' : 'Brouillon') : 'Nouvelle feuille');
    status.id = 'sheet-status';
    head.appendChild(status);
    root.appendChild(head);

    // Actions
    const acts = el('div', 'sheet-actions');
    const tplSel = el('select', 'select'); tplSel.title = 'Modèle de feuille';
    TEMPLATES.forEach(t => tplSel.appendChild(Object.assign(el('option'), { value: t.id, textContent: 'Modèle : ' + t.name, selected: t.id === settings.template })));
    tplSel.onchange = async () => { settings.template = tplSel.value; await saveSettings(settings); E.toast(`Modèle « ${TEMPLATES.find(t => t.id === tplSel.value).name} » choisi pour toute l’équipe.`); };
    acts.append(
      btn('Aperçu', 'outline', () => openPreview()),
      btn('Imprimer / PDF', 'outline', async () => { if (await checkUnsure('Imprimer')) printSheet(html(), 'Feuille de match'); }),
      btn('Partager en image', 'outline', async () => { if (await checkUnsure('Partager')) imageSheet(html(), fileName(ev)); }),
      tplSel,
      btn('Personnaliser la feuille', 'outline', () => openSettings())
    );
    root.appendChild(acts);

    // Logo du club : à ajouter une seule fois, il s'affiche ensuite sur toutes les feuilles
    if (!settings.logo) {
      const call = el('div', 'logo-callout', '<div><strong>Ajoutez le logo du club</strong><br><span class="muted">Une seule fois : il sera sur toutes les feuilles de match.</span></div>');
      const f = el('input'); f.type = 'file'; f.accept = 'image/*'; f.id = 'sheet-logo-quick'; f.className = 'file-input';
      f.onchange = () => { if (f.files[0]) quickLogo(f.files[0]); };
      const l = el('label', 'btn primary small', 'Choisir le logo'); l.htmlFor = 'sheet-logo-quick';
      call.append(l, f);
      root.appendChild(call);
    }

    // Reprendre la compo du match précédent (feuille vide, ou on écrase après confirmation)
    const reuse = el('div', 'sheet-reuse');
    reuse.appendChild(btn('Reprendre la compo du dernier match', 'outline small', () => reusePrevious()));
    root.appendChild(reuse);

    // En-tête
    const top = el('div', 'sheet-card');
    top.appendChild(el('div', 'todo-head', 'En-tête'));
    const grid = el('div', 'sheet-grid');
    grid.appendChild(field('Match', sheet.opponent, v => { sheet.opponent = v; }));
    // Changer l'heure ici la change aussi dans l'agenda (une seule heure partout)
    const meetField = field('H RDV', sheet.meet, v => { sheet.meet = v; }, 'time');
    meetField.querySelector('input').onchange = async e => {
      const v = e.target.value; if (!/^\d{2}:\d{2}$/.test(v)) return;
      const start = new Date(cur.ev.starts_at), m = new Date(start); m.setHours(+v.slice(0, 2), +v.slice(3), 0, 0);
      if (m > start) m.setDate(m.getDate() - 1);
      const { error } = await sb.from('team_events').update({ meet_at: m.toISOString() }).eq('id', cur.ev.id);
      if (error) return E.toast('Heure non reportée dans l’agenda : ' + error.message);
      cur.ev.meet_at = m.toISOString(); E.toast(`Rendez-vous à ${hhmm(v)}, aussi dans l’agenda.`);
    };
    meetField.appendChild(el('small', 'muted', 'Même heure que dans l’agenda.'));
    grid.appendChild(meetField);
    settings.fields.forEach(f => grid.appendChild(field(f.label, sheet.values[f.id], v => { sheet.values[f.id] = v; }, 'text', 'sheet-names')));
    top.appendChild(grid);
    root.appendChild(top);

    // Noms des membres pour l'autocomplétion
    let dl = $('#sheet-names'); if (!dl) { dl = el('datalist'); dl.id = 'sheet-names'; document.body.appendChild(dl); }
    dl.replaceChildren(...cur.members.map(m => Object.assign(el('option'), { value: m.name })));

    // Équipes
    settings.squads.forEach(q => root.appendChild(squadCard(q)));

    const notes = el('div', 'sheet-card');
    notes.appendChild(el('div', 'todo-head', 'Infos pour les joueurs'));
    const ta = el('textarea', 'admin-textarea'); ta.rows = 3; ta.maxLength = 1000; ta.placeholder = 'Tenue, covoiturage, consignes… (facultatif)'; ta.value = sheet.notes || '';
    ta.oninput = () => { sheet.notes = ta.value; queueSave(); };
    notes.appendChild(ta);
    root.appendChild(notes);

    // Publication
    const pub = el('div', 'sheet-publish');
    const published = cur.row && cur.row.published;
    pub.appendChild(btn(published ? 'Republier et prévenir à nouveau' : 'Publier la compo aux joueurs', 'primary wide', () => publish(true)));
    if (published) pub.appendChild(btn('Retirer la publication', 'outline wide', () => publish(false)));
    pub.appendChild(el('p', 'muted small center', 'Les joueurs voient la feuille et leur ligne en surbrillance. Tout est enregistré automatiquement.'));
    root.appendChild(pub);
  }
  /** Copie la feuille du dernier match de l'équipe : seulement les joueurs encore dans l'effectif ; les absents
      connus de la convocation du nouveau match restent visibles (ligne « Absent »). */
  async function reusePrevious() {
    const { ev, team, settings, sheet, members } = cur;
    const { data: prev } = await sb.from('team_events').select('id, kind, home, opponent, title, starts_at').eq('team_id', team.id).eq('kind', 'match').lt('starts_at', ev.starts_at).order('starts_at', { ascending: false }).limit(10);
    const ids = (prev || []).map(e => e.id);
    const { data: sheets } = ids.length ? await sb.from('match_sheets').select('event_id, data').in('event_id', ids) : { data: [] };
    const from = (prev || []).find(e => (sheets || []).some(x => x.event_id === e.id && x.data && x.data.squads));
    if (!from) return E.toast('Aucune compo d’un match précédent à reprendre.');
    const filled = settings.squads.some(q => sheet.squads[q.id].some(p => p.name));
    const label = AG() ? AG().label(from) : from.opponent;
    if (filled && !await window.RugbyDialog.confirm(`Remplacer cette feuille par la compo du match « ${label} » (${new Date(from.starts_at).toLocaleDateString('fr-FR')}) ?`, { title: 'Reprendre la compo', ok: 'Remplacer' })) return;
    const old = (sheets.find(x => x.event_id === from.id) || {}).data;
    const roster = new Map(members.map(m => [m.id, m]));
    const auto = (settings.marks.find(m => m.auto === 'double') || {}).code;
    let kept = 0, dropped = 0;
    settings.squads.forEach(q => {
      const src = (old.squads && old.squads[q.id]) || [];
      sheet.squads[q.id] = sheet.squads[q.id].map((_, i) => {
        const p = src[i];
        const m = p && (p.user_id ? roster.get(p.user_id) : members.find(x => nameKey(x.name) === nameKey(p.name)));
        if (p && p.name && !m) dropped++;
        if (!m) return { name: '', user_id: null, marks: [] };
        kept++;
        return { name: m.name, user_id: m.id, marks: (p.marks || []).filter(c => c !== auto) };
      });
    });
    Object.assign(sheet.values, old.values || {});
    if (old.squadValues) Object.keys(sheet.squadValues).forEach(k => Object.assign(sheet.squadValues[k], old.squadValues[k] || {}));
    syncDoubles();
    clearTimeout(saveTimer); await saveSheet();
    track('sheet_reuse', { kept, dropped });
    const abs = settings.squads.reduce((n, q) => n + sheet.squads[q.id].filter(p => p.user_id && cur.absent.has(p.user_id)).length, 0);
    E.toast(`Compo du match « ${label} » reprise : ${kept} joueur${kept > 1 ? 's' : ''}${dropped ? `, ${dropped} plus dans l’effectif retiré${dropped > 1 ? 's' : ''}` : ''}${abs ? `. ${abs} absent${abs > 1 ? 's' : ''} pour ce match (surligné${abs > 1 ? 's' : ''})` : ''}.`);
    E.refreshView();
  }
  function field(label, value, onChange, type, list) {
    const l = el('label', 'sheet-field');
    l.appendChild(el('span', '', esc(label)));
    const i = el('input'); i.type = type || 'text'; i.value = value || ''; i.maxLength = 80;
    if (list) i.setAttribute('list', list);
    i.oninput = () => { onChange(i.value.trim()); queueSave(); };
    l.appendChild(i);
    return l;
  }
  function squadCard(q) {
    const { settings, sheet, members, present } = cur;
    const list = sheet.squads[q.id];
    const card = el('div', 'sheet-card');
    const head = el('div', 'sheet-sq-head', `<div class="todo-head">${esc(q.label)}</div>`);
    // Joueurs présents à la convocation, pas encore placés
    const placed = () => new Set(settings.squads.flatMap(s => sheet.squads[s.id].map(p => p.user_id).filter(Boolean)));
    const avail = members.filter(m => present.has(m.id) && !placed().has(m.id));
    if (avail.length) head.appendChild(btn(`+ Ajouter les présents (${avail.length})`, 'secondary small', () => {
      const free = members.filter(m => present.has(m.id) && !placed().has(m.id));
      free.forEach(m => { const slot = list.find(p => !p.name); if (slot) { slot.name = m.name; slot.user_id = m.id; } });
      clearTimeout(saveTimer); saveSheet().then(() => E.refreshView());
    }));
    card.appendChild(head);
    // Un joueur ne figure qu'une fois par équipe : dès qu'il est placé, il disparaît des suggestions de cette équipe
    // (il reste proposé dans les autres équipes : c'est le cas du « double »)
    const listId = 'sheet-names-' + q.id;
    let dl = document.getElementById(listId); if (!dl) { dl = el('datalist'); dl.id = listId; document.body.appendChild(dl); }
    const inputs = [];
    const keyOf = p => p.user_id || nameKey(p.name);
    const setName = (p, v) => { p.name = v.trim(); const m = p.name && members.find(x => nameKey(x.name) === nameKey(p.name)); p.user_id = m ? m.id : null; };
    const refresh = () => {
      const count = {}; list.forEach(p => { const k = keyOf(p); if (k) count[k] = (count[k] || 0) + 1; });
      dl.replaceChildren(...members.filter(m => !count[m.id] && !count[nameKey(m.name)]).map(m => Object.assign(el('option'), { value: m.name })));
      inputs.forEach(({ p, inp }) => { const dup = !!keyOf(p) && count[keyOf(p)] > 1; inp.classList.toggle('dup', dup); inp.title = dup ? `Déjà dans ${q.label}` : ''; });
    };
    const rows = el('div', 'sheet-rows');
    cur.markButtons = cur.markButtons.filter(x => x.el.isConnected);
    list.forEach((p, i) => {
      const r = el('div', 'sheet-row' + (i === 15 ? ' bench-start' : ''));
      r.appendChild(el('span', 'sheet-num', String(i + 1)));
      const inp = el('input'); inp.value = p.name || ''; inp.maxLength = 40; inp.setAttribute('list', listId);
      inp.placeholder = settings.showPositions && i < 15 ? POSITIONS[i] : i >= 15 ? 'Remplaçant' : 'Nom';
      let prev = p.name || '', prevState = null;
      inp.onfocus = () => { prev = p.name || ''; prevState = { name: p.name, user_id: p.user_id, marks: p.marks.slice() }; };
      inp.oninput = () => { setName(p, inp.value); refresh(); syncDoubles(); queueSave(); };
      inp.onchange = () => {
        const k = keyOf(p), other = k ? list.findIndex(x => x !== p && keyOf(x) === k) : -1;
        if (other >= 0) {
          // Joueur déjà placé dans cette équipe : on propose de le déplacer ici ou d'échanger les deux places
          askMove(r, i, other, prevState || { name: '', user_id: null, marks: [] });
          return;
        }
        const m = p.user_id && members.find(x => x.id === p.user_id);
        if (m && inp.value !== m.name) { inp.value = p.name = m.name; queueSave(); }   // « simon a » → « Simon A. »
        prev = p.name;
      };
      inputs.push({ p, inp });
      // Absent connu de la convocation : ligne en rouge, étiquette dans le champ (sans réduire le nom)
      const wrap = el('span', 'sheet-in'); wrap.appendChild(inp);
      if (p.user_id && cur.absent.has(p.user_id)) { r.classList.add('is-absent'); wrap.appendChild(el('span', 'sheet-absent', 'Absent')); inp.title = 'Absent pour ce match'; }
      else if (p.user_id && cur.answers && cur.answers.get(p.user_id) !== 'yes') {
        const lbl = cur.answers.get(p.user_id) === 'maybe' ? 'Peut-être' : 'Sans réponse';
        r.classList.add('is-unsure'); wrap.appendChild(el('span', 'sheet-absent unsure', lbl)); inp.title = lbl + ' à la convocation';
      }
      r.appendChild(wrap);
      const marks = el('div', 'sheet-marks');
      settings.marks.forEach(m => {
        const b = el('button', 'sheet-mark' + (p.marks.includes(m.code) ? ' on' : ''), esc(m.code));
        b.type = 'button'; b.title = m.label;
        if (m.auto === 'double') { b.classList.add('auto'); b.title = m.label + ' : se coche tout seul quand le joueur est dans deux équipes'; }
        b.onclick = () => { if (m.auto === 'double') { E.toast('« ' + m.label + ' » se coche tout seul : mets le joueur dans les deux équipes.'); return; } p.marks = p.marks.includes(m.code) ? p.marks.filter(c => c !== m.code) : p.marks.concat(m.code); b.classList.toggle('on'); queueSave(); };
        cur.markButtons.push({ p, code: m.code, el: b });
        marks.appendChild(b);
      });
      r.appendChild(marks);
      // Vider le poste
      if (p.name) {
        const x = el('button', 'sheet-clear', '✕'); x.type = 'button'; x.title = 'Retirer ce joueur du poste'; x.setAttribute('aria-label', `Retirer ${p.name} du n° ${i + 1}`);
        x.onclick = () => { Object.assign(p, { name: '', user_id: null, marks: [] }); syncDoubles(); queueSave(); redraw(); };
        r.appendChild(x);
      }
      rows.appendChild(r);
    });
    // Redessine cette équipe sur place (après un déplacement, un échange ou un poste vidé)
    function redraw() { const fresh = squadCard(q); card.replaceWith(fresh); }
    /** Choix sous la ligne : « Déplacer ici » (l'ancien poste se vide) ou « Échanger » (le joueur remplacé prend l'ancien poste). */
    function askMove(row, i, other, before) {
      document.querySelectorAll('.sheet-choice').forEach(x => x.remove());
      const p = list[i], o = list[other];
      const box = el('div', 'sheet-choice', `<span><b>${esc(o.name)}</b> est déjà n° ${other + 1}.</span>`);
      const cancel = () => { Object.assign(p, before); box.remove(); redraw(); };
      box.appendChild(btn('Déplacer ici', 'primary small', () => {
        p.marks = o.marks.slice(); Object.assign(o, { name: '', user_id: null, marks: [] });
        syncDoubles(); queueSave(); redraw(); E.toast(`${p.name} passe au n° ${i + 1}.`);
      }));
      if (before.name) box.appendChild(btn('Échanger', 'outline small', () => {
        const marks = o.marks.slice(); Object.assign(o, { name: before.name, user_id: before.user_id, marks: before.marks.slice() }); p.marks = marks;
        syncDoubles(); queueSave(); redraw(); E.toast(`${p.name} et ${o.name} ont échangé leurs places.`);
      }));
      box.appendChild(btn('Annuler', 'ghost small', cancel));
      row.after(box);
    }
    card.appendChild(rows);
    refresh();
    if (settings.squadFields.length) {
      const foot = el('div', 'sheet-grid');
      settings.squadFields.forEach(f => foot.appendChild(field(f.label, sheet.squadValues[q.id][f.id], v => { sheet.squadValues[q.id][f.id] = v; }, 'text', 'sheet-names')));
      card.appendChild(foot);
    }
    if (settings.marks.length) card.appendChild(el('p', 'muted small', 'Repères : ' + settings.marks.map(m => `<b>${esc(m.code)}</b> ${esc(m.label)}`).join(' · ')));
    return card;
  }
  const html = () => sheetHtml(cur.settings, cur.sheet, cur.ev, cur.team, null);

  /** Repère « double » : coché sur toutes les lignes d'un joueur présent dans au moins deux équipes. */
  const nameKey = n => String(n || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  function syncDoubles() {
    const mark = cur.settings.marks.find(m => m.auto === 'double');
    if (!mark) return;
    const squadsOf = {};
    cur.settings.squads.forEach(q => cur.sheet.squads[q.id].forEach(p => {
      const k = p.user_id || nameKey(p.name); if (!k) return;
      (squadsOf[k] = squadsOf[k] || new Set()).add(q.id);
    }));
    cur.settings.squads.forEach(q => cur.sheet.squads[q.id].forEach(p => {
      const k = p.user_id || nameKey(p.name);
      const dbl = !!k && squadsOf[k] && squadsOf[k].size > 1;
      const has = p.marks.includes(mark.code);
      if (dbl && !has) p.marks = p.marks.concat(mark.code);
      if (!dbl && has) p.marks = p.marks.filter(c => c !== mark.code);
    }));
    (cur.markButtons || []).forEach(x => x.el.classList.toggle('on', x.p.marks.includes(x.code)));
  }

  function queueSave() {
    const st = $('#sheet-status'); if (st) st.textContent = 'Enregistrement…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveSheet, 700);
  }
  async function saveSheet() {
    if (!cur) return;
    const row = { team_id: cur.team.id, event_id: cur.ev.id, data: cur.sheet, updated_by: A.user().id };
    const { data, error } = await sb.from('match_sheets').upsert(row, { onConflict: 'event_id' }).select().maybeSingle();
    const st = $('#sheet-status');
    if (error) { if (st) st.textContent = 'Erreur d’enregistrement'; E.toast('Enregistrement impossible : ' + error.message); return; }
    if (data) cur.row = data;
    if (st) { const pub = !!(cur.row && cur.row.published); st.className = 'sheet-status sheet-st ' + (pub ? 'pub' : 'draft'); st.textContent = pub ? 'Publiée · enregistrée ✓' : 'Brouillon enregistré ✓'; }
  }
  async function publish(on) {
    if (on && !await checkUnsure('Publier')) return;
    clearTimeout(saveTimer); await saveSheet();
    const { error } = await sb.from('match_sheets').update({ published: on, published_at: on ? new Date().toISOString() : null }).eq('event_id', cur.ev.id);
    if (error) return E.toast(error.message);
    if (on) {
      track('sheet_publish');
      sb.functions.invoke('push-notify', { body: { event_id: cur.ev.id, kind: 'sheet_published' } }).catch(() => {});
      E.toast('Compo publiée : les joueurs sont prévenus.');
    } else E.toast('Publication retirée.');
    E.refreshView();
  }
  function openPreview() {
    const box = $('#sheet-preview-body'); box.replaceChildren();
    E.openModal('modal-sheet-preview');
    const frame = el('div', 'sheet-frame'); box.appendChild(frame);
    previewInto(frame, html());
  }

  /* ---------- Personnalisation (par équipe) ---------- */
  async function saveSettings(s) {
    const { error } = await sb.from('teams').update({ sheet_settings: s }).eq('id', A.team().id);
    if (error) { E.toast('Réglages non enregistrés : ' + error.message); return false; }
    track('sheet_settings', { template: s.template });
    if (window.RugbyHub && window.RugbyHub.logoChanged) window.RugbyHub.logoChanged(A.team().id, s.logo);
    return true;
  }
  /** Autres équipes dont je suis coach ou admin (même club, en général). */
  const otherStaffTeams = () => A.teams().filter(t => A.team() && t.id !== A.team().id && !t.superadmin && (t.role === 'coach' || t.role === 'admin'));
  /** Met le logo (et les couleurs) sur d'autres équipes ; onlyEmpty : seulement celles qui n'ont pas encore de logo. */
  async function shareLogo(s, onlyEmpty) {
    let n = 0;
    for (const t of otherStaffTeams()) {
      const other = await loadSettings(t.id);
      if (onlyEmpty && other.logo) continue;
      other.logo = s.logo; other.primary = s.primary; other.accent = s.accent;
      const { error } = await sb.from('teams').update({ sheet_settings: other }).eq('id', t.id);
      if (!error) { n++; if (window.RugbyHub && window.RugbyHub.logoChanged) window.RugbyHub.logoChanged(t.id, s.logo); }
    }
    return n;
  }
  /** Ajout du logo depuis la feuille : une seule fois pour toutes les feuilles de l'équipe. */
  async function quickLogo(file) {
    try {
      const url = await resizeLogo(file);
      cur.settings.logo = url;
      if (!(await saveSettings(cur.settings))) return;
      const n = await shareLogo(cur.settings, true);
      track('sheet_logo', { shared: n });
      E.toast(n ? `Logo ajouté sur toutes les feuilles de l’équipe et de ${n > 1 ? 'vos ' + n + ' autres équipes' : 'votre autre équipe'}.` : 'Logo ajouté : il sera sur toutes les feuilles de match de l’équipe.');
      E.refreshView();
    } catch (e) { E.toast('Image illisible : essaie un PNG ou un JPG.'); }
  }
  async function openSettings() {
    const team = A.team();
    const s = cur && cur.team.id === team.id ? JSON.parse(JSON.stringify(cur.settings)) : await loadSettings(team.id);
    const body = $('#sheet-settings-body');
    const draw = () => {
      body.replaceChildren();
      // Modèle
      body.appendChild(el('div', 'todo-head', 'Modèle'));
      const tpls = el('div', 'tpl-grid');
      TEMPLATES.forEach(t => { const b = el('button', 'tpl-card' + (s.template === t.id ? ' on' : ''), `<strong>${t.name}</strong><small>${t.desc}</small>`); b.type = 'button'; b.onclick = () => { s.template = t.id; draw(); }; tpls.appendChild(b); });
      body.appendChild(tpls);
      // Logo et couleurs
      body.appendChild(el('div', 'todo-head', 'Logo et couleurs'));
      const brand = el('div', 'brand-row');
      const logo = el('div', 'logo-box', s.logo ? `<img src="${s.logo}" alt="Logo">` : '<span>Pas de logo</span>');
      logo.style.background = s.primary;
      const file = el('input'); file.type = 'file'; file.accept = 'image/*'; file.id = 'sheet-logo-file'; file.className = 'file-input';
      file.onchange = () => { const f = file.files[0]; if (f) resizeLogo(f).then(url => { s.logo = url; draw(); }).catch(() => E.toast('Image illisible.')); };
      const lb = el('label', 'btn outline small', s.logo ? 'Changer le logo' : 'Ajouter le logo'); lb.htmlFor = 'sheet-logo-file';
      const colors = el('div', 'color-row');
      const c1 = el('input'); c1.type = 'color'; c1.value = s.primary; c1.oninput = () => { s.primary = c1.value; logo.style.background = s.primary; };
      const c2 = el('input'); c2.type = 'color'; c2.value = s.accent; c2.oninput = () => { s.accent = c2.value; };
      colors.append(el('label', '', 'Couleur principale'), c1, el('label', '', 'Texte sur la couleur'), c2);
      const logoBtns = el('div', 'row-wrap'); logoBtns.append(lb, file);
      if (s.logo) logoBtns.appendChild(btn('Retirer', 'ghost small', () => { s.logo = null; draw(); }));
      const right = el('div', 'brand-right'); right.append(logoBtns, colors);
      brand.append(logo, right);
      body.appendChild(brand);
      const others = otherStaffTeams();
      if (others.length && s.logo) {
        const share = el('label', 'check', `<input type="checkbox"> Mettre aussi ce logo et ces couleurs sur ${others.length > 1 ? 'mes autres équipes' : 'mon autre équipe'} : ${others.map(t => esc(t.name)).join(', ')}`);
        share.querySelector('input').checked = s.__share !== false;
        share.querySelector('input').onchange = e => { s.__share = e.target.checked; };
        body.appendChild(share);
      }
      // Listes éditables
      body.appendChild(listEditor('Champs en haut de la feuille', 'Ex. Resp. ballons, Adjoint terrain, Soigneur…', s.fields, () => ({ id: uid(), label: '' }), 'label'));
      body.appendChild(squadEditor(s));
      body.appendChild(listEditor('Champs en bas de chaque équipe', 'Ex. Resp. maillots', s.squadFields, () => ({ id: uid(), label: '' }), 'label'));
      body.appendChild(marksEditor(s));
      const opt = el('label', 'check', '<input type="checkbox"> Afficher les postes (pilier, talonneur…) dans le modèle Moderne');
      opt.querySelector('input').checked = !!s.showPositions; opt.querySelector('input').onchange = e => { s.showPositions = e.target.checked; };
      body.appendChild(opt);
      const save = btn('Enregistrer pour toute l’équipe', 'primary wide', async b => {
        b.disabled = true;
        const share = s.__share !== false && s.logo && otherStaffTeams().length;
        const clean = normSettings(s);
        if (await saveSettings(clean)) {
          const n = share ? await shareLogo(clean, false) : 0;
          E.closeModal('modal-sheet-settings');
          E.toast(n ? `Feuille personnalisée, logo mis aussi sur ${n > 1 ? n + ' autres équipes' : 'votre autre équipe'}.` : 'Feuille personnalisée.');
          E.refreshView();
        }
        b.disabled = false;
      });
      body.appendChild(save);
    };
    draw();
    E.openModal('modal-sheet-settings');
  }
  function listEditor(title, placeholder, arr, make, key) {
    const box = el('div', 'list-editor');
    box.appendChild(el('div', 'todo-head', esc(title)));
    const rows = el('div', 'list-rows');
    const drawRows = () => {
      rows.replaceChildren();
      arr.forEach((item, i) => {
        const r = el('div', 'list-row');
        const inp = el('input'); inp.value = item[key] || ''; inp.placeholder = placeholder; inp.maxLength = 40;
        inp.oninput = () => { item[key] = inp.value; };
        r.append(inp, btn('✕', 'ghost small', () => { arr.splice(i, 1); drawRows(); }));
        rows.appendChild(r);
      });
    };
    drawRows();
    box.append(rows, btn('+ Ajouter', 'outline small', () => { arr.push(make()); drawRows(); rows.lastChild.querySelector('input').focus(); }));
    return box;
  }
  function squadEditor(s) {
    const box = el('div', 'list-editor');
    box.appendChild(el('div', 'todo-head', 'Équipes sur la feuille'));
    const rows = el('div', 'list-rows');
    const drawRows = () => {
      rows.replaceChildren();
      s.squads.forEach((q, i) => {
        const r = el('div', 'list-row');
        const inp = el('input'); inp.value = q.label; inp.maxLength = 30; inp.oninput = () => { q.label = inp.value; };
        const size = el('select', 'select small');
        for (let n = 15; n <= 30; n++) size.appendChild(Object.assign(el('option'), { value: n, textContent: `${n} joueurs`, selected: n === q.size }));
        size.onchange = () => { q.size = +size.value; };
        r.append(inp, size);
        if (s.squads.length > 1) r.appendChild(btn('✕', 'ghost small', () => { s.squads.splice(i, 1); drawRows(); }));
        rows.appendChild(r);
      });
    };
    drawRows();
    box.appendChild(rows);
    box.appendChild(btn('+ Ajouter une équipe', 'outline small', () => { if (s.squads.length >= 3) return E.toast('3 équipes au maximum.'); s.squads.push({ id: uid(), label: `Équipe ${String.fromCharCode(65 + s.squads.length)}`, size: 22 }); drawRows(); }));
    return box;
  }
  function marksEditor(s) {
    const box = el('div', 'list-editor');
    box.appendChild(el('div', 'todo-head', 'Repères à côté des noms'));
    const rows = el('div', 'list-rows');
    const drawRows = () => {
      rows.replaceChildren();
      s.marks.forEach((m, i) => {
        const r = el('div', 'list-row');
        const code = el('input'); code.value = m.code; code.maxLength = 2; code.className = 'mark-code'; code.oninput = () => { m.code = code.value.trim(); };
        const lab = el('input'); lab.value = m.label; lab.maxLength = 30; lab.placeholder = 'Signification'; lab.oninput = () => { m.label = lab.value; };
        r.append(code, lab, btn('✕', 'ghost small', () => { s.marks.splice(i, 1); drawRows(); }));
        rows.appendChild(r);
      });
    };
    drawRows();
    box.append(rows, btn('+ Ajouter un repère', 'outline small', () => { if (s.marks.length >= 6) return E.toast('6 repères au maximum.'); s.marks.push({ code: '', label: '' }); drawRows(); }));
    return box;
  }
  /** Logo réduit à 320 px pour rester léger (enregistré avec les réglages de l'équipe). */
  function resizeLogo(file) {
    return new Promise((resolve, reject) => {
      const img = new Image(); const url = URL.createObjectURL(file);
      img.onload = () => {
        const k = Math.min(1, 320 / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/png'));
      };
      img.onerror = reject; img.src = url;
    });
  }

  window.RugbySheets = { render, upcoming, sheetHtml, normSettings, normSheet, previewInto, openSettings };
})();
