# Rugbeo — Charte graphique & design system

> Document de référence pour concevoir et développer l'appli web, le site, l'appli mobile et les supports de Rugbeo. Direction retenue : **« Terrain »** (claire, conviviale, club — proche de SportEasy).
> À l'IA qui lit ce fichier : respecte strictement les tokens et règles ci-dessous. Toute couleur, taille ou espacement passe par une variable CSS `var(--token)`, jamais une valeur en dur.

---

## 1. Plateforme de marque

Rugbeo, c'est le carnet de jeu du club amateur : le coach dessine ses combinaisons, l'équipe les reçoit, tout le monde arrive à l'entraînement en sachant quoi faire.

| | |
|---|---|
| Promesse | Ton plan de jeu, partagé en 2 clics. |
| Pour qui | Coachs, éducateurs et capitaines de clubs amateurs (école de rugby → seniors), puis leurs joueurs. |
| Contre quoi | Les feuilles A4, les photos floues de paperboard dans WhatsApp, le « on revoit ça samedi ». |
| Personnalité | Le pote du club qui est aussi le meilleur analyste : accessible, précis, jamais prétentieux. |
| Trois mots | Clair · Collectif · Terrain |

---

## 2. Logo

- **Symbole** : poteaux en H avec le ballon ovale, légèrement incliné, qui passe au-dessus de la barre (la transformation réussie), dans une pastille ronde. Icône d’écran d’accueil : fond vert plein, symbole agrandi (H sur environ la moitié de la largeur).
- **Logotype** : « rugbeo », toujours en **minuscules**, Archivo 900, interlettrage −1,5 px. Composé en texte.
- **Versions** : couleur (fond clair) · inversée (fond vert ou sombre) · monochrome (broderie, gravure, tampon).
- **Zone de protection** : longueur du ballon × 2 tout autour.
- **Taille mini** : symbole 24 px écran / 8 mm print. Sous 32 px, symbole seul.
- **Lockup** : symbole + logotype centrés verticalement, écart = 0,25 × hauteur du symbole.
- **Interdits** : déformer, tourner, ombrer, recolorer le ballon, poser la version couleur sur une photo chargée, écrire « RUGBEO » en capitales.

### SVG du symbole (viewBox 64 × 64)

```svg
<!-- Couleur (fond clair) -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="32" fill="#0E7A4B"/><path d="M20 20v26M44 20v26M20 35h24" fill="none" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round"/><ellipse cx="32" cy="17" rx="7.2" ry="4.6" transform="rotate(-28 32 17)" fill="#FFB020"/></svg>

<!-- Inversé (fond vert / sombre) -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="32" fill="#FFFFFF"/><path d="M20 20v26M44 20v26M20 35h24" fill="none" stroke="#0E7A4B" stroke-width="5" stroke-linecap="round"/><ellipse cx="32" cy="17" rx="7.2" ry="4.6" transform="rotate(-28 32 17)" fill="#FFB020"/></svg>

<!-- Monochrome -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="32" fill="#0B3D2A"/><path d="M20 20v26M44 20v26M20 35h24" fill="none" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round"/><ellipse cx="32" cy="17" rx="7.2" ry="4.6" transform="rotate(-28 32 17)" fill="#FFFFFF"/></svg>
```

---

## 3. Couleurs

### Couleurs de marque

| Nom | Hex | Rôle |
|---|---|---|
| Vert Pelouse | `#0E7A4B` | Couleur de marque : logo, CTA principal, terrain |
| Vert Vestiaire | `#0B3D2A` | Encre : titres et texte |
| Orange Ballon | `#FFB020` | Accent : ballon, ligne de course, compteurs |
| Craie | `#F4F6F1` | Fond de page |
| Blanc | `#FFFFFF` | Cartes |

### Règle de dosage 60 / 30 / 10

| Rôle | Tokens | Part |
|---|---|---|
| Fond | `surface-page`, `surface-card` | 60 % |
| Marque | `primary`, `ink` | 30 % |
| Accent | `accent` | 10 % max |

### Règles
- **Un seul bouton primaire par écran.** Le bouton orange (`accent`) est réservé à une action d'enthousiasme (Inviter l'équipe, Partager) et ne côtoie jamais un primaire.
- **L'orange ne s'écrit pas** sur fond clair (contraste 1,9:1). Texte orange = `accent-text`.
- **Le texte n'est jamais noir** : `ink` (vert très foncé), `ink-muted`, `ink-subtle`.
- **Couleurs d'état** (`danger`, `info`, orange pour avertir) : uniquement pour des états, jamais décoratives.
- Contrastes AA vérifiés : `ink`/`surface-page` 11,8:1 · `ink-muted`/`surface-page` 6,0:1 · `on-primary`/`primary` 5,5:1 · `on-accent`/`accent` 6,4:1 · `accent-text`/`surface-card` 5,6:1.

---

## 4. Tokens CSS (à copier tel quel)

```css
@import url("https://fonts.googleapis.com/css2?family=Archivo:wght@700;900&family=DM+Sans:wght@400;500;700&display=swap");

:root, [data-theme="light"] {
  /* Échelles fixes */
  --green-50: #E3F2EA;  --green-100: #C4E5D2; --green-300: #5FB98A; --green-500: #108653;
  --green-600: #0E7A4B; --green-700: #0B6A41; --green-900: #0B3D2A;
  --ball-100: #FFF0D1;  --ball-400: #FFB020;  --ball-700: #8F5600;

  /* Surfaces */
  --surface-page: #F4F6F1;   /* fond de page */
  --surface-card: #FFFFFF;   /* cartes, nav, modales */
  --surface-sunken: #EAEFE7; /* zones en creux, piste d'onglets, tuiles de stats */
  --border: #DCE3D8;         /* filets, séparateurs */
  --border-strong: #8FA294;  /* bordure des champs (3:1) */

  /* Texte */
  --ink: #0B3D2A;            /* texte principal, titres */
  --ink-muted: #4A6357;      /* texte secondaire */
  --ink-subtle: #5E7368;     /* métadonnées, placeholders */

  /* Primaire */
  --primary: #0E7A4B;  --primary-hover: #0B6A41;  --on-primary: #FFFFFF;
  --primary-soft: #E3F2EA;  --primary-text: #0E7A4B;

  /* Accent */
  --accent: #FFB020;  --on-accent: #0B3D2A;  --accent-soft: #FFF0D1;  --accent-text: #8F5600;

  /* États */
  --danger: #C2362B;  --on-danger: #FFFFFF;  --danger-soft: #FBE6E3;  --danger-text: #A12C23;
  --info: #2563C9;    --info-soft: #E3ECFA;  --info-text: #1D4F9E;

  /* Schéma tactique */
  --pitch: #0E7A4B;  --pitch-stripe: #108653;  --pitch-line: #FFFFFF;
  --team-us: #FFFFFF;  --team-them: #0B3D2A;  --run-line: var(--accent);

  /* Ombres */
  --shadow-card: 0 2px 0 #DCE3D8;
  --shadow-pop: 0 12px 32px rgba(11, 61, 42, 0.16);
  --shadow-focus: 0 0 0 3px #FFB020;
}

[data-theme="dark"] {
  --surface-page: #0C1712;  --surface-card: #13221A;  --surface-sunken: #1A2D23;
  --border: #2A3F33;  --border-strong: #557263;
  --ink: #EAF2EC;  --ink-muted: #A3B8AB;  --ink-subtle: #8AA095;
  --primary: #3FBF7F;  --primary-hover: #5ACD93;  --on-primary: #04241A;
  --primary-soft: #173B2A;  --primary-text: #6FD6A0;
  --accent-soft: #3A2C0E;  --accent-text: #FFC95C;
  --danger: #F07A6E;  --on-danger: #2A0D0A;  --danger-soft: #3A1916;  --danger-text: #F59A90;
  --info: #7EA8F0;  --info-soft: #142540;  --info-text: #A3C2F5;
  --pitch: #0F5C3A;  --pitch-stripe: #126842;  --pitch-line: #E6F0EA;  --team-them: #04140D;
  --shadow-card: 0 2px 0 #08120D;
  --shadow-pop: 0 12px 32px rgba(0, 0, 0, 0.5);
}

:root {
  /* Typo */
  --font-display: Archivo, "Arial Black", system-ui, sans-serif;
  --font-sans: "DM Sans", system-ui, -apple-system, "Segoe UI", sans-serif;

  /* Espacements — grille de 4 px */
  --space-1: 4px;  --space-2: 8px;  --space-3: 12px;  --space-4: 16px;  --space-5: 20px;
  --space-6: 24px; --space-8: 32px; --space-10: 40px; --space-12: 48px; --space-16: 64px; --space-24: 96px;

  /* Rayons */
  --radius-sm: 8px;  --radius-md: 12px;  --radius-lg: 16px;  --radius-xl: 24px;  --radius-pill: 999px;

  /* Tailles */
  --control-sm: 36px;  --control-md: 44px;  --control-lg: 52px;
  --container: 1200px;  --nav-height: 64px;
}

/* Points de rupture (mobile d'abord) : 640px · 960px · 1280px */
```

### Usage des tokens

| Token | Usage |
|---|---|
| `space-2` | Écart entre chips, icône ↔ label de bouton |
| `space-3` | Label ↔ champ |
| `space-4` | Marge latérale et gouttière mobile |
| `space-5` | Padding de carte |
| `space-6` | Gouttière desktop, écart entre cartes |
| `space-10` | Marge latérale desktop |
| `space-12` | Écart entre sections (appli) |
| `space-16` / `space-24` | Écart entre sections (site mobile / desktop) |
| `radius-sm` | Tuiles internes, cases à cocher |
| `radius-md` | Champs, alertes, tuiles de stats |
| `radius-lg` | Pastille date, schéma tactique |
| `radius-xl` | Cartes, modales |
| `radius-pill` | Boutons, badges, onglets, avatars |
| `shadow-card` | Toutes les cartes (ombre plate, pas de flou) |
| `shadow-pop` | Uniquement ce qui flotte : menus, toasts, modales |
| `shadow-focus` | Focus clavier sur tout élément interactif |

---

## 5. Typographie

- **Archivo** (700, 900) : affichage et titres. Minuscules / casse de phrase, jamais en capitales (sauf `overline`).
- **DM Sans** (400, 500, 700) : tout le texte.

| Style | Famille | Taille / interligne | Graisse | Interlettrage | Usage |
|---|---|---|---|---|---|
| display-xl | Archivo | 64 / 64 | 900 | −2px | Hero, 1 par page (mobile → display-l) |
| display-l | Archivo | 48 / 52 | 900 | −1.5px | Titres de sections marketing |
| stat | Archivo | 32 / 36 | 900 | −0.5px | Chiffres : stats, scores, dates |
| h1 | Archivo | 36 / 42 | 900 | −1px | Titre de page appli |
| h2 | Archivo | 28 / 34 | 700 | −0.5px | Titre de section |
| h3 | Archivo | 22 / 28 | 700 | −0.3px | Titre de carte |
| h4 | Archivo | 18 / 24 | 700 | 0 | Sous-titre, titre de modale |
| body-l | DM Sans | 18 / 28 | 400 | 0 | Chapô, marketing |
| body | DM Sans | 16 / 24 | 400 | 0 | Texte courant (min. 16px dans un champ) |
| body-s | DM Sans | 14 / 20 | 400 | 0 | Texte de carte, aides |
| label | DM Sans | 14 / 20 | 700 | 0 | Labels, boutons, onglets |
| caption | DM Sans | 12 / 16 | 500 | 0 | Métadonnées, légendes |
| overline | DM Sans | 12 / 16 | 700 | 2px | Surtitre en CAPITALES (seul style en majuscules) |

Règles : titres en casse de phrase (« Prochain match »), 72 caractères max par ligne, chiffres toujours en style `stat`.

---

## 6. Mise en page

- **Grille** : 4 col. mobile (marge 16, gouttière 16) · 8 col. tablette (≥960) · 12 col. desktop (≥1280, marge 40, gouttière 24). Contenu max 1 200 px.
- **Formes** : tout est arrondi, rien à angle vif.
- **Élévation** : cartes = marche plate de 2 px (`shadow-card`). Flou réservé aux éléments flottants.
- **Mobile d'abord** : cibles tactiles ≥ 44 px ; CTA principal en pleine largeur (52 px) sous 640 px.
- **Navigation** : barre en haut sur desktop ; sous 640 px, barre d'onglets en bas d'écran (appli) ou menu (site).

---

## 7. Le schéma tactique — signature visuelle

| Élément | Rendu | Token |
|---|---|---|
| Terrain | Aplat vert + bandes de tonte 1 sur 2 | `pitch`, `pitch-stripe` |
| Lignes | Blanc ; ligne d'essai pleine, 22 m et 10 m en pointillés | `pitch-line` |
| Nos joueurs | Ronds blancs pleins, numéro du poste en caption vert foncé | `team-us` |
| Adversaires | Ronds vert Vestiaire | `team-them` |
| Course du porteur | Trait orange plein 4 px, flèche arrondie | `run-line` |
| Passe | Trait blanc pointillé (8 / 6) | `pitch-line` |
| Leurre | Trait blanc fin 2 px, 50 % d'opacité | `pitch-line` |

Toujours horizontal, attaque vers la droite, pleine largeur de la carte, rayon `radius-lg`. Animation : déplacement phase par phase en 600 ms, le trait orange se dessine en suivant le porteur. Toujours un équivalent texte (description phase par phase).

---

## 8. Iconographie, photo, illustration

- **Icônes** : [Lucide](https://lucide.dev), traits 2 px arrondis, 20 px en interface, 24 px en navigation / états vides, couleur du texte voisin. Icônes métier (ballon, poteaux, sifflet, maillot, plot) dans le même style. Pas d'icônes pleines, pas d'emoji.
- **Photos** : vrais clubs amateurs, lumière naturelle, boue, pluie, sourires, mains sur le ballon, bord de terrain, tableau du vestiaire. Pas de rugby pro posé, pas de banque d'images. Texte sur photo → voile `#0B3D2A` à 70 %.
- **Illustration** : uniquement schémas tactiques et formes géométriques (ronds, pilules). Pas de mascotte.

---

## 9. Ton & rédaction

**Tutoiement** partout (appli, site, réseaux). Vouvoiement seulement pour fédérations, comités, mairies, sponsors.

| On écrit | On n'écrit pas |
|---|---|
| Combinaison envoyée à 23 joueurs | Votre combinaison a été envoyée avec succès ! |
| Crée ta première combinaison | Aucune donnée disponible |
| Ce nom est déjà pris. Essaie « Croisé 2 ». | Erreur 409 : conflit |
| Inviter l'équipe | Cliquez ici pour inviter |
| 15 joueurs ont lu | 15 lectures |

- Boutons : verbe d'abord, 1 à 3 mots, sans point.
- Vocabulaire rugby assumé (lancement, touche, regroupement, côté fermé, intervalle).
- Chiffres en chiffres (« 3 phases », « 22 m »).
- Pas de « ! » dans l'interface (on en garde un pour fêter un essai).
- Erreur = ce qui s'est passé + quoi faire.

---

## 10. Mouvement & accessibilité

- Transitions : 150 ms (survol), 250 ms (entrée/sortie), easing `cubic-bezier(0.2, 0.8, 0.2, 1)`.
- `prefers-reduced-motion` : on coupe les animations de déplacement.
- Texte ≥ 4,5:1, éléments d'interface ≥ 3:1, dans les deux thèmes.
- Focus clavier toujours visible (`shadow-focus`, anneau orange 3 px).
- Jamais d'info par la couleur seule : un badge a toujours un mot.

---

## 11. Composants

### Button
Pilule. Un seul `primary` par écran.
- `primary` : action principale (Enregistrer, Envoyer à l'équipe) — fond `primary`, texte `on-primary`.
- `secondary` : alternative (Annuler, Voir une démo) — transparent, bordure 2px `ink`.
- `ghost` : action discrète (Modifier) — texte `primary-text`, survol `primary-soft`.
- `accent` : enthousiasme (Inviter l'équipe) — fond `accent`, texte `on-accent`. Jamais à côté d'un primary.
- `danger` : suppression, toujours avec confirmation.
- Tailles : `md` 44 px (défaut), `lg` 52 px (CTA site, CTA mobile pleine largeur), `sm` 36 px (desktop, listes denses). Texte DM Sans 700 16px, padding horizontal `space-6`.

### Badge
1 à 3 mots, pilule, 13px/700, padding 6×12. Tons : `neutral` (fait factuel), `brand` (positif : Lu par 15), `accent` (à traiter : 2 questions), `solid` (compteur clé, 1 par écran : 18 présents), `danger` (Blessé), `info` (Nouveau).

### Avatar
Rond. Initiales sur `primary-soft`, ou numéro de maillot sur `green-900` (composition d'équipe). Tailles 32 / 44 / 64 px. Nom complet toujours en `aria-label`.

### Input
Label toujours visible (14px/700) au-dessus, champ 44 px, rayon `radius-md`, bordure 1,5px `border-strong`, focus bordure `primary` + `shadow-focus`. Aide en `body-s` `ink-muted` ; en erreur, bordure `danger` et message `danger-text`. Placeholder = exemple réel sans « ex. ».

### Tabs
Piste `surface-sunken` en pilule, onglets 36 px ; actif = fond `surface-card` + `shadow-card`. 2 à 5 onglets, pour filtrer une même vue (Toutes / Avants / Trois-quarts / Défense). Pas pour naviguer entre pages.

### Alert
Dans la page (pas flottante). Icône + titre court + une phrase, rayon `radius-md`, padding `space-4`. `success` (fond `primary-soft`), `warning` (fond `accent-soft`), `danger` (fond `danger-soft`), `info` (fond `info-soft`), texte dans le `*-text` correspondant.

### StatTile
Fond `surface-sunken`, rayon `radius-md`. Label `caption` `ink-muted` au-dessus, valeur en style `stat`, évolution optionnelle en `primary-text`. Par 2 à 4. Pas de chiffre inventé : tiret si la donnée manque.

### Card
Fond `surface-card`, rayon `radius-xl`, `shadow-card`, padding `space-5`, gap `space-4`. Surtitre `overline` en `primary-text`, titre `h3`, action à droite (Button ghost ou Badge). Une carte = un sujet. Pas de carte dans une carte.

### Navbar
64 px, fond `surface-card`, filet bas `border`. Logo (symbole 32 px + « rugbeo » Archivo 900 24px) à gauche, 3 à 5 liens (15px/700 `ink-muted`, page courante en `primary-text` sur `primary-soft`), une action à droite.

### MatchCard
Carte horizontale : pastille date 60×60 (`primary-soft`, jour en overline vert + chiffre Archivo 900), titre « Contre [club] » / « À [club] », méta « 15 h · Stade » en `ink-muted`, badge `solid` « 18 présents » à droite.

### PlayCard (carte signature)
Carte avec surtitre (« Mêlée · 5 m adverse »), titre h3 (« Croisé »), badge « 3 phases », schéma tactique (section 7) en viewBox 520×300, pied avec badges « Lu par 15 joueurs » (brand) et « 2 questions » (accent).

---

## 12. Feuille de styles des composants (référence)

```css
body{margin:0;background:var(--surface-page);color:var(--ink);font-family:var(--font-sans);font-size:16px;line-height:24px}
:where(.rb-btn,.rb-input,.rb-tab,.rb-nav a):focus-visible{outline:none;box-shadow:var(--shadow-focus)}

.rb-btn{font-family:var(--font-sans);font-weight:700;font-size:16px;line-height:20px;display:inline-flex;align-items:center;justify-content:center;gap:var(--space-2);height:var(--control-md);padding:0 var(--space-6);border-radius:var(--radius-pill);border:2px solid transparent;cursor:pointer;transition:background-color 150ms cubic-bezier(.2,.8,.2,1),transform 150ms;text-decoration:none;white-space:nowrap}
.rb-btn:active{transform:scale(.98)}
.rb-btn-sm{height:var(--control-sm);padding:0 var(--space-4);font-size:14px}
.rb-btn-lg{height:var(--control-lg);padding:0 var(--space-8);font-size:17px}
.rb-btn-block{display:flex;width:100%}
.rb-btn-primary{background:var(--primary);color:var(--on-primary)}
.rb-btn-primary:hover{background:var(--primary-hover)}
.rb-btn-secondary{background:transparent;color:var(--ink);border-color:var(--ink)}
.rb-btn-secondary:hover{background:var(--surface-sunken)}
.rb-btn-ghost{background:transparent;color:var(--primary-text)}
.rb-btn-ghost:hover{background:var(--primary-soft)}
.rb-btn-accent{background:var(--accent);color:var(--on-accent)}
.rb-btn-danger{background:var(--danger);color:var(--on-danger)}

.rb-badge{display:inline-flex;align-items:center;gap:var(--space-1);font-size:13px;line-height:16px;font-weight:700;padding:6px 12px;border-radius:var(--radius-pill)}
.rb-badge-neutral{background:var(--surface-sunken);color:var(--ink)}
.rb-badge-brand{background:var(--primary-soft);color:var(--primary-text)}
.rb-badge-accent{background:var(--accent-soft);color:var(--accent-text)}
.rb-badge-solid{background:var(--accent);color:var(--on-accent)}
.rb-badge-danger{background:var(--danger-soft);color:var(--danger-text)}
.rb-badge-info{background:var(--info-soft);color:var(--info-text)}

.rb-avatar{display:inline-flex;align-items:center;justify-content:center;border-radius:var(--radius-pill);background:var(--primary-soft);color:var(--primary-text);font-family:var(--font-display);font-weight:900}
.rb-avatar-number{background:var(--green-900);color:#FFFFFF}

.rb-field{display:flex;flex-direction:column;gap:6px}
.rb-field label{font-size:14px;line-height:20px;font-weight:700}
.rb-input{font-family:var(--font-sans);font-size:16px;height:var(--control-md);padding:0 var(--space-4);border-radius:var(--radius-md);border:1.5px solid var(--border-strong);background:var(--surface-card);color:var(--ink)}
.rb-input::placeholder{color:var(--ink-subtle)}
.rb-input:focus-visible{border-color:var(--primary)}
.rb-field-error .rb-input{border-color:var(--danger)}
.rb-hint{font-size:14px;line-height:20px;color:var(--ink-muted)}
.rb-field-error .rb-hint{color:var(--danger-text)}

.rb-tabs{display:inline-flex;gap:var(--space-1);padding:var(--space-1);background:var(--surface-sunken);border-radius:var(--radius-pill)}
.rb-tab{font-size:14px;font-weight:700;height:36px;padding:0 var(--space-4);border:none;border-radius:var(--radius-pill);background:transparent;color:var(--ink-muted)}
.rb-tab[aria-selected="true"]{background:var(--surface-card);color:var(--ink);box-shadow:var(--shadow-card)}

.rb-alert{display:flex;gap:var(--space-3);padding:var(--space-4);border-radius:var(--radius-md);font-size:14px;line-height:20px}
.rb-alert-info{background:var(--info-soft);color:var(--info-text)}
.rb-alert-success{background:var(--primary-soft);color:var(--primary-text)}
.rb-alert-warning{background:var(--accent-soft);color:var(--accent-text)}
.rb-alert-danger{background:var(--danger-soft);color:var(--danger-text)}

.rb-card{background:var(--surface-card);border-radius:var(--radius-xl);box-shadow:var(--shadow-card);padding:var(--space-5);display:flex;flex-direction:column;gap:var(--space-4)}
.rb-overline{font-size:12px;line-height:16px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--primary-text)}
.rb-card-title{font-family:var(--font-display);font-weight:700;font-size:22px;line-height:28px;letter-spacing:-.3px;margin:2px 0 0}

.rb-stat{background:var(--surface-sunken);border-radius:var(--radius-md);padding:var(--space-3) var(--space-4)}
.rb-stat-label{font-size:12px;line-height:16px;font-weight:500;color:var(--ink-muted)}
.rb-stat-value{font-family:var(--font-display);font-weight:900;font-size:32px;line-height:36px;letter-spacing:-.5px}

.rb-nav{display:flex;align-items:center;gap:var(--space-6);height:var(--nav-height);padding:0 var(--space-5);background:var(--surface-card);border-bottom:1px solid var(--border)}
.rb-nav-links a{font-size:15px;font-weight:700;color:var(--ink-muted);text-decoration:none;padding:8px 14px;border-radius:var(--radius-pill)}
.rb-nav-links a[aria-current="page"]{color:var(--primary-text);background:var(--primary-soft)}

.rb-match-date{width:60px;height:60px;border-radius:var(--radius-lg);background:var(--primary-soft);display:flex;flex-direction:column;align-items:center;justify-content:center}

.rb-pitch{width:100%;height:auto;display:block;border-radius:var(--radius-lg)}
.rb-pitch .bg{fill:var(--pitch)} .rb-pitch .stripe{fill:var(--pitch-stripe)}
.rb-pitch .line{stroke:var(--pitch-line);fill:none} .rb-pitch .us{fill:var(--team-us)}
.rb-pitch .them{fill:var(--team-them)} .rb-pitch .run{stroke:var(--run-line);fill:none}

@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
```

---

## 13. Checklist avant de livrer un écran

- [ ] Un seul bouton primaire visible.
- [ ] L'orange occupe ≤ 10 % de l'écran et n'est jamais du texte sur fond clair.
- [ ] Aucune valeur de couleur, d'espacement ou de rayon en dur : uniquement des tokens.
- [ ] Titres en casse de phrase, chiffres en style `stat`.
- [ ] Cibles tactiles ≥ 44 px, testé à 375 px de large.
- [ ] Testé en thème sombre.
- [ ] Focus clavier visible, contrastes AA.
- [ ] Textes au tutoiement, verbes d'abord, sans « ! ».
