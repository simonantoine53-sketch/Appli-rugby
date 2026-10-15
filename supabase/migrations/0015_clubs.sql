-- Niveau Club : un club regroupe des équipes. On rejoint le club (code club), puis ses équipes
-- (demande comme joueur ou comme coach / encadrant). Les rôles restent par équipe ;
-- la direction du club (« responsable ») a les droits d'un coach dans toutes les équipes du club.
-- Création de club : super-admin, ou tout le monde si l'interrupteur « club_creation » est ouvert.
-- Reprise : « SCB » devient l'équipe « Séniors » du club « SC Bernay » ; « Test RC » devient un club de test.
-- Appliqué sur le projet « Appli Rugby Strat » le 2026-10-15.

create table if not exists public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 60),
  join_code text not null unique default public.gen_join_code(),
  settings jsonb not null default '{}'::jsonb check (pg_column_size(settings) < 300000),
  season_start text not null default '07-01' check (season_start ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.club_members (
  club_id uuid not null references public.clubs(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('member', 'responsable')),
  joined_at timestamptz not null default now(),
  primary key (club_id, user_id)
);
create index if not exists club_members_user_idx on public.club_members (user_id);
alter table public.teams add column if not exists club_id uuid references public.clubs(id) on delete cascade;
create index if not exists teams_club_idx on public.teams (club_id);
alter table public.team_members add column if not exists requested_as text check (requested_as in ('player', 'staff'));
alter table public.clubs enable row level security;
alter table public.club_members enable row level security;

-- Droits
create or replace function public.team_club(t uuid) returns uuid
language sql stable security definer set search_path = public as $f$ select club_id from teams where id = t $f$;
create or replace function public.is_club_member(c uuid) returns boolean
language sql stable security definer set search_path = public as $f$
  select exists (select 1 from club_members where club_id = c and user_id = auth.uid()) or public.is_superadmin() $f$;
create or replace function public.is_club_admin(c uuid) returns boolean
language sql stable security definer set search_path = public as $f$
  select exists (select 1 from club_members where club_id = c and user_id = auth.uid() and role = 'responsable') or public.is_superadmin() $f$;
create or replace function public.is_member(t uuid) returns boolean
language sql stable security definer set search_path = public as $f$
  select exists (select 1 from team_members where team_id = t and user_id = auth.uid() and status = 'active') or public.is_club_admin(public.team_club(t)) $f$;
create or replace function public.is_coach(t uuid) returns boolean
language sql stable security definer set search_path = public as $f$
  select exists (select 1 from team_members where team_id = t and user_id = auth.uid() and role = 'coach' and status = 'active') or public.is_club_admin(public.team_club(t)) $f$;
create or replace function public.is_staff(t uuid) returns boolean
language sql stable security definer set search_path = public as $f$
  select exists (select 1 from team_members where team_id = t and user_id = auth.uid() and role in ('coach', 'admin') and status = 'active') or public.is_club_admin(public.team_club(t)) $f$;
create or replace function public.is_staff_of(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $f$
  select exists (
    select 1 from team_members me join team_members them on them.team_id = me.team_id
    where me.user_id = auth.uid() and me.status = 'active' and me.role in ('coach', 'admin')
      and them.user_id = p_user and them.status in ('active', 'pending')
  ) or exists (
    select 1 from club_members me join club_members them on them.club_id = me.club_id
    where me.user_id = auth.uid() and me.role = 'responsable' and them.user_id = p_user
  ) or public.is_superadmin() $f$;
create or replace function public.shares_team_with(u uuid) returns boolean
language sql stable security definer set search_path = public as $f$
  select exists (
    select 1 from team_members a join team_members b on a.team_id = b.team_id
    where a.user_id = auth.uid() and b.user_id = u and a.status = 'active'
  ) or exists (
    select 1 from club_members a join club_members b on a.club_id = b.club_id
    where a.user_id = auth.uid() and b.user_id = u and (a.role = 'responsable' or b.role = 'responsable')
  ) or public.is_superadmin() $f$;
revoke execute on function public.team_club(uuid), public.is_club_member(uuid), public.is_club_admin(uuid) from anon, public;

-- Politiques
revoke update on public.teams from authenticated;
grant update (name, share_default, sheet_settings, calendar_club) on public.teams to authenticated;
alter policy teams_select on public.teams using (public.is_member(id) or public.is_pending(id) or public.is_club_member(club_id));
alter policy teams_delete on public.teams using (public.is_club_admin(club_id));
create policy clubs_select on public.clubs for select to authenticated using (public.is_club_member(id));
create policy clubs_update on public.clubs for update to authenticated using (public.is_club_admin(id)) with check (public.is_club_admin(id));
revoke update on public.clubs from authenticated;
grant update (name, settings, season_start) on public.clubs to authenticated;
create policy club_members_select on public.club_members for select to authenticated
  using (user_id = auth.uid() or role = 'responsable' and public.is_club_member(club_id) or public.is_club_admin(club_id));
create policy club_members_update on public.club_members for update to authenticated
  using (public.is_club_admin(club_id)) with check (public.is_club_admin(club_id));
create policy club_members_remove on public.club_members for delete to authenticated using (public.is_club_admin(club_id) or user_id = auth.uid());
revoke update on public.club_members from authenticated;
grant update (role) on public.club_members to authenticated;

-- Faire partie d'une équipe (ou le demander) = faire partie de son club
create or replace function public.ensure_club_member() returns trigger
language plpgsql security definer set search_path = public as $f$
begin
  insert into club_members (club_id, user_id) select t.club_id, new.user_id from teams t where t.id = new.team_id and t.club_id is not null
  on conflict do nothing;
  return new;
end $f$;
revoke execute on function public.ensure_club_member() from anon, public, authenticated;
create or replace trigger team_members_club after insert on public.team_members for each row execute function public.ensure_club_member();

-- Fonctions (création, codes, demandes, responsables, back-office)
create or replace function public.club_creation_open() returns boolean
language sql stable security definer set search_path = public as $f$
  select exists (select 1 from feature_flags where key = 'club_creation' and team_id is null and enabled) $f$;

create or replace function public.create_club(p_name text, p_team text default null) returns public.clubs
language plpgsql security definer set search_path = public as $f$
declare c public.clubs; t public.teams; me uuid := auth.uid();
begin
  if me is null then raise exception 'Non connecté'; end if;
  if not public.is_superadmin() and not public.club_creation_open() then
    raise exception 'La création de club se fait sur invitation. Demandez un code à votre club.';
  end if;
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Nom de club trop court'; end if;
  insert into clubs (name, created_by) values (trim(p_name), me) returning * into c;
  if not public.is_superadmin() then insert into club_members (club_id, user_id, role) values (c.id, me, 'responsable'); end if;
  if length(trim(coalesce(p_team, ''))) >= 2 then
    insert into teams (name, created_by, club_id) values (trim(p_team), me, c.id) returning * into t;
    if not public.is_superadmin() then insert into team_members (team_id, user_id, role) values (t.id, me, 'coach'); end if;
  end if;
  return c;
end $f$;

create or replace function public.create_team(p_name text) returns public.teams
language plpgsql security definer set search_path = public as $f$
declare c public.clubs; t public.teams;
begin
  c := public.create_club(p_name, p_name);
  select * into t from teams where club_id = c.id order by created_at limit 1;
  return t;
end $f$;

create or replace function public.create_club_team(p_club uuid, p_name text) returns public.teams
language plpgsql security definer set search_path = public as $f$
declare t public.teams;
begin
  if not public.is_club_admin(p_club) then raise exception 'Réservé à la direction du club'; end if;
  if length(trim(coalesce(p_name, ''))) < 2 then raise exception 'Nom d''équipe trop court'; end if;
  insert into teams (name, created_by, club_id) values (trim(p_name), auth.uid(), p_club) returning * into t;
  return t;
end $f$;

create or replace function public.join_with_code(p_code text) returns json
language plpgsql security definer set search_path = public as $f$
declare me uuid := auth.uid(); c public.clubs; t public.teams; code text := upper(trim(coalesce(p_code, '')));
begin
  if me is null then raise exception 'Non connecté'; end if;
  if (select count(*) from join_attempts where user_id = me and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Trop d''essais de code : réessayez dans une heure';
  end if;
  select * into c from clubs where join_code = code;
  if found then
    insert into club_members (club_id, user_id) values (c.id, me) on conflict do nothing;
    return json_build_object('kind', 'club', 'id', c.id, 'name', c.name);
  end if;
  select * into t from teams where join_code = code;
  if found then
    insert into team_members (team_id, user_id, role, status, requested_as) values (t.id, me, 'player', 'pending', 'player') on conflict do nothing;
    return json_build_object('kind', 'team', 'id', t.id, 'name', t.name, 'club_id', t.club_id);
  end if;
  insert into join_attempts (user_id) values (me);
  return null;
end $f$;

create or replace function public.request_team(p_team uuid, p_as text) returns void
language plpgsql security definer set search_path = public as $f$
begin
  if auth.uid() is null then raise exception 'Non connecté'; end if;
  if p_as not in ('player', 'staff') then raise exception 'Demande invalide'; end if;
  if not public.is_club_member(public.team_club(p_team)) then raise exception 'Rejoignez d''abord le club'; end if;
  insert into team_members (team_id, user_id, role, status, requested_as) values (p_team, auth.uid(), 'player', 'pending', p_as)
  on conflict (team_id, user_id) do update set requested_as = excluded.requested_as where team_members.status = 'pending';
end $f$;

create or replace function public.regenerate_club_code(p_club uuid) returns text
language plpgsql security definer set search_path = public as $f$
declare c text;
begin
  if not public.is_club_admin(p_club) then raise exception 'Réservé à la direction du club'; end if;
  loop
    c := public.gen_join_code();
    exit when not exists (select 1 from clubs where join_code = c) and not exists (select 1 from teams where join_code = c);
  end loop;
  update clubs set join_code = c where id = p_club;
  return c;
end $f$;

create or replace function public.set_club_role(p_club uuid, p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $f$
begin
  if not public.is_club_admin(p_club) then raise exception 'Réservé à la direction du club'; end if;
  if p_role not in ('member', 'responsable') then raise exception 'Rôle invalide'; end if;
  insert into club_members (club_id, user_id, role) values (p_club, p_user, p_role)
  on conflict (club_id, user_id) do update set role = excluded.role;
end $f$;

create or replace function public.admin_clubs() returns table (id uuid, name text, join_code text, created_at timestamptz, teams bigint, members bigint, responsables json)
language sql stable security definer set search_path = public as $f$
  select c.id, c.name, c.join_code, c.created_at,
    (select count(*) from teams t where t.club_id = c.id),
    (select count(*) from club_members m where m.club_id = c.id),
    (select coalesce(json_agg(json_build_object('user_id', m.user_id, 'name', p.display_name) order by p.display_name), '[]'::json)
       from club_members m join profiles p on p.id = m.user_id where m.club_id = c.id and m.role = 'responsable')
  from clubs c where public.is_superadmin() order by c.name $f$;

revoke execute on function public.club_creation_open(), public.create_club(text, text), public.create_club_team(uuid, text), public.join_with_code(text),
  public.request_team(uuid, text), public.regenerate_club_code(uuid), public.set_club_role(uuid, uuid, text), public.admin_clubs() from anon, public;

-- Reprise des données existantes
with c as (insert into clubs (name) values ('SC Bernay') returning id)
update teams set club_id = (select id from c), name = 'Séniors' where name = 'SCB' and club_id is null;
with c as (insert into clubs (name) values ('Test RC') returning id)
update teams set club_id = (select id from c) where name = 'Test RC' and club_id is null;
insert into club_members (club_id, user_id) select t.club_id, m.user_id from team_members m join teams t on t.id = m.team_id where t.club_id is not null on conflict do nothing;
alter table public.teams alter column club_id set not null;
-- Club de test : « Joueur Test » est responsable de Test RC (pour vérifier les droits de la direction)
