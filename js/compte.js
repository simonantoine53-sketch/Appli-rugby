/* Page Compte, en cinq groupes courts : Mon profil, Mon club et mes équipes, Réglages, Aide, Compte.
   Tout est visible sur la page ; les formulaires (code, mot de passe) s'ouvrent sur place (2 touches au plus). */
(function () {
  const de = name => (/^[aeiouyàâäéèêëîïôöùûü]/i.test(name || '') ? 'd’' : 'de ');   // d’Emma, de Léo
  'use strict';
  const A = window.RugbyAccount;
  const E = window.RugbyEditor;
  if (!A || !A.isActive()) return;
  const sb = A.sb;
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
  const btn = (label, cls, fn) => { const b = el('button', 'btn ' + cls); b.type = 'button'; b.textContent = label; b.onclick = e => { e.stopPropagation(); fn(b); }; return b; };
  const track = (name, props) => { if (window.RugbyTrack) window.RugbyTrack.track(name, props); };
  const errMsg = A.errMsg;

  function render() {
    const user = A.authUser(), me = A.ownProfile();
    if (!user || !me) return;
    const P = window.RugbyProfile;

    // 1. Mon profil
    $('#account-name').textContent = me.display_name;
    $('#team-user').textContent = user.email;
    if (P) { $('#account-avatar').replaceChildren(P.avatar(me.display_name, me.avatar)); $('#account-summary').textContent = P.summary(me) || 'Ajoutez votre photo et votre poste pour que l’équipe vous reconnaisse.'; }
    $('#account-kids').replaceChildren(kidsCard());

    // 2. Mon club et mes équipes (quitter une équipe se fait dans sa page Équipe)
    const box = $('#account-teams'); box.replaceChildren();
    const mine = A.teams().filter(t => !t.superadmin && !t.notMember && !t.who);
    mine.forEach(t => box.appendChild(el('div', 'account-team', `${esc(t.name)}${t.clubName ? ` <span class="muted small">· ${esc(t.clubName)}</span>` : ''} ${A.roleBadge(t.role, t.plays)}`)));
    A.clubs().filter(c => c.myRole === 'responsable').forEach(c => box.appendChild(el('div', 'account-team', `${esc(c.name)} <span class="role-badge coach">${esc(c.myTitle || 'Bureau du club')}</span>`)));
    if (!box.children.length) box.appendChild(el('p', 'muted small', A.kids().length ? 'Vous n’êtes membre d’aucune équipe vous-même ; les équipes de vos jeunes sont dans « Mes jeunes ».' : 'Pas encore d’équipe : rejoignez votre club avec le code ou le lien reçu.'));
    const join = $('#account-join'); join.replaceChildren();
    const pend = A.pendingCard(); if (pend) join.appendChild(pend);
    const toggle = btn('Rejoindre un club ou une équipe', 'outline wide', () => {
      const forms = A.teamForms(() => { forms.replaceWith(toggle); toggle.focus(); });
      toggle.replaceWith(forms);
    });
    join.appendChild(toggle);

    // 3. Réglages
    if (window.RugbyPush) window.RugbyPush.renderButton(!!A.team());
    renderReminders();
    // 5. Compte
    $('#btn-admin').classList.toggle('hidden', !A.isSuper());
    closePassword();
  }

  /** Préférence personnelle : rappel la veille (pour mes jeunes aussi, puisque leurs notifications arrivent chez moi). */
  async function renderReminders() {
    const row = $('#reminders-row'), box = $('#reminders-on');
    const { data, error } = await sb.from('profile_private').select('reminders_off').eq('user_id', A.authUser().id).maybeSingle();
    row.classList.toggle('hidden', !!error);
    if (error) return;
    box.checked = !(data && data.reminders_off);
    $('#reminders-help').textContent = A.kids().length ? 'Pour vous et vos jeunes. Le staff choisit l’heure.' : 'Le staff de l’équipe choisit l’heure.';
    box.onchange = async () => {
      const { error: e } = await sb.from('profile_private').upsert({ user_id: A.authUser().id, reminders_off: !box.checked });
      if (e) { box.checked = !box.checked; return E.toast(errMsg(e)); }
      track('reminders_pref', { on: box.checked });
      E.toast(box.checked ? 'Rappel de la veille activé.' : 'Plus de rappel la veille.');
    };
  }

  /** Mes jeunes (moins de 15 ans) : leurs équipes, leur profil, en ajouter ou en retirer. */
  function kidsCard() {
    const kids = A.kids(), logins = A.kidLogins(), teams = A.teams(), pending = A.pendingTeams();
    const box = el('div', 'team-forms-card kids-card');
    const P = window.RugbyProfile;
    if (!kids.length) {
      // Pas de jeune : une seule ligne discrète, qui déplie l'explication et le formulaire
      const open = btn('+ Ajouter un enfant (−15 ans)', 'ghost small kids-open', () => { box.classList.remove('kids-closed'); open.remove(); box.querySelector('input').focus(); });
      box.classList.add('kids-empty', 'kids-closed');
      box.appendChild(open);
      box.appendChild(el('p', 'help kids-help', 'Gérez son compte depuis le vôtre : convocations, profil, équipes.'));
    } else {
      box.appendChild(el('h4', '', 'Mes jeunes'));
      kids.forEach(k => {
        const row = el('div', 'kid-row');
        if (P) row.appendChild(P.avatar(k.display_name, k.avatar));
        const names = teams.filter(t => t.who === k.id).map(t => t.name).concat(pending.filter(t => t.who === k.id).map(t => t.name + ' (en attente)'));
        row.appendChild(el('div', 'who', `${esc(k.display_name)}<small>${esc(names.join(', ') || 'Pas encore d’équipe')}</small>`));
        const acts = el('div', 'row-wrap');
        acts.appendChild(btn('Son profil', 'outline small', () => P && P.openProfile(k.id)));
        acts.appendChild(btn(logins[k.id] ? 'Renvoyer le lien' : 'Lui donner son compte', 'outline small', () => handOver(k)));
        const more = btn('⋯', 'ghost small', () => window.RugbySelect.openMenu(more, [[`Retirer ${k.display_name} de mon compte`, async () => {
          if (!await window.RugbyDialog.confirm(`Retirer ${k.display_name} de votre compte ? Son profil, ses équipes et ses réponses aux convocations seront effacés.`, { title: 'Retirer un jeune', ok: 'Retirer', danger: true })) return;
          const { error } = await sb.rpc('remove_child', { p_child: k.id });
          if (error) return E.toast(errMsg(error));
          await A.reloadKids(); render(); E.toast(`${k.display_name} n’est plus rattaché à votre compte.`);
        }]], k.display_name));
        more.title = 'Plus d’actions'; more.setAttribute('aria-label', `Plus d’actions pour ${k.display_name}`);
        acts.appendChild(more);
        row.appendChild(acts);
        box.appendChild(row);
        if (logins[k.id]) box.appendChild(el('p', 'help kid-handover', `Compte transmis à ${esc(logins[k.id])} : vous le gérez jusqu’à sa première connexion.`));
        // Trace de l'accord parental donné à l'inscription (ou à l'ajout du jeune)
        const consent = el('p', 'help kid-consent'); box.appendChild(consent);
        sb.from('profile_private').select('parental_consent_at').eq('user_id', k.id).maybeSingle().then(({ data }) => {
          if (data && data.parental_consent_at) consent.textContent = `Accord parental donné le ${new Date(data.parental_consent_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}.`;
        });
      });
      box.appendChild(el('p', 'help', 'À 15 ans, votre jeune peut avoir son propre e-mail et mot de passe : « Lui donner son compte » lui transmet ce compte, avec son profil et ses équipes.'));
    }
    const f = el('form', 'inline-form', '<input type="text" placeholder="Prénom et nom du jeune" required minlength="2" maxlength="60" aria-label="Prénom et nom du jeune"><button class="btn outline small" type="submit">Ajouter un jeune</button>');
    f.onsubmit = async e => {
      e.preventDefault();
      const name = f.querySelector('input').value.trim();
      const { error } = await sb.rpc('add_child', { p_name: name });
      if (error) return E.toast(errMsg(error));
      await A.reloadKids(); render();
      E.toast(`${name} est ajouté. Rejoignez son équipe avec le code du club, en choisissant « Pour ${name} ».`);
    };
    box.appendChild(f);
    return box;
  }

  /** À 15 ans, le jeune peut avoir son propre compte : il reçoit un lien pour choisir son mot de passe.
      Le parent garde la main jusqu'à la première connexion du jeune (claim_my_account). */
  async function handOver(k) {
    const D = window.RugbyDialog;
    const first = (k.display_name || '').split(' ')[0];
    const em = await D.prompt(`E-mail ${de(first)}${first}`, A.kidLogins()[k.id] || '', { title: 'Lui donner son compte', placeholder: 'son.adresse@exemple.fr', ok: 'Continuer', maxLength: 254 });
    if (!em) return;
    const again = await D.prompt('Retapez son adresse pour vérifier', '', { title: 'Lui donner son compte', placeholder: em.trim(), ok: 'Envoyer le lien', maxLength: 254 });
    if (again == null) return;
    if (again.trim().toLowerCase() !== em.trim().toLowerCase()) return E.toast('Les deux adresses ne sont pas identiques : rien n’a été envoyé.');
    const { error } = await sb.rpc('handover_child', { p_child: k.id, p_email: em.trim() });
    if (error) return E.toast(errMsg(error));
    track('kid_handover');
    const { error: e2 } = await sb.auth.resetPasswordForEmail(em.trim(), { redirectTo: location.origin + location.pathname });
    await A.reloadKids(); render();
    if (e2) E.toast(`Compte transmis, mais l’e-mail n’est pas parti (${errMsg(e2)}). Réessayez avec « Renvoyer le lien ».`);
    else E.toast(`Lien envoyé à ${em.trim()} : ${first} choisit son mot de passe et se connecte. Vous gérez son compte jusque-là.`);
  }

  /* Changer mon mot de passe : formulaire sur place, sous le bouton */
  function closePassword() { $('#password-form').classList.add('hidden'); $('#btn-password').setAttribute('aria-expanded', 'false'); }
  $('#btn-password').onclick = () => {
    const f = $('#password-form'), open = f.classList.contains('hidden');
    f.reset(); $('#password-msg').textContent = '';
    f.classList.toggle('hidden', !open); $('#btn-password').setAttribute('aria-expanded', String(open));
    if (open) $('#password-new').focus();
  };
  $('#password-form').onsubmit = async e => {
    e.preventDefault();
    const pw = $('#password-new').value, again = $('#password-again').value, msg = $('#password-msg');
    if (pw.length < 6) { msg.textContent = 'Mot de passe trop court (6 caractères minimum).'; return; }
    if (pw !== again) { msg.textContent = 'Les deux mots de passe ne sont pas identiques.'; return; }
    const b = $('#password-save'); b.disabled = true;
    const { error } = await sb.auth.updateUser({ password: pw });
    b.disabled = false;
    if (error) { msg.textContent = errMsg(error); return; }
    track('password_change');
    closePassword(); E.toast('Mot de passe modifié.');
  };
  $('#password-cancel').onclick = closePassword;

  // Déconnexion : les données gardées pour le hors ligne sont effacées de l'appareil (avant et après, lectures en cours comprises)
  $('#btn-logout').onclick = async () => { const O = window.RugbyOffline; if (O) await O.clearData(); await sb.auth.signOut(); if (O) setTimeout(O.clearData, 1500); E.go('home'); E.toast('Déconnecté.'); };
  $('#btn-privacy').onclick = () => window.RugbyLegal && window.RugbyLegal.open('privacy');
  /* Apparence : Clair / Sombre / Automatique (suit le téléphone) ; gardé sur cet appareil */
  function showTheme() {
    let cur = 'auto'; try { cur = localStorage.getItem('rs-theme') || 'auto'; } catch (e) { /* ignore */ }
    document.querySelectorAll('[data-theme-set]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.themeSet === cur)));
  }
  document.querySelectorAll('[data-theme-set]').forEach(b => { b.onclick = () => {
    const v = b.dataset.themeSet;
    try { if (v === 'auto') localStorage.removeItem('rs-theme'); else localStorage.setItem('rs-theme', v); } catch (e) { /* ignore */ }
    if (v === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', v);
    track('theme', { theme: v }); showTheme();
  }; });
  showTheme();
  $('#btn-calendar').onclick = () => window.RugbyAgenda && window.RugbyAgenda.openSubscribe && window.RugbyAgenda.openSubscribe();
  $('#btn-cookies').onclick = () => window.RugbyConsent && window.RugbyConsent.ask(true);
  // Revoir le tutoriel : retour à l'accueil (là où se trouvent les blocs expliqués) puis visite guidée
  $('#btn-tour').onclick = () => { E.go('home'); setTimeout(() => { if (window.RugbyTour) window.RugbyTour.start(A.isStaff() ? 'coach' : 'player'); }, 1200); };
  // Droit à l'effacement : supprime le compte et toutes les données liées (côté serveur)
  $('#btn-delete-account').onclick = async () => {
    const D = window.RugbyDialog;
    if (!await D.confirm('Supprimer définitivement votre compte ? Vos dessins, formations, réponses aux convocations, votre profil et vos statistiques seront effacés, y compris les stratégies que vous avez publiées dans une équipe. Si vous êtes le seul coach d’une équipe, le plus ancien membre devient coach.', { title: 'Supprimer mon compte', ok: 'Continuer', danger: true })) return;
    const typed = await D.prompt('Pour confirmer, tapez SUPPRIMER', '', { title: 'Supprimer mon compte', placeholder: 'SUPPRIMER', ok: 'Supprimer mon compte', danger: true });
    if (typed == null) return;
    if (typed.trim().toUpperCase() !== 'SUPPRIMER') return E.toast('Suppression annulée : le mot de confirmation ne correspond pas.');
    const { error } = await sb.rpc('delete_my_account');
    if (error) return E.toast(errMsg(error));
    await sb.auth.signOut();
    E.go('home'); E.toast('Votre compte et vos données ont été supprimés.');
  };

  window.RugbyCompte = { render };
})();
