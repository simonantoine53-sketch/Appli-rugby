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

## Modèle économique (hypothèse)
- Dessiner et prévisualiser : gratuit.
- Enregistrer, exporter, partager, convocations : réservé aux membres d'un club (abonnement club).
