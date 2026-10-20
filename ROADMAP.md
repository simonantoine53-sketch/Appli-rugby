# Feuille de route – Rugbeo

Priorités décidées le 8 octobre 2026, mises à jour le 21 octobre 2026 (lots 0 à 3 faits, voir plus bas ; à passer en production après validation).

## En cours : éditeur de stratégies
- Finaliser avec les retours des coachs (test terrain vendredi).
- Benchmark : personne ne combine tableau tactique animé + vie du club + séances. C'est le créneau.

## Priorité 1 (après l'éditeur)
1. **Appel et convocations** : événement entraînement/match, réponse présent/absent en un clic, rappels, liste des absents pour le coach. Fonction d'usage hebdomadaire.
2. **Séances d'entraînement** : assembler des dessins en séance chronométrée avec matériel, à relier aux convocations. Les séances peuvent être une catégorie de stratégies.
3. **Compositions d'équipe** : les 15 postes + remplaçants, publiées aux joueurs, **feuille de match imprimable personnalisable aux couleurs du club (logo, etc.)**. Simon fournira le template actuel du club.

## Fait dans l'éditeur (11 octobre 2026)
- Catégories et recherche, duplication, durée et pause par étape, note de coaching par étape, noms des joueurs depuis l'effectif, flèches courbes, grille magnétique (option), export PDF et MP4.
- Mode présentation plein écran (flèches / espace / clic pour avancer), lien de partage public en lecture seule, commentaires des joueurs avec réponse du coach, notifications push (publication et proposition ; sur iPhone l'appli doit être ajoutée à l'écran d'accueil).

## Back-office super-admin (11 octobre 2026)
- Verrou : personne ne peut se passer super-admin soi-même (droits de colonne + trigger).
- Bouton « Mon avis » (accueil et Mon compte) : bug / idée / autre, contexte joint automatiquement ; l'auteur voit le statut et la réponse.
- Page Back-office (`#/admin`, depuis Mon compte, réservée aux super-admins) : vue d'ensemble (comptes actifs, temps d'usage, part éditeur, mobile, outils, exports, terrains, catégories), retours avec statut / note interne / réponse, toutes les équipes (ouvrir, renommer, nouveau code, supprimer), tous les comptes (équipes, dernière connexion, temps, promotion super-admin), métadonnées des stratégies, demandes d'adhésion, erreurs JS, bandeau d'annonce, options de fonctionnalités par équipe.
- Suivi d'usage : événements (outil, export, aperçu, présentation, publication…) et sessions de temps (toutes les 60 s quand l'onglet est visible).
- Plus tard : désactiver / supprimer un compte, réinitialiser un mot de passe (Edge Function avec clé service), statut d'abonnement par club.

## Qui a vu quoi (13 octobre 2026)
- Chaque ouverture d'une stratégie publiée par un membre est enregistrée (table drawing_views : première / dernière ouverture, nombre d'ouvertures, animation lue).
- Coach / admin : bouton « 👁 12/18 ont vu » sur chaque stratégie publiée, liste « Pas encore vu » / « Ont vu », relance par notification push des seuls joueurs qui n'ont pas vu, ou message à copier pour WhatsApp.

## Feuilles de match : fait le 13 octobre 2026 (sur le modèle de la feuille papier du SC Bernay)
- Une feuille par match de l'agenda (page Compositions, tuile de l'accueil, bouton dans le détail du match).
- Personnalisation par équipe : 3 modèles (Classique façon feuille papier, Moderne, Terrain), logo, couleurs, champs d'en-tête (brassards, responsables…), équipes A / B / C et nombre de joueurs, champs de bas d'équipe (resp. maillots), repères à côté des noms (1re ligne, capitaine, « double » coché automatiquement quand un joueur joue en B puis en A…), postes affichables.
- Remplissage : noms proposés depuis l'effectif, « Ajouter les présents » depuis la convocation, enregistrement automatique.
- Sorties : impression / PDF (A4), image PNG partageable sur WhatsApp, publication aux joueurs (notification, leur ligne en surbrillance, « tu es n°12 » sur l'accueil).
- Fait le 21 octobre 2026 : déplacer ou échanger deux joueurs, vider un poste, reprendre la compo du match précédent (absents surlignés).
- Plus tard : statistiques de sélection.

## Droits de partage (15 octobre 2026)
- Le coach choisit ce que les joueurs peuvent faire d'une stratégie : « Dans l'appli seulement » (pas de téléchargement, pas de copie, pas de lien public), « Téléchargeable » (export et copie, pas de lien public) ou « Partage libre ».
- Réglage par défaut dans la page Équipe, réglage par stratégie dans son menu ⋯ ; passer hors « Partage libre » désactive le lien public, et le serveur refuse tout lien public d'une stratégie non libre.
- Limite : une capture d'écran reste possible, et un joueur voit les données de la stratégie dans l'appli ; c'est une restriction d'usage, pas une protection absolue.

## Profil personnalisable (15 octobre 2026, inspiré de SportEasy)
- Page Compte → « Modifier mon profil » : photo (recadrée et réduite), nom affiché, postes (4 au plus), numéro préféré, pied fort, taille, poids, présentation.
- Infos privées (téléphone, date de naissance, contact d'urgence) visibles seulement par la personne et le staff de ses équipes (vérifié côté serveur).
- Photos dans l'en-tête, la page Équipe (poste et numéro sous le nom, fiche au clic) et la liste « qui vient » de l'agenda ; « Complète ton profil » sur l'accueil du joueur.
- Fait le 21 octobre 2026 : présences de la saison sur la fiche.
- Plus tard : licence et certificat médical (effectif).

## À noter pour l'éditeur
- **Cadrage par étape** : fait le 11 octobre 2026. Dans l'étape active, « Cadrer (zoomer sur une zone) » : on glisse le cadre, on tire un coin pour zoomer, on valide. Une nouvelle étape reprend le cadre ; « Tout le terrain » le retire. L'aperçu, le partage, le GIF, la vidéo, le PNG et la fiche PDF animent ou appliquent le cadrage.

## À réfléchir plus (priorité moyenne)
- **Effectif** (poste, licence, certificat médical, contact d'urgence) : à creuser, pas tranché.

## Dépriorisé (bonnes idées, pas maintenant)
- **Messagerie / annonces** : seulement après toutes les autres fonctions.
- **Suivi des matchs** (scores, essais, stats) : trop lourd à alimenter, existe déjà côté FFR. Prévoir plutôt **un lien vers la page du club (FFR / « mon club house »)**.
- **Calendrier de saison** : pas prioritaire, à réfléchir.
- **Suivi des blessures** : se fait par message aujourd'hui, à réfléchir.
- **Annotation vidéo** (flèches sur une vidéo de match, comme 360Player / Hudl) : reportée le 13 octobre 2026, trop complexe pour l'instant (stockage vidéo, export impossible avec YouTube, usage rare). Version légère possible plus tard : importer une capture de match comme fond de l'éditeur et dessiner dessus.

## Accueil global : fait le 13 octobre 2026
- Choix retenus (maquette : https://claude.ai/artifact/LzkCm2RoyRwonGjTdGvEbG) : accueil hybride, barre de navigation à 4 entrées (Accueil, Agenda, Stratégies, Équipe) avec le compte en avatar en haut à droite, une équipe à la fois avec le sélecteur dans l'en-tête.
- Accueil : guide « Démarrer avec ton équipe » pour le staff (créer, inviter 5 joueurs, publier, notifications), bandeau « À faire » (3 actions au plus : demandes d'adhésion, propositions, stratégies peu vues ; côté joueur : stratégies à regarder, notifications), tuiles avec info vivante.
- Agenda, Séances, Compositions : pages « Bientôt » avec « Ça m'intéresse » (compté dans le back-office pour prioriser).
- Notifications : lien direct vers la stratégie (#/d/<id>) ; un joueur qui ouvre une stratégie du coach voit l'animation démarrer.

## Agenda et convocations : fait le 13 octobre 2026 (inspiré de Spond et SportEasy)
- Événements : entraînement, match (adversaire, domicile / extérieur) ou autre ; date, début, heure de rendez-vous, lieu (lien carte), infos pour l'équipe ; entraînements répétés chaque semaine ; modifier, annuler (membres prévenus), supprimer.
- Convocation de tous les joueurs actifs : Présent / Peut-être / Absent en un appui, commentaire facultatif ; le staff peut saisir la réponse d'un joueur ; liste par statut visible par toute l'équipe.
- Relance push des seuls joueurs sans réponse, message WhatsApp à copier, notification à la création ; « Ajouter à mon agenda » (.ics).
- Accueil : le coach voit « X joueurs sans réponse [Relancer] », le joueur répond « Oui / Non » directement ; tuile et onglet Agenda avec le prochain rendez-vous et le nombre de réponses à donner.
- Planning de la saison (13 octobre 2026) : jours cochés (ex. mercredi et vendredi), même heure, jusqu'au 30 juin par défaut ; annulation en un appui depuis la liste ; pour une séance du planning, annuler / supprimer / modifier « seulement celle-ci » ou « celle-ci et les suivantes ».
- Import des matchs FFR (13 octobre 2026) : fichier .ics exporté de Mon Club House (page de la compétition → Calendrier → « Ajouter à mon agenda »), ou tout autre .ics. Le coach choisit son club dans la poule (deviné d'après le nom de l'équipe, mémorisé), voit l'aperçu (nouveaux / modifiés / à jour), choisit l'heure de rendez-vous. Un réimport met à jour les matchs déplacés sans doublon (UID du fichier).
- Synchronisation automatique : le fichier annonce un flux (SOURCE api-web.monclubhouse.ffr.fr/ical/poule/<id>) mais cette adresse renvoie « route inexistante » au 13 octobre 2026. Si la FFR l'ouvre, on pourra synchroniser chaque nuit côté serveur.
- Faits le 21 octobre 2026 : rappel automatique la veille, statistiques de présence par joueur (voir lots 2 et 3).
- Plus tard : convocation d'une sélection pour les matchs.

## Niveau club : fait le 15 au 20 octobre 2026
- Un club regroupe plusieurs équipes (Séniors, U16, Féminines…). Code du club : on rejoint le club puis on choisit ses équipes, comme joueur ou comme coach / encadrant ; code d'équipe : demande directe pour une équipe.
- Rôles par équipe (on peut être coach des U19 et joueur des Séniors) ; « Joue aussi » pour le staff qui est convoqué.
- Bureau du club (Président·e, Vice-président(e), Secrétaire, Trésorier·e, Membre du bureau) : droits de coach dans toutes les équipes du club, création d'équipes, code et début de saison du club, gestion des membres.
- Partage d'une stratégie avec une autre équipe du club : elle reçoit une copie en proposition, l'original ne change pas.
- Demandes d'adhésion en temps réel et notifiées (au staff à la demande, à la personne quand elle est acceptée).

## Confidentialité et RGPD : fait le 19 octobre 2026
- Données hébergées en France (Paris), aucune revente, aucune publicité, aucun cookie.
- Accord parental avant 15 ans, infos privées réservées au staff, suppression du compte par la personne, nettoyage automatique des données anciennes.

## Lot 0 : environnement de test (20 octobre 2026)
- Base de test séparée (rugbeo-test) avec le même schéma, ses fonctions serveur et ses clés de notification ; l'appli choisit la base selon l'adresse (bandeau « Environnement de test » ; les aperçus de branche restent sur le test).
- Jeu de données reproductible (`select public.test_seed();`), comptes `@exemple.test`, documentation dans le README et CLAUDE.md.
- Lot 0 bis : le coach voit le parent d'un jeune, compte transmis au jeune à 15 ans, lien vers la page FFR du club.

## Espace parents (20 octobre 2026)
- Un compte parent gère plusieurs jeunes de moins de 15 ans (inscription par étapes) : convocations, profil, équipes ; les notifications des jeunes arrivent chez le parent.

## Lot 1 (21 octobre 2026)
- Compos : déplacer / échanger / vider un poste, « double » gardé, reprendre la compo du dernier match.
- Équipe démo en lecture seule (« Voir la démo »), remise à zéro chaque semaine, aucune notification.
- Rejoindre en un clic : lien et QR code d'invitation, adhésion automatique après l'inscription (même après confirmation de l'e-mail), nouveau lien, code manuel toujours possible.
- Page Compte en cinq groupes courts, changement de mot de passe.

## Lot 2 (21 octobre 2026)
- Répondre à une convocation depuis la notification (boutons Présent / Absent ; sur iPhone, écran à trois grands boutons), réponses vues en temps réel par le staff.
- Rappel automatique la veille (heure réglable par équipe, journal anti-doublon, coupable par chacun).
- Abonnement à l'agenda (Google, iPhone / Mac, Outlook, lien à copier), lien personnel renouvelable.
- Notifications groupées : planning, import FFR, annulation de plusieurs séances, modification avec « Prévenir l'équipe ».

## Lot 3 (21 octobre 2026)
- Présences par joueur : saison (début fixé par le club) ou 30 derniers jours, entraînements et matchs séparés, sans réponse à part, tri ; sur la fiche du membre ; chaque joueur voit les siennes.
- Partenaires du club : nom, logo, lien, ordre ; gérés par le bureau ; sur l'accueil de l'équipe et en bas des liens publics (pas sur la feuille de match, choix de Simon).
- Mode hors ligne : appli en cache liée à la version, dernières données consultées, bandeau « Hors ligne », réponses envoyées au retour du réseau, données effacées à la déconnexion.
- Mode sombre : Clair / Sombre / Automatique, contrastes vérifiés, impressions et exports toujours en clair.

## Plus tard
- **Covoiturage** pour les matchs à l'extérieur.
- **Espace bénévoles** : buvette, arbitrage de touche, tâches du club.
- **Cotisations** : suivi de qui a payé et paiement en ligne via SumUp ou HelloAsso. À valider d'abord avec le président du club.
- **Bibliothèque de départ** de l'éditeur (plans de jeu types 1-3-3-1, 2-4-2, pods…) : choisir les plans avec le coach avant de les construire.
- **Mesure de l'activation des clubs** : savoir quels clubs utilisent vraiment l'appli (équipes créées, joueurs inscrits, convocations envoyées, réponses) pour aider ceux qui décrochent.

## Modèle économique (hypothèse)
- Dessiner et prévisualiser : gratuit.
- Enregistrer, exporter, partager, convocations : réservé aux membres d'un club (abonnement club).
