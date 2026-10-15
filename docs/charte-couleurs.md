# Charte des couleurs (provisoire)

Version minimale pour garder l'appli cohérente en attendant la vraie charte graphique.
Toutes les couleurs sont des variables CSS définies en haut de `css/style.css` (`:root`).
Aperçu visuel : ouvrir `charte.html` (en ligne : `/Appli-rugby/charte.html`).

## La règle d'or

**Un seul bleu pour agir, des couleurs d'état pour informer.**

- Une seule couleur d'action : le **bleu** (`--primary`). Tout ce qui se clique pour avancer est bleu.
- Le vert, l'orange et le rouge **ne décorent jamais** : ils disent « ça va », « attention » ou « problème ».
- Jamais de code couleur en dur (`#c62828`…) dans le CSS : toujours `var(--…)`.
- Pour changer une couleur de toute l'appli, on ne modifie que la variable dans `:root`.

## Les couleurs

| Rôle | Variable | Couleur | Quand l'utiliser |
|---|---|---|---|
| Fond des pages | `--bg` | `#f4f6f8` | Arrière-plan général |
| Surfaces | `--panel` | `#ffffff` | Cartes, fenêtres, barres |
| Fond discret | `--subtle` | `#f1f3f5` | Survols, boutons secondaires, encadrés |
| Bordures | `--border` | `#e3e6ea` | Séparateurs, contours |
| Bordures fortes | `--border-strong` | `#c9cdd2` | Survol d'un champ, interrupteur éteint, icône inactive |
| Texte | `--text` | `#1f2933` | Texte principal |
| Texte secondaire | `--muted` | `#6b7280` | Dates, aides, sous-titres |
| **Action** | `--primary` | `#1a73e8` | Boutons principaux, liens, onglet actif, sélection, focus |
| Action foncée | `--primary-dark` | `#1558b8` | Survol des boutons, texte bleu sur fond clair |
| Action claire | `--primary-soft` | `#e8f0fe` | Fond des boutons secondaires bleus, badge Coach |
| **Succès** | `--success` / `--success-soft` | `#2e7d32` / `#e3f2e6` | Présent, publié, validé, mot de passe solide |
| **Attention** | `--warning` / `--warning-soft` | `#ef6c00` / `#fff3e0` | Peut-être, en attente, proposé, partage limité |
| **Problème** | `--danger` / `--danger-soft` | `#c62828` / `#fdecea` | Absent, erreurs, Supprimer / Retirer / Refuser, pastilles de notification |
| Problème foncé | `--danger-dark` | `#a91f1f` | Survol des boutons de suppression |
| Match | `--match` / `--match-soft` | `#6a1b9a` / `#f3e5f5` | Étiquette et date des matchs (l'entraînement reste en bleu) |
| Catégorie | `--tag` / `--tag-soft` | `#00796b` / `#e0f2f1` | Catégories des stratégies (Touche, Mêlée…) |
| Neutre | `--neutral` / `--neutral-soft` | `#455a64` / `#eceff1` | Rôles Joueur / Admin, « Privé », « Autre » |
| Terrain | `--field` | `#4a9e4f` | Uniquement le terrain des dessins |
| Cadre sur le terrain | `--field-highlight` | `#ffd54f` | Cadre en cours de modification dans l'éditeur |

Exceptions voulues : le blanc (`#fff`) pour le texte sur un bouton coloré, le noir transparent des ombres,
le vert WhatsApp (couleur de marque) et le thème sombre du mode présentation.
Les couleurs des joueurs et du matériel sur le terrain font partie du dessin, pas de l'interface.

## Quel bouton pour quelle action

| Type | Classe | Exemple |
|---|---|---|
| Action principale (une seule par zone) | `btn primary` | Enregistrer, Créer mon compte, Publier |
| Action secondaire | `btn outline` | Modifier, Inviter, Personnaliser la feuille |
| Action discrète | `btn ghost` | Retour, Plus tard, liens d'action |
| Action destructive | `btn outline danger` (ou `btn danger`) | Supprimer, Retirer, Refuser |
| Confirmation destructive | `btn primary danger-solid` | Dans la fenêtre « Supprimer mon compte ? » |

## Textes

- Toujours le **vouvoiement** (« Vérifiez votre boîte mail »).
- Les mêmes mots partout : **Équipe**, **Compos**, **Présent / Peut-être / Absent**.
