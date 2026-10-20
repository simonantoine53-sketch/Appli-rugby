# Rugbeo – L'appli des clubs de rugby

*De la convoc' au maillot, Rugbeo.*

Outil web pour dessiner des exercices et des combinaisons de rugby, étape par étape, puis les partager en image, en GIF animé ou en vidéo.

Aucune installation ni dépendance : ouvrez `index.html` dans un navigateur récent (Chrome, Edge, Firefox). Pour servir le dossier localement :

```bash
npx http-server -p 8080 .
# puis http://localhost:8080
```

## Fonctionnalités

- **Terrain** complet, demi-terrain ou vide, en paysage ou en portrait.
- **Formes** : cercle, rectangle, triangle, quadrilatère (pleins ou pointillés), lignes, flèches, course avec ballon (ondulée), course en appuis (zigzag), tracé libre, texte.
- **Équipement** : ballon, ballons, sac de plaquage, plot, piquet, cône, coupelle, cerceau, joug, bouclier, échelle.
- **Joueurs** : 8 couleurs, en pastille ou en maillot, avec numéro (double-clic).
- **Propriétés** de l'objet sélectionné : couleur, pointillé, épaisseur, remplissage, flèche, style de ligne, taille, rotation, ordre d'affichage.
- **Étapes** : chaque étape reprend la position des objets de la précédente. Déplacez les joueurs pour créer l'animation.
- **Aperçu** animé avec interpolation des déplacements entre étapes.
- **Export** : image PNG (étape affichée), GIF animé et vidéo WebM (toutes les étapes avec le mouvement des joueurs).
- **Sauvegarde** dans le navigateur (« Mes dessins »), export et import JSON.
- Annuler / rétablir, raccourcis clavier (voir l'onglet Réglages).

## Structure

```
index.html      interface
css/style.css   styles
js/icons.js     palette d'outils (groupes, icônes, raccourcis)
js/field.js     rendu SVG du terrain
js/objects.js   rendu SVG des objets, bornes, déplacement, interpolation
js/export.js    génération des images d'animation, encodeur GIF, vidéo WebM
js/editor.js    état, interactions, étapes, aperçu, sauvegarde
```

## Format des données

Un dessin est un objet JSON : `{ id, title, settings: { field, orientation, stepDuration }, steps: [ { id, objects: [...] } ] }`.
Les objets d'une étape à l'autre partagent le même `id`, ce qui permet d'animer leur déplacement.

## Deux bases : production et test

| | Production | Test |
|---|---|---|
| Projet Supabase | `rnbsupogbesfngjfykyc` (Appli Rugby Strat) | `qrldtcbzsewvjdrzzsdf` (rugbeo-test) |
| Utilisée sur | `simonantoine53-sketch.github.io` (et plus tard `rugbeo.fr`) | tout le reste : localhost, 127.0.0.1, fichier local, aperçus `*.pages.dev` / `*.vercel.app` |
| Repère | aucun | bandeau orange « Environnement de test » |

Le choix est automatique (`js/config.js`, liste `PROD_HOSTS`). Un futur nom de domaine de production s'ajoute à cette liste ; les déploiements d'aperçu (une adresse par branche) restent sur la base de test sans retouche. Les clés « publishable » et VAPID publiques sont publiques par conception ; la clé « service » et les clés VAPID privées ne vont jamais dans le dépôt (elles sont dans la table `app_secrets` de chaque base).

### Méthode de travail

1. Chaque nouvelle migration (`supabase/migrations/`, numéro suivant) est d'abord appliquée et testée sur la **base de test**.
2. Elle n'est appliquée sur la **production** qu'après validation.
3. Tous les tests (Playwright, notifications, rappels, tâches planifiées) se font sur la base de test. Aucun e-mail ni aucune notification ne doit partir vers de vrais utilisateurs.

### Mettre en place ou remettre à zéro la base de test

- Base vide : `node supabase/test/build-schema.js` puis coller `supabase/test/schema_complet.sql` (toutes les migrations dans l'ordre) dans l'éditeur SQL du projet de test, puis `supabase/test/seed.sql`.
- Remise à zéro des données : `select public.test_seed();` dans l'éditeur SQL du projet de test. La fonction refuse de tourner ailleurs que sur la base de test (table `app_env`, jamais créée par une migration).
- Comptes de test (mot de passe commun `RugbeoTest2026!`, adresses en `.test` qui ne reçoivent jamais de mail) : `coach@exemple.test`, `admin@exemple.test`, `presidente@exemple.test`, `joueur@exemple.test` (et `joueur2` à `joueur20`), `parent@exemple.test` (deux jeunes gérés, Tom et Lina, en U16), `super@exemple.test` (back-office). Club « RC Test » (code `RCTEST26`), équipes Séniors (`TESTSEN1`) et U16 (`TESTU161`).

### Tests

```bash
python3 -m http.server 8765      # depuis la racine du dépôt
node tests/e2e.js                # vue téléphone et ordinateur, captures dans tests/out/
```
