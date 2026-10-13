# Feuille de route – Appli Rugby Strat

Priorités décidées le 8 octobre 2026. Rien ici n'est en cours : on finit d'abord l'éditeur de stratégies avec les retours des coachs.

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
- Personnalisation par équipe : 3 modèles (Classique façon feuille papier, Moderne, Terrain), logo, couleurs, champs d'en-tête (brassards, responsables…), équipes A / B / C et nombre de joueurs, champs de bas d'équipe (resp. maillots), repères à côté des noms (1re ligne, capitaine, direct au stade…), postes affichables.
- Remplissage : noms proposés depuis l'effectif, « Ajouter les présents » depuis la convocation, enregistrement automatique.
- Sorties : impression / PDF (A4), image PNG partageable sur WhatsApp, publication aux joueurs (notification, leur ligne en surbrillance, « tu es n°12 » sur l'accueil).
- Plus tard : glisser-déposer pour réordonner, copier la compo du match précédent, statistiques de sélection.

## À noter pour l'éditeur
- **Bibliothèque de départ** (plans de jeu type 1-3-3-1, 2-4-2, pod…) : à décider avec le coach quels plans y mettre avant de les construire.
- **Cadrage par étape** : fait le 11 octobre 2026. Dans l'étape active, « Cadrer (zoomer sur une zone) » : on glisse le cadre, on tire un coin pour zoomer, on valide. Une nouvelle étape reprend le cadre ; « Tout le terrain » le retire. L'aperçu, le partage, le GIF, la vidéo, le PNG et la fiche PDF animent ou appliquent le cadrage.

## À réfléchir plus (priorité moyenne)
- **Cotisations** : suivi de qui a payé, relances. Intéressant pour le club, à remonter, mais la faisabilité (paiement en ligne, prestataire) reste à étudier.
- **Effectif** (poste, licence, certificat médical, contact d'urgence) : à creuser, pas tranché.

## Dépriorisé (bonnes idées, pas maintenant)
- **Messagerie / annonces** : seulement après toutes les autres fonctions.
- **Suivi des matchs** (scores, essais, stats) : trop lourd à alimenter, existe déjà côté FFR. Prévoir plutôt **un lien vers la page du club (FFR / « mon club house »)**.
- **Calendrier de saison** : pas prioritaire, à réfléchir.
- **Suivi des blessures** : se fait par message aujourd'hui, à réfléchir.
- **Espace parents** (écoles de rugby) : très bonne idée, pour plus tard.
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
- Plus tard : rappel automatique la veille (tâche planifiée), convocation d'une sélection pour les matchs, lien vers la compo, statistiques de présence par joueur.

## Modèle économique (hypothèse)
- Dessiner et prévisualiser : gratuit.
- Enregistrer, exporter, partager, convocations : réservé aux membres d'un club (abonnement club).
