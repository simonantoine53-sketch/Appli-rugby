/* Profil personnalisable (inspiré de SportEasy) : photo, postes, numéro, pied fort, taille, poids, présentation,
   et infos privées (téléphone, date de naissance, contact d'urgence) visibles seulement par le staff de l'équipe.
   Fournit aussi l'avatar (photo ou initiale) utilisé dans les listes de membres. */
(function () {
  const de = name => (/^[aeiouyàâäéèêëîïôöùûü]/i.test(name || '') ? 'd’' : 'de ');   // d’Emma, de Léo
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
  /** Mon profil, ou celui d'un jeune que je gère (forId). */
  async function openProfile(forId) {
    const me = A.user(); if (!me) return;
    if (typeof forId === 'string') me.id = forId;
    const kid = (A.kids ? A.kids() : []).find(k => k.id === me.id);
    $('#profile-title').textContent = kid ? `Profil ${de(kid.display_name)}${kid.display_name}` : 'Mon profil';
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
      f.onchange = () => { if (f.files[0]) resize(f.files[0]).then(url => { photo = url; drawPhoto(); }).catch(() => E.toast('Image illisible : essayez une photo JPG ou PNG.')); };
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
    posBox.appendChild(el('span', 'profile-label', kid ? 'Ses postes (4 au plus)' : 'Vos postes (4 au plus)'));
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
    row1.append(field('Numéro préféré (facultatif)', num), field('Taille en cm (facultatif)', height), field('Poids en kg (facultatif)', weight));
    form.appendChild(row1);

    const foot = el('select', 'select'); foot.setAttribute('aria-label', 'Pied fort');
    [['', '—']].concat(FEET).forEach(([val, l]) => foot.appendChild(Object.assign(el('option'), { value: val, textContent: l, selected: (p.strong_foot || '') === val })));
    form.appendChild(field('Pied fort (facultatif)', foot));
    const bio = el('textarea', 'admin-textarea'); bio.rows = 2; bio.maxLength = 200; bio.placeholder = kid ? `Quelques mots sur ${kid.display_name.split(' ')[0]} (facultatif)` : 'Quelques mots sur vous (facultatif)'; bio.value = p.bio || '';
    form.appendChild(field('Présentation', bio));

    // Infos privées
    form.appendChild(el('div', 'profile-private-head', `<strong>Infos privées</strong><span class="muted">${kid ? 'Visibles seulement par vous et le staff de son équipe.' : 'Visibles seulement par vous et le staff de votre équipe.'}</span>`));
    const phone = input('tel', v.phone, { maxLength: 30, autocomplete: 'tel', placeholder: '06 12 34 56 78' });
    // Sur iPhone, toucher le champ le remplit avec la date du jour : on borne les dates et on permet d'effacer
    const isoDay = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;   // date locale (pas UTC)
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
    const save = el('button', 'btn primary wide', kid ? 'Enregistrer son profil' : 'Enregistrer mon profil'); save.type = 'submit';
    form.append(err, save);
    form.onsubmit = async e => {
      e.preventDefault(); err.textContent = '';
      // Chaque champ est facultatif et indépendant : une valeur vide ou invalide n'est pas enregistrée,
      // tout le reste l'est quand même (on dit seulement ce qui a été laissé de côté).
      const skipped = [];
      const num2 = (inp, min, max, label) => {
        if (inp.value === '') return null;
        const x = Math.round(+inp.value);
        if (x >= min && x <= max) return x;
        skipped.push(`${label} (entre ${min} et ${max})`); return undefined;
      };
      const patch = { display_name: name.value.trim().slice(0, 60) || p.display_name, avatar: photo || null, positions: positions.slice(0, 4), strong_foot: foot.value || null, bio: bio.value.trim().slice(0, 200) || null };
      [['jersey_number', num, 1, 99, 'numéro'], ['height_cm', height, 100, 230, 'taille'], ['weight_kg', weight, 30, 200, 'poids']].forEach(([k, inp, min, max, label]) => {
        const x = num2(inp, min, max, label); if (x !== undefined) patch[k] = x;
      });
      const priv2 = { user_id: me.id, phone: phone.value.trim().slice(0, 30) || null, emergency_name: emName.value.trim().slice(0, 60) || null, emergency_phone: emPhone.value.trim().slice(0, 30) || null };
      // Date de naissance : vide = pas renseignée. La date du jour (remplie toute seule sur iPhone) compte comme vide.
      const today = isoDay(new Date());
      if (!birth.value || birth.value === today) priv2.birth_date = null;
      else {
        const bd = new Date(birth.value + 'T00:00:00'), age = (Date.now() - bd) / 31557600000;
        if (bd.getFullYear() > 1920 && age >= 3) priv2.birth_date = birth.value;
        else skipped.push('date de naissance (à vérifier)');
      }
      save.disabled = true;
      // Les deux parties sont enregistrées séparément : l'échec de l'une ne bloque pas l'autre
      const [r1, r2] = await Promise.all([sb.from('profiles').update(patch).eq('id', me.id), sb.from('profile_private').upsert(priv2)]);
      save.disabled = false;
      if (r1.error) console.warn('profil', r1.error.message);
      if (r2.error) console.warn('profil privé', r2.error.message);
      if (r1.error && r2.error) { err.textContent = 'Enregistrement impossible, vérifiez votre connexion et réessayez.'; return; }
      if (!r1.error) Object.assign(kid || A.ownProfile(), patch);
      if (r1.error) skipped.push('profil sportif');
      if (r2.error) skipped.push('infos privées');
      track('profile_save', { photo: !!photo, positions: positions.length });
      E.closeModal('modal-profile');
      E.toast(skipped.length ? `Profil enregistré, sauf : ${skipped.join(', ')}.` : 'Profil enregistré.');
      if (window.RugbyHub) window.RugbyHub.renderChrome();
      E.refreshView();
    };
    body.appendChild(form);
    E.openModal('modal-profile');
  }

  /* ---------- Fiche d'un membre ---------- */
  async function viewMember(userId, role) {
    const [{ data: p }, { data: priv }] = await Promise.all([
      sb.from('profiles').select('display_name, avatar, positions, jersey_number, strong_foot, height_cm, weight_kg, bio, guardian_id').eq('id', userId).maybeSingle(),
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
    // Jeune de moins de 15 ans : le staff voit qui gère son compte, pour prévenir le parent directement
    if (p.guardian_id) {
      const { data: g } = await sb.rpc('guardian_contact', { p_user: userId });
      const c = g && g[0];
      if (c) body.appendChild(el('dl', 'member-facts private', `<div class="facts-title">Compte géré par un parent</div><div><dt>Parent</dt><dd>${esc(c.name)}</dd></div><div><dt>E-mail</dt><dd><a class="link" href="mailto:${esc(c.email)}">${esc(c.email)}</a></dd></div>`));
    }
    if (!p.bio && !facts.length && !summary(p)) body.appendChild(el('p', 'muted', 'Ce membre n’a pas encore complété son profil.'));
    E.openModal('modal-member');
    // Présences de la saison (le staff les voit pour tout joueur, chacun pour lui-même)
    if (window.RugbyStats && A.team()) {
      const st = await window.RugbyStats.memberBlock(A.team().id, userId);
      if (st) body.appendChild(st);
    }
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

  $('#btn-profile').onclick = () => openProfile(A.authUser().id);
  window.RugbyProfile = { avatar, openProfile, viewMember, summary, POSTES };
})();
