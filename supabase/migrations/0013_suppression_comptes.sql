-- Suppression de compte (RGPD) et nettoyage des inscriptions jamais confirmées.
-- À coller dans Supabase : Dashboard → SQL Editor → New query → Run.

-- 1. « Supprimer mon compte » (page Compte de l'appli)
-- Les données liées partent avec le compte (dessins, réponses, profil…). Une équipe dont la personne
-- était le seul membre du staff passe au plus ancien membre (nommé coach), ou est supprimée si elle est vide.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public as $f$
declare uid uuid := auth.uid(); t record; heir uuid;
begin
  if uid is null then raise exception 'Non connecté'; end if;
  if (select is_superadmin from profiles where id = uid) and (select count(*) from profiles where is_superadmin) <= 1 then
    raise exception 'Tu es le seul super-admin : nomme un autre super-admin avant de supprimer ton compte';
  end if;
  for t in select team_id from team_members where user_id = uid and status = 'active' and role in ('coach', 'admin') loop
    if not exists (select 1 from team_members where team_id = t.team_id and user_id <> uid and status = 'active' and role in ('coach', 'admin')) then
      select user_id into heir from team_members where team_id = t.team_id and user_id <> uid and status = 'active' order by joined_at limit 1;
      if heir is null then delete from teams where id = t.team_id;
      else update team_members set role = 'coach' where team_id = t.team_id and user_id = heir;
      end if;
    end if;
  end loop;
  delete from auth.users where id = uid;
end $f$;
revoke execute on function public.delete_my_account() from anon, public;
grant execute on function public.delete_my_account() to authenticated;

-- 2. Inscriptions abandonnées : e-mail non confirmé après 24 h → compte supprimé (l'adresse redevient libre).
-- Ne touche que les comptes jamais connectés, sans équipe ni dessin (les comptes de test créés en base sont épargnés).
create extension if not exists pg_cron;
select cron.schedule('purge-inscriptions-non-confirmees', '17 * * * *', $c$
  delete from auth.users u
  where u.email_confirmed_at is null
    and u.last_sign_in_at is null
    and u.created_at < now() - interval '24 hours'
    and not exists (select 1 from public.team_members m where m.user_id = u.id)
    and not exists (select 1 from public.drawings d where d.owner_id = u.id)
$c$);
