/* Partenaires du club : nom, logo, lien, ordre d'affichage. Gérés par le bureau du club (et le super-admin).
   Affichés : bloc discret sur l'accueil de l'équipe et bas de page des liens publics (pas sur la feuille de match). */
(function () {
  'use strict';
  const A = window.RugbyAccount;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  const btn = (label, cls, fn) => { const b = el('button', 'btn ' + cls); b.type = 'button'; b.textContent = label; b.onclick = e => { e.stopPropagation(); fn(b); }; return b; };
  const track = (name, props) => { if (window.RugbyTrack) window.RugbyTrack.track(name, props); };
  const safeUrl = u => (/^https?:\/\/[^\s]+$/i.test(u || '') ? u : null);

  /** Bandeau de logos (ou de noms sans logo), cliquables quand il y a un lien. */
  function strip(list, opts) {
    const o = opts || {};
    const box = el('div', 'sponsor-strip' + (o.cls ? ' ' + o.cls : ''));
    if (o.title !== false) box.appendChild(el('div', 'sponsor-title', esc(o.title || 'Nos partenaires')));
    const row = el('div', 'sponsor-logos');
    (list || []).forEach(s => {
      const url = safeUrl(s.url);
      const item = el(url && !o.print ? 'a' : 'span', 'sponsor-item');
      if (url && !o.print) { item.href = url; item.target = '_blank'; item.rel = 'noopener sponsored'; item.title = s.name; }
      if (s.logo) { const img = el('img'); img.src = s.logo; img.alt = s.name; img.loading = 'lazy'; item.appendChild(img); }
      else item.appendChild(el('span', 'sponsor-name', esc(s.name)));
      row.appendChild(item);
    });
    box.appendChild(row);
    return box;
  }

  const cache = {};
  async function load(clubId, fresh) {
    if (!clubId || !A || !A.isActive()) return [];
    if (!fresh && cache[clubId] && Date.now() - cache[clubId].at < 5 * 60e3) return cache[clubId].list;
    const { data, error } = await A.sb.from('club_sponsors').select('id, name, logo, url, position, created_at').eq('club_id', clubId).order('position').order('created_at');
    if (error) return [];
    cache[clubId] = { at: Date.now(), list: data || [] };
    return cache[clubId].list;
  }

  /** Logo réduit (300 × 150 au plus) : PNG pour garder la transparence, JPEG sur fond blanc si c'est trop lourd. */
  function shrink(file) {
    return new Promise((resolve, reject) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const k = Math.min(1, 300 / img.width, 150 / img.height);
        const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
        const g = c.getContext('2d'); g.drawImage(img, 0, 0, c.width, c.height);
        let out = c.toDataURL('image/png');
        if (out.length > 190000) { const w = document.createElement('canvas'); w.width = c.width; w.height = c.height; const h = w.getContext('2d'); h.fillStyle = '#fff'; h.fillRect(0, 0, w.width, w.height); h.drawImage(c, 0, 0); out = w.toDataURL('image/jpeg', 0.85); }
        URL.revokeObjectURL(url); resolve(out);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image illisible')); };
      img.src = url;
    });
  }

  /** Onglet Club : la liste des partenaires ; le bureau ajoute, modifie, réordonne, retire. */
  async function manage(root, club, admin) {
    const E = window.RugbyEditor, sb = A.sb;
    const sec = el('div', 'club-section sponsor-admin');
    root.appendChild(sec);
    const draw = async fresh => {
      const list = await load(club.id, fresh);
      sec.replaceChildren();
      const head = el('div', 'members-head', `<span class="muted">${list.length ? `${list.length} partenaire${list.length > 1 ? 's' : ''}` : 'Partenaires du club'}</span>`);
      if (admin) head.appendChild(btn('+ Ajouter un partenaire', 'outline small', () => form(null)));
      sec.appendChild(head);
      if (!list.length) { sec.appendChild(el('p', 'help', admin ? 'Les logos de vos partenaires s’affichent sur l’accueil des équipes et en bas des stratégies partagées par lien.' : 'Pas encore de partenaire.')); return; }
      list.forEach((s, i) => {
        const row = el('div', 'sponsor-row');
        row.appendChild(s.logo ? Object.assign(el('img', 'sponsor-thumb'), { src: s.logo, alt: '' }) : el('div', 'sponsor-thumb empty', esc(s.name.slice(0, 1).toUpperCase())));
        row.appendChild(el('div', 'grow', `<strong>${esc(s.name)}</strong>${safeUrl(s.url) ? `<small>${esc(s.url.replace(/^https?:\/\//, ''))}</small>` : ''}`));
        if (admin) {
          const acts = el('div', 'row-wrap sponsor-acts');
          const up = btn('↑', 'ghost small icon-only', () => move(list, i, -1)); up.disabled = i === 0; up.setAttribute('aria-label', 'Monter ' + s.name);
          const down = btn('↓', 'ghost small icon-only', () => move(list, i, 1)); down.disabled = i === list.length - 1; down.setAttribute('aria-label', 'Descendre ' + s.name);
          acts.append(up, down, btn('Modifier', 'outline small', () => form(s)), btn('Retirer', 'ghost small danger', async () => {
            if (!await window.RugbyDialog.confirm(`Retirer « ${s.name} » des partenaires du club ?`, { title: 'Retirer un partenaire', ok: 'Retirer', danger: true })) return;
            const { error } = await sb.from('club_sponsors').delete().eq('id', s.id);
            if (error) return E.toast(A.errMsg(error));
            track('sponsor_remove'); E.toast('Partenaire retiré.'); draw(true);
          }));
          row.appendChild(acts);
        }
        sec.appendChild(row);
      });
    };
    async function move(list, i, d) {
      const order = list.slice(); const [x] = order.splice(i, 1); order.splice(i + d, 0, x);
      const res = await Promise.all(order.map((s, k) => sb.from('club_sponsors').update({ position: k }).eq('id', s.id)));
      if (res.some(r => r.error)) E.toast('Ordre non enregistré.');
      track('sponsor_reorder'); draw(true);
    }
    function form(s) {
      const f = el('form', 'form sponsor-form');
      f.innerHTML = `<label>Nom<input name="name" required maxlength="80" value="${esc(s ? s.name : '')}"></label>
        <label>Lien (facultatif)<input name="url" type="url" maxlength="300" placeholder="https://…" value="${esc(s && s.url ? s.url : '')}"></label>
        <label>Logo (facultatif)<input name="logo" type="file" accept="image/png,image/jpeg,image/webp"></label>
        <p class="form-error"></p>`;
      const preview = el('div', 'sponsor-preview');
      let logo = s ? s.logo : null;
      const showLogo = () => { preview.replaceChildren(); if (logo) { preview.appendChild(Object.assign(el('img'), { src: logo, alt: '' })); preview.appendChild(btn('Enlever le logo', 'ghost small', () => { logo = null; showLogo(); })); } };
      showLogo();
      f.insertBefore(preview, f.querySelector('.form-error'));
      f.logo.onchange = async () => { const file = f.logo.files[0]; if (!file) return; try { logo = await shrink(file); showLogo(); } catch (e) { f.querySelector('.form-error').textContent = 'Image illisible : essayez un PNG ou un JPEG.'; } };
      const acts = el('div', 'row-wrap');
      acts.append(el('button', 'btn primary small', 'Enregistrer'), btn('Annuler', 'ghost small', () => draw()));
      acts.firstChild.type = 'submit';
      f.appendChild(acts);
      f.onsubmit = async e => {
        e.preventDefault();
        const url = f.url.value.trim();
        if (url && !safeUrl(url)) { f.querySelector('.form-error').textContent = 'Le lien doit commencer par https://'; return; }
        const row = { name: f.name.value.trim(), url: url || null, logo: logo || null };
        const list = await load(club.id);
        const { error } = s ? await sb.from('club_sponsors').update(row).eq('id', s.id) : await sb.from('club_sponsors').insert(Object.assign(row, { club_id: club.id, position: list.length }));
        if (error) { f.querySelector('.form-error').textContent = A.errMsg(error); return; }
        track(s ? 'sponsor_edit' : 'sponsor_add'); E.toast(s ? 'Partenaire modifié.' : `${row.name} ajouté aux partenaires du club.`); draw(true);
      };
      sec.replaceChildren(el('div', 'members-head', `<span class="muted">${s ? 'Modifier le partenaire' : 'Nouveau partenaire'}</span>`), f);
      f.name.focus();
    }
    await draw();
  }

  window.RugbySponsors = { strip, load, manage };
})();
