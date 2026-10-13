-- Correctifs de sécurité (audit du 2026-10-13).
-- Appliqué sur le projet « Appli Rugby Strat » le 2026-10-13.
--  1. Membres : le staff ne modifie que le rôle et le statut (plus l'identifiant de la personne ni l'équipe).
--  2. Stratégies : l'auteur ne change jamais ; seuls le staff règle le mode de partage et le coach
--     modifie une stratégie publiée ; formations et réponses aux convocations ne changent pas de propriétaire.
--  3. Limites anti-abus : statistiques, erreurs et retours (débit et taille), nom d'affichage.
--  4. Codes d'équipe : 8 caractères pour les nouveaux codes, 10 essais ratés par heure.

-- ---------------------------------------------------------------
-- 1. Membres d'équipe
-- ---------------------------------------------------------------
revoke update on public.team_members from authenticated;
grant update (role, status) on public.team_members to authenticated;

-- ---------------------------------------------------------------
-- 2. Stratégies, formations, réponses
-- ---------------------------------------------------------------
create or replace function public.guard_drawing() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;   -- serveur (SQL, clé service)
  if tg_op = 'INSERT' then
    -- Le mode de partage et le lien public se règlent après coup, jamais à la création
    if new.share_mode is not null and (new.team_id is null or not public.is_staff(new.team_id)) then new.share_mode := null; end if;
    new.share_token := null;
    return new;
  end if;
  if new.owner_id is distinct from old.owner_id then raise exception 'L''auteur d''une stratégie ne peut pas être changé'; end if;
  if old.visibility = 'team' and not public.is_coach(old.team_id) then
    raise exception 'Stratégie publiée : seul le coach peut la modifier';
  end if;
  if new.share_mode is distinct from old.share_mode and new.team_id is not null and not public.is_staff(new.team_id) then
    raise exception 'Seul le staff de l''équipe règle le partage';
  end if;
  return new;
end $$;
revoke execute on function public.guard_drawing() from anon, public, authenticated;
create or replace trigger drawings_guard before insert or update on public.drawings for each row execute function public.guard_drawing();

revoke update on public.formations from authenticated;
grant update (name, data) on public.formations to authenticated;

create or replace function public.guard_event_response() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.event_id is distinct from old.event_id or new.user_id is distinct from old.user_id then
    raise exception 'Réponse : l''événement et la personne ne peuvent pas changer';
  end if;
  return new;
end $$;
revoke execute on function public.guard_event_response() from anon, public, authenticated;
create or replace trigger event_responses_guard before update on public.event_responses for each row execute function public.guard_event_response();

-- ---------------------------------------------------------------
-- 3. Limites anti-abus (NOT VALID : s'appliquent aux nouvelles lignes)
-- ---------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_display_name_len;
alter table public.profiles add constraint profiles_display_name_len check (length(display_name) <= 60) not valid;
alter table public.events drop constraint if exists events_props_size;
alter table public.events add constraint events_props_size check (pg_column_size(props) <= 4000) not valid;
alter table public.feedback drop constraint if exists feedback_context_size;
alter table public.feedback add constraint feedback_context_size check (pg_column_size(context) <= 8000) not valid;
alter table public.client_errors drop constraint if exists client_errors_sizes;
alter table public.client_errors add constraint client_errors_sizes check (length(url) <= 500 and length(build) <= 60 and length(user_agent) <= 500) not valid;

-- Débit maximal par personne (security definer : compte aussi les lignes que l'utilisateur ne voit pas)
create or replace function public.rate_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int; lim int; win interval;
begin
  if auth.uid() is null then return new; end if;
  if tg_table_name = 'events' then
    lim := 120; win := interval '1 minute';
    select count(*) into n from events where user_id = new.user_id and created_at > now() - win;
  elsif tg_table_name = 'client_errors' then
    lim := 30; win := interval '10 minutes';
    select count(*) into n from client_errors where user_id = new.user_id and created_at > now() - win;
  else
    lim := 10; win := interval '1 hour';
    select count(*) into n from feedback where user_id = new.user_id and created_at > now() - win;
  end if;
  if n >= lim then raise exception 'Trop de requêtes, réessaie plus tard'; end if;
  return new;
end $$;
revoke execute on function public.rate_limit() from anon, public, authenticated;
create or replace trigger events_rate_limit before insert on public.events for each row execute function public.rate_limit();
create or replace trigger client_errors_rate_limit before insert on public.client_errors for each row execute function public.rate_limit();
create or replace trigger feedback_rate_limit before insert on public.feedback for each row execute function public.rate_limit();

-- ---------------------------------------------------------------
-- 4. Codes d'équipe
-- ---------------------------------------------------------------
-- 8 caractères sans lettres ni chiffres ambigus (0/O, 1/I/L) : environ mille milliards de combinaisons
create or replace function public.gen_join_code() returns text
language sql volatile set search_path = public as $$
  select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::int, 1), '')
  from generate_series(1, 8);
$$;
alter table public.teams alter column join_code set default public.gen_join_code();

create or replace function public.regenerate_join_code(p_team uuid) returns text
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not public.is_staff(p_team) then raise exception 'Réservé au staff de l''équipe'; end if;
  loop
    c := public.gen_join_code();
    exit when not exists (select 1 from teams where join_code = c);
  end loop;
  update teams set join_code = c where id = p_team;
  return c;
end $$;
revoke execute on function public.regenerate_join_code(uuid) from anon, public;

-- Essais ratés de code (aucune lecture côté client)
create table if not exists public.join_attempts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists join_attempts_user_idx on public.join_attempts (user_id, created_at desc);
alter table public.join_attempts enable row level security;

-- Un code inconnu renvoie null (au lieu d'une erreur) pour que l'essai raté reste enregistré
create or replace function public.join_team(p_code text) returns public.teams
language plpgsql security definer set search_path = public as $$
declare t public.teams;
begin
  if auth.uid() is null then raise exception 'Non connecté'; end if;
  if (select count(*) from join_attempts where user_id = auth.uid() and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Trop d''essais de code : réessaie dans une heure';
  end if;
  select * into t from teams where join_code = upper(trim(p_code));
  if not found then
    insert into join_attempts (user_id) values (auth.uid());
    return null;
  end if;
  insert into team_members (team_id, user_id, role, status) values (t.id, auth.uid(), 'player', 'pending')
  on conflict do nothing;
  return t;
end $$;
revoke execute on function public.join_team(text) from anon, public;
