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
| **Attention** | `--warning` / `--warning-soft` | `#b34d00` / `#fff3e0` | Peut-être, en attente, proposé, partage limité |
| **Problème** | `--danger` / `--danger-soft` | `#c62828` / `#fdecea` | Absent, erreurs, Supprimer / Retirer / Refuser, pastilles de notification |
| Problème foncé | `--danger-dark` | `#a91f1f` | Survol des boutons de suppression |
| Match | `--match` / `--match-soft` | `#6a1b9a` / `#f3e5f5` | Étiquette et date des matchs (l'entraînement reste en bleu) |
| Catégorie | `--tag` / `--tag-soft` | `#00796b` / `#e0f2f1` | Catégories des stratégies (Touche, Mêlée…) |
| Neutre | `--neutral` / `--neutral-soft` | `#455a64` / `#eceff1` | Rôles Joueur / Admin, « Privé », « Autre » |
| Terrain | `--field` | `#4a9e4f` | Uniquement le terrain des dessins |
| Cadre sur le terrain | `--field-highlight` | `#ffd54f` | Cadre en cours de modification dans l'éditeur |

Plus aucun code couleur dans les règles de `css/style.css` : le blanc sur un bouton coloré, le vert WhatsApp et le fond noir
du mode présentation ont maintenant leur variable (voir « Couleurs fixes en plus »). Seule exception : le noir transparent des ombres.
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

## Graphiques (back-office)

Réservées aux graphiques : jamais pour un bouton ni pour un état.

| Variable | Couleur | Rôle |
|---|---|---|
| `--chart-1` | #1a73e8 | 1re série (le bleu de l'appli ; série unique) |
| `--chart-2` | #1baf7a | 2e série |
| `--chart-3` | #6250d6 | 3e série |
| `--chart-4` | #eda100 | 4e série |
| `--chart-5` | #e87ba4 | 5e série |
| `--chart-other` | #9aa3ad | « Autres » (au-delà de 5 séries, on regroupe) |
| `--chart-grid` | #e9ecef | lignes de repère |

Toujours dans cet ordre, la couleur suit la série (jamais son rang). L'ordre a été vérifié pour les daltoniens. Les séries 2, 4 et 5 sont peu contrastées sur fond blanc : on affiche toujours les valeurs (légende chiffrée ou tableau).

## Couleurs fixes en plus

| Variable | Couleur | Rôle |
|---|---|---|
| `--on-color` | #ffffff | Texte et icônes posés sur une couleur pleine (bouton bleu, pastille rouge, réponse choisie). Blanc dans les deux modes. |
| `--primary-ink`, `--success-ink`, `--warning-ink`, `--danger-ink`, `--match-ink`, `--tag-ink`, `--neutral-ink` | (= la couleur en clair) | Texte posé sur une teinte pâle (`--x-soft`) : étiquettes, badges, bouton secondaire. Plus lumineux en mode sombre. |
| `--stage`, `--stage-btn`, `--stage-border` | #000 / #222 / #444 | Présentation plein écran (fond noir), identique dans les deux modes. |
| `--whatsapp` | #25d366 | Bouton « WhatsApp » de l'invitation (couleur de la marque). |

## Mode sombre

Réglage dans Compte → Réglages → Apparence : **Clair**, **Sombre** ou **Automatique** (par défaut : suit le réglage du téléphone). Le choix est gardé sur l'appareil (`rs-theme`) et appliqué avant l'affichage (pas d'éclair blanc).

Chaque variable garde **le même rôle** ; seules les valeurs changent (bloc `:root[data-theme="dark"]` de `css/style.css`). On n'écrit donc jamais de règle propre au mode sombre : une nouvelle règle qui utilise les variables marche dans les deux modes.

| Variable | Clair | Sombre |
|---|---|---|
| `--bg` | #f4f6f8 | #0d1117 |
| `--panel` | #ffffff | #151b22 |
| `--subtle` | #f1f3f5 | #1d252e |
| `--border` / `--border-strong` | #e3e6ea / #c9cdd2 | #2a333d / #46515d |
| `--text` / `--muted` | #1f2933 / #5f6672 | #e6edf3 / #9da7b3 |
| `--primary` / `--primary-soft` | #1a73e8 / #e8f0fe | #4d94f0 / #19304e |
| `--success` / `--success-soft` | #2e7d32 / #e3f2e6 | #45a84b / #1c3427 |
| `--warning` / `--warning-soft` | #b34d00 / #fff3e0 | #e0701a / #3e291b |
| `--danger` / `--danger-soft` | #c62828 / #fdecea | #e65c5c / #40252b |
| `--primary-fill` / `--success-fill` / `--warning-fill` / `--danger-fill` | = couleur de base | #1a6fd0 / #2f8034 / #b34d00 / #c43c3c |
| `--primary-ink` | #1558b8 | #80b1f2 |
| `--brand-ink` | #3b8540 | #5bb361 |
| `--match` / `--tag` / `--neutral` | #6a1b9a / #00796b / #455a64 | #ac54e1 / #008c7c / #63818f |

Contrastes vérifiés en sombre : texte 14,7:1 et texte secondaire 7,1:1 sur les cartes ; texte « encre » 6:1 sur les teintes pâles. Depuis le test utilisateur du 22 octobre 2026, chaque couleur d'état a deux rôles séparés pour passer le seuil de 4,5:1 dans les deux modes : **la couleur de base** (`--primary`, `--success`…) pour un texte, une bordure ou une icône sur une carte ; **la version `-fill`** pour un fond plein sous un texte blanc (`background: var(--primary-fill)`, bouton principal, réponse choisie). En clair les deux sont identiques ; en sombre, la base est plus lumineuse (≥ 5:1 sur une carte) et le fond plein plus sombre (≥ 4,9:1 avec du blanc). Le survol d'un bouton plein l'assombrit (ombre intérieure), au lieu de changer de couleur. Le nom « Rugbeo » en texte utilise `--brand-ink` (le vert du terrain `--field` reste pour les fonds et les coches). Pour un long texte coloré sur une teinte pâle, utiliser la variable `-ink`.

Restent toujours en clair : **l'impression** (bloc `@media print`), la **feuille de match** (aperçu, image, PDF), les **dessins du terrain** et leurs exports (couleurs propres à `js/field.js` et `js/export.js`).

## Charte « Terrain » (appliquée par défaut depuis le 24 octobre 2026)

La charte graphique complète est dans `docs/charte-graphique-terrain.md`. C'est l'apparence de l'appli pour tout le monde :
- mise en œuvre : bloc « Charte Terrain » à la fin de `css/style.css` (variables redéfinies sous `html.charte-terrain`, clair et sombre), polices Archivo et DM Sans hébergées dans `vendor/fonts/`, logo « poteaux + ballon » (`.logo-terrain` dans `index.html`, icônes `icons/`, écran de démarrage), terrain des exports au vert Pelouse (`js/field.js`) ;
- `…/?charte=classique` remet l'ancienne apparence sur un appareil (retour : `…/?charte=terrain`) ;
- pas encore repris : textes (la charte demande le tutoiement, l'appli vouvoie) et en-tête vert des e-mails (`supabase/templates/`, à recoller dans Supabase).
