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
  update auth.users set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) - 'managed' where id = auth.uid();
  return true;
end $$;
revoke execute on function public.claim_my_account() from anon, public;
grant execute on function public.claim_my_account() to authenticated;
