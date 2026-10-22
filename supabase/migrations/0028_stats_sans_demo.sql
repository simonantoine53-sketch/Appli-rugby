-- Back-office : les données du club démo (RC Démo, 22 comptes fictifs, identifiants fixes « d0000000-0000-4000-8000-… »,
-- recréées chaque semaine par demo_reset) ne comptent plus dans les statistiques ni dans les listes du super-admin.
-- Nouvelle statistique anonyme : nombre d'ouvertures de la démo (comme coach ou comme joueur) et de comptes créés après.

create or replace function public.is_demo(u uuid) returns boolean
language sql immutable set search_path = public as $$ select coalesce(u::text like 'd0000000-0000-4000-8000-%', false) $$;

-- Copies filtrées des tables, sans la démo. Les fonctions du back-office les lisent en premier (search_path « stats, public »),
-- sans changer leur code. Ce schéma n'est pas ouvert à l'API.
create schema if not exists stats;
revoke all on schema stats from public, anon, authenticated;
create or replace view stats.profiles as select * from public.profiles where not public.is_demo(id);
create or replace view stats.teams as select * from public.teams where not public.is_demo(id);
create or replace view stats.clubs as select * from public.clubs where not public.is_demo(id);
create or replace view stats.team_members as select * from public.team_members where not public.is_demo(team_id) and not public.is_demo(user_id);
create or replace view stats.club_members as select * from public.club_members where not public.is_demo(club_id) and not public.is_demo(user_id);
create or replace view stats.drawings as select * from public.drawings where not public.is_demo(owner_id) and not public.is_demo(team_id);
create or replace view stats.drawing_views as select * from public.drawing_views where not public.is_demo(user_id);
create or replace view stats.drawing_comments as select * from public.drawing_comments where not public.is_demo(user_id);
create or replace view stats.team_events as select * from public.team_events where not public.is_demo(team_id);
create or replace view stats.event_responses as select * from public.event_responses where not public.is_demo(user_id);
create or replace view stats.match_sheets as select * from public.match_sheets where not public.is_demo(team_id);
revoke all on all tables in schema stats from public, anon, authenticated;

alter function public.admin_metrics(integer) set search_path = stats, public;
alter function public.admin_users() set search_path = stats, public;
alter function public.admin_teams() set search_path = stats, public;
alter function public.admin_clubs() set search_path = stats, public;
alter function public.admin_drawings() set search_path = stats, public;
alter function public.admin_pending_requests() set search_path = stats, public;

-- admin_overview lit aussi auth.users : on y écarte la démo directement
create or replace function public.admin_overview() returns json
language plpgsql stable security definer set search_path = stats, public as $$
declare r json;
begin
  if not public.is_superadmin() then raise exception 'Réservé aux super-admins'; end if;
  select json_build_object(
    'users', (select count(*) from profiles),
    'users_7d', (select count(*) from auth.users where created_at > now() - interval '7 days' and not public.is_demo(id)),
    'teams', (select count(*) from teams),
    'members_pending', (select count(*) from team_members where status = 'pending'),
    'drawings', (select count(*) from drawings),
    'drawings_by_visibility', (select coalesce(json_object_agg(visibility, n), '{}'::json) from (select visibility, count(*) n from drawings group by visibility) x),
    'drawings_7d', (select count(*) from drawings where created_at > now() - interval '7 days'),
    'formations', (select count(*) from formations),
    'feedback_new', (select count(*) from feedback where status = 'new'),
    'errors_7d', (select count(*) from client_errors where created_at > now() - interval '7 days'),
    'active_1d', (select count(distinct user_id) from usage_sessions where last_seen_at > now() - interval '1 day'),
    'active_7d', (select count(distinct user_id) from usage_sessions where last_seen_at > now() - interval '7 days'),
    'active_30d', (select count(distinct user_id) from usage_sessions where last_seen_at > now() - interval '30 days'),
    'sessions_30d', (select count(*) from usage_sessions where last_seen_at > now() - interval '30 days'),
    'avg_session_s', (select coalesce(round(avg(seconds)), 0) from usage_sessions where last_seen_at > now() - interval '30 days' and seconds > 0),
    'total_hours_30d', (select coalesce(round(sum(seconds) / 3600.0, 1), 0) from usage_sessions where last_seen_at > now() - interval '30 days'),
    'editor_share', (select case when sum(seconds) > 0 then round(100.0 * sum(editor_seconds) / sum(seconds)) else 0 end from usage_sessions where last_seen_at > now() - interval '30 days'),
    'devices_30d', (select coalesce(json_object_agg(device, n), '{}'::json) from (select device, count(*) n from usage_sessions where last_seen_at > now() - interval '30 days' group by device) x),
    'signups_by_week', (select coalesce(json_agg(json_build_object('week', w, 'n', n) order by w), '[]'::json) from (
        select to_char(date_trunc('week', created_at), 'YYYY-MM-DD') w, count(*) n from auth.users where created_at > now() - interval '12 weeks' and not public.is_demo(id) group by 1) x),
    'active_by_day', (select coalesce(json_agg(json_build_object('day', d, 'n', n) order by d), '[]'::json) from (
        select to_char(date_trunc('day', last_seen_at), 'YYYY-MM-DD') d, count(distinct user_id) n from usage_sessions where last_seen_at > now() - interval '30 days' group by 1) x),
    'events_30d', (select coalesce(json_agg(json_build_object('name', name, 'n', n) order by n desc), '[]'::json) from (
        select name, count(*) n from events where created_at > now() - interval '30 days' group by name) x),
    'tools_30d', (select coalesce(json_agg(json_build_object('name', t, 'n', n) order by n desc), '[]'::json) from (
        select props->>'tool' t, count(*) n from events where name = 'tool' and created_at > now() - interval '30 days' group by 1 order by n desc limit 15) x),
    'tool_groups_30d', (select coalesce(json_agg(json_build_object('name', g, 'n', n) order by n desc), '[]'::json) from (
        select coalesce(props->>'group', '?') g, count(*) n from events where name = 'tool' and created_at > now() - interval '30 days' group by 1) x),
    'exports_30d', (select coalesce(json_agg(json_build_object('name', k, 'n', n) order by n desc), '[]'::json) from (
        select coalesce(props->>'kind', '?') k, count(*) n from events where name = 'export' and created_at > now() - interval '30 days' group by 1) x),
    'fields', (select coalesce(json_agg(json_build_object('name', f, 'n', n) order by n desc), '[]'::json) from (
        select coalesce(data->'settings'->>'field', '?') || ' · ' || coalesce(data->'settings'->>'orientation', '?') f, count(*) n from drawings group by 1) x),
    'categories', (select coalesce(json_agg(json_build_object('name', c, 'n', n) order by n desc), '[]'::json) from (
        select coalesce(nullif(data->>'category', ''), 'Sans catégorie') c, count(*) n from drawings group by 1) x),
    'avg_steps', (select coalesce(round(avg(jsonb_array_length(data->'steps')), 1), 0) from drawings where jsonb_typeof(data->'steps') = 'array')
  ) into r;
  return r;
end $$;

-- Compteur anonyme de la démo (aucun identifiant, comme page_counts) : ouvertures comme coach ou joueur,
-- et comptes créés sur un appareil où la démo avait été ouverte dans les 30 jours.
create table if not exists public.demo_counts (
  day date not null,
  kind text not null check (kind in ('coach', 'joueur', 'inscription')),
  n integer not null default 0,
  primary key (day, kind)
);
alter table public.demo_counts enable row level security;   -- aucune règle : lu et écrit seulement par les fonctions ci-dessous

create or replace function public.count_demo(p_kind text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_kind not in ('coach', 'joueur', 'inscription') then return; end if;
  insert into demo_counts (day, kind, n) values ((now() at time zone 'Europe/Paris')::date, p_kind, 1)
  on conflict (day, kind) do update set n = demo_counts.n + 1;
end $$;
revoke execute on function public.count_demo(text) from public;
grant execute on function public.count_demo(text) to anon, authenticated;

create or replace function public.admin_demo_stats(p_weeks integer default 12) returns json
language plpgsql stable security definer set search_path = public as $$
declare
  w0 date := date_trunc('week', (now() at time zone 'Europe/Paris')::date)::date;
  wfrom date := w0 - (greatest(1, least(coalesce(p_weeks, 12), 60)) - 1) * 7;
  out json;
begin
  if not public.is_superadmin() then raise exception 'Réservé au super-admin'; end if;
  with weeks as (select generate_series(wfrom, w0, interval '1 week')::date w)
  select json_build_object(
    'weeks', (select json_agg(w order by w) from weeks),
    'coach', (select json_agg(coalesce((select sum(n) from demo_counts c where c.kind = 'coach' and c.day >= weeks.w and c.day < weeks.w + 7), 0) order by w) from weeks),
    'joueur', (select json_agg(coalesce((select sum(n) from demo_counts c where c.kind = 'joueur' and c.day >= weeks.w and c.day < weeks.w + 7), 0) order by w) from weeks),
    'inscription', (select json_agg(coalesce((select sum(n) from demo_counts c where c.kind = 'inscription' and c.day >= weeks.w and c.day < weeks.w + 7), 0) order by w) from weeks),
    'total', (select coalesce(json_object_agg(kind, n), '{}'::json) from (select kind, sum(n) n from demo_counts where day >= wfrom group by kind) s)
  ) into out;
  return out;
end $$;
revoke execute on function public.admin_demo_stats(integer) from public, anon;
grant execute on function public.admin_demo_stats(integer) to authenticated;
