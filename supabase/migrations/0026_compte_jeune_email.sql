-- Compte transmis à un jeune de 15 ans : l'e-mail « Choisissez votre mot de passe » (modèle Reset password,
-- supabase/templates/recuperation.html) affiche le texte « Votre compte Rugbeo vous attend » tant que le compte
-- porte la marque « managed » (géré par un parent). À sa première connexion, le compte devient celui du jeune :
-- on retire cette marque, pour que ses prochains « Mot de passe oublié » reçoivent le texte habituel.

create or replace function public.claim_my_account() returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not exists (select 1 from profiles where id = auth.uid() and guardian_id is not null) then return false; end if;
  perform set_config('rugbeo.claim', 'on', true);
  update profiles set guardian_id = null where id = auth.uid();
  update profile_private set under_15 = false where user_id = auth.uid();
  update auth.users set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) - 'managed' - 'guardian_name' where id = auth.uid();
  return true;
end $$;
revoke execute on function public.claim_my_account() from anon, public;
grant execute on function public.claim_my_account() to authenticated;

-- E-mail personnalisé (« Bonjour Tom, Sophie vous a transmis votre compte ») : au moment de la transmission,
-- on note le prénom du jeune et celui du parent dans les données du compte, lues par le modèle d'e-mail.
-- Ils sont retirés (avec « managed ») à la première connexion du jeune, ci-dessus.
create or replace function public.handover_child(p_child uuid, p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare em text := lower(trim(coalesce(p_email, '')));
        kid text := (select split_part(trim(display_name), ' ', 1) from profiles where id = p_child);
        par text := (select split_part(trim(display_name), ' ', 1) from profiles where id = auth.uid());
begin
  if auth.uid() is null or not exists (select 1 from profiles where id = p_child and guardian_id = auth.uid()) then
    raise exception 'Action non autorisée';
  end if;
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or em like '%@rugbeo.invalid' then raise exception 'Adresse e-mail invalide'; end if;
  if exists (select 1 from auth.users where lower(email) = em and id <> p_child) then
    raise exception 'Cette adresse a déjà un compte Rugbeo : choisissez-en une autre';
  end if;
  update auth.users set email = em, email_confirmed_at = coalesce(email_confirmed_at, now()),
         raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
         raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
           || jsonb_build_object('first_name', coalesce(kid, ''), 'guardian_name', coalesce(par, '')),
         updated_at = now()
  where id = p_child;
  insert into auth.identities (user_id, provider_id, provider, identity_data, created_at, updated_at)
  values (p_child, p_child::text, 'email', jsonb_build_object('sub', p_child::text, 'email', em, 'email_verified', true), now(), now())
  on conflict (provider_id, provider) do update set identity_data = excluded.identity_data, updated_at = now();
end $$;
revoke execute on function public.handover_child(uuid, text) from anon, public;
grant execute on function public.handover_child(uuid, text) to authenticated;
