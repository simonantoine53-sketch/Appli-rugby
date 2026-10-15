# Appli Rugby – règles pour les mises à jour

- **Couleurs** : suivre `docs/charte-couleurs.md`. Uniquement les variables CSS de `:root` (`var(--primary)`, `var(--danger)`…), jamais de code couleur en dur. Un seul bleu pour les actions ; vert / orange / rouge seulement pour les états.
- **Textes** : vouvoiement partout. Mots fixes : « Équipe », « Compos », « Présent / Peut-être / Absent ».
- **Mise en ligne** : `node build.js` (cache et `dist/appli-rugby.html`) avant chaque commit ; un push sur `main` déploie GitHub Pages.
- **Base Supabase** : chaque changement de schéma va dans `supabase/migrations/` (numéro suivant).
