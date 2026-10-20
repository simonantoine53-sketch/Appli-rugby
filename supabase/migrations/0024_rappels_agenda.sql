-- Lot 2 : répondre depuis la notification, rappels la veille, abonnement à l'agenda.
-- Rien n'est supprimé. Après la migration, sur chaque base (test puis production), enregistrer l'adresse des fonctions :
--   insert into public.app_secrets (key, value) values ('functions_url', 'https://<projet>.supabase.co/functions/v1')
--   on conflict (key) do update set value = excluded.value;

create extension if not exists pg_net;

-- Secrets générés dans la base (jamais dans le dépôt) : signature des réponses depuis la notification, clé de la tâche planifiée
insert into public.app_secrets (key, value) values ('rsvp_secret', encode(extensions.gen_random_bytes(32), 'hex')) on conflict (key) do nothing;
insert into public.app_secrets (key, value) values ('cron_key', encode(extensions.gen_random_bytes(24), 'hex')) on conflict (key) do nothing;

-- Rappel la veille : réglage par équipe (heure de Paris)
alter table public.teams add column if not exists reminder_enabled boolean not null default true;
alter table public.teams add column if not exists reminder_hour smallint not null default 18 check (reminder_hour between 6 and 22);
-- Réglé par le staff (la règle de mise à jour des équipes s'applique) ; mêmes colonnes modifiables qu'avant, plus ces deux-là
grant update (reminder_enabled, reminder_hour) on public.teams to authenticated;

-- Préférence personnelle : pas de rappel la veille (pour un jeune, c'est celle du parent qui reçoit ses notifications)
alter table public.profile_private add column if not exists reminders_off boolean not null default false;

-- Le staff voit les réponses arriver en temps réel (lecture filtrée par les règles d'accès existantes)
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'event_responses') then
    alter publication supabase_realtime add table public.event_responses;
  end if;
end $$;

-- Journal des rappels envoyés : jamais deux fois le même (lu et écrit par la fonction serveur seulement)
create table if not exists public.reminder_log (
  event_id uuid not null references public.team_events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  sent_at timestamptz not null default now(),
  primary key (event_id, user_id, kind)
);
alter table public.reminder_log enable row level security;   -- aucune politique : invisible depuis l'appli

-- Abonnement à l'agenda : une adresse secrète par personne (le flux ne contient que les événements de ses équipes)
create table if not exists public.calendar_feeds (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  token text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  created_at timestamptz not null default now()
);
alter table public.calendar_feeds enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'calendar_feeds' and policyname = 'feeds_select') then
    create policy feeds_select on public.calendar_feeds for select to authenticated using (user_id = auth.uid());
  end if;
end $$;

-- Mon adresse d'abonnement (créée à la première demande), ou une nouvelle (l'ancienne ne marche plus)
create or replace function public.my_calendar_token(p_renew boolean default false) returns text
language plpgsql security definer set search_path = public as $$
declare tok text;
begin
  if auth.uid() is null then raise exception 'Non connecté'; end if;
  if p_renew then
    insert into calendar_feeds (user_id) values (auth.uid())
    on conflict (user_id) do update set token = encode(extensions.gen_random_bytes(18), 'hex'), created_at = now()
    returning token into tok;
  else
    insert into calendar_feeds (user_id) values (auth.uid()) on conflict (user_id) do nothing;
    select token into tok from calendar_feeds where user_id = auth.uid();
  end if;
  return tok;
end $$;
revoke execute on function public.my_calendar_token(boolean) from anon, public;
grant execute on function public.my_calendar_token(boolean) to authenticated;

-- Rappels : la tâche appelle la fonction serveur toutes les heures ; la fonction ne traite que les équipes dont c'est l'heure
create or replace function public.call_daily_reminders() returns void
language plpgsql security definer set search_path = public as $f$
declare u text := (select value from app_secrets where key = 'functions_url'); k text := (select value from app_secrets where key = 'cron_key');
begin
  if u is null or k is null then return; end if;
  perform net.http_post(url := u || '/push-notify', headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', k), body := '{}'::jsonb);
end $f$;
revoke execute on function public.call_daily_reminders() from anon, public, authenticated;
-- cron.schedule remplace la tâche du même nom si elle existe déjà
select cron.schedule('rappels-veille', '2 * * * *', 'select public.call_daily_reminders()');
