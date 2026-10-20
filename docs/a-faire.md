# Rugbeo : à faire et idées gardées de côté

Mis à jour le 15/10/2026.

## À vérifier sur la vraie appli (après rechargement)

- [x] Menu ⋯ d’une stratégie → « Partager… » : testé le 15/10 (copie bien reçue par l’autre équipe). Nouvelle fenêtre « interrupteurs » (style C) à revoir.
- [ ] Demande pour rejoindre une équipe : la page se met à jour toute seule, côté demandeur comme côté coach, sans rafraîchir (temps réel activé sur les membres).
- [ ] Compte → « Rejoindre ou créer un club, une équipe » : trois blocs séparés (code, ajouter une équipe à votre club, nouveau club).
- [ ] iPhone, appli installée : la barre du bas est remontée au-dessus de la barre d'accueil (après une première mise à jour manuelle : fermer l'appli complètement puis la rouvrir).
- [ ] Mises à jour automatiques : en revenant sur l'appli installée, elle se recharge toute seule quand une nouvelle version est en ligne.
- [ ] Notifications d'adhésion : une demande prévient le coach et la direction du club ; une acceptation prévient la personne (il faut avoir activé les notifications dans Compte).
- [ ] Notifications de la direction du club (convocation, relance) depuis une équipe dont elle n'est pas membre.

## Données de test à garder ou supprimer

- Club « Test RC » : on le garde pour l'instant, on le supprimera plus tard. Il contient l'équipe « Test U16 » et une stratégie partagée en proposition, créées pendant les tests.
- « Joueur Test » est à la direction de Test RC.

## Reporté (on en reparle avant de commencer)

- **RGPD** : fait le 19/10 (confidentialité, cookies, conditions, mentions légales, accord parental, nettoyage automatique). Reste : adresse e-mail de contact dédiée (js/legal.js, champ email), coller la partie 2 de supabase/migrations/0018_rgpd.sql dans le SQL Editor, registre des traitements à tenir (document interne).
- **Équipes jeunes** : catégories d'âge (montée automatique ou par le coach), profils parents et enfants, lien pour remettre son compte à l'enfant, RGPD des mineurs (accord parental).
- Logo au niveau du club (aujourd'hui : par équipe, dans la feuille de match).
- Mode sombre.
- Nommer la direction de SC Bernay : quand votre responsable aura un compte et aura rejoint le club (code FRTPYJJQ), Back-office → Clubs → « Nommer la direction ».

## Pistes business

- **Prix par club et par saison**, nombre d'équipes illimité : un club a un budget et un responsable qui décide, contrairement à un coach seul. L'interrupteur « Création de clubs » du back-office est prêt pour le jour où la création devient payante.
- **Offre d'essai** : un club gratuit jusqu'à la fin de la saison, puis payant. Le début de saison est déjà réglable par club (pour caler la facturation dessus).
- **Comités et ligues** : vendre à un comité départemental un pack pour tous ses clubs (un interlocuteur, beaucoup de clubs).
- **Partage entre équipes** : argument de vente pour la direction (les jeunes jouent les mêmes combinaisons que les Séniors).
- **Freelance** : le modèle « club → équipes → rôles » se réutilise pour d'autres sports amateurs (foot, hand, basket). Marché large, peu d'outils simples en français, clubs faciles à démarcher par les réseaux et les comités.
