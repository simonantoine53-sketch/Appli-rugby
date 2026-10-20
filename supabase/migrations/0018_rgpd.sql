-- RGPD : preuve de l'information et de l'accord parental, durées de conservation.
-- Partie 1 (appliquée le 19/10/2026) : colonnes de consentement, inscription, acceptation des conditions mises à jour.
-- Partie 2 (à coller dans Supabase : Dashboard → SQL Editor → New query → Run) : nettoyage automatique quotidien.

-- ---------------------------------------------------------------
-- Partie 1
-- ---------------------------------------------------------------
alter table public.profile_private
  add column if not exists terms_version text,
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists under_15 boolean not null default false,
  add column if not exists parent_email text,
  add column if not exists parental_consent_at timestamptz;
alter table public.profile_private drop constraint if exists profile_private_parent_email_len;
alter table public.profile_private add constraint profile_private_parent_email_len check (parent_email is null or length(parent_email) <= 254) not valid;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path to 'public' as $function$
declare m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb); u15 boolean := coalesce((m->>'under_15')::boolean, false);
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(m->>'display_name', ''), split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  -- Preuve de l'information et de l'accord parental (moins de 15 ans) donnés à l'inscription
  if m ? 'terms_version' then
    insert into public.profile_private (user_id, terms_version, terms_accepted_at, under_15, parent_email, parental_consent_at)
    values (new.id, left(m->>'terms_version', 20), now(), u15,
            case when u15 then left(nullif(trim(m->>'parent_email'), ''), 254) end,
            case when u15 and coalesce((m->>'parental_consent')::boolean, false) then now() end)
    on conflict (user_id) do update set terms_version = excluded.terms_version, terms_accepted_at = excluded.terms_accepted_at,
      under_15 = excluded.under_15, parent_email = excluded.parent_email, parental_consent_at = excluded.parental_consent_at;
  end if;
  return new;
end $function$;

-- Acceptation de la politique mise à jour par un compte déjà inscrit
create or replace function public.accept_terms(p_version text) returns void
language sql security definer set search_path = public as $$
  insert into profile_private (user_id, terms_version, terms_accepted_at) values (auth.uid(), left(p_version, 20), now())
  on conflict (user_id) do update set terms_version = excluded.terms_version, terms_accepted_at = now();
$$;
revoke execute on function public.accept_terms(text) from anon, public;
grant execute on function public.accept_terms(text) to authenticated;

-- ---------------------------------------------------------------
-- Partie 2 : durées de conservation annoncées dans la politique de confidentialité
-- ---------------------------------------------------------------
create or replace function public.purge_old_data() returns void
language plpgsql security definer set search_path = public as $f$
begin
  delete from public.events where created_at < now() - interval '13 months';          -- mesure d'usage
  delete from public.usage_sessions where started_at < now() - interval '13 months';
  delete from public.client_errors where created_at < now() - interval '6 months';     -- erreurs techniques
  delete from public.join_attempts where created_at < now() - interval '24 hours';     -- essais de code
  delete from public.feedback where created_at < now() - interval '2 years';           -- messages
  delete from public.page_counts where day < current_date - interval '25 months';      -- compteurs anonymes
  delete from public.activity_counts where period < current_date - interval '25 months';
  -- Comptes sans activité depuis 3 ans (jamais les super-admins) ; tout ce qui leur est lié part avec eux
  delete from auth.users u
  where greatest(coalesce(u.last_sign_in_at, u.created_at), coalesce((select a.day::timestamptz from public.activity_last a where a.user_id = u.id), u.created_at)) < now() - interval '3 years'
    and not exists (select 1 from public.profiles p where p.id = u.id and p.is_superadmin);
end $f$;
revoke execute on function public.purge_old_data() from anon, public, authenticated;

select cron.unschedule('purge-donnees-anciennes') where exists (select 1 from cron.job where jobname = 'purge-donnees-anciennes');
select cron.schedule('purge-donnees-anciennes', '23 3 * * *', 'select public.purge_old_data()');
