/* Profil personnalisable (inspiré de SportEasy) : photo, postes, numéro, pied fort, taille, poids, présentation,
   et infos privées (téléphone, date de naissance, contact d'urgence) visibles seulement par le staff de l'équipe.
   Fournit aussi l'avatar (photo ou initiale) utilisé dans les listes de membres. */
(function () {
  'use strict';

  const $ = s => document.querySelector(s);
  const E = window.RugbyEditor;
  const A = window.RugbyAccount;
  if (!A || !A.isActive()) { window.RugbyProfile = { avatar: (n) => initial(n) }; }
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  const btn = (label, cls, fn) => { const b = el('button', 'btn ' + cls); b.type = 'button'; b.textContent = label; b.onclick = e => { e.stopPropagation(); fn(b); }; return b; };
  const track = (name, props) => { if (window.RugbyTrack) window.RugbyTrack.track(name, props); };
  const okImage = v => typeof v === 'string' && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v);
  function initial(name) { const d = el('div', 'avatar'); d.textContent = (String(name || '?').trim().slice(0, 1) || '?').toUpperCase(); return d; }
  /** Avatar : la photo si elle existe, sinon l'initiale. */
  function avatar(name, photo) {
    if (!okImage(photo)) return initial(name);
    const d = el('div', 'avatar photo'); const img = el('img'); img.src = photo; img.alt = ''; d.appendChild(img); return d;
  }
  if (!A || !A.isActive()) return;
  const sb = A.sb;

  const POSTES = ['Pilier', 'Talonneur', '2e ligne', '3e ligne', 'Demi de mêlée', 'Demi d’ouverture', 'Centre', 'Ailier', 'Arrière'];
  const FEET = [['droit', 'Droit'], ['gauche', 'Gauche'], ['les deux', 'Les deux']];
  /** Résumé sportif : « Talonneur · n°2 ». */
  const summary = p => [(p.positions || []).join(', '), p.jersey_number ? `n°${p.jersey_number}` : ''].filter(Boolean).join(' · ');

  /* ---------- Mon profil ---------- */
  async function openProfile() {
    const me = A.user(); if (!me) return;
    const [{ data: prof }, { data: priv }] = await Promise.all([
      sb.from('profiles').select('display_name, avatar, positions, jersey_number, strong_foot, height_cm, weight_kg, bio').eq('id', me.id).maybeSingle(),
      sb.from('profile_private').select('phone, birth_date, emergency_name, emergency_phone').eq('user_id', me.id).maybeSingle()
    ]);
    const p = Object.assign({ display_name: '', avatar: null, positions: [], jersey_number: null, strong_foot: null, height_cm: null, weight_kg: null, bio: '' }, prof || {});
    const v = Object.assign({ phone: '', birth_date: '', emergency_name: '', emergency_phone: '' }, priv || {});
    const body = $('#profile-body'); body.replaceChildren();

    // Photo
    const photoRow = el('div', 'profile-photo');
    let photo = p.avatar;
    const drawPhoto = () => {
      photoRow.replaceChildren(avatar(p.display_name, photo));
      const f = el('input'); f.type = 'file'; f.accept = 'image/*'; f.id = 'profile-photo-file'; f.className = 'file-input';
      f.onchange = () => { if (f.files[0]) resize(f.files[0]).then(url => { photo = url; drawPhoto(); }).catch(() => E.toast('Image illisible : essaie une photo JPG ou PNG.')); };
      const lb = el('label', 'btn outline small', photo ? 'Changer la photo' : 'Ajouter une photo'); lb.htmlFor = 'profile-photo-file';
      const acts = el('div', 'row-wrap'); acts.append(lb, f);
      if (photo) acts.appendChild(btn('Retirer', 'ghost small', () => { photo = null; drawPhoto(); }));
      photoRow.appendChild(acts);
    };
    drawPhoto();
    body.appendChild(photoRow);

    const form = el('form', 'form profile-form');
    const field = (label, input) => { const l = el('label', '', esc(label)); l.appendChild(input); return l; };
    const input = (type, value, attrs) => { const i = el('input'); i.type = type; i.value = value == null ? '' : value; Object.assign(i, attrs || {}); return i; };
    const name = input('text', p.display_name, { maxLength: 40, required: true, autocomplete: 'name' });
    form.appendChild(field('Nom affiché (prénom et nom)', name));

    // Postes : choix multiple, 4 au plus
    const posBox = el('div', 'profile-field');
    posBox.appendChild(el('span', 'profile-label', 'Postes (4 au plus)'));
    const chips = el('div', 'day-chips poste-chips');
    let positions = (p.positions || []).slice();
    POSTES.forEach(po => {
      const l = el('label'); const c = el('input'); c.type = 'checkbox'; c.checked = positions.includes(po);
      c.onchange = () => {
        if (c.checked && positions.length >= 4) { c.checked = false; E.toast('4 postes au maximum.'); return; }
        positions = c.checked ? positions.concat(po) : positions.filter(x => x !== po);
      };
      l.append(c, el('span', '', esc(po))); chips.appendChild(l);
    });
    posBox.appendChild(chips);
    form.appendChild(posBox);

    const row1 = el('div', 'form-row');
    const num = input('number', p.jersey_number, { min: 1, max: 99, inputMode: 'numeric', placeholder: '—' });
    const height = input('number', p.height_cm, { min: 100, max: 230, inputMode: 'numeric', placeholder: 'cm' });
    const weight = input('number', p.weight_kg, { min: 30, max: 200, inputMode: 'numeric', placeholder: 'kg' });
    row1.append(field('Numéro préféré', num), field('Taille (cm)', height), field('Poids (kg)', weight));
    form.appendChild(row1);

    const foot = el('select', 'select'); foot.setAttribute('aria-label', 'Pied fort');
    [['', '—']].concat(FEET).forEach(([val, l]) => foot.appendChild(Object.assign(el('option'), { value: val, textContent: l, selected: (p.strong_foot || '') === val })));
    form.appendChild(field('Pied fort', foot));
    const bio = el('textarea', 'admin-textarea'); bio.rows = 2; bio.maxLength = 200; bio.placeholder = 'Un mot sur toi (facultatif)'; bio.value = p.bio || '';
    form.appendChild(field('Présentation', bio));

    // Infos privées
    form.appendChild(el('div', 'profile-private-head', '<strong>Infos privées</strong><span class="muted">Visibles seulement par toi et le staff de ton équipe.</span>'));
    const phone = input('tel', v.phone, { maxLength: 30, autocomplete: 'tel', placeholder: '06 12 34 56 78' });
    // Sur iPhone, toucher le champ le remplit avec la date du jour : on borne les dates et on permet d'effacer
    const isoDay = d => d.toISOString().slice(0, 10);
    const birth = input('date', v.birth_date || '', { min: '1920-01-02', max: isoDay(new Date(Date.now() - 86400000)) });
    const birthBox = el('div', 'birth-box'); birthBox.appendChild(birth);
    const clearBirth = el('button', 'btn ghost small', 'Effacer'); clearBirth.type = 'button'; clearBirth.onclick = () => { birth.value = ''; };
    birthBox.appendChild(clearBirth);
    const row2 = el('div', 'form-row two'); row2.append(field('Téléphone', phone), field('Date de naissance', birthBox));
    form.appendChild(row2);
    const emName = input('text', v.emergency_name, { maxLength: 60, placeholder: 'Nom' });
    const emPhone = input('tel', v.emergency_phone, { maxLength: 30, placeholder: 'Téléphone' });
    const row3 = el('div', 'form-row two'); row3.append(field('Contact d’urgence', emName), field('Son téléphone', emPhone));
    form.appendChild(row3);

    const err = el('p', 'form-error');
    const save = el('button', 'btn primary wide', 'Enregistrer mon profil'); save.type = 'submit';
    form.append(err, save);
    form.onsubmit = async e => {
      e.preventDefault(); err.textContent = '';
      const n = v2 => v2 === '' ? null : +v2;
      const patch = { display_name: name.value.trim() || p.display_name, avatar: photo || null, positions, jersey_number: n(num.value), strong_foot: foot.value || null, height_cm: n(height.value), weight_kg: n(weight.value), bio: bio.value.trim() || null };
      if (patch.jersey_number !== null && !(patch.jersey_number >= 1 && patch.jersey_number <= 99)) { err.textContent = 'Le numéro va de 1 à 99.'; return; }
      if (patch.height_cm !== null && !(patch.height_cm >= 100 && patch.height_cm <= 230)) { err.textContent = 'Taille entre 100 et 230 cm.'; return; }
      if (patch.weight_kg !== null && !(patch.weight_kg >= 30 && patch.weight_kg <= 200)) { err.textContent = 'Poids entre 30 et 200 kg.'; return; }
      if (birth.value) {
        const bd = new Date(birth.value + 'T00:00:00'), age = (Date.now() - bd) / 31557600000;
        if (!(bd.getFullYear() > 1920) || age < 0) { err.textContent = 'La date de naissance doit être dans le passé. Vérifie l’année, ou appuie sur « Effacer ».'; return; }
        if (age < 3) { err.textContent = `Date de naissance à vérifier : ${bd.toLocaleDateString('fr-FR')} donnerait moins de 3 ans. Corrige l’année, ou appuie sur « Effacer ».`; return; }
      }
      save.disabled = true;
      const priv2 = { user_id: me.id, phone: phone.value.trim() || null, birth_date: birth.value || null, emergency_name: emName.value.trim() || null, emergency_phone: emPhone.value.trim() || null };
      const [r1, r2] = await Promise.all([sb.from('profiles').update(patch).eq('id', me.id), sb.from('profile_private').upsert(priv2)]);
      save.disabled = false;
      if (r1.error || r2.error) {
        const m = (r1.error || r2.error).message || '';
        // Messages de la base traduits : jamais de jargon technique à l'écran
        err.textContent = /birth_date/.test(m) ? 'La date de naissance n’est pas valide : elle doit être dans le passé.'
          : /check constraint|violates/.test(m) ? 'Une des valeurs n’est pas valide : vérifie les champs du profil.'
          : 'Enregistrement impossible, réessaie dans un instant.';
        console.warn('profil', m);
        return;
      }
      Object.assign(A.profile(), patch);
      track('profile_save', { photo: !!photo, positions: positions.length });
      E.closeModal('modal-profile'); E.toast('Profil enregistré.');
      if (window.RugbyHub) window.RugbyHub.renderChrome();
      E.refreshView();
    };
    body.appendChild(form);
    E.openModal('modal-profile');
  }

  /* ---------- Fiche d'un membre ---------- */
  async function viewMember(userId, role) {
    const [{ data: p }, { data: priv }] = await Promise.all([
      sb.from('profiles').select('display_name, avatar, positions, jersey_number, strong_foot, height_cm, weight_kg, bio').eq('id', userId).maybeSingle(),
      sb.from('profile_private').select('phone, birth_date, emergency_name, emergency_phone').eq('user_id', userId).maybeSingle()
    ]);
    if (!p) return E.toast('Profil introuvable.');
    const body = $('#member-body'); body.replaceChildren();
    const head = el('div', 'member-head');
    head.appendChild(avatar(p.display_name, p.avatar));
    head.appendChild(el('div', '', `<h2>${esc(p.display_name)}</h2><p class="muted">${esc(summary(p) || ({ coach: 'Coach', admin: 'Admin', player: 'Joueur' }[role] || ''))}</p>`));
    body.appendChild(head);
    if (p.bio) body.appendChild(el('p', 'member-bio', esc(p.bio)));
    const facts = [['Pied fort', p.strong_foot && (FEET.find(f => f[0] === p.strong_foot) || [0, p.strong_foot])[1]], ['Taille', p.height_cm && p.height_cm + ' cm'], ['Poids', p.weight_kg && p.weight_kg + ' kg']].filter(x => x[1]);
    if (facts.length) body.appendChild(el('dl', 'member-facts', facts.map(([k, val]) => `<div><dt>${k}</dt><dd>${esc(val)}</dd></div>`).join('')));
    if (priv) {
      const age = priv.birth_date ? Math.floor((Date.now() - new Date(priv.birth_date)) / 31557600000) : null;
      const rows = [['Téléphone', priv.phone ? `<a class="link" href="tel:${esc(priv.phone.replace(/\s/g, ''))}">${esc(priv.phone)}</a>` : ''], ['Naissance', priv.birth_date ? `${new Date(priv.birth_date).toLocaleDateString('fr-FR')} (${age} ans)` : ''], ['Contact d’urgence', [priv.emergency_name, priv.emergency_phone].filter(Boolean).map(esc).join(' · ')]].filter(x => x[1]);
      if (rows.length) body.appendChild(el('dl', 'member-facts private', '<div class="facts-title">Infos privées (staff)</div>' + rows.map(([k, val]) => `<div><dt>${k}</dt><dd>${val}</dd></div>`).join('')));
    }
    if (!p.bio && !facts.length && !summary(p)) body.appendChild(el('p', 'muted', 'Ce membre n’a pas encore complété son profil.'));
    E.openModal('modal-member');
  }

  /** Photo réduite à 256 px (JPEG) pour rester légère. */
  function resize(file) {
    return new Promise((resolve, reject) => {
      const img = new Image(); const url = URL.createObjectURL(file);
      img.onload = () => {
        const side = Math.min(img.width, img.height), k = 256 / side;
        const c = document.createElement('canvas'); c.width = 256; c.height = 256;
        // recadrage carré centré
        c.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, side * k, side * k);
        URL.revokeObjectURL(url); resolve(c.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = reject; img.src = url;
    });
  }

  $('#btn-profile').onclick = openProfile;
  window.RugbyProfile = { avatar, openProfile, viewMember, summary, POSTES };
})();
