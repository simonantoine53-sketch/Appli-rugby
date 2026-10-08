-- Comptes, équipes, rôles et partage des stratégies.
-- Rôles : coach (publie à l'équipe, gère les membres) / player (dessins privés, propositions au coach).

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  join_code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'player' check (role in ('coach', 'player')),
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create table if not exists public.drawings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  title text not null default 'Sans titre',
  data jsonb not null,
  visibility text not null default 'private' check (visibility in ('private', 'proposed', 'team')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists drawings_team_idx on public.drawings (team_id, visibility);
create index if not exists drawings_owner_idx on public.drawings (owner_id);

-- Fonctions utilitaires (security definer pour éviter la récursion des politiques)
create or replace function public.is_member(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from team_members where team_id = t and user_id = auth.uid());
$$;

create or replace function public.is_coach(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from team_members where team_id = t and user_id = auth.uid() and role = 'coach');
$$;

create or replace function public.shares_team_with(u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from team_members a join team_members b on a.team_id = b.team_id
    where a.user_id = auth.uid() and b.user_id = u
  );
$$;

-- Profil créé automatiquement à l'inscription
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- updated_at automatique
create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists drawings_updated_at on public.drawings;
create trigger drawings_updated_at before update on public.drawings
  for each row execute function public.set_updated_at();

-- Créer une équipe : le créateur devient coach
create or replace function public.create_team(p_name text) returns public.teams
language plpgsql security definer set search_path = public as $$
declare t public.teams;
begin
  if auth.uid() is null then raise exception 'Non connecté'; end if;
  if length(trim(p_name)) < 2 then raise exception 'Nom d''équipe trop court'; end if;
  insert into teams (name, created_by) values (trim(p_name), auth.uid()) returning * into t;
  insert into team_members (team_id, user_id, role) values (t.id, auth.uid(), 'coach');
  return t;
end $$;

-- Rejoindre une équipe avec son code : on devient joueur
create or replace function public.join_team(p_code text) returns public.teams
language plpgsql security definer set search_path = public as $$
declare t public.teams;
begin
  if auth.uid() is null then raise exception 'Non connecté'; end if;
  select * into t from teams where join_code = upper(trim(p_code));
  if not found then raise exception 'Code d''équipe invalide'; end if;
  insert into team_members (team_id, user_id, role) values (t.id, auth.uid(), 'player')
  on conflict do nothing;
  return t;
end $$;

-- Politiques RLS
alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.drawings enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_team_with(id));
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists teams_select on public.teams;
create policy teams_select on public.teams for select to authenticated using (public.is_member(id));
drop policy if exists teams_update on public.teams;
create policy teams_update on public.teams for update to authenticated
  using (public.is_coach(id)) with check (public.is_coach(id));
drop policy if exists teams_delete on public.teams;
create policy teams_delete on public.teams for delete to authenticated using (public.is_coach(id));

drop policy if exists members_select on public.team_members;
create policy members_select on public.team_members for select to authenticated using (public.is_member(team_id));
drop policy if exists members_update on public.team_members;
create policy members_update on public.team_members for update to authenticated
  using (public.is_coach(team_id)) with check (public.is_coach(team_id));
drop policy if exists members_delete on public.team_members;
create policy members_delete on public.team_members for delete to authenticated
  using (user_id = auth.uid() or public.is_coach(team_id));

drop policy if exists drawings_select on public.drawings;
create policy drawings_select on public.drawings for select to authenticated using (
  owner_id = auth.uid()
  or (visibility = 'team' and public.is_member(team_id))
  or (visibility = 'proposed' and public.is_coach(team_id))
);
drop policy if exists drawings_insert on public.drawings;
create policy drawings_insert on public.drawings for insert to authenticated with check (
  owner_id = auth.uid()
  and (team_id is null or public.is_member(team_id))
  and (visibility <> 'team' or public.is_coach(team_id))
);
drop policy if exists drawings_update on public.drawings;
create policy drawings_update on public.drawings for update to authenticated
  using (owner_id = auth.uid() or public.is_coach(team_id))
  with check (
    (owner_id = auth.uid() or public.is_coach(team_id))
    and (team_id is null or public.is_member(team_id))
    and (visibility <> 'team' or public.is_coach(team_id))
  );
drop policy if exists drawings_delete on public.drawings;
create policy drawings_delete on public.drawings for delete to authenticated
  using (owner_id = auth.uid() or public.is_coach(team_id));

-- Temps réel sur les dessins (les politiques RLS s'appliquent aussi aux événements)
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'drawings') then
    alter publication supabase_realtime add table public.drawings;
  end if;
end $$;

-- Liens vers les profils (pour joindre les noms côté client) et ligne complète dans les événements temps réel
alter table public.drawings add constraint drawings_owner_profile_fk foreign key (owner_id) references public.profiles(id) on delete cascade;
alter table public.team_members add constraint team_members_user_profile_fk foreign key (user_id) references public.profiles(id) on delete cascade;
alter table public.drawings replica identity full;

-- Les fonctions sensibles ne sont pas appelables par les visiteurs non connectés
revoke execute on function public.create_team(text), public.join_team(text), public.is_member(uuid), public.is_coach(uuid), public.shares_team_with(uuid), public.handle_new_user(), public.set_updated_at() from anon, public;
revoke execute on function public.handle_new_user(), public.set_updated_at() from authenticated;

-- ---------------------------------------------------------------
-- 0002 : rôles (coach / admin / joueur), demandes d'adhésion, super-admin
-- ---------------------------------------------------------------
alter table public.profiles add column if not exists is_superadmin boolean not null default false;
alter table public.team_members add column if not exists status text not null default 'active';
alter table public.team_members drop constraint if exists team_members_role_check;
alter table public.team_members add constraint team_members_role_check check (role in ('coach', 'admin', 'player'));
alter table public.team_members add constraint team_members_status_check check (status in ('pending', 'active'));

create or replace function public.is_superadmin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_superadmin from profiles where id = auth.uid()), false);
$$;
create or replace function public.is_member(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from team_members where team_id = t and user_id = auth.uid() and status = 'active') or public.is_superadmin();
$$;
create or replace function public.is_coach(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from team_members where team_id = t and user_id = auth.uid() and role = 'coach' and status = 'active') or public.is_superadmin();
$$;
create or replace function public.is_staff(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from team_members where team_id = t and user_id = auth.uid() and role in ('coach', 'admin') and status = 'active') or public.is_superadmin();
$$;
create or replace function public.is_pending(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from team_members where team_id = t and user_id = auth.uid() and status = 'pending');
$$;
create or replace function public.shares_team_with(u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from team_members a join team_members b on a.team_id = b.team_id
    where a.user_id = auth.uid() and b.user_id = u and a.status = 'active'
  ) or public.is_superadmin();
$$;
-- L'adhésion par code crée une demande en attente, validée par un coach ou un admin
create or replace function public.join_team(p_code text) returns public.teams
language plpgsql security definer set search_path = public as $$
declare t public.teams;
begin
  if auth.uid() is null then raise exception 'Non connecté'; end if;
  select * into t from teams where join_code = upper(trim(p_code));
  if not found then raise exception 'Code d''équipe invalide'; end if;
  insert into team_members (team_id, user_id, role, status) values (t.id, auth.uid(), 'player', 'pending')
  on conflict do nothing;
  return t;
end $$;
revoke execute on function public.is_superadmin(), public.is_staff(uuid), public.is_pending(uuid) from anon, public;

alter policy teams_select on public.teams using (public.is_member(id) or public.is_pending(id));
alter policy teams_update on public.teams using (public.is_staff(id)) with check (public.is_staff(id));
alter policy teams_delete on public.teams using (public.is_staff(id));
alter policy members_select on public.team_members using (public.is_member(team_id) or user_id = auth.uid());
alter policy members_update on public.team_members using (public.is_staff(team_id)) with check (public.is_staff(team_id));
alter policy members_delete on public.team_members using (user_id = auth.uid() or public.is_staff(team_id));

-- Super-administrateur initial (compte « Toutoune »)
-- update public.profiles set is_superadmin = true where id = '<uuid du compte>';
