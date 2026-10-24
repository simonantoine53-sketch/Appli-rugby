/* Partenaires du club : nom, logo, lien, ordre d'affichage, « réservé aux adultes ». Gérés par le bureau du club (et le super-admin).
   Affichés : carte « Partenaire du club » (accueil, à tour de rôle) et entre les événements de l'Agenda, logos en bas de l'accueil
   et des liens publics (pas sur la feuille de match). Un partenaire réservé aux adultes (bar, brasserie : loi Évin) n'apparaît
   jamais sur une équipe de jeunes. Affichages et clics sont comptés sans identifiant (count_sponsor), pour le super-admin. */
(function () {
  'use strict';
  const A = window.RugbyAccount;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  const btn = (label, cls, fn) => { const b = el('button', 'btn ' + cls); b.type = 'button'; b.textContent = label; b.onclick = e => { e.stopPropagation(); fn(b); }; return b; };
  const track = (name, props) => { if (window.RugbyTrack) window.RugbyTrack.track(name, props); };
  const safeUrl = u => (/^https?:\/\/[^\s]+$/i.test(u || '') ? u : null);

  /* Compteur anonyme : un affichage par partenaire et par jour sur cet appareil (pas à chaque rafraîchissement), chaque clic.
     Rien n'est compté si la personne s'oppose à la mesure d'audience. */
  const anonOk = () => !(window.RugbyConsent && window.RugbyConsent.anon && !window.RugbyConsent.anon());
  function count(s, kind) {
    if (!s || !s.id || !A || !A.sb || !anonOk()) return;
    if (kind === 'view') {
      const k = 'rs-sp-' + new Date().toISOString().slice(0, 10) + '-' + s.id;
      try { if (sessionStorage.getItem(k)) return; sessionStorage.setItem(k, '1'); } catch (e) { /* ignore */ }
    }
    A.sb.rpc('count_sponsor', { p_sponsor: s.id, p_kind: kind }).then(() => {}, () => {});
  }
  /** Compte l'affichage quand l'élément est vraiment à l'écran (au moins à moitié). */
  function seen(node, s) {
    if (!('IntersectionObserver' in window)) { count(s, 'view'); return; }
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { io.disconnect(); count(s, 'view'); } }, { threshold: 0.5 });
    io.observe(node);
  }
  const link = (node, s) => { const url = safeUrl(s.url); if (!url) return; node.href = url; node.target = '_blank'; node.rel = 'noopener sponsored'; node.addEventListener('click', () => count(s, 'click')); };
  const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } };
  /** Partenaires montrés à cette équipe : sans ceux réservés aux adultes sur une équipe de jeunes. */
  const forTeam = (list, team) => (list || []).filter(s => !(s.adults_only && team && team.youth));

  /** Carte « Partenaire du club » : logo, nom, site ; toute la carte mène au site du partenaire. */
  function card(s, opts) {
    const o = opts || {}, url = safeUrl(s.url);
    const c = el(url ? 'a' : 'div', 'sponsor-card' + (o.cls ? ' ' + o.cls : ''));
    if (url) link(c, s);
    c.innerHTML = `<span class="sponsor-card-tag">${esc(o.tag || 'Partenaire du club')}</span>
      <span class="sponsor-card-logo">${s.logo ? `<img src="${esc(s.logo)}" alt="" loading="lazy">` : `<span class="sponsor-card-initial">${esc(s.name.slice(0, 1).toUpperCase())}</span>`}</span>
      <span class="sponsor-card-text"><strong>${esc(s.name)}</strong>${url ? `<small>${esc(host(url))}</small>` : ''}</span>
      ${url ? '<span class="sponsor-card-go">Découvrir ↗</span>' : ''}`;
    seen(c, s);
    return c;
  }
  /** Un partenaire différent à chaque ouverture (à tour de rôle, mémorisé sur l'appareil). */
  function pick(list, key) {
    if (!list || !list.length) return null;
    let n = 0;
    try { n = (+localStorage.getItem('rs-sp-turn-' + key) || 0) + 1; localStorage.setItem('rs-sp-turn-' + key, String(n)); } catch (e) { /* ignore */ }
    return list[n % list.length];
  }

  /** Bandeau de logos (ou de noms sans logo), cliquables quand il y a un lien. */
  function strip(list, opts) {
    const o = opts || {};
    const box = el('div', 'sponsor-strip' + (o.cls ? ' ' + o.cls : ''));
    if (o.title !== false) box.appendChild(el('div', 'sponsor-title', esc(o.title || 'Nos partenaires')));
    const row = el('div', 'sponsor-logos');
    (list || []).forEach(s => {
      const url = safeUrl(s.url);
      const item = el(url && !o.print ? 'a' : 'span', 'sponsor-item');
      if (url && !o.print) { link(item, s); item.title = s.name; }
      if (!o.print) seen(item, s);
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
    const { data, error } = await A.sb.from('club_sponsors').select('id, name, logo, url, position, adults_only, created_at').eq('club_id', clubId).order('position').order('created_at');
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
      if (!list.length) { sec.appendChild(el('p', 'help', admin ? 'Vos partenaires s’affichent sur l’accueil des équipes, entre les événements de l’Agenda et en bas des stratégies partagées par lien.' : 'Pas encore de partenaire.')); return; }
      const grid = el('div', 'sponsor-grid');
      sec.appendChild(grid);
      list.forEach((s, i) => {
        const row = el('div', 'sponsor-box');
        row.appendChild(el('div', 'sponsor-box-logo', s.logo ? `<img src="${esc(s.logo)}" alt="">` : `<span class="sponsor-card-initial">${esc(s.name.slice(0, 1).toUpperCase())}</span>`));
        row.appendChild(el('div', 'sponsor-box-text', `<strong>${esc(s.name)}</strong>${safeUrl(s.url) ? `<small>${esc(host(s.url))}</small>` : '<small>Sans lien</small>'}${s.adults_only ? '<span class="sponsor-adult">Réservé aux adultes</span>' : ''}`));
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
        grid.appendChild(row);
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
        <label class="check"><input name="adults" type="checkbox"${s && s.adults_only ? ' checked' : ''}> Réservé aux adultes : jamais affiché sur les équipes de jeunes (bar, brasserie, alcool : loi Évin)</label>
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
        const row = { name: f.name.value.trim(), url: url || null, logo: logo || null, adults_only: f.adults.checked };
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

  window.RugbySponsors = { strip, card, pick, forTeam, load, manage };
})();
