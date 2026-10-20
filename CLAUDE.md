# Rugbeo – règles pour les mises à jour

- **Couleurs** : suivre `docs/charte-couleurs.md`. Uniquement les variables CSS de `:root` (`var(--primary)`, `var(--danger)`…), jamais de code couleur en dur. Un seul bleu pour les actions ; vert / orange / rouge seulement pour les états.
- **Textes** : vouvoiement partout. Mots fixes : « Équipe », « Compos », « Présent / Peut-être / Absent ».
- **Mise en ligne** : `node build.js` (cache et `dist/appli-rugby.html`) avant chaque commit ; un push sur `main` déploie GitHub Pages.
- **Base Supabase** : chaque changement de schéma va dans `supabase/migrations/` (numéro suivant). Toute nouvelle table a ses règles d'accès (RLS) cohérentes avec l'existant.
- **Deux bases** (voir README) : la base de **test** (`qrldtcbzsewvjdrzzsdf`, rugbeo-test) sert à tout : chaque migration y est appliquée et testée d'abord, puis sur la **production** (`rnbsupogbesfngjfykyc`) seulement après validation de Simon. Tous les tests (Playwright, notifications, rappels, tâches planifiées) se font sur la base de test ; aucun e-mail ni notification vers de vrais utilisateurs. `js/config.js` choisit la base selon l'adresse (production : `PROD_HOSTS` uniquement). Remise à zéro de la base de test : `select public.test_seed();`.
- **Bibliothèques** : aucune depuis un CDN ; tout est dans `vendor/` (voir la page Cookies de `js/legal.js`).
- **Données personnelles** : si une fonctionnalité ajoute une donnée personnelle ou un prestataire, mettre à jour `js/legal.js` (et seulement alors changer « version »).
- **Livraison** : plan validé avant de coder, tests Playwright en vue téléphone et ordinateur, `node build.js`, un commit par fonctionnalité, résultat montré avant de pousser sur `main`.
