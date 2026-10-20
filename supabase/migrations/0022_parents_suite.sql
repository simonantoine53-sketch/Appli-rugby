-- Espace parents, suite :
-- 1. le staff (et le bureau du club) d'un jeune voit qui gère son compte, pour contacter le parent directement ;
-- 2. à 15 ans, le parent transmet le compte au jeune : il saisit son e-mail, le jeune reçoit un lien pour choisir
--    son mot de passe ; le parent garde la main jusqu'à la première connexion du jeune (claim_my_account).
-- Aucune suppression : applicable telle quelle.

-- 1. Contact du parent, réservé au staff du jeune
create or replace function public.guardian_contact(p_user uuid) returns table (name text, email text)
language sql stable security definer set search_path = public as $$
  select g.display_name, u.email
  from profiles k join profiles g on g.id = k.guardian_id join auth.users u on u.id = g.id
  where k.id = p_user and public.is_staff_of(p_user) $$;
revoke execute on function public.guardian_contact(uuid) from anon, public;
grant execute on function public.guardian_contact(uuid) to authenticated;

-- 2. Transmettre le compte au jeune (le parent seulement)
create or replace function public.handover_child(p_child uuid, p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare em text := lower(trim(coalesce(p_email, '')));
begin
  if auth.uid() is null or not exists (select 1 from profiles where id = p_child and guardian_id = auth.uid()) then
    raise exception 'Action non autorisée';
  end if;
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or em like '%@rugbeo.invalid' then raise exception 'Adresse e-mail invalide'; end if;
  if exists (select 1 from auth.users where lower(email) = em and id <> p_child) then
    raise exception 'Cette adresse a déjà un compte Rugbeo : choisissez-en une autre';
  end if;
  update auth.users set email = em, email_confirmed_at = coalesce(email_confirmed_at, now()),
         raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb, updated_at = now()
  where id = p_child;
  insert into auth.identities (user_id, provider_id, provider, identity_data, created_at, updated_at)
  values (p_child, p_child::text, 'email', jsonb_build_object('sub', p_child::text, 'email', em, 'email_verified', true), now(), now())
  on conflict (provider_id, provider) do update set identity_data = excluded.identity_data, updated_at = now();
end $$;
revoke execute on function public.handover_child(uuid, text) from anon, public;
grant execute on function public.handover_child(uuid, text) to authenticated;

-- Adresse de connexion déjà transmise (pour afficher « en attente de sa première connexion »)
create or replace function public.my_kids_login() returns table (id uuid, email text)
language sql stable security definer set search_path = public as $$
  select p.id, u.email from profiles p join auth.users u on u.id = p.id
  where p.guardian_id = auth.uid() and auth.uid() is not null and u.email not like '%@rugbeo.invalid' $$;
revoke execute on function public.my_kids_login() from anon, public;
grant execute on function public.my_kids_login() to authenticated;

-- Première connexion du jeune : le compte devient le sien (le parent n'y a plus accès)
create or replace function public.claim_my_account() returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not exists (select 1 from profiles where id = auth.uid() and guardian_id is not null) then return false; end if;
  perform set_config('rugbeo.claim', 'on', true);
  update profiles set guardian_id = null where id = auth.uid();
  update profile_private set under_15 = false where user_id = auth.uid();
  return true;
end $$;
revoke execute on function public.claim_my_account() from anon, public;
grant execute on function public.claim_my_account() to authenticated;

-- Le lien parent / jeune reste protégé, sauf pour la reprise du compte par le jeune lui-même
create or replace function public.protect_guardian() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and new.guardian_id is distinct from old.guardian_id
     and not (coalesce(current_setting('rugbeo.claim', true), '') = 'on' and new.id = auth.uid() and new.guardian_id is null) then
    raise exception 'Le parent d''un jeune ne peut pas être changé';
  end if;
  return new;
end $$;
revoke execute on function public.protect_guardian() from anon, public, authenticated;
