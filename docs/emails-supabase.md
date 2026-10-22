# E-mails Rugbeo : modèles à coller dans Supabase

Les modèles sont dans `supabase/templates/` (un fichier HTML par e-mail, objets dans `sujets.json`). Une page d'aperçu avec boutons « Copier » permet de les coller sans ouvrir les fichiers.

Où : Supabase → Authentication → Emails → Templates. **Base de test (rugbeo-test) d'abord**, puis la production (Appli Rugby Strat) après validation.

| Fichier | Onglet Supabase | Objet |
|---|---|---|
| `confirmation.html` | Confirm signup | Confirmez votre adresse pour Rugbeo |
| `recuperation.html` | Reset password | Rugbeo : choisissez votre mot de passe |
| `invitation.html` | Invite user | Une invitation vous attend sur Rugbeo |
| `lien-connexion.html` | Magic link | Votre lien de connexion Rugbeo |
| `changement-email.html` | Change email address | Rugbeo : confirmez votre nouvelle adresse |

Un même contenu s'adapte à la situation grâce aux données du compte (`.Data`, rempli à l'inscription par `js/account.js`) :
- **Confirmation** : `kids` (un parent crée le compte de son enfant), sinon `join_code` (venu par un lien d'invitation : il rejoindra l'équipe automatiquement), sinon inscription simple.
- **Mot de passe** : `managed` (compte d'un jeune transmis par son parent à 15 ans, voir « Lui donner son compte »), sinon mot de passe oublié.

Ne pas modifier les morceaux `{{ … }}` : Supabase les remplit (`{{ .ConfirmationURL }}` = le lien).

Couleurs : celles de `docs/charte-couleurs.md`, écrites en dur car les messageries ne lisent pas les variables CSS. Pas d’image dans les e-mails (souvent bloquées par les messageries) : le logo est un ballon 🏉 sur un carré blanc, en texte.

**Limite actuelle** : sans service d'envoi branché (SMTP), Supabase n'envoie qu'aux membres de l'équipe du projet Supabase et quelques e-mails par heure. Pour les vrais utilisateurs, il faudra un nom de domaine et un service d'envoi (par exemple Brevo), puis « Sender name : Rugbeo » dans Authentication → Emails → SMTP Settings, et mettre à jour `js/legal.js` (nouveau prestataire).
