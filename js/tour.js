/* Tutoriel de première connexion : visite guidée de l'accueil, bloc par bloc (coach ou joueur).
   Affiché une seule fois par compte et par appareil ; « Revoir le tutoriel » dans la page Compte.
   Tutoriel « editor » : comment dessiner une stratégie, à la première ouverture de l'éditeur ; bouton « Aide » pour le revoir. */
(function () {
  const $ = s => document.querySelector(s);
  // Visible et dans l'écran (un panneau replié hors de l'écran sur téléphone ne compte pas ; un élément fixe, oui)
  const visible = e => { if (!e || !e.getClientRects().length) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.right > 0 && r.left < window.innerWidth; };
  const nav = () => visible($('#app-nav')) ? '#app-nav' : '#hub-tabs';
  const account = () => visible($('#hub-account')) ? '#hub-account' : '#btn-account';
  // Éditeur : sur ordinateur les panneaux sont affichés, sur téléphone on montre le bouton de la barre du bas
  // (sur téléphone, le panneau replié est glissé sous l'écran : il doit aussi être dans la hauteur de l'écran)
  const shown = q => { const e = $(q); if (!visible(e)) return false; const r = e.getBoundingClientRect(); return r.bottom > 0 && r.top < window.innerHeight; };
  const tools = () => shown('#palette') ? '#palette' : '.mobile-bar [data-mtab="tools"]';
  const stepsBox = () => shown('#steps') ? '#steps' : '.mobile-bar [data-mtab="steps"]';

  const STEPS = {
    coach: [
      { title: 'Bienvenue dans Rugbeo 👋', text: 'Une visite d’une minute pour découvrir l’accueil ? Vous pourrez aussi la lancer plus tard depuis la page Compte.' },
      { sel: '.todo-card.onboarding', title: 'Démarrer avec votre équipe', text: 'Les premières étapes pour lancer votre équipe : inviter les joueurs, publier une stratégie, créer un match. Ce bloc disparaît quand tout est fait.' },
      { sel: '.todo-card.week', title: 'À faire cette semaine', text: 'Ce qui demande votre attention : joueurs sans réponse à relancer, demandes d’adhésion à valider, stratégies peu vues, compo à préparer.' },
      { sel: '[data-tile="strats"]', title: 'Stratégies', text: 'Dessinez vos combinaisons étape par étape, publiez-les à l’équipe et voyez qui les a regardées. Les joueurs peuvent aussi vous proposer leurs idées.' },
      { sel: '[data-tile="team"]', title: 'Équipe', text: 'Les membres, leurs postes et leurs coordonnées, les demandes d’adhésion à accepter et les rôles (coach, admin, joueur). L’onglet Club montre les autres équipes du club. Pour leur envoyer une stratégie : menu ⋯ de la stratégie, puis « Partager… ».' },
      { sel: '[data-tile="invite"]', title: 'Inviter', text: 'Partagez le code de l’équipe ou un message tout prêt par WhatsApp, SMS ou e-mail. Chaque nouvelle personne attend votre validation.' },
      { sel: '[data-tile="agenda"]', title: 'Agenda', text: 'Créez matchs et entraînements (ou importez le calendrier de la fédération). Les joueurs répondent Présent, Peut-être ou Absent, et vous relancez ceux qui n’ont pas répondu.' },
      { sel: '[data-tile="compos"]', title: 'Compos', text: 'Préparez la feuille de match aux couleurs du club, publiez la compo à l’équipe, imprimez-la ou partagez-la en image.' },
      { club: true, title: 'Bureau du club', text: 'Vous êtes au bureau du club : vous avez les droits de coach dans toutes ses équipes. Dans Équipe, onglet Club, vous gérez le code du club, la date de début de saison, les équipes et les fonctions du bureau (présidente, secrétaire…). Changez d’équipe avec le sélecteur en haut de l’accueil.' },
      { sel: () => nav(), title: 'Navigation', text: 'Passez d’une page à l’autre : Accueil, Agenda, Stratégies, Compos et Équipe. Les pastilles rouges signalent ce qui vous attend.' },
      { sel: '#home-new', title: 'Nouveau dessin', text: 'Créez une nouvelle stratégie à tout moment.' },
      { sel: () => account(), title: 'Votre compte', text: 'Votre profil, les notifications, vos retours sur l’appli et la confidentialité. C’est aussi là que vous pourrez revoir ce tutoriel.' }
    ],
    editor: [
      { title: 'Dessiner une stratégie 🏉', text: 'En 4 temps : placer les joueurs, découper l’action en étapes, regarder l’animation, puis publier à l’équipe. Une minute pour faire le tour ?' },
      { sel: () => tools(), title: '1. Placez les joueurs', text: 'Le plus rapide : une formation toute prête (mêlée, touche…). Sinon, touchez un joueur dans les outils, puis touchez le terrain pour le poser.' },
      { sel: '#canvas', title: 'Déplacez et modifiez', text: 'Faites glisser un joueur pour le déplacer. Touchez-le pour changer son numéro, son nom ou lui donner le ballon. Pour une course ou une passe : choisissez la flèche, puis glissez sur le terrain.' },
      { sel: () => stepsBox(), title: '2. Découpez l’action en étapes', text: 'Une étape = un moment de l’action. Ajoutez une étape : les joueurs restent où ils sont, déplacez-les et l’animation fera le mouvement entre les deux.' },
      { sel: '#fab-undo', title: 'Une erreur ?', text: '« Annuler » revient en arrière, autant de fois que nécessaire.' },
      { sel: '#btn-preview', title: '3. Regardez l’animation', text: 'L’aperçu joue la stratégie étape par étape, comme vos joueurs la verront sur leur téléphone.' },
      { sel: '#btn-save', title: '4. Enregistrez et publiez', text: 'Donnez un nom à la stratégie, puis publiez-la à l’équipe : les joueurs sont prévenus et vous voyez qui l’a regardée.' },
      { sel: () => (visible($('#fab-help')) ? '#fab-help' : '#fab-help-m'), title: 'Besoin d’un rappel ?', text: 'Le bouton « Aide » (ou « ? » sur téléphone) relance ce tutoriel à tout moment.' }
    ],
    player: [
      { title: 'Bienvenue dans Rugbeo 👋', text: 'Une visite d’une minute pour voir comment suivre votre équipe ? Vous pourrez aussi la lancer plus tard depuis la page Compte.' },
      { sel: '.todo-card.week', title: 'À faire cette semaine', text: 'Répondez aux convocations d’un appui (Présent, Peut-être, Absent) et retrouvez les stratégies à regarder avant le match.' },
      { sel: '[data-tile="strats"]', title: 'Stratégies', text: 'Les combinaisons publiées par le coach, animées étape par étape. Vous pouvez aussi dessiner vos idées et les proposer au coach.' },
      { sel: '[data-tile="team"]', title: 'Équipe', text: 'Tous les membres de l’équipe et leurs postes. L’onglet Club liste les autres équipes du club : vous pouvez demander à en rejoindre une, comme joueur ou comme coach.' },
      { sel: '[data-tile="agenda"]', title: 'Agenda', text: 'Les matchs et entraînements à venir, qui vient, et votre réponse. Vous pouvez ajouter un commentaire (retard, blessure…).' },
      { sel: '[data-tile="compos"]', title: 'Compos', text: 'La composition du prochain match, dès que le coach l’a publiée, avec votre numéro.' },
      { sel: () => nav(), title: 'Navigation', text: 'Passez d’une page à l’autre. Les pastilles rouges signalent ce qui vous attend.' },
      { sel: () => account(), title: 'Votre compte', text: 'Complétez votre profil (photo, poste) et activez les notifications pour ne rater aucune convocation.' }
    ]
  };

  let layer = null, steps = [], i = 0, done = null;
  const target = s => { if (!s.sel) return null; const q = typeof s.sel === 'function' ? s.sel() : s.sel; const e = $(q); return visible(e) ? e : null; };

  function build() {
    layer = document.createElement('div');
    layer.className = 'tour';
    layer.innerHTML = `<div class="tour-spot"></div>
      <div class="tour-card" role="dialog" aria-modal="true" aria-labelledby="tour-title">
        <div class="tour-count muted small"></div>
        <strong id="tour-title" class="tour-title"></strong>
        <p class="tour-text"></p>
        <div class="tour-actions">
          <button type="button" class="btn ghost small tour-skip">Passer</button>
          <span class="tour-grow"></span>
          <button type="button" class="btn outline small tour-prev">Précédent</button>
          <button type="button" class="btn primary small tour-next">Suivant</button>
        </div>
      </div>`;
    document.body.appendChild(layer);
    layer.querySelector('.tour-skip').onclick = () => finish();
    layer.querySelector('.tour-prev').onclick = () => show(i - 1);
    layer.querySelector('.tour-next').onclick = () => (i >= steps.length - 1 ? finish() : show(i + 1));
    window.addEventListener('resize', place);
    document.addEventListener('scroll', place, true);   // suit le défilement (scrollIntoView en douceur)
    document.addEventListener('keydown', onKey);
  }
  function onKey(e) {
    if (!layer) return;
    if (e.key === 'Escape') finish();
    else if (e.key === 'ArrowRight') layer.querySelector('.tour-next').click();
    else if (e.key === 'ArrowLeft' && i > 0) show(i - 1);
  }
  function show(n) {
    i = Math.max(0, Math.min(n, steps.length - 1));
    const s = steps[i];
    layer.querySelector('.tour-count').textContent = `${i + 1} / ${steps.length}`;
    layer.querySelector('.tour-title').textContent = s.title;
    layer.querySelector('.tour-text').textContent = s.text;
    layer.querySelector('.tour-prev').classList.toggle('hidden', i === 0);
    layer.querySelector('.tour-next').textContent = i === 0 ? 'Faire la visite' : i === steps.length - 1 ? 'C’est parti !' : 'Suivant';
    layer.querySelector('.tour-skip').textContent = i === 0 ? 'Plus tard' : 'Passer';
    const t = target(s);
    if (t) t.scrollIntoView({ block: 'center', behavior: 'smooth' });
    place(); if (t) { setTimeout(place, 350); setTimeout(place, 800); }
  }
  /** Met en valeur l'élément (découpe lumineuse) et place la bulle au-dessus ou en dessous. */
  function place() {
    if (!layer) return;
    const s = steps[i], t = target(s), spot = layer.querySelector('.tour-spot'), card = layer.querySelector('.tour-card');
    const W = window.innerWidth, H = window.innerHeight, pad = 6;
    layer.classList.toggle('centered', !t);
    if (!t) { spot.style.cssText = 'display:none'; card.style.cssText = ''; return; }
    const r = t.getBoundingClientRect();
    spot.style.cssText = `display:block; left:${r.left - pad}px; top:${r.top - pad}px; width:${r.width + 2 * pad}px; height:${r.height + 2 * pad}px`;
    // Largeur d'abord, puis hauteur réelle du texte : la bulle reste entière dans l'écran
    const cw = Math.min(360, W - 24);
    card.style.cssText = `width:${cw}px; left:12px; top:0`;
    const ch = card.offsetHeight || 180;
    const below = r.bottom + pad + 12 + ch < H, above = r.top - pad - 12 - ch > 0;
    let top = Math.min(Math.max(12, below ? r.bottom + pad + 12 : above ? r.top - pad - 12 - ch : H - ch - 12), H - ch - 12);
    let left = Math.min(Math.max(12, r.left + r.width / 2 - cw / 2), W - cw - 12);
    // Élément très haut (panneau des outils sur ordinateur) : la bulle se met à côté plutôt que par-dessus
    if (!below && !above && r.right + pad + 12 + cw < W) { left = r.right + pad + 12; top = Math.min(Math.max(12, r.top + 40), H - ch - 12); }
    else if (!below && !above && r.left - pad - 12 - cw > 0) { left = r.left - pad - 12 - cw; top = Math.min(Math.max(12, r.top + 40), H - ch - 12); }
    card.style.cssText = `width:${cw}px; left:${left}px; top:${top}px`;
  }
  function finish() {
    if (!layer) return;
    window.removeEventListener('resize', place);
    document.removeEventListener('scroll', place, true);
    document.removeEventListener('keydown', onKey);
    layer.remove(); layer = null;
    const cb = done; done = null;
    if (cb) cb();
  }

  const key = (uid, role) => (role === 'editor' ? 'tour-editor-' : 'tour-done-') + uid;
  /** Lance la visite ; onDone est appelée à la fin (ou si on la passe). */
  function start(role, onDone) {
    if (layer) return;
    const A = window.RugbyAccount, t = A && A.team && A.team();
    const direction = !!(t && A.isClubAdmin && A.isClubAdmin(t.club_id) && !A.isSuper());
    steps = (STEPS[role] || STEPS.player).filter(s => (s.club ? direction : !s.sel || target(s)));
    done = onDone || null;
    build(); show(0);
  }
  /** Première connexion : lance la visite si ce compte ne l'a jamais vue sur cet appareil. */
  function maybeStart(uid, role, onDone) {
    let seen = false;
    try { seen = !!localStorage.getItem(key(uid, role)); localStorage.setItem(key(uid, role), '1'); } catch (e) { seen = true; }
    if (seen) { if (onDone) onDone(); return false; }
    start(role, onDone);
    return true;
  }

  window.RugbyTour = { start, maybeStart };
})();
