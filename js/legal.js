/* Pages légales : confidentialité (RGPD), cookies et stockage, conditions d'utilisation, mentions légales.
   Une seule fenêtre à onglets ; RugbyLegal.open('privacy' | 'cookies' | 'cgu' | 'legal').
   Pour modifier l'identité du responsable ou l'adresse de contact : le bloc LEGAL ci-dessous.
   Toute modification de fond : changer « version » (les comptes existants seront invités à relire). */
(function () {
  const LEGAL = {
    owner: 'Antoine Simon',            // responsable du traitement, éditeur et directeur de la publication
    email: '',                         // adresse de contact dédiée (vide : le formulaire de l'appli sert de contact)
    updated: '22 octobre 2026',
    version: '2026-10-22-1',
    changes: 'les e-mails de confirmation et de mot de passe partent désormais par Brevo, un prestataire français'   // résumé affiché aux comptes existants

  };
  const $ = s => document.querySelector(s);
  const contact = () => LEGAL.email
    ? `par e-mail à <strong>${LEGAL.email}</strong> ou depuis l’appli (Compte → « Signaler un bug ou proposer une idée »)`
    : 'depuis l’appli (Compte → « Signaler un bug ou proposer une idée »), en précisant « Données personnelles »';

  const PAGES = {
    privacy: { tab: 'Confidentialité', html: () => `
      <div class="legal-kid">
        <strong>En bref (et pour les plus jeunes)</strong>
        <ul>
          <li>On garde seulement ce qu’il faut pour que l’appli marche avec ton équipe.</li>
          <li>Pas de pub, on ne vend rien, on ne donne tes infos à personne pour faire du commerce.</li>
          <li>Ton téléphone et ta date de naissance : seulement toi et les coachs de ton équipe les voient.</li>
          <li>Moins de 15 ans : c’est un parent qui crée et gère le compte.</li>
          <li>Tu peux tout effacer quand tu veux : Compte → « Supprimer mon compte ».</li>
        </ul>
      </div>

      <h4>1. Qui est responsable de vos données ?</h4>
      <p>L’appli Rugbeo est éditée par <strong>${LEGAL.owner}</strong>, qui est le responsable du traitement de vos données. Pour toute question ou demande : ${contact()}.</p>
      <p>Les clubs et les coachs qui utilisent l’appli décident de ce qu’ils y mettent (stratégies, convocations, compositions) pour leur équipe. Ils doivent eux aussi respecter vos données (voir les Conditions d’utilisation).</p>

      <h4>2. Quelles données, pourquoi, et sur quelle base ?</h4>
      <div class="legal-table-wrap"><table class="legal-table">
        <thead><tr><th>Données</th><th>À quoi elles servent</th><th>Base légale</th></tr></thead>
        <tbody>
          <tr><td><strong>Compte</strong> : e-mail, mot de passe (chiffré, illisible même pour nous), prénom ou pseudo</td><td>Vous connecter, vous relier à vos équipes, vous envoyer les e-mails de confirmation et de mot de passe oublié</td><td>Exécution du service (contrat)</td></tr>
          <tr><td><strong>Âge et accord parental</strong> : compte d’un jeune de moins de 15 ans géré par un parent, e-mail du parent, date de l’accord et de l’acceptation des conditions</td><td>Respecter la loi sur les mineurs et pouvoir prouver l’accord</td><td>Obligation légale</td></tr>
          <tr><td><strong>Profil sportif</strong> (facultatif) : photo, postes, numéro, pied fort, taille, poids, présentation</td><td>Que vos coéquipiers et vos coachs vous reconnaissent, préparer les compositions</td><td>Votre consentement (vous choisissez de le remplir et pouvez l’effacer)</td></tr>
          <tr><td><strong>Infos privées</strong> (facultatif) : téléphone, date de naissance, contact d’urgence</td><td>Que le staff de votre équipe puisse vous joindre, ou joindre un proche en cas d’urgence</td><td>Votre consentement</td></tr>
          <tr><td><strong>Vie d’équipe</strong> : stratégies, formations, commentaires, agenda, réponses aux convocations, feuilles de match, demandes d’adhésion, qui a ouvert une stratégie</td><td>Le cœur de l’appli : partager les stratégies, organiser les matchs et entraînements</td><td>Exécution du service (contrat)</td></tr>
          <tr><td><strong>Notifications</strong> : adresse technique de votre appareil</td><td>Vous prévenir des convocations, compos, stratégies et demandes d’adhésion</td><td>Votre consentement (autorisation de l’appareil)</td></tr>
          <tr><td><strong>Mesure d’audience anonyme</strong> : onglet ouvert, origine du clic (barre du bas, tuile, notification), téléphone ou ordinateur, appli installée ou non, <strong>sans aucun identifiant</strong> ; nombre de personnes actives par jour, semaine et mois</td><td>Savoir quelles parties de l’appli servent, sans savoir qui fait quoi</td><td>Intérêt légitime (mesure d’audience dispensée de consentement selon la CNIL) ; vous pouvez vous y opposer (onglet Cookies)</td></tr>
          <tr><td><strong>Date de votre dernière activité</strong></td><td>Compter les personnes actives (seuls des totaux sont gardés) et supprimer les comptes inutilisés depuis 3 ans</td><td>Intérêt légitime</td></tr>
          <tr><td><strong>Mesure d’usage détaillée</strong> : temps passé par onglet, fonctions utilisées (exports, relances, impressions…), liés à votre compte</td><td>Comprendre en détail ce qui sert et améliorer l’appli</td><td>Votre consentement (bandeau, modifiable à tout moment)</td></tr>
          <tr><td><strong>Erreurs techniques et sécurité</strong> : message d’erreur, navigateur, version, essais de code d’invitation</td><td>Corriger les bugs, empêcher les abus (essais de codes, envois massifs)</td><td>Intérêt légitime (faire fonctionner et sécuriser l’appli)</td></tr>
          <tr><td><strong>Vos messages</strong> (« Signaler un bug ou proposer une idée »)</td><td>Vous répondre et améliorer l’appli</td><td>Intérêt légitime</td></tr>
        </tbody>
      </table></div>
      <p>Nous ne collectons aucune donnée de santé, aucune donnée bancaire et aucune géolocalisation. Aucune décision automatique n’est prise à votre sujet, et aucun profil publicitaire n’est créé.</p>

      <h4>3. Qui voit vos données ?</h4>
      <ul>
        <li><strong>Vos coéquipiers</strong> : votre nom, votre profil sportif, vos réponses aux convocations et ce que vous publiez dans l’équipe.</li>
        <li><strong>Le staff de votre équipe</strong> (coachs, admins) et <strong>la direction de votre club</strong> : en plus, vos infos privées et l’e-mail du parent pour les moins de 15 ans, pour les seuls besoins de l’équipe.</li>
        <li><strong>L’éditeur de l’appli</strong> : seulement pour la maintenance, le support et la sécurité.</li>
        <li><strong>Nos prestataires techniques</strong> (sous-traitants), qui agissent uniquement sur nos instructions :
          <ul>
            <li><strong>Supabase</strong> (base de données et connexion) : données hébergées <strong>en France, à Paris</strong> (région AWS eu-west-3).</li>
            <li><strong>GitHub</strong> (hébergement des fichiers de l’appli) : ne reçoit aucune donnée de compte, seulement les informations techniques de chargement de la page (adresse IP).</li>
            <li><strong>Brevo</strong> (Sendinblue SAS, société française) : envoi des e-mails de confirmation et de mot de passe oublié. Il reçoit votre adresse e-mail et le contenu de ces e-mails, traités dans l’Union européenne.</li>
            <li><strong>Services de notification</strong> d’Apple, Google ou Mozilla, selon votre appareil : ils transmettent les notifications, dont le contenu est chiffré.</li>
          </ul>
        </li>
        <li><strong>Votre calendrier</strong> (Google Agenda, Apple, Outlook…), seulement si vous vous abonnez à l’agenda depuis l’appli : il reçoit, par un lien secret propre à vous, les dates, lieux et adversaires des événements de vos équipes, sans nom de joueur ni réponse. Vous pouvez couper ce lien à tout moment (« Nouveau lien »).</li>
      </ul>
      <p>Aucune donnée n’est vendue, louée ou utilisée pour de la publicité.</p>

      <h4>4. Transferts hors de l’Union européenne</h4>
      <p>Vos données sont stockées en France. Supabase et GitHub sont des sociétés américaines, comme Google pour certaines notifications : un accès depuis les États-Unis reste possible (maintenance, chargement de l’appli). Il est encadré par le cadre de protection des données UE–États-Unis (Data Privacy Framework) ou par les clauses contractuelles types de la Commission européenne prévues dans leurs contrats.</p>

      <h4>5. Combien de temps ?</h4>
      <ul>
        <li><strong>Compte, profil, contenu</strong> : tant que votre compte existe. Un compte sans connexion depuis <strong>3 ans</strong> est supprimé automatiquement.</li>
        <li><strong>Inscription jamais confirmée</strong> : supprimée après 24 heures.</li>
        <li><strong>Mesure d’usage détaillée</strong> : 13 mois. <strong>Compteurs anonymes</strong> : 25 mois.</li>
        <li><strong>Erreurs techniques</strong> : 6 mois. <strong>Essais de code d’invitation</strong> : 24 heures.</li>
        <li><strong>Vos messages</strong> : 2 ans, ou jusqu’à la suppression de votre compte.</li>
        <li><strong>Accord parental et acceptation des conditions</strong> : tant que le compte existe (c’est la preuve demandée par la loi).</li>
      </ul>
      <p>Quand vous supprimez votre compte, tout est effacé définitivement : profil, dessins, réponses, statistiques. Les copies de sauvegarde de l’hébergeur disparaissent ensuite d’elles-mêmes sous quelques jours.</p>

      <h4>6. Vos droits</h4>
      <p>Vous pouvez à tout moment :</p>
      <ul>
        <li><strong>consulter et corriger</strong> vos données (Compte → « Modifier mon profil ») ;</li>
        <li><strong>tout effacer</strong> (Compte → « Supprimer mon compte ») ;</li>
        <li><strong>retirer votre consentement</strong> : vider vos infos privées ou votre profil, couper les notifications, refuser la mesure d’usage détaillée (Compte → « Cookies et mesure d’usage ») ;</li>
        <li><strong>vous opposer</strong> à la mesure d’audience anonyme (même endroit) ;</li>
        <li>demander <strong>une copie de vos données</strong> dans un fichier (portabilité), la <strong>limitation</strong> d’un traitement ou vous <strong>opposer</strong> à un traitement fondé sur l’intérêt légitime ;</li>
        <li>donner des <strong>directives</strong> sur le sort de vos données après votre décès.</li>
      </ul>
      <p>Pour ces demandes : ${contact()}. Nous répondons sous un mois au plus. Si vous estimez que vos droits ne sont pas respectés, vous pouvez saisir la <strong>CNIL</strong> (cnil.fr, 3 place de Fontenoy, 75007 Paris).</p>

      <h4>7. Mineurs</h4>
      <ul>
        <li><strong>À partir de 15 ans</strong>, vous pouvez créer un compte seul (article 45 de la loi Informatique et Libertés).</li>
        <li><strong>Avant 15 ans</strong>, c’est un parent ou le représentant légal qui crée le compte du jeune, depuis son propre compte (un compte peut gérer plusieurs enfants). Le parent confirme son accord à l’inscription ; l’accord est daté et conservé. Le jeune n’a pas d’identifiant à lui : le parent répond pour lui aux convocations et gère son profil.</li>
        <li>Un parent peut à tout moment, pour son enfant de moins de 15 ans : consulter ses données, les faire corriger, retirer son accord et <strong>supprimer son compte</strong> : directement dans Compte → Mes jeunes → Retirer, ou ${contact()}. Le compte est alors supprimé sans délai.</li>
        <li>Les données d’un mineur ne sont jamais publiques : sa photo et son profil ne sont visibles que par son équipe. Nous recommandons aux coachs de ne pas faire figurer le nom complet d’un mineur dans une stratégie partagée par lien public.</li>
        <li>Les textes de l’appli sont écrits simplement, avec un résumé en tête de cette page.</li>
      </ul>

      <h4>8. Sécurité</h4>
      <p>Connexion chiffrée (HTTPS), mots de passe chiffrés, données en France, accès limité par équipe et contrôlé par le serveur (chacun ne voit que ce qui le concerne), limites contre les abus. En cas de fuite de données présentant un risque, la CNIL et les personnes concernées sont prévenues comme la loi l’exige.</p>

      <h4>9. Modifications</h4>
      <p>Si cette politique change sur le fond, l’appli vous le signale à votre prochaine connexion. Dernière mise à jour : ${LEGAL.updated}.</p>` },

    cookies: { tab: 'Cookies', html: () => `
      <p><strong>Rugbeo n’utilise aucun cookie</strong>, ni publicitaire ni de réseau social, et aucun traceur d’une autre société : toutes les bibliothèques de l’appli sont hébergées avec elle.</p>
      <h4>Ce que l’appli garde dans votre navigateur</h4>
      <p>Comme toute appli, elle range quelques informations dans le stockage de votre navigateur pour fonctionner. Elles sont <strong>strictement nécessaires</strong> et ne demandent donc pas votre accord :</p>
      <ul>
        <li>votre session de connexion (pour ne pas vous redemander votre mot de passe) ;</li>
        <li>l’équipe que vous avez choisie et les stratégies déjà vues ;</li>
        <li>les dessins faits sans compte et le dessin en cours ;</li>
        <li>vos préférences (tutoriel déjà vu, notifications déjà proposées, lieux récents de l’agenda, apparence claire ou sombre) ;</li>
        <li>la date à laquelle vous avez ouvert la démo, effacée à la création de votre compte ou au bout de 30 jours (pour compter, sans savoir qui, les comptes créés après la démo) ;</li>
        <li>pour le mode hors ligne : une copie de l’appli et des dernières données de vos équipes que vous avez consultées, ainsi que les réponses aux convocations données sans réseau, le temps de les envoyer. Cette copie est effacée quand vous vous déconnectez ;</li>
        <li>votre choix sur la mesure d’usage.</li>
      </ul>
      <h4>Mesure d’audience anonyme</h4>
      <p>L’appli compte les onglets ouverts et le nombre de personnes actives, <strong>sans aucun identifiant</strong> : nous savons par exemple que l’Agenda a été ouvert 120 fois cette semaine, que la démo a été ouverte 30 fois, ou combien de fois le logo d’un partenaire du club a été vu et touché, jamais par qui. La CNIL dispense ce type de mesure de consentement ; vous pouvez tout de même vous y opposer :</p>
      <p><button type="button" class="btn outline small" data-anon-toggle></button> <span class="muted small" data-anon-state></span></p>
      <h4>Mesure d’usage détaillée : seulement avec votre accord</h4>
      <p>Si vous l’acceptez, l’appli enregistre les pages et fonctions utilisées et la durée des visites, liées à votre compte, pour comprendre ce qui sert et l’améliorer. Ces données restent chez nous, ne servent jamais à la publicité et sont effacées après 13 mois. Refuser ne change rien au fonctionnement de l’appli.</p>
      <p>Votre choix est gardé 13 mois, puis l’appli vous redemande. Vous pouvez le changer à tout moment :</p>
      <p><button type="button" class="btn outline small" data-consent-open>Changer mon choix</button> <span class="muted small" data-consent-state></span></p>
      <h4>Notifications</h4>
      <p>L’appli ne vous envoie des notifications que si vous l’acceptez, en deux temps : nous vous expliquons d’abord à quoi elles servent, puis votre appareil vous demande l’autorisation. Vous pouvez les couper à tout moment (Compte → Notifications, ou dans les réglages de votre appareil). Leur contenu est chiffré pendant le transport.</p>
      <p>La veille d’un match ou d’un entraînement, un rappel peut vous être envoyé (réglé par le staff de l’équipe). Vous pouvez le couper pour vous (et vos jeunes) dans Compte → Réglages. Pour ne jamais envoyer deux fois le même rappel, l’appli garde la trace des rappels envoyés, effacée avec l’événement. Les boutons « Présent » et « Absent » d’une notification de convocation envoient votre réponse grâce à un code valable pour vous seul, pour cet événement et jusqu’à son début.</p>` },

    cgu: { tab: 'Conditions', html: () => `
      <p>Ces conditions d’utilisation s’appliquent à toute personne qui crée un compte sur Rugbeo. En créant un compte, vous les acceptez.</p>
      <h4>1. Le service</h4>
      <p>Rugbeo aide les équipes et les clubs de rugby à dessiner et partager des stratégies, organiser les convocations et préparer les compositions. L’appli est gratuite pour le moment ; si une offre payante est créée, elle sera proposée clairement et jamais imposée sans votre accord.</p>
      <h4>2. Votre compte</h4>
      <ul>
        <li>Donnez des informations exactes et gardez votre mot de passe secret : vous êtes responsable de ce qui est fait avec votre compte.</li>
        <li>Avant 15 ans, c’est un parent ou le représentant légal qui crée et gère le compte du jeune (voir Confidentialité, partie Mineurs).</li>
        <li>Vous pouvez supprimer votre compte à tout moment (Compte → « Supprimer mon compte »).</li>
      </ul>
      <h4>3. Équipes et clubs</h4>
      <ul>
        <li>Le coach, les admins de l’équipe et la direction du club acceptent les membres, gèrent les rôles et choisissent ce qui est partagé.</li>
        <li>Ils n’utilisent les informations des membres (en particulier les infos privées et celles des mineurs) que pour la vie de l’équipe, et ne les copient pas ailleurs sans l’accord des personnes.</li>
        <li>Les codes d’invitation sont à donner seulement aux personnes qui font partie du club ou de l’équipe.</li>
      </ul>
      <h4>4. Ce que vous publiez</h4>
      <ul>
        <li>Vos stratégies et vos dessins restent à vous. Vous autorisez seulement l’appli à les stocker et à les montrer aux personnes avec qui vous les partagez (votre équipe, une autre équipe de votre club, ou toute personne qui a le lien public si vous en créez un).</li>
        <li>Vous ne publiez que ce que vous avez le droit de publier : pas de contenu insultant, discriminant, violent ou illégal, pas de photo d’une autre personne sans son accord (ou celui de ses parents pour un mineur).</li>
        <li>Le lien public d’une stratégie est visible par toute personne qui l’a : n’y mettez pas d’informations personnelles, en particulier sur des mineurs.</li>
      </ul>
      <h4>5. Usage interdit</h4>
      <p>Il est interdit de chercher à accéder aux données d’autres équipes, de deviner des codes d’invitation, de surcharger l’appli ou de l’utiliser pour envoyer des messages non sollicités. En cas d’abus, le compte peut être suspendu ou supprimé, après un message d’avertissement sauf urgence.</p>
      <h4>6. Disponibilité</h4>
      <p>L’appli est en amélioration continue. Nous faisons de notre mieux pour qu’elle fonctionne sans interruption et pour protéger vos données, sans pouvoir garantir une disponibilité totale. Gardez une copie de ce qui est indispensable (export PDF, image, vidéo).</p>
      <h4>7. Modifications et droit applicable</h4>
      <p>Ces conditions peuvent évoluer ; en cas de changement important, l’appli vous le signale. Elles sont soumises au droit français. En cas de désaccord, contactez-nous d’abord ${contact()} : nous chercherons une solution à l’amiable.</p>
      <p class="muted small">Dernière mise à jour : ${LEGAL.updated}.</p>` },

    legal: { tab: 'Mentions légales', html: () => `
      <h4>Éditeur</h4>
      <p>L’appli <strong>Rugbeo</strong> (l’appli des clubs de rugby) est éditée par <strong>${LEGAL.owner}</strong>, particulier.<br>Contact : ${contact()}.</p>
      <h4>Directeur de la publication</h4>
      <p>${LEGAL.owner}.</p>
      <h4>Hébergement</h4>
      <ul>
        <li><strong>Fichiers de l’appli</strong> : GitHub, Inc. (GitHub Pages), 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, États-Unis.</li>
        <li><strong>Données des comptes</strong> : Supabase, Inc., hébergées sur des serveurs Amazon Web Services situés à Paris (France).</li>
      </ul>
      <h4>Propriété intellectuelle</h4>
      <p>L’appli Rugbeo, son code, son nom et son design appartiennent à ${LEGAL.owner}. Les stratégies et dessins appartiennent à leurs auteurs.</p>
      <h4>Données personnelles</h4>
      <p>Voir l’onglet Confidentialité. Pour exercer vos droits : ${contact()}.</p>` }
  };

  let current = 'privacy';
  function open(tab) {
    current = PAGES[tab] ? tab : 'privacy';
    const tabs = $('#legal-tabs'); tabs.replaceChildren();
    Object.entries(PAGES).forEach(([id, p]) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'tab' + (id === current ? ' active' : ''); b.textContent = p.tab;
      b.onclick = () => open(id); tabs.appendChild(b);
    });
    const body = $('#legal-body'); body.innerHTML = PAGES[current].html(); body.scrollTop = 0;
    body.querySelectorAll('[data-consent-open]').forEach(b => { b.onclick = () => window.RugbyConsent && window.RugbyConsent.ask(true); });
    body.querySelectorAll('[data-consent-state]').forEach(s => { s.textContent = window.RugbyConsent ? window.RugbyConsent.label() : ''; });
    const C = window.RugbyConsent;
    const anonDraw = () => body.querySelectorAll('[data-anon-toggle]').forEach(b => {
      const on = !C || C.anon();
      b.textContent = on ? 'M’opposer à la mesure anonyme' : 'Accepter la mesure anonyme';
      b.onclick = () => { if (C) C.setAnon(!on); anonDraw(); };
      const st = b.parentElement.querySelector('[data-anon-state]'); if (st) st.textContent = on ? 'Mesure anonyme active.' : 'Vous vous êtes opposé à la mesure anonyme.';
    });
    anonDraw();
    $('#modal-legal').classList.remove('hidden');
  }
  // Tous les liens « data-legal » de l'appli ouvrent la page correspondante
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('[data-legal]');
    if (!a) return;
    e.preventDefault(); open(a.dataset.legal);
  });

  window.RugbyLegal = { open, version: LEGAL.version, changes: LEGAL.changes, owner: LEGAL.owner };
})();
