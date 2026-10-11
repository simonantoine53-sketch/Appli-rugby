-- Back-office super-admin : verrou de sécurité, retours utilisateurs, statistiques d'usage,
-- erreurs clients, annonces, drapeaux de fonctionnalités et fonctions d'administration.
-- Appliqué sur le projet « Appli Rugby Strat » le 2026-10-11.

-- ---------------------------------------------------------------
-- 1. Verrou : personne ne peut se promouvoir super-admin
-- ---------------------------------------------------------------
-- a) Droits de colonne : un utilisateur connecté ne peut modifier que son nom d'affichage.
revoke update on public.profiles from authenticated;
grant update (display_name) on public.profiles to authenticated;

-- b) Ceinture et bretelles : un trigger refuse tout changement de is_superadmin
--    qui ne vient pas d'un super-admin (ou du serveur : SQL editor, service role, auth.uid() nul).
create or replace function public.protect_superadmin_flag() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.is_superadmin is distinct from old.is_superadmin
     and auth.uid() is not null and not public.is_superadmin() then
    raise exception 'Modification du statut super-admin refusée';
  end if;
  return new;
end $$;
drop trigger if exists profiles_protect_superadmin on public.profiles;
create trigger profiles_protect_superadmin before update on public.profiles
  for each row execute function public.protect_superadmin_flag();
revoke execute on function public.protect_superadmin_flag() from anon, public, authenticated;

-- Promouvoir / rétrograder un super-admin (réservé aux super-admins, jamais le dernier)
create or replace function public.admin_set_superadmin(p_user uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_superadmin() then raise exception 'Réservé aux super-admins'; end if;
  if not p_on and (select count(*) from profiles where is_superadmin) <= 1 and (select is_superadmin from profiles where id = p_user) then
    raise exception 'Impossible de retirer le dernier super-admin';
  end if;
  update profiles set is_superadmin = p_on where id = p_user;
end $$;
revoke execute on function public.admin_set_superadmin(uuid, boolean) from anon, public;

-- ---------------------------------------------------------------
-- 2. Retours utilisateurs
-- ---------------------------------------------------------------
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  team_id uuid references public.teams(id) on delete set null,
  kind text not null default 'idea' check (kind in ('bug', 'idea', 'other')),
  message text not null check (length(message) between 3 and 2000),
  context jsonb not null default '{}'::jsonb,
  status text not null default 'new' check (status in ('new', 'seen', 'planned', 'done', 'rejected')),
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists feedback_status_idx on public.feedback (status, created_at desc);
drop trigger if exists feedback_updated_at on public.feedback;
create trigger feedback_updated_at before update on public.feedback for each row execute function public.set_updated_at();
alter table public.feedback enable row level security;
drop policy if exists feedback_select on public.feedback;
create policy feedback_select on public.feedback for select to authenticated
  using (user_id = auth.uid() or public.is_superadmin());
drop policy if exists feedback_insert on public.feedback;
create policy feedback_insert on public.feedback for insert to authenticated
  with check (user_id = auth.uid() and status = 'new' and admin_note is null);
drop policy if exists feedback_update on public.feedback;
create policy feedback_update on public.feedback for update to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());
drop policy if exists feedback_delete on public.feedback;
create policy feedback_delete on public.feedback for delete to authenticated
  using (user_id = auth.uid() or public.is_superadmin());

-- ---------------------------------------------------------------
-- 3. Statistiques d'usage : événements et sessions
-- ---------------------------------------------------------------
create table if not exists public.events (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  name text not null check (length(name) between 1 and 40),
  props jsonb not null default '{}'::jsonb,
  device text not null default 'desktop' check (device in ('desktop', 'mobile')),
  created_at timestamptz not null default now()
);
create index if not exists events_created_idx on public.events (created_at desc);
create index if not exists events_name_idx on public.events (name, created_at desc);
create index if not exists events_user_idx on public.events (user_id, created_at desc);
alter table public.events enable row level security;
drop policy if exists events_insert on public.events;
create policy events_insert on public.events for insert to authenticated with check (user_id = auth.uid());
drop policy if exists events_select on public.events;
create policy events_select on public.events for select to authenticated using (public.is_superadmin());
drop policy if exists events_delete on public.events;
create policy events_delete on public.events for delete to authenticated using (public.is_superadmin());

-- Une ligne par session d'utilisation ; le client la met à jour toutes les 60 s quand l'onglet est visible.
create table if not exists public.usage_sessions (
  id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  device text not null default 'desktop' check (device in ('desktop', 'mobile')),
  build text,
  seconds integer not null default 0 check (seconds >= 0 and seconds < 86400),
  editor_seconds integer not null default 0 check (editor_seconds >= 0 and editor_seconds <= seconds),
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists usage_sessions_user_idx on public.usage_sessions (user_id, last_seen_at desc);
create index if not exists usage_sessions_seen_idx on public.usage_sessions (last_seen_at desc);
alter table public.usage_sessions enable row level security;
drop policy if exists sessions_insert on public.usage_sessions;
create policy sessions_insert on public.usage_sessions for insert to authenticated with check (user_id = auth.uid());
drop policy if exists sessions_update on public.usage_sessions;
create policy sessions_update on public.usage_sessions for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists sessions_select on public.usage_sessions;
create policy sessions_select on public.usage_sessions for select to authenticated
  using (user_id = auth.uid() or public.is_superadmin());

-- ---------------------------------------------------------------
-- 4. Erreurs JavaScript remontées par les clients
-- ---------------------------------------------------------------
create table if not exists public.client_errors (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete set null,
  message text not null check (length(message) <= 1000),
  stack text check (length(stack) <= 4000),
  url text,
  build text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists client_errors_created_idx on public.client_errors (created_at desc);
alter table public.client_errors enable row level security;
drop policy if exists errors_insert on public.client_errors;
create policy errors_insert on public.client_errors for insert to authenticated with check (user_id = auth.uid());
drop policy if exists errors_select on public.client_errors;
create policy errors_select on public.client_errors for select to authenticated using (public.is_superadmin());
drop policy if exists errors_delete on public.client_errors;
create policy errors_delete on public.client_errors for delete to authenticated using (public.is_superadmin());

-- ---------------------------------------------------------------
-- 5. Annonces (bandeau) globales ou par équipe
-- ---------------------------------------------------------------
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  message text not null check (length(message) between 1 and 300),
  level text not null default 'info' check (level in ('info', 'warning')),
  team_id uuid references public.teams(id) on delete cascade,
  active boolean not null default true,
  ends_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.announcements enable row level security;
drop policy if exists announcements_select on public.announcements;
create policy announcements_select on public.announcements for select to authenticated
  using (public.is_superadmin() or (active and (ends_at is null or ends_at > now()) and (team_id is null or public.is_member(team_id))));
drop policy if exists announcements_write on public.announcements;
create policy announcements_write on public.announcements for all to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());

-- ---------------------------------------------------------------
-- 6. Drapeaux de fonctionnalités (globaux ou par équipe)
-- ---------------------------------------------------------------
create table if not exists public.feature_flags (
  key text not null check (key ~ '^[a-z0-9_-]{2,40}$'),
  team_id uuid references public.teams(id) on delete cascade,
  enabled boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  primary key (key, team_id)
);
create unique index if not exists feature_flags_global_idx on public.feature_flags (key) where team_id is null;
alter table public.feature_flags enable row level security;
drop policy if exists flags_select on public.feature_flags;
create policy flags_select on public.feature_flags for select to authenticated
  using (public.is_superadmin() or team_id is null or public.is_member(team_id));
drop policy if exists flags_write on public.feature_flags;
create policy flags_write on public.feature_flags for all to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());

-- ---------------------------------------------------------------
-- 7. Fonctions d'administration (lecture globale, réservée aux super-admins)
-- ---------------------------------------------------------------
create or replace function public.admin_overview() returns json
language plpgsql stable security definer set search_path = public as $$
declare r json;
begin
  if not public.is_superadmin() then raise exception 'Réservé aux super-admins'; end if;
  select json_build_object(
    'users', (select count(*) from profiles),
    'users_7d', (select count(*) from auth.users where created_at > now() - interval '7 days'),
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
        select to_char(date_trunc('week', created_at), 'YYYY-MM-DD') w, count(*) n from auth.users where created_at > now() - interval '12 weeks' group by 1) x),
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

create or replace function public.admin_teams() returns table (
  id uuid, name text, join_code text, created_at timestamptz, created_by_name text,
  members bigint, pending bigint, coaches bigint, published bigint, drawings bigint, last_activity timestamptz
) language sql stable security definer set search_path = public as $$
  select t.id, t.name, t.join_code, t.created_at, coalesce(p.display_name, ''),
    (select count(*) from team_members m where m.team_id = t.id and m.status = 'active'),
    (select count(*) from team_members m where m.team_id = t.id and m.status = 'pending'),
    (select count(*) from team_members m where m.team_id = t.id and m.status = 'active' and m.role = 'coach'),
    (select count(*) from drawings d where d.team_id = t.id and d.visibility = 'team'),
    (select count(*) from drawings d where d.team_id = t.id),
    greatest((select max(d.updated_at) from drawings d where d.team_id = t.id), (select max(m.joined_at) from team_members m where m.team_id = t.id), t.created_at)
  from teams t left join profiles p on p.id = t.created_by
  where public.is_superadmin()
  order by t.name;
$$;

create or replace function public.admin_users() returns table (
  id uuid, display_name text, email text, is_superadmin boolean, created_at timestamptz, last_sign_in_at timestamptz,
  last_seen_at timestamptz, drawings bigint, sessions_30d bigint, seconds_30d bigint, teams json
) language sql stable security definer set search_path = public as $$
  select p.id, p.display_name, u.email::text, p.is_superadmin, u.created_at, u.last_sign_in_at,
    (select max(s.last_seen_at) from usage_sessions s where s.user_id = p.id),
    (select count(*) from drawings d where d.owner_id = p.id),
    (select count(*) from usage_sessions s where s.user_id = p.id and s.last_seen_at > now() - interval '30 days'),
    (select coalesce(sum(s.seconds), 0) from usage_sessions s where s.user_id = p.id and s.last_seen_at > now() - interval '30 days'),
    (select coalesce(json_agg(json_build_object('team_id', t.id, 'name', t.name, 'role', m.role, 'status', m.status) order by t.name), '[]'::json)
       from team_members m join teams t on t.id = m.team_id where m.user_id = p.id)
  from profiles p join auth.users u on u.id = p.id
  where public.is_superadmin()
  order by u.created_at desc;
$$;

create or replace function public.admin_pending_requests() returns table (
  team_id uuid, team_name text, user_id uuid, user_name text, joined_at timestamptz
) language sql stable security definer set search_path = public as $$
  select m.team_id, t.name, m.user_id, coalesce(p.display_name, ''), m.joined_at
  from team_members m join teams t on t.id = m.team_id left join profiles p on p.id = m.user_id
  where m.status = 'pending' and public.is_superadmin()
  order by m.joined_at;
$$;

-- Métadonnées de tous les dessins (jamais le contenu des dessins privés)
create or replace function public.admin_drawings() returns table (
  id uuid, title text, owner_name text, team_name text, team_id uuid, visibility text, category text,
  steps integer, objects integer, created_at timestamptz, updated_at timestamptz, published_at timestamptz
) language sql stable security definer set search_path = public as $$
  select d.id, d.title, coalesce(p.display_name, ''), coalesce(t.name, ''), d.team_id, d.visibility, coalesce(d.data->>'category', ''),
    case when jsonb_typeof(d.data->'steps') = 'array' then jsonb_array_length(d.data->'steps') else 0 end,
    coalesce((select sum(jsonb_array_length(s->'objects'))::int from jsonb_array_elements(case when jsonb_typeof(d.data->'steps') = 'array' then d.data->'steps' else '[]'::jsonb end) s where jsonb_typeof(s->'objects') = 'array'), 0),
    d.created_at, d.updated_at, d.published_at
  from drawings d left join profiles p on p.id = d.owner_id left join teams t on t.id = d.team_id
  where public.is_superadmin()
  order by d.updated_at desc;
$$;

-- Nouveau code d'invitation (coach, admin du club ou super-admin)
create or replace function public.regenerate_join_code(p_team uuid) returns text
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not public.is_staff(p_team) then raise exception 'Réservé au staff de l''équipe'; end if;
  c := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  update teams set join_code = c where id = p_team;
  return c;
end $$;

revoke execute on function public.admin_overview(), public.admin_teams(), public.admin_users(), public.admin_pending_requests(), public.admin_drawings(), public.regenerate_join_code(uuid) from anon, public;
