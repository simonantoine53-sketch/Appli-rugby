# Appli Rugby – Éditeur d'exercices

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
