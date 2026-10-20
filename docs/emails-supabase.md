# E-mails Rugbeo : textes à coller dans Supabase

Où : Supabase → Authentication → Emails → Templates. Pour chaque modèle, remplacer l'objet (Subject) et le contenu (Message body), puis « Save ».
Nom de l'expéditeur : Authentication → Emails → SMTP Settings → Sender name : `Rugbeo`.

Ne pas modifier `{{ .ConfirmationURL }}` : c'est le lien que Supabase remplit.

---

## Confirm signup (confirmation d'inscription)

**Objet :** `Confirmez votre compte Rugbeo`

```html
<div style="font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; max-width: 520px; margin: 0 auto; color: #1f2933;">
  <p style="font-size: 20px; font-weight: 700; color: #4a9e4f; margin: 0 0 4px;">Rugbeo</p>
  <p style="font-size: 13px; color: #6b7280; margin: 0 0 24px;">L’appli des clubs de rugby</p>
  <p>Bonjour,</p>
  <p>Merci de vous être inscrit sur Rugbeo. Pour activer votre compte, confirmez votre adresse e-mail :</p>
  <p style="margin: 24px 0;"><a href="{{ .ConfirmationURL }}" style="background: #1a73e8; color: #ffffff; text-decoration: none; padding: 12px 20px; border-radius: 8px; font-weight: 600; display: inline-block;">Confirmer mon compte</a></p>
  <p style="font-size: 13px; color: #6b7280;">Sans confirmation sous 24 heures, l’inscription est annulée. Si vous n’avez pas créé de compte, ignorez simplement cet e-mail.</p>
  <p style="font-size: 13px; color: #6b7280; margin-top: 32px;">De la convoc’ au maillot, Rugbeo.</p>
</div>
```

## Reset password (mot de passe oublié)

**Objet :** `Rugbeo : choisissez un nouveau mot de passe`

```html
<div style="font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; max-width: 520px; margin: 0 auto; color: #1f2933;">
  <p style="font-size: 20px; font-weight: 700; color: #4a9e4f; margin: 0 0 4px;">Rugbeo</p>
  <p style="font-size: 13px; color: #6b7280; margin: 0 0 24px;">L’appli des clubs de rugby</p>
  <p>Bonjour,</p>
  <p>Vous avez demandé à changer votre mot de passe. Cliquez sur le bouton pour en choisir un nouveau :</p>
  <p style="margin: 24px 0;"><a href="{{ .ConfirmationURL }}" style="background: #1a73e8; color: #ffffff; text-decoration: none; padding: 12px 20px; border-radius: 8px; font-weight: 600; display: inline-block;">Choisir un nouveau mot de passe</a></p>
  <p style="font-size: 13px; color: #6b7280;">Si vous n’avez rien demandé, ignorez cet e-mail : votre mot de passe actuel reste valable.</p>
  <p style="font-size: 13px; color: #6b7280; margin-top: 32px;">De la convoc’ au maillot, Rugbeo.</p>
</div>
```

## Invite user (invitation envoyée depuis Supabase)

**Objet :** `Vous êtes invité sur Rugbeo`

```html
<div style="font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; max-width: 520px; margin: 0 auto; color: #1f2933;">
  <p style="font-size: 20px; font-weight: 700; color: #4a9e4f; margin: 0 0 4px;">Rugbeo</p>
  <p style="font-size: 13px; color: #6b7280; margin: 0 0 24px;">L’appli des clubs de rugby</p>
  <p>Bonjour,</p>
  <p>Vous êtes invité à rejoindre Rugbeo : stratégies, convocations et compos de votre équipe au même endroit.</p>
  <p style="margin: 24px 0;"><a href="{{ .ConfirmationURL }}" style="background: #1a73e8; color: #ffffff; text-decoration: none; padding: 12px 20px; border-radius: 8px; font-weight: 600; display: inline-block;">Accepter l’invitation</a></p>
  <p style="font-size: 13px; color: #6b7280; margin-top: 32px;">De la convoc’ au maillot, Rugbeo.</p>
</div>
```

## Magic link et Change email address

Pas utilisés par l'appli pour l'instant. Pour la cohérence, remplacer seulement le nom dans l'objet :
- Magic link : `Votre lien de connexion Rugbeo`
- Change email address : `Rugbeo : confirmez votre nouvelle adresse e-mail`
