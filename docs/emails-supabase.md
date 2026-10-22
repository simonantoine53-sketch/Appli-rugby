# E-mails Rugbeo : modèles à coller dans Supabase

Les modèles sont dans `supabase/templates/` (un fichier HTML par e-mail, objets dans `sujets.json`). Une page d'aperçu avec boutons « Copier » permet de les coller sans ouvrir les fichiers.

Où : Supabase → Authentication → Emails → Templates. **Base de test (rugbeo-test) d'abord**, puis la production (Appli Rugby Strat) après validation.

| Fichier | Onglet Supabase | Objet |
|---|---|---|
| `confirmation.html` | Confirm signup | Confirmez votre adresse pour Rugbeo |
| `recuperation.html` | Reset password | variable (voir `sujets.json`) : « Tom, votre compte Rugbeo est à vous » pour un jeune, sinon « Rugbeo : choisissez un nouveau mot de passe » |
| `invitation.html` | Invite user | Une invitation vous attend sur Rugbeo |
| `lien-connexion.html` | Magic link | Votre lien de connexion Rugbeo |
| `changement-email.html` | Change email address | Rugbeo : confirmez votre nouvelle adresse |
| `mot-de-passe-modifie.html` | Security → Password changed (interrupteur à activer) | Rugbeo : votre mot de passe a été modifié |

**Utilisés aujourd'hui** : Confirm sign up, Reset password et l'alerte Password changed. Les autres sont prêts mais pas nécessaires (l'appli n'utilise ni invitation Supabase, ni lien de connexion, ni changement d'adresse).

Un même contenu s'adapte à la situation grâce aux données du compte (`.Data`, rempli à l'inscription par `js/account.js`) :
- **Confirmation** : `kids` (un parent crée le compte de son enfant), sinon `join_code` (venu par un lien d'invitation : il rejoindra l'équipe automatiquement), sinon inscription simple.
- **Mot de passe** : `managed` (compte d'un jeune transmis par son parent à 15 ans, voir « Lui donner son compte »), avec `first_name` et `guardian_name` (« Tom, votre compte Rugbeo est à vous · Sophie vous a transmis… », notés par `handover_child`, migration 0026) ; sinon mot de passe oublié.

Les modèles sont vérifiés avec le moteur de Supabase (Go `html/template`) pour chaque situation : aucune accolade ne reste dans l'e-mail reçu.

**Tests automatiques** : Brevo envoie pour de vrai depuis la base de test ; `tests/lib.js` bloque donc inscription, renvoi et mot de passe oublié pendant les tests.

Ne pas modifier les morceaux `{{ … }}` : Supabase les remplit (`{{ .ConfirmationURL }}` = le lien).

Couleurs : celles de `docs/charte-couleurs.md`, écrites en dur car les messageries ne lisent pas les variables CSS. Pas d’image dans les e-mails (souvent bloquées par les messageries) : le logo est un ballon 🏉 sur un carré blanc, en texte.

**Limite actuelle** : sans service d'envoi branché (SMTP), Supabase n'envoie qu'aux membres de l'équipe du projet Supabase et quelques e-mails par heure. Pour les vrais utilisateurs, il faudra un nom de domaine et un service d'envoi (par exemple Brevo), puis « Sender name : Rugbeo » dans Authentication → Emails → SMTP Settings, et mettre à jour `js/legal.js` (nouveau prestataire).
