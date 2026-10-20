-- Schéma complet de Rugbeo : toutes les migrations 0001 à 0023, dans l'ordre.
-- Fichier généré par supabase/test/build-schema.js : ne pas modifier à la main.
-- À coller dans l'éditeur SQL d'une base de TEST vide (jamais sur la production, qui reçoit les migrations une par une).

-- =================================================================
-- 0001_comptes_equipes.sql
-- =================================================================
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

-- =================================================================
-- 0002_roles_adhesion_superadmin.sql
-- =================================================================
-- Rôles admin, adhésion validée (statut pending/active) et super-administrateur.
-- Appliqué sur le projet « Appli Rugby Strat » le 2026-10-08.

alter table public.profiles add column if not exists is_superadmin boolean not null default false;
alter table public.team_members add column if not exists status text not null default 'active';
alter table public.team_members drop constraint if exists team_members_role_check;
alter table public.team_members add constraint team_members_role_check check (role in ('coach', 'admin', 'player'));
alter table public.team_members drop constraint if exists team_members_status_check;
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
-- Rejoindre : la demande reste en attente jusqu'à validation par un coach ou un admin
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

-- Super-administrateur : compte Toutoune
update public.profiles set is_superadmin = true where id = '6cf0824c-8a60-462a-b4c9-f54313f94645';

-- Formations enregistrées (réutilisables), par équipe ou personnelles
create table if not exists public.formations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  team_id uuid references public.teams(id) on delete cascade,
  name text not null,
  data jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists formations_team_idx on public.formations (team_id);
alter table public.formations enable row level security;
create policy formations_select on public.formations for select to authenticated
  using (owner_id = auth.uid() or (team_id is not null and public.is_member(team_id)));
create policy formations_insert on public.formations for insert to authenticated
  with check (owner_id = auth.uid() and (team_id is null or public.is_member(team_id)));
create policy formations_update on public.formations for update to authenticated
  using (owner_id = auth.uid() or public.is_staff(team_id)) with check (owner_id = auth.uid() or public.is_staff(team_id));
create policy formations_delete on public.formations for delete to authenticated
  using (owner_id = auth.uid() or public.is_staff(team_id));

-- =================================================================
-- 0003_partage_commentaires.sql
-- =================================================================
-- Paquet 2 : lien de partage public (lecture seule) et commentaires des joueurs sous les stratégies publiées.
-- Déjà appliqué sur le projet « Appli Rugby Strat » ; conservé ici pour mémoire.

-- 1. Jeton de partage public sur un dessin (null = pas de partage)
alter table public.drawings add column if not exists share_token text unique;

-- Lecture anonyme d'un dessin par son jeton (pas besoin de compte)
create or replace function public.get_shared_drawing(p_token text)
returns json
language sql
security definer
set search_path = public
as $$
  select json_build_object(
    'title', d.title,
    'data', d.data,
    'published_at', d.published_at,
    'updated_at', d.updated_at,
    'owner_name', p.display_name,
    'team_name', t.name
  )
  from public.drawings d
  left join public.profiles p on p.id = d.owner_id
  left join public.teams t on t.id = d.team_id
  where d.share_token = p_token and length(p_token) >= 16
  limit 1;
$$;
grant execute on function public.get_shared_drawing(text) to anon, authenticated;

-- 2. Commentaires
create table if not exists public.drawing_comments (
  id uuid primary key default gen_random_uuid(),
  drawing_id uuid not null references public.drawings(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
alter table public.drawing_comments enable row level security;

-- Lecture : toute personne qui voit le dessin voit ses commentaires
create policy comments_select on public.drawing_comments for select to authenticated
  using (exists (select 1 from public.drawings d where d.id = drawing_id));
-- Écriture : uniquement sur les stratégies publiées à l'équipe, en son nom
create policy comments_insert on public.drawing_comments for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.drawings d where d.id = drawing_id and d.visibility = 'team'));
-- Suppression : son propre commentaire, ou le staff (coach / admin) de l'équipe du dessin
create policy comments_delete on public.drawing_comments for delete to authenticated
  using (user_id = auth.uid() or public.is_staff((select d.team_id from public.drawings d where d.id = drawing_id)));

-- =================================================================
-- 0004_notifications_push.sql
-- =================================================================
-- Paquet 3 : notifications push (Web Push). Déjà appliqué sur le projet « Appli Rugby Strat ».
-- La fonction Edge `push-notify` (supabase/functions/push-notify) lit les clés VAPID dans app_secrets
-- avec la clé service et envoie les notifications aux membres de l'équipe.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
create policy push_own_select on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
create policy push_own_insert on public.push_subscriptions for insert to authenticated with check (user_id = auth.uid());
create policy push_own_update on public.push_subscriptions for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy push_own_delete on public.push_subscriptions for delete to authenticated using (user_id = auth.uid());

-- Secrets lus uniquement par la clé service (RLS activée, aucune policy)
create table if not exists public.app_secrets (key text primary key, value text not null);
alter table public.app_secrets enable row level security;
-- insert into public.app_secrets (key, value) values ('vapid_public', '…'), ('vapid_private', '…');

-- =================================================================
-- 0005_admin_feedback_stats.sql
-- =================================================================
-- Back-office super-admin : verrou de sécurité, retours utilisateurs, statistiques d'usage,
-- erreurs clients, annonces, drapeaux de fonctionnalités et fonctions d'administration.
-- Appliqué sur le projet « Appli Rugby Strat » le 2026-10-11 (le verrou de la section 1 l'était déjà).

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
  reply text check (length(reply) <= 2000),
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
  with check (user_id = auth.uid() and status = 'new' and admin_note is null and reply is null);
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
  id uuid primary key default gen_random_uuid(),
  key text not null check (key ~ '^[a-z0-9_-]{2,40}$'),
  team_id uuid references public.teams(id) on delete cascade,
  enabled boolean not null default true,
  note text,
  created_at timestamptz not null default now()
);
create unique index if not exists feature_flags_team_idx on public.feature_flags (key, team_id) where team_id is not null;
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

-- La note interne n'est lisible que par les super-admins, via admin_feedback().
revoke select on public.feedback from authenticated;
grant select (id, user_id, team_id, kind, message, context, status, reply, created_at, updated_at) on public.feedback to authenticated;

create or replace function public.admin_feedback() returns table (
  id uuid, user_id uuid, user_name text, email text, team_name text, kind text, message text, context jsonb,
  status text, admin_note text, reply text, created_at timestamptz, updated_at timestamptz
) language sql stable security definer set search_path = public as $$
  select f.id, f.user_id, coalesce(p.display_name, ''), coalesce(u.email::text, ''), coalesce(t.name, ''), f.kind, f.message, f.context,
    f.status, f.admin_note, f.reply, f.created_at, f.updated_at
  from feedback f left join profiles p on p.id = f.user_id left join auth.users u on u.id = f.user_id left join teams t on t.id = f.team_id
  where public.is_superadmin()
  order by f.created_at desc;
$$;
revoke execute on function public.admin_feedback() from anon, public;

-- =================================================================
-- 0006_vues_strategies.sql
-- =================================================================
-- Qui a regardé quoi : une ligne par (stratégie publiée, membre) avec la première et la dernière
-- ouverture, le nombre d'ouvertures et si l'animation a été lue. Visible par l'intéressé,
-- par le staff de l'équipe (coach, admin) et par les super-admins.
-- Appliqué sur le projet « Appli Rugby Strat » le 2026-10-13.

create table if not exists public.drawing_views (
  drawing_id uuid not null references public.drawings(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  views integer not null default 1 check (views >= 0),
  played boolean not null default false,
  primary key (drawing_id, user_id)
);
create index if not exists drawing_views_user_idx on public.drawing_views (user_id);
alter table public.drawing_views enable row level security;
drop policy if exists views_select on public.drawing_views;
create policy views_select on public.drawing_views for select to authenticated
  using (user_id = auth.uid() or exists (select 1 from public.drawings d where d.id = drawing_id and public.is_staff(d.team_id)));
-- Pas d'écriture directe : tout passe par mark_drawing_viewed().

-- Enregistre une ouverture (p_played = false) ou la lecture de l'animation (p_played = true)
-- d'une stratégie publiée dans une équipe dont l'appelant est membre.
create or replace function public.mark_drawing_viewed(p_drawing uuid, p_played boolean default false) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  if not exists (select 1 from drawings d where d.id = p_drawing and d.visibility = 'team' and public.is_member(d.team_id)) then return; end if;
  insert into drawing_views (drawing_id, user_id, played) values (p_drawing, auth.uid(), p_played)
  on conflict (drawing_id, user_id) do update
    set last_seen_at = now(),
        views = drawing_views.views + case when p_played then 0 else 1 end,
        played = drawing_views.played or excluded.played;
end $$;
revoke execute on function public.mark_drawing_viewed(uuid, boolean) from anon, public;

-- Détail par membre pour une stratégie (staff de l'équipe) : l'auteur n'est pas compté.
create or replace function public.drawing_view_stats(p_drawing uuid) returns table (
  user_id uuid, display_name text, role text, first_seen_at timestamptz, last_seen_at timestamptz, views integer, played boolean
) language sql stable security definer set search_path = public as $$
  select m.user_id, coalesce(p.display_name, ''), m.role, v.first_seen_at, v.last_seen_at, coalesce(v.views, 0), coalesce(v.played, false)
  from drawings d
  join team_members m on m.team_id = d.team_id and m.status = 'active' and m.user_id <> d.owner_id
  left join profiles p on p.id = m.user_id
  left join drawing_views v on v.drawing_id = d.id and v.user_id = m.user_id
  where d.id = p_drawing and d.visibility = 'team' and public.is_staff(d.team_id)
  order by p.display_name;
$$;
revoke execute on function public.drawing_view_stats(uuid) from anon, public;

-- Compteurs « vus / destinataires » de toutes les stratégies publiées d'une équipe (staff).
create or replace function public.team_view_counts(p_team uuid) returns table (drawing_id uuid, viewers bigint, audience bigint)
language sql stable security definer set search_path = public as $$
  select d.id,
    (select count(*) from drawing_views v join team_members m on m.user_id = v.user_id and m.team_id = d.team_id and m.status = 'active'
      where v.drawing_id = d.id and v.user_id <> d.owner_id),
    (select count(*) from team_members m where m.team_id = d.team_id and m.status = 'active' and m.user_id <> d.owner_id)
  from drawings d
  where d.team_id = p_team and d.visibility = 'team' and public.is_staff(p_team);
$$;
revoke execute on function public.team_view_counts(uuid) from anon, public;

-- =================================================================
-- 0007_agenda_convocations.sql
-- =================================================================
-- Agenda et convocations : matchs, entraînements et autres rendez-vous d'une équipe, avec la réponse
-- de chaque membre (présent, absent, peut-être) et un commentaire facultatif.
-- Tous les membres actifs de l'équipe sont convoqués. Le staff (coach, admin) crée, modifie et annule
-- les événements, et peut saisir la réponse d'un joueur à sa place.
-- Appliqué sur le projet « Appli Rugby Strat » le 2026-10-13.

create table if not exists public.team_events (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  kind text not null default 'training' check (kind in ('match', 'training', 'other')),
  title text not null check (length(title) between 1 and 80),
  opponent text check (length(opponent) <= 60),
  home boolean,
  starts_at timestamptz not null,
  meet_at timestamptz,
  location text check (length(location) <= 120),
  notes text check (length(notes) <= 1000),
  cancelled boolean not null default false,
  series_id uuid,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists team_events_team_idx on public.team_events (team_id, starts_at);
drop trigger if exists team_events_updated_at on public.team_events;
create trigger team_events_updated_at before update on public.team_events for each row execute function public.set_updated_at();
alter table public.team_events enable row level security;
drop policy if exists team_events_select on public.team_events;
create policy team_events_select on public.team_events for select to authenticated using (public.is_member(team_id));
drop policy if exists team_events_insert on public.team_events;
create policy team_events_insert on public.team_events for insert to authenticated with check (public.is_staff(team_id) and created_by = auth.uid());
drop policy if exists team_events_update on public.team_events;
create policy team_events_update on public.team_events for update to authenticated using (public.is_staff(team_id)) with check (public.is_staff(team_id));
drop policy if exists team_events_delete on public.team_events;
create policy team_events_delete on public.team_events for delete to authenticated using (public.is_staff(team_id));

create table if not exists public.event_responses (
  event_id uuid not null references public.team_events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('yes', 'no', 'maybe')),
  comment text check (length(comment) <= 140),
  set_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index if not exists event_responses_user_idx on public.event_responses (user_id);
drop trigger if exists event_responses_updated_at on public.event_responses;
create trigger event_responses_updated_at before update on public.event_responses for each row execute function public.set_updated_at();
alter table public.event_responses enable row level security;

-- Équipe d'un événement (utilisée par les politiques)
create or replace function public.event_team(p_event uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select team_id from team_events where id = p_event;
$$;
revoke execute on function public.event_team(uuid) from anon, public;

drop policy if exists responses_select on public.event_responses;
create policy responses_select on public.event_responses for select to authenticated
  using (public.is_member(public.event_team(event_id)));
-- Un membre répond pour lui ; le staff peut répondre pour un membre actif de l'équipe
drop policy if exists responses_insert on public.event_responses;
create policy responses_insert on public.event_responses for insert to authenticated
  with check (
    (user_id = auth.uid() and public.is_member(public.event_team(event_id)))
    or (public.is_staff(public.event_team(event_id))
        and exists (select 1 from team_members m where m.team_id = public.event_team(event_id) and m.user_id = event_responses.user_id and m.status = 'active'))
  );
drop policy if exists responses_update on public.event_responses;
create policy responses_update on public.event_responses for update to authenticated
  using (user_id = auth.uid() or public.is_staff(public.event_team(event_id)))
  with check (user_id = auth.uid() or public.is_staff(public.event_team(event_id)));
drop policy if exists responses_delete on public.event_responses;
create policy responses_delete on public.event_responses for delete to authenticated
  using (user_id = auth.uid() or public.is_staff(public.event_team(event_id)));

-- =================================================================
-- 0008_import_calendrier.sql
-- =================================================================
-- Import du calendrier des matchs depuis un fichier agenda (.ics), par exemple celui de Mon Club House (FFR).
-- external_id garde l'identifiant du match dans le fichier (UID) : un nouvel import met à jour les matchs
-- déjà importés (date, lieu, annulation) au lieu de créer des doublons.
-- teams.calendar_club mémorise le nom du club tel qu'il apparaît dans le calendrier fédéral.
-- Appliqué sur le projet « Appli Rugby Strat » le 2026-10-13.

alter table public.team_events add column if not exists external_id text check (length(external_id) <= 200);
create unique index if not exists team_events_external_idx on public.team_events (team_id, external_id) where external_id is not null;

alter table public.teams add column if not exists calendar_club text check (length(calendar_club) <= 120);

-- =================================================================
-- 0009_feuilles_de_match.sql
-- =================================================================
-- Feuilles de match : une composition par match de l'agenda, entièrement paramétrable par équipe.
-- teams.sheet_settings : modèle visuel, logo (image réduite), couleurs, champs d'en-tête, équipes (A, B…),
-- champs de bas d'équipe et repères (1re ligne, capitaine, direct au stade…).
-- match_sheets.data : contenu de la feuille (adversaire, rendez-vous, valeurs des champs, joueurs par numéro).
-- Le staff prépare la feuille ; les membres la voient une fois publiée.
-- Appliqué sur le projet « Appli Rugby Strat » le 2026-10-13.

alter table public.teams add column if not exists sheet_settings jsonb not null default '{}'::jsonb;
alter table public.teams drop constraint if exists teams_sheet_settings_size;
alter table public.teams add constraint teams_sheet_settings_size check (pg_column_size(sheet_settings) < 400000);

create table if not exists public.match_sheets (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  event_id uuid not null unique references public.team_events(id) on delete cascade,
  data jsonb not null default '{}'::jsonb check (pg_column_size(data) < 200000),
  published boolean not null default false,
  published_at timestamptz,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists match_sheets_team_idx on public.match_sheets (team_id);
drop trigger if exists match_sheets_updated_at on public.match_sheets;
create trigger match_sheets_updated_at before update on public.match_sheets for each row execute function public.set_updated_at();
alter table public.match_sheets enable row level security;
drop policy if exists sheets_select on public.match_sheets;
create policy sheets_select on public.match_sheets for select to authenticated
  using (public.is_staff(team_id) or (published and public.is_member(team_id)));
drop policy if exists sheets_insert on public.match_sheets;
create policy sheets_insert on public.match_sheets for insert to authenticated
  with check (public.is_staff(team_id) and public.event_team(event_id) = team_id);
drop policy if exists sheets_update on public.match_sheets;
create policy sheets_update on public.match_sheets for update to authenticated
  using (public.is_staff(team_id)) with check (public.is_staff(team_id) and public.event_team(event_id) = team_id);
drop policy if exists sheets_delete on public.match_sheets;
create policy sheets_delete on public.match_sheets for delete to authenticated using (public.is_staff(team_id));

-- =================================================================
-- 0010_droits_de_partage.sql
-- =================================================================
-- Droits de partage des stratégies, choisis par le coach.
--   app      : visible dans l'appli seulement (pas de téléchargement, pas de copie, pas de lien public)
--   download : téléchargement et copie autorisés, pas de lien public
--   public   : tout est autorisé, y compris le lien public
-- teams.share_default : réglage par défaut de l'équipe ; drawings.share_mode : réglage d'une stratégie (vide = défaut).
-- Le lien public ne fonctionne que si le mode effectif est « public » (vérifié côté serveur).
-- Appliqué sur le projet « Appli Rugby Strat » le 2026-10-15.

alter table public.teams add column if not exists share_default text not null default 'public' check (share_default in ('app', 'download', 'public'));
alter table public.drawings add column if not exists share_mode text check (share_mode in ('app', 'download', 'public'));

create or replace function public.get_shared_drawing(p_token text) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'id', d.id, 'title', d.title, 'data', d.data, 'published_at', d.published_at, 'updated_at', d.updated_at,
    'owner_name', coalesce(p.display_name, ''), 'team_name', coalesce(t.name, '')
  )
  from drawings d left join profiles p on p.id = d.owner_id left join teams t on t.id = d.team_id
  where d.share_token is not null and length(p_token) >= 16 and d.share_token = p_token
    and coalesce(d.share_mode, t.share_default, 'public') = 'public'
  limit 1;
$$;

-- =================================================================
-- 0011_profils_joueurs.sql
-- =================================================================
-- Profil personnalisable (inspiré de SportEasy).
-- Profil sportif, visible par les coéquipiers : photo, postes, numéro préféré, pied fort, taille, poids, présentation.
-- Infos privées (profile_private), visibles seulement par la personne et le staff (coach, admin) de ses équipes :
-- téléphone, date de naissance, contact d'urgence.
-- Appliqué sur le projet « Appli Rugby Strat » le 2026-10-15.

alter table public.profiles add column if not exists avatar text
  check (avatar is null or (avatar ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$' and length(avatar) < 200000));
alter table public.profiles add column if not exists positions text[] not null default '{}'
  check (coalesce(array_length(positions, 1), 0) <= 4);
alter table public.profiles add column if not exists jersey_number smallint check (jersey_number between 1 and 99);
alter table public.profiles add column if not exists strong_foot text check (strong_foot in ('droit', 'gauche', 'les deux'));
alter table public.profiles add column if not exists height_cm smallint check (height_cm between 100 and 230);
alter table public.profiles add column if not exists weight_kg smallint check (weight_kg between 30 and 200);
alter table public.profiles add column if not exists bio text check (length(bio) <= 200);
-- Chacun modifie son profil (jamais is_superadmin, protégé par ailleurs)
grant update (display_name, avatar, positions, jersey_number, strong_foot, height_cm, weight_kg, bio) on public.profiles to authenticated;

-- Le staff d'une équipe de la personne (ou un super-admin)
create or replace function public.is_staff_of(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from team_members me join team_members them on them.team_id = me.team_id
    where me.user_id = auth.uid() and me.status = 'active' and me.role in ('coach', 'admin')
      and them.user_id = p_user and them.status in ('active', 'pending')
  ) or public.is_superadmin();
$$;
revoke execute on function public.is_staff_of(uuid) from anon, public;

create table if not exists public.profile_private (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  phone text check (length(phone) <= 30),
  birth_date date check (birth_date > date '1920-01-01' and birth_date < current_date),
  emergency_name text check (length(emergency_name) <= 60),
  emergency_phone text check (length(emergency_phone) <= 30),
  updated_at timestamptz not null default now()
);
drop trigger if exists profile_private_updated_at on public.profile_private;
create trigger profile_private_updated_at before update on public.profile_private for each row execute function public.set_updated_at();
alter table public.profile_private enable row level security;
drop policy if exists private_select on public.profile_private;
create policy private_select on public.profile_private for select to authenticated using (user_id = auth.uid() or public.is_staff_of(user_id));
drop policy if exists private_insert on public.profile_private;
create policy private_insert on public.profile_private for insert to authenticated with check (user_id = auth.uid());
drop policy if exists private_update on public.profile_private;
create policy private_update on public.profile_private for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists private_delete on public.profile_private;
create policy private_delete on public.profile_private for delete to authenticated using (user_id = auth.uid());

-- =================================================================
-- 0012_securite.sql
-- =================================================================
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

-- =================================================================
-- 0013_suppression_comptes.sql
-- =================================================================
-- Suppression de compte (RGPD) et nettoyage des inscriptions jamais confirmées.
-- À coller dans Supabase : Dashboard → SQL Editor → New query → Run.

-- 1. « Supprimer mon compte » (page Compte de l'appli)
-- Les données liées partent avec le compte (dessins, réponses, profil…). Une équipe dont la personne
-- était le seul membre du staff passe au plus ancien membre (nommé coach), ou est supprimée si elle est vide.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public as $f$
declare uid uuid := auth.uid(); t record; heir uuid;
begin
  if uid is null then raise exception 'Non connecté'; end if;
  if (select is_superadmin from profiles where id = uid) and (select count(*) from profiles where is_superadmin) <= 1 then
    raise exception 'Tu es le seul super-admin : nomme un autre super-admin avant de supprimer ton compte';
  end if;
  for t in select team_id from team_members where user_id = uid and status = 'active' and role in ('coach', 'admin') loop
    if not exists (select 1 from team_members where team_id = t.team_id and user_id <> uid and status = 'active' and role in ('coach', 'admin')) then
      select user_id into heir from team_members where team_id = t.team_id and user_id <> uid and status = 'active' order by joined_at limit 1;
      if heir is null then delete from teams where id = t.team_id;
      else update team_members set role = 'coach' where team_id = t.team_id and user_id = heir;
      end if;
    end if;
  end loop;
  delete from auth.users where id = uid;
end $f$;
revoke execute on function public.delete_my_account() from anon, public;
grant execute on function public.delete_my_account() to authenticated;

-- 2. Inscriptions abandonnées : e-mail non confirmé après 24 h → compte supprimé (l'adresse redevient libre).
-- Ne touche que les comptes jamais connectés, sans équipe ni dessin (les comptes de test créés en base sont épargnés).
create extension if not exists pg_cron;
select cron.schedule('purge-inscriptions-non-confirmees', '17 * * * *', $c$
  delete from auth.users u
  where u.email_confirmed_at is null
    and u.last_sign_in_at is null
    and u.created_at < now() - interval '24 hours'
    and not exists (select 1 from public.team_members m where m.user_id = u.id)
    and not exists (select 1 from public.drawings d where d.owner_id = u.id)
$c$);

-- =================================================================
-- 0014_joue_aussi.sql
-- =================================================================
-- Fonction « joue aussi » : un coach ou un admin peut aussi être convoqué comme un joueur
-- (Présent / Peut-être / Absent, relances, compos). Les joueurs sont toujours convoqués.
-- Le rôle reste les droits (coach, admin, joueur) ; « plays » est la première fonction.
-- Seul le staff de l'équipe la modifie (politique members_update existante : is_staff).
-- Appliqué sur le projet « Appli Rugby Strat » le 2026-10-15.

alter table public.team_members add column if not exists plays boolean not null default false;
comment on column public.team_members.plays is 'Fonction « joue aussi » : un coach ou un admin convoqué comme un joueur (les joueurs le sont toujours)';
grant update (role, status, plays) on public.team_members to authenticated;

-- =================================================================
-- 0015_clubs.sql
-- =================================================================
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

-- =================================================================
-- 0016_partage_strategies.sql
-- =================================================================
-- Partager une stratégie avec une autre équipe du club : le staff de l'équipe d'origine envoie une COPIE,
-- reçue en proposition par le coach de l'équipe cible ; l'original n'est jamais modifiable par l'autre équipe.
-- Le coach de l'équipe cible ne peut pas parcourir les stratégies des autres équipes : il ne reçoit que ce qu'on lui partage.
-- Appliqué sur le projet « Appli Rugby Strat » le 2026-10-15.
create or replace function public.share_drawing(p_drawing uuid, p_team uuid) returns uuid
language plpgsql security definer set search_path = public as $f$
declare d public.drawings; src text; nid uuid := gen_random_uuid();
begin
  if auth.uid() is null then raise exception 'Non connecté'; end if;
  select * into d from drawings where id = p_drawing;
  if not found or d.team_id is null then raise exception 'Stratégie introuvable'; end if;
  if not public.is_staff(d.team_id) then raise exception 'Réservé au staff de l''équipe'; end if;
  if p_team = d.team_id or public.team_club(p_team) is distinct from public.team_club(d.team_id) then
    raise exception 'Partage possible seulement avec une autre équipe du club';
  end if;
  select name into src from teams where id = d.team_id;
  insert into drawings (id, owner_id, team_id, title, data, visibility)
  values (nid, auth.uid(), p_team, left(d.title || ' (' || src || ')', 120),
          jsonb_set(jsonb_set(d.data, '{id}', to_jsonb(nid::text)), '{sharedFrom}', to_jsonb(src)), 'proposed');
  return nid;
end $f$;
revoke execute on function public.share_drawing(uuid, uuid) from anon, public;

-- =================================================================
-- 0017_temps_reel_membres.sql
-- =================================================================
-- Demandes d'adhésion en temps réel : l'appli est prévenue quand une demande est envoyée, acceptée ou refusée
-- (les règles RLS de team_members s'appliquent : chacun ne reçoit que les lignes qu'il peut lire).
alter publication supabase_realtime add table public.team_members;

-- =================================================================
-- 0018_rgpd.sql
-- =================================================================
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

-- =================================================================
-- 0019_bureau_club.sql
-- =================================================================
-- Bureau du club : une fonction (Présidente, Secrétaire, Trésorier…) qui donne les droits de la direction du club.
-- Appliquée le 19/10/2026.
alter table public.club_members add column if not exists title text;
alter table public.club_members drop constraint if exists club_members_title_len;
alter table public.club_members add constraint club_members_title_len check (title is null or length(title) <= 40);

create or replace function public.set_club_function(p_club uuid, p_user uuid, p_title text) returns void
language plpgsql security definer set search_path = public as $f$
declare t text := nullif(trim(coalesce(p_title, '')), '');
begin
  if not public.is_club_admin(p_club) then raise exception 'Réservé à la direction du club'; end if;
  if t is not null and length(t) > 40 then raise exception 'Fonction trop longue'; end if;
  if t is null and exists (select 1 from club_members where club_id = p_club and user_id = p_user and role = 'responsable')
     and (select count(*) from club_members where club_id = p_club and role = 'responsable') <= 1 and not public.is_superadmin() then
    raise exception 'Nommez d''abord une autre personne au bureau du club';
  end if;
  insert into club_members (club_id, user_id, role, title) values (p_club, p_user, case when t is null then 'member' else 'responsable' end, t)
  on conflict (club_id, user_id) do update set role = excluded.role, title = excluded.title;
end $f$;
revoke execute on function public.set_club_function(uuid, uuid, text) from anon, public;
grant execute on function public.set_club_function(uuid, uuid, text) to authenticated;

create or replace function public.set_club_role(p_club uuid, p_user uuid, p_role text) returns void
language plpgsql security definer set search_path to 'public' as $function$
begin
  if not public.is_club_admin(p_club) then raise exception 'Réservé à la direction du club'; end if;
  if p_role not in ('member', 'responsable') then raise exception 'Rôle invalide'; end if;
  insert into club_members (club_id, user_id, role, title) values (p_club, p_user, p_role, case when p_role = 'responsable' then 'Membre du bureau' end)
  on conflict (club_id, user_id) do update set role = excluded.role,
    title = case when excluded.role = 'member' then null else coalesce(club_members.title, 'Membre du bureau') end;
end $function$;

create or replace function public.admin_clubs() returns table(id uuid, name text, join_code text, created_at timestamptz, teams bigint, members bigint, responsables json)
language sql stable security definer set search_path to 'public' as $function$
  select c.id, c.name, c.join_code, c.created_at,
    (select count(*) from teams t where t.club_id = c.id),
    (select count(*) from club_members m where m.club_id = c.id),
    (select coalesce(json_agg(json_build_object('user_id', m.user_id, 'name', p.display_name, 'title', m.title) order by p.display_name), '[]'::json)
       from club_members m join profiles p on p.id = m.user_id where m.club_id = c.id and m.role = 'responsable')
  from clubs c where public.is_superadmin() order by c.name $function$;
update public.club_members set title = 'Membre du bureau' where role = 'responsable' and title is null;

-- =================================================================
-- 0020_tableau_de_bord.sql
-- =================================================================
-- Tableau de bord du super-admin : personnes actives, onglets visités, usage des fonctions, démarrage, fidélité, clubs.
-- Appliquée le 20/10/2026.
-- Deux sources :
--   * compteurs anonymes pour tout le monde (aucun identifiant) : personnes actives par jour / semaine / mois, onglets visités ;
--   * données de fonctionnement déjà en base (stratégies, vues, convocations, compos, membres) : on ne fait que compter.
-- Le détail par personne (temps passé par onglet, exports, relances…) ne vient que de ceux qui ont accepté la mesure d'usage.

create table if not exists public.activity_last (user_id uuid primary key references auth.users(id) on delete cascade, day date, week date, month date);
alter table public.activity_last enable row level security;
create table if not exists public.activity_counts (kind text not null check (kind in ('day','week','month')), period date not null, n int not null default 0, primary key (kind, period));
alter table public.activity_counts enable row level security;
create table if not exists public.page_counts (day date not null, page text not null, source text not null, device text not null, installed boolean not null, n int not null default 0, primary key (day, page, source, device, installed));
alter table public.page_counts enable row level security;

-- Une fois par jour et par compte : met à jour le dernier jour d'activité et les compteurs anonymes
create or replace function public.touch_activity() returns void
language plpgsql security definer set search_path = public as $f$
declare d date := (now() at time zone 'Europe/Paris')::date; w date := date_trunc('week', d)::date; m date := date_trunc('month', d)::date;
  r public.activity_last; had boolean;
begin
  if auth.uid() is null then return; end if;
  select * into r from activity_last where user_id = auth.uid();
  had := found;
  if had and r.day = d then return; end if;
  insert into activity_counts (kind, period, n) values ('day', d, 1) on conflict (kind, period) do update set n = activity_counts.n + 1;
  if not had or r.week is distinct from w then
    insert into activity_counts (kind, period, n) values ('week', w, 1) on conflict (kind, period) do update set n = activity_counts.n + 1;
  end if;
  if not had or r.month is distinct from m then
    insert into activity_counts (kind, period, n) values ('month', m, 1) on conflict (kind, period) do update set n = activity_counts.n + 1;
  end if;
  insert into activity_last (user_id, day, week, month) values (auth.uid(), d, w, m)
  on conflict (user_id) do update set day = excluded.day, week = excluded.week, month = excluded.month;
end $f$;
revoke execute on function public.touch_activity() from anon, public;
grant execute on function public.touch_activity() to authenticated;

-- Ouverture d'un onglet : compteur anonyme (page, origine du clic, appareil, appli installée)
create or replace function public.count_page(p_page text, p_source text, p_device text, p_installed boolean) returns void
language plpgsql security definer set search_path = public as $f$
begin
  if p_page not in ('home','agenda','strats','compos','team','account','editor','admin','other')
     or p_source not in ('nav','tile','notif','link','other') or p_device not in ('mobile','desktop') then return; end if;
  insert into page_counts (day, page, source, device, installed, n)
  values ((now() at time zone 'Europe/Paris')::date, p_page, p_source, p_device, coalesce(p_installed, false), 1)
  on conflict (day, page, source, device, installed) do update set n = page_counts.n + 1;
end $f$;
revoke execute on function public.count_page(text, text, text, boolean) from public;
grant execute on function public.count_page(text, text, text, boolean) to anon, authenticated;

-- Tous les chiffres du tableau de bord, sur les p_weeks dernières semaines
create or replace function public.admin_metrics(p_weeks int default 12) returns json
language plpgsql stable security definer set search_path = public as $f$
declare
  today date := (now() at time zone 'Europe/Paris')::date;
  w0 date := date_trunc('week', today)::date;
  wfrom date := w0 - (greatest(1, least(coalesce(p_weeks, 12), 60)) - 1) * 7;
  tfrom timestamptz := (wfrom::timestamp at time zone 'Europe/Paris');
  out json;
begin
  if not public.is_superadmin() then raise exception 'Réservé au super-admin'; end if;
  with
  weeks as (select generate_series(wfrom, w0, interval '1 week')::date w),
  wk as (select w, (w::timestamp at time zone 'Europe/Paris') t0, ((w + 7)::timestamp at time zone 'Europe/Paris') t1 from weeks),
  convoked as (select team_id, user_id from team_members where status = 'active' and (role = 'player' or plays)),
  -- Activité réelle d'une personne (données de fonctionnement), pour la fidélité et les clubs
  act as (
    select user_id, last_seen_at ts from drawing_views
    union all select user_id, first_seen_at from drawing_views
    union all select user_id, updated_at from event_responses
    union all select owner_id, created_at from drawings
    union all select owner_id, updated_at from drawings
    union all select user_id, created_at from drawing_comments
    union all select created_by, created_at from team_events
    union all select updated_by, updated_at from match_sheets where updated_by is not null
    union all select user_id, started_at from usage_sessions
    union all select user_id, (day::timestamp at time zone 'Europe/Paris') from activity_last
  ),
  actw as (select distinct user_id, date_trunc('week', ts at time zone 'Europe/Paris')::date w from act where user_id is not null),
  pub as (select d.id, d.team_id, d.owner_id, d.published_at from drawings d where d.visibility = 'team' and d.team_id is not null and d.published_at >= tfrom),
  pubviews as (
    select p.id, v.first_seen_at, v.played, extract(epoch from (v.first_seen_at - p.published_at)) / 3600 hrs
    from pub p join drawing_views v on v.drawing_id = p.id
    join convoked c on c.team_id = p.team_id and c.user_id = v.user_id and c.user_id <> p.owner_id
  ),
  past_events as (select e.id, e.team_id, e.created_at from team_events e where not e.cancelled and e.starts_at >= tfrom and e.starts_at < now()),
  cohort as (select id, date_trunc('week', created_at at time zone 'Europe/Paris')::date w from profiles where created_at >= tfrom)
  select json_build_object(
    'from', wfrom, 'to', w0, 'today', today,
    'weeks', (select json_agg(w order by w) from weeks),
    -- Étage 1 : santé
    'active', json_build_object(
      'day', coalesce((select n from activity_counts where kind = 'day' and period = today), 0),
      'week', coalesce((select n from activity_counts where kind = 'week' and period = w0), 0),
      'week_prev', coalesce((select n from activity_counts where kind = 'week' and period = w0 - 7), 0),
      'month', coalesce((select n from activity_counts where kind = 'month' and period = date_trunc('month', today)::date), 0),
      'by_week', (select json_agg(coalesce(a.n, 0) order by weeks.w) from weeks left join activity_counts a on a.kind = 'week' and a.period = weeks.w),
      'by_day', (select json_agg(json_build_object('d', g::date, 'n', coalesce(a.n, 0)) order by g) from generate_series(wfrom, today, interval '1 day') g left join activity_counts a on a.kind = 'day' and a.period = g::date),
      'avg_day_month', coalesce((select round(avg(n)::numeric, 1) from activity_counts where kind = 'day' and period >= date_trunc('month', today)::date), 0)
    ),
    'new', json_build_object(
      'accounts', (select json_agg((select count(*) from profiles p where p.created_at >= wk.t0 and p.created_at < wk.t1) order by wk.w) from wk),
      'teams', (select json_agg((select count(*) from teams t where t.created_at >= wk.t0 and t.created_at < wk.t1) order by wk.w) from wk),
      'clubs', (select json_agg((select count(*) from clubs c where c.created_at >= wk.t0 and c.created_at < wk.t1) order by wk.w) from wk),
      'total_accounts', (select count(*) from profiles), 'total_teams', (select count(*) from teams), 'total_clubs', (select count(*) from clubs)
    ),
    -- Étage 2 : onglets
    'pages', json_build_object(
      'by_week', (select coalesce(json_object_agg(page, series), '{}'::json) from (
          select pg.page, json_agg(coalesce((select sum(n) from page_counts c where c.page = pg.page and c.day >= weeks.w and c.day < weeks.w + 7), 0) order by weeks.w) series
          from (select distinct page from page_counts where day >= wfrom) pg cross join weeks group by pg.page) s),
      'sources', (select coalesce(json_object_agg(source, n), '{}'::json) from (select source, sum(n) n from page_counts where day >= wfrom group by source) s),
      'devices', (select coalesce(json_object_agg(device, n), '{}'::json) from (select device, sum(n) n from page_counts where day >= wfrom group by device) s),
      'installed', (select coalesce(json_object_agg(case when installed then 'app' else 'web' end, n), '{}'::json) from (select installed, sum(n) n from page_counts where day >= wfrom and device = 'mobile' group by installed) s),
      'time', (select coalesce(json_object_agg(page, secs), '{}'::json) from (select props->>'page' page, sum(least(coalesce((props->>'s')::int, 0), 3600)) secs from events where name = 'page_time' and created_at >= tfrom group by 1) s),
      'time_people', (select count(distinct user_id) from events where name = 'page_time' and created_at >= tfrom)
    ),
    -- Étage 3 : fonctions
    'strats', json_build_object(
      'created', (select json_agg((select count(*) from drawings d where d.created_at >= wk.t0 and d.created_at < wk.t1) order by wk.w) from wk),
      'published', (select json_agg((select count(*) from drawings d where d.visibility = 'team' and d.published_at >= wk.t0 and d.published_at < wk.t1) order by wk.w) from wk),
      'pub_count', (select count(*) from pub),
      'audience', (select count(*) from pub p join convoked c on c.team_id = p.team_id and c.user_id <> p.owner_id),
      'seen', (select count(*) from pubviews),
      'seen48', (select count(*) from pubviews where hrs <= 48),
      'median_h', (select round(percentile_cont(0.5) within group (order by greatest(hrs, 0))::numeric, 1) from pubviews),
      'played', (select count(*) from pubviews where played),
      'proposals', (select count(*) from drawings where visibility = 'proposed' and created_at >= tfrom)
    ),
    'agenda', json_build_object(
      'created', (select json_agg((select count(*) from team_events e where e.created_at >= wk.t0 and e.created_at < wk.t1) order by wk.w) from wk),
      'past', (select count(*) from past_events),
      'convoked', (select count(*) from past_events e join convoked c on c.team_id = e.team_id),
      'answered', (select count(*) from past_events e join convoked c on c.team_id = e.team_id join event_responses r on r.event_id = e.id and r.user_id = c.user_id),
      'median_h', (select round(percentile_cont(0.5) within group (order by greatest(extract(epoch from (r.updated_at - e.created_at)) / 3600, 0))::numeric, 1)
                   from past_events e join event_responses r on r.event_id = e.id),
      'reminders', (select count(*) from events where name in ('event_reminder', 'reminder') and created_at >= tfrom)
    ),
    'compos', json_build_object(
      'matches', (select count(*) from team_events e where e.kind = 'match' and not e.cancelled and e.starts_at >= tfrom and e.starts_at < now() + interval '7 days'),
      'published', (select count(*) from team_events e join match_sheets s on s.event_id = e.id and s.published where e.kind = 'match' and not e.cancelled and e.starts_at >= tfrom and e.starts_at < now() + interval '7 days'),
      'prints', (select count(*) from events where name = 'sheet_print' and created_at >= tfrom),
      'images', (select count(*) from events where name = 'sheet_image' and created_at >= tfrom)
    ),
    'team', json_build_object(
      'invites', (select count(*) from events where name = 'invite' and created_at >= tfrom),
      'accounts', (select count(*) from profiles where created_at >= tfrom),
      'requests', (select count(*) from team_members where joined_at >= tfrom),
      'accepted', (select count(*) from team_members where joined_at >= tfrom and status = 'active')
    ),
    'push', json_build_object('users', (select count(distinct user_id) from push_subscriptions), 'total', (select count(*) from profiles)),
    -- Étage 4 : démarrage et fidélité (comptes créés sur la période)
    'funnel_coach', json_build_array(
      (select count(*) from cohort),
      (select count(*) from cohort k where exists (select 1 from team_members m where m.user_id = k.id and m.status = 'active')),
      (select count(*) from cohort k where exists (select 1 from team_members m where m.user_id = k.id and m.status = 'active' and m.role in ('coach', 'admin'))),
      (select count(*) from cohort k where exists (select 1 from team_members m where m.user_id = k.id and m.status = 'active' and m.role in ('coach', 'admin')
          and (select count(*) from team_members x where x.team_id = m.team_id and x.status = 'active') >= 5)),
      (select count(*) from cohort k where exists (select 1 from drawings d where d.owner_id = k.id and d.visibility = 'team')),
      (select count(*) from cohort k where exists (select 1 from team_events e where e.created_by = k.id))
    ),
    'funnel_player', json_build_array(
      (select count(*) from cohort k where exists (select 1 from team_members m where m.user_id = k.id and m.role = 'player')),
      (select count(*) from cohort k where exists (select 1 from team_members m where m.user_id = k.id and m.role = 'player' and m.status = 'active')),
      (select count(*) from cohort k where exists (select 1 from team_members m where m.user_id = k.id and m.role = 'player' and m.status = 'active')
          and exists (select 1 from event_responses r where r.user_id = k.id)),
      (select count(*) from cohort k where exists (select 1 from team_members m where m.user_id = k.id and m.role = 'player' and m.status = 'active')
          and exists (select 1 from drawing_views v where v.user_id = k.id))
    ),
    'retention', (select coalesce(json_agg(json_build_object('w', c.w, 'n', c.n,
        'w1', case when c.w + 7 <= w0 then (select count(distinct k.id) from cohort k join actw a on a.user_id = k.id and a.w = c.w + 7 where k.w = c.w) end,
        'w4', case when c.w + 28 <= w0 then (select count(distinct k.id) from cohort k join actw a on a.user_id = k.id and a.w = c.w + 28 where k.w = c.w) end) order by c.w), '[]'::json)
      from (select w, count(*) n from cohort group by w) c),
    -- Étage 5 : clubs et qualité
    'clubs', (select coalesce(json_agg(json_build_object('name', c.name,
        'teams', (select count(*) from teams t where t.club_id = c.id),
        'members', (select count(*) from club_members m where m.club_id = c.id),
        'active', (select count(*) from club_members m join activity_last a on a.user_id = m.user_id and a.week = w0 where m.club_id = c.id),
        'last', (select max(a.day) from club_members m join activity_last a on a.user_id = m.user_id where m.club_id = c.id)) order by c.name), '[]'::json) from clubs c),
    'errors', (select json_agg((select count(*) from client_errors x where x.created_at >= wk.t0 and x.created_at < wk.t1) order by wk.w) from wk),
    'feedback_new', (select count(*) from feedback where status = 'new')
  ) into out;
  return out;
end $f$;
revoke execute on function public.admin_metrics(int) from anon, public;
grant execute on function public.admin_metrics(int) to authenticated;

-- =================================================================
-- 0021_espace_parents.sql
-- =================================================================
-- Espace parents : un compte parent gère un ou plusieurs jeunes (moins de 15 ans).
-- Chaque jeune est un vrai compte (auth.users + profiles), sans mot de passe ni e-mail joignable :
-- il ne peut pas se connecter ; c'est le parent qui agit pour lui (convocations, profil, équipes).
-- Toutes les tables existantes (team_members, event_responses, drawing_views…) marchent donc telles quelles.

-- =================================================================
-- Partie 1
-- =================================================================

alter table public.profiles add column if not exists guardian_id uuid references public.profiles(id) on delete cascade;
create index if not exists profiles_guardian_idx on public.profiles (guardian_id) where guardian_id is not null;

-- Moi, ou un jeune dont je suis le parent
create or replace function public.is_me(u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select u = auth.uid() or exists (select 1 from profiles where id = u and guardian_id = auth.uid() and auth.uid() is not null) $$;
revoke execute on function public.is_me(uuid) from anon, public;
grant execute on function public.is_me(uuid) to authenticated;

create or replace function public.my_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select auth.uid() where auth.uid() is not null
  union all select id from profiles where guardian_id = auth.uid() and auth.uid() is not null $$;
revoke execute on function public.my_ids() from anon, public;
grant execute on function public.my_ids() to authenticated;

-- Le lien parent / jeune ne se modifie pas depuis l'appli
create or replace function public.protect_guardian() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and new.guardian_id is distinct from old.guardian_id then
    raise exception 'Le parent d''un jeune ne peut pas être changé';
  end if;
  return new;
end $$;
drop trigger if exists profiles_protect_guardian on public.profiles;
create trigger profiles_protect_guardian before update on public.profiles for each row execute function public.protect_guardian();
revoke execute on function public.protect_guardian() from anon, public, authenticated;

-- ---------- Fonctions d'accès : les équipes de mes jeunes comptent comme les miennes ----------
create or replace function public.is_member(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from team_members where team_id = t and user_id in (select public.my_ids()) and status = 'active')
    or public.is_club_admin(public.team_club(t)) $$;

create or replace function public.is_club_member(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from club_members where club_id = c and user_id in (select public.my_ids())) or public.is_superadmin() $$;

create or replace function public.is_pending(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from team_members where team_id = t and user_id in (select public.my_ids()) and status = 'pending') $$;

create or replace function public.shares_team_with(u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_me(u) or exists (
    select 1 from team_members a join team_members b on a.team_id = b.team_id
    where a.user_id in (select public.my_ids()) and b.user_id = u and a.status = 'active'
  ) or exists (
    select 1 from club_members a join club_members b on a.club_id = b.club_id
    where a.user_id = auth.uid() and b.user_id = u and (a.role = 'responsable' or b.role = 'responsable')
  ) or public.is_superadmin() $$;

-- ---------- Rejoindre : pour moi ou pour un de mes jeunes (p_for) ----------
drop function if exists public.join_with_code(text);
create or replace function public.join_with_code(p_code text, p_for uuid default null) returns json
language plpgsql security definer set search_path = public as $$
declare me uuid := coalesce(p_for, auth.uid()); c public.clubs; t public.teams; code text := upper(trim(coalesce(p_code, '')));
begin
  if auth.uid() is null then raise exception 'Non connecté'; end if;
  if not public.is_me(me) then raise exception 'Action non autorisée'; end if;
  if (select count(*) from join_attempts where user_id = auth.uid() and created_at > now() - interval '1 hour') >= 10 then
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
    if t.club_id is not null then insert into club_members (club_id, user_id) values (t.club_id, me) on conflict do nothing; end if;
    return json_build_object('kind', 'team', 'id', t.id, 'name', t.name, 'club_id', t.club_id);
  end if;
  insert into join_attempts (user_id) values (auth.uid());
  return null;
end $$;
revoke execute on function public.join_with_code(text, uuid) from anon, public;
grant execute on function public.join_with_code(text, uuid) to authenticated;

drop function if exists public.request_team(uuid, text);
create or replace function public.request_team(p_team uuid, p_as text, p_for uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := coalesce(p_for, auth.uid());
begin
  if auth.uid() is null then raise exception 'Non connecté'; end if;
  if not public.is_me(me) then raise exception 'Action non autorisée'; end if;
  if p_as not in ('player', 'staff') then raise exception 'Demande invalide'; end if;
  if me <> auth.uid() and p_as <> 'player' then raise exception 'Un jeune rejoint une équipe comme joueur'; end if;
  if not exists (select 1 from club_members where club_id = public.team_club(p_team) and user_id = me) and not public.is_superadmin() then
    raise exception 'Rejoignez d''abord le club';
  end if;
  insert into team_members (team_id, user_id, role, status, requested_as) values (p_team, me, 'player', 'pending', p_as)
  on conflict (team_id, user_id) do update set requested_as = excluded.requested_as where team_members.status = 'pending';
end $$;
revoke execute on function public.request_team(uuid, text, uuid) from anon, public;
grant execute on function public.request_team(uuid, text, uuid) to authenticated;

drop function if exists public.mark_drawing_viewed(uuid, boolean);
create or replace function public.mark_drawing_viewed(p_drawing uuid, p_played boolean default false, p_for uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := coalesce(p_for, auth.uid());
begin
  if auth.uid() is null or not public.is_me(me) then return; end if;
  -- Le jeune doit être membre de l'équipe ; pour soi, la direction du club compte aussi (is_member)
  if not exists (select 1 from drawings d where d.id = p_drawing and d.visibility = 'team'
                 and (exists (select 1 from team_members m where m.team_id = d.team_id and m.user_id = me and m.status = 'active')
                      or (me = auth.uid() and public.is_member(d.team_id)))) then return; end if;
  insert into drawing_views (drawing_id, user_id, played) values (p_drawing, me, p_played)
  on conflict (drawing_id, user_id) do update
    set last_seen_at = now(),
        views = drawing_views.views + case when p_played then 0 else 1 end,
        played = drawing_views.played or excluded.played;
end $$;
revoke execute on function public.mark_drawing_viewed(uuid, boolean, uuid) from anon, public;
grant execute on function public.mark_drawing_viewed(uuid, boolean, uuid) to authenticated;

-- ---------- Créer un jeune ----------
-- Compte sans mot de passe, adresse en .invalid (domaine réservé, jamais distribué) : connexion impossible.
create or replace function public.create_child_for(p_parent uuid, p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare kid uuid := gen_random_uuid(); nm text := left(trim(coalesce(p_name, '')), 60); pmail text;
begin
  if nm = '' then raise exception 'Indiquez le prénom du jeune'; end if;
  if (select count(*) from profiles where guardian_id = p_parent) >= 6 then raise exception '6 jeunes au maximum par compte'; end if;
  select email into pmail from auth.users where id = p_parent;
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
  values ('00000000-0000-0000-0000-000000000000', kid, 'authenticated', 'authenticated', 'jeune-' || kid || '@rugbeo.invalid', '', now(),
          '{"provider":"managed","providers":["managed"]}'::jsonb, jsonb_build_object('display_name', nm, 'managed', true),
          now(), now(), '', '', '', '');
  update profiles set guardian_id = p_parent where id = kid;
  -- Preuve : compte créé par le parent, qui a accepté la politique de confidentialité pour lui
  insert into profile_private (user_id, under_15, parent_email, parental_consent_at, terms_version, terms_accepted_at)
  select kid, true, pmail, now(), pp.terms_version, now() from (select (select terms_version from profile_private where user_id = p_parent) as terms_version) pp
  on conflict (user_id) do update set under_15 = true, parent_email = excluded.parent_email, parental_consent_at = now();
  return kid;
end $$;
revoke execute on function public.create_child_for(uuid, text) from anon, public, authenticated;

create or replace function public.add_child(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Non connecté'; end if;
  if exists (select 1 from profiles where id = auth.uid() and guardian_id is not null) then raise exception 'Action non autorisée'; end if;
  return public.create_child_for(auth.uid(), p_name);
end $$;
revoke execute on function public.add_child(text) from anon, public;
grant execute on function public.add_child(text) to authenticated;

-- Inscription d'un parent : les prénoms des jeunes arrivent dans les métadonnées (kids)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb); u15 boolean := coalesce((m->>'under_15')::boolean, false); k text;
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
  -- Parent : création des jeunes (6 au plus)
  if jsonb_typeof(m->'kids') = 'array' and not coalesce((m->>'managed')::boolean, false) then
    for k in select value from jsonb_array_elements_text(m->'kids') limit 6 loop
      if trim(k) <> '' then perform public.create_child_for(new.id, k); end if;
    end loop;
  end if;
  return new;
end $$;

-- ---------- Politiques : « moi » devient « moi ou mes jeunes » ----------
drop policy if exists club_members_remove on public.club_members;
create policy club_members_remove on public.club_members for delete to authenticated using (is_club_admin(club_id) or public.is_me(user_id));
drop policy if exists club_members_select on public.club_members;
create policy club_members_select on public.club_members for select to authenticated
  using (public.is_me(user_id) or (role = 'responsable' and is_club_member(club_id)) or is_club_admin(club_id));

drop policy if exists comments_delete on public.drawing_comments;
create policy comments_delete on public.drawing_comments for delete to authenticated
  using (public.is_me(user_id) or exists (select 1 from drawings d where d.id = drawing_comments.drawing_id and is_staff(d.team_id)));
drop policy if exists comments_insert on public.drawing_comments;
create policy comments_insert on public.drawing_comments for insert to authenticated
  with check (public.is_me(user_id) and exists (select 1 from drawings d where d.id = drawing_comments.drawing_id and d.visibility = 'team'));

drop policy if exists views_select on public.drawing_views;
create policy views_select on public.drawing_views for select to authenticated
  using (public.is_me(user_id) or exists (select 1 from drawings d where d.id = drawing_views.drawing_id and is_staff(d.team_id)));

drop policy if exists drawings_delete on public.drawings;
create policy drawings_delete on public.drawings for delete to authenticated using (public.is_me(owner_id) or is_coach(team_id));
drop policy if exists drawings_insert on public.drawings;
create policy drawings_insert on public.drawings for insert to authenticated
  with check (public.is_me(owner_id) and (team_id is null or is_member(team_id)) and (visibility <> 'team' or is_coach(team_id)));
drop policy if exists drawings_select on public.drawings;
create policy drawings_select on public.drawings for select to authenticated
  using (public.is_me(owner_id) or (visibility = 'team' and is_member(team_id)) or (visibility = 'proposed' and is_coach(team_id)));
drop policy if exists drawings_update on public.drawings;
create policy drawings_update on public.drawings for update to authenticated
  using (public.is_me(owner_id) or is_coach(team_id))
  with check ((public.is_me(owner_id) or is_coach(team_id)) and (team_id is null or is_member(team_id)) and (visibility <> 'team' or is_coach(team_id)));

drop policy if exists responses_delete on public.event_responses;
create policy responses_delete on public.event_responses for delete to authenticated
  using (public.is_me(user_id) or is_staff(event_team(event_id)));
drop policy if exists responses_insert on public.event_responses;
create policy responses_insert on public.event_responses for insert to authenticated
  with check (
    (public.is_me(user_id) and exists (select 1 from team_members m where m.team_id = event_team(event_responses.event_id) and m.user_id = event_responses.user_id and m.status = 'active'))
    or (is_staff(event_team(event_id))
        and exists (select 1 from team_members m where m.team_id = event_team(event_responses.event_id) and m.user_id = event_responses.user_id and m.status = 'active'))
  );
drop policy if exists responses_update on public.event_responses;
create policy responses_update on public.event_responses for update to authenticated
  using (public.is_me(user_id) or is_staff(event_team(event_id)))
  with check (public.is_me(user_id) or is_staff(event_team(event_id)));

drop policy if exists formations_delete on public.formations;
create policy formations_delete on public.formations for delete to authenticated using (public.is_me(owner_id) or is_staff(team_id));
drop policy if exists formations_insert on public.formations;
create policy formations_insert on public.formations for insert to authenticated
  with check (public.is_me(owner_id) and (team_id is null or is_member(team_id)));
drop policy if exists formations_select on public.formations;
create policy formations_select on public.formations for select to authenticated
  using (public.is_me(owner_id) or (team_id is not null and is_member(team_id)));
drop policy if exists formations_update on public.formations;
create policy formations_update on public.formations for update to authenticated
  using (public.is_me(owner_id) or is_staff(team_id)) with check (public.is_me(owner_id) or is_staff(team_id));

drop policy if exists private_delete on public.profile_private;
create policy private_delete on public.profile_private for delete to authenticated using (public.is_me(user_id));
drop policy if exists private_insert on public.profile_private;
create policy private_insert on public.profile_private for insert to authenticated with check (public.is_me(user_id));
drop policy if exists private_select on public.profile_private;
create policy private_select on public.profile_private for select to authenticated using (public.is_me(user_id) or is_staff_of(user_id));
drop policy if exists private_update on public.profile_private;
create policy private_update on public.profile_private for update to authenticated using (public.is_me(user_id)) with check (public.is_me(user_id));

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (public.is_me(id) or shares_team_with(id));
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated using (public.is_me(id)) with check (public.is_me(id));

drop policy if exists members_delete on public.team_members;
create policy members_delete on public.team_members for delete to authenticated using (public.is_me(user_id) or is_staff(team_id));
drop policy if exists members_select on public.team_members;
create policy members_select on public.team_members for select to authenticated using (is_member(team_id) or public.is_me(user_id));

-- =================================================================
-- Partie 2 (contient des suppressions : à coller dans l'éditeur SQL de Supabase)
-- =================================================================

-- Un jeune supprimé (par son parent, ou avec le compte du parent) : son compte de connexion part aussi
create or replace function public.drop_child_login() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.guardian_id is not null then delete from auth.users where id = old.id; end if;
  return old;
end $$;
drop trigger if exists profiles_drop_child_login on public.profiles;
create trigger profiles_drop_child_login after delete on public.profiles for each row execute function public.drop_child_login();
revoke execute on function public.drop_child_login() from anon, public, authenticated;

create or replace function public.remove_child(p_child uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not exists (select 1 from profiles where id = p_child and guardian_id = auth.uid()) then
    raise exception 'Action non autorisée';
  end if;
  delete from auth.users where id = p_child;
end $$;
revoke execute on function public.remove_child(uuid) from anon, public;
grant execute on function public.remove_child(uuid) to authenticated;

-- Les jeunes partent avec le compte du parent ; jamais purgés seuls pour inactivité (ils ne se connectent pas)
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
  -- Comptes sans activité depuis 3 ans (jamais les super-admins, ni les jeunes gérés par un parent)
  delete from auth.users u
  where greatest(coalesce(u.last_sign_in_at, u.created_at), coalesce((select a.day::timestamptz from public.activity_last a where a.user_id = u.id), u.created_at)) < now() - interval '3 years'
    and not exists (select 1 from public.profiles p where p.id = u.id and (p.is_superadmin or p.guardian_id is not null));
end $f$;
revoke execute on function public.purge_old_data() from anon, public, authenticated;

-- =================================================================
-- 0022_parents_suite.sql
-- =================================================================
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

-- =================================================================
-- 0023_equipe_demo.sql
-- =================================================================
-- Équipe démo « RC Démo » : un club marqué is_demo, une équipe Séniors préremplie (joueurs fictifs, 3 stratégies,
-- agenda avec réponses, feuille de match, vues « qui a vu »).
-- - Les joueurs fictifs sont des comptes sans mot de passe, à une adresse en .invalid : ils ne peuvent pas se connecter
--   et ne reçoivent jamais de notification ni d'e-mail (aucun appareil inscrit, aucune adresse joignable).
-- - « Voir la démo » (visiteur sans compte) lit une copie de ce club avec demo_snapshot(), en lecture seule :
--   aucune donnée privée (ni e-mail, ni infos privées, ni codes d'invitation), et l'appli n'écrit rien.
-- - select public.demo_reset(); recrée la démo (dates recalées sur aujourd'hui) ; tâche planifiée chaque lundi.
-- Contient des suppressions (demo_reset) : à coller dans l'éditeur SQL (base de test d'abord, production ensuite).

alter table public.clubs add column if not exists is_demo boolean not null default false;

-- Copie en lecture seule du club démo
create or replace function public.demo_snapshot() returns jsonb
language sql stable security definer set search_path = public as $$
  with c as (select * from clubs where is_demo order by created_at limit 1),
  t as (select * from teams where club_id = (select id from c)),
  m as (select team_id, user_id, role, status, plays, requested_as, joined_at from team_members where team_id in (select id from t) and status = 'active'),
  e as (select * from team_events where team_id in (select id from t)),
  d as (select id, owner_id, team_id, title, data, visibility, share_mode, published_at, created_at, updated_at from drawings where team_id in (select id from t) and visibility = 'team')
  select case when exists (select 1 from c) then jsonb_build_object(
    'club', (select to_jsonb(c) - 'join_code' from c),
    'teams', (select coalesce(jsonb_agg(to_jsonb(t) - 'join_code'), '[]'::jsonb) from t),
    'team_members', (select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb) from m),
    'club_members', (select coalesce(jsonb_agg(jsonb_build_object('club_id', club_id, 'user_id', user_id, 'role', role, 'title', title, 'joined_at', joined_at)), '[]'::jsonb)
                     from club_members where club_id = (select id from c) and user_id in (select user_id from m)),
    'profiles', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'display_name', display_name, 'avatar', avatar, 'positions', positions, 'jersey_number', jersey_number,
                  'strong_foot', strong_foot, 'height_cm', height_cm, 'weight_kg', weight_kg, 'bio', bio, 'is_superadmin', false, 'guardian_id', null)), '[]'::jsonb)
                 from profiles where id in (select user_id from m)),
    'team_events', (select coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb) from e),
    'event_responses', (select coalesce(jsonb_agg(jsonb_build_object('event_id', event_id, 'user_id', user_id, 'status', status, 'comment', comment, 'set_by', set_by, 'updated_at', updated_at)), '[]'::jsonb)
                        from event_responses where event_id in (select id from e)),
    'drawings', (select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) from d),
    'drawing_views', (select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb) from drawing_views v where drawing_id in (select id from d)),
    'drawing_comments', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'drawing_id', drawing_id, 'user_id', user_id, 'body', body, 'created_at', created_at)), '[]'::jsonb)
                         from drawing_comments where drawing_id in (select id from d)),
    'match_sheets', (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from match_sheets s where team_id in (select id from t) and published)
  ) end $$;
revoke execute on function public.demo_snapshot() from public;
grant execute on function public.demo_snapshot() to anon, authenticated;

-- Compte fictif de la démo (sans mot de passe, adresse non joignable)
create or replace function public.demo_user(p_id uuid, p_name text, p_pos text, p_num int) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', 'demo-' || p_id || '@demo.rugbeo.invalid', '', now(),
          '{"provider":"demo","providers":["demo"]}'::jsonb, jsonb_build_object('display_name', p_name, 'demo', true), now() - interval '90 days', now(), '', '', '', '');
  update profiles set positions = case when p_pos is null then '{}' else array[p_pos] end, jersey_number = p_num where id = p_id;
  return p_id;
end $$;
revoke execute on function public.demo_user(uuid, text, text, int) from anon, public, authenticated;

create or replace function public.demo_reset() returns text
language plpgsql security definer set search_path = public as $$
declare
  club uuid := 'd0000000-0000-4000-8000-000000000001';
  sen  uuid := 'd0000000-0000-4000-8000-000000000011';
  coach uuid := 'd0000000-0000-4000-8000-000000000100';
  adj uuid := 'd0000000-0000-4000-8000-000000000101';
  tr1 uuid := 'd0000000-0000-4000-8000-000000000201';
  tr2 uuid := 'd0000000-0000-4000-8000-000000000202';
  mt  uuid := 'd0000000-0000-4000-8000-000000000203';
  s1 uuid := 'd0000000-0000-4000-8000-000000000301';
  s2 uuid := 'd0000000-0000-4000-8000-000000000302';
  s3 uuid := 'd0000000-0000-4000-8000-000000000303';
  names text[] := array['Kevin Durand','Mathis Roux','Yanis Petit','Bastien Lambert','Florian Girard','Romain Fontaine','Maxime Chevalier','Alexis Robin',
                        'Léo Garnier','Hugo Perrin','Enzo Marchand','Thomas Blanc','Lucas Fabre','Nathan Guérin','Clément Bonnet','Antoine Mercier',
                        'Jules Lemoine','Quentin Dupuis','Samuel Rey','Adrien Barbier'];
  posts text[] := array['Pilier','Talonneur','Pilier','2e ligne','2e ligne','3e ligne','3e ligne','3e ligne','Demi de mêlée','Demi d’ouverture',
                        'Ailier','Centre','Centre','Ailier','Arrière','Talonneur','Pilier','2e ligne','3e ligne','Centre'];
  pl uuid[] := '{}'; u uuid; i int;
  day0 timestamptz := date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris';
  P jsonb; L jsonb; Q jsonb; squad jsonb := '[]'::jsonb;
begin
  -- 1. On efface l'ancienne démo (club, équipe, comptes fictifs et tout ce qui leur est lié)
  delete from auth.users where email like '%@demo.rugbeo.invalid';
  delete from clubs where id = club or is_demo;

  -- 2. Comptes fictifs
  perform demo_user(coach, 'Julien Moreau', null, null);
  perform demo_user(adj, 'Pierre Faure', null, null);
  for i in 1..20 loop
    u := ('d0000000-0000-4000-8000-0000000010' || lpad(i::text, 2, '0'))::uuid;
    perform demo_user(u, names[i], posts[i], i);
    pl := pl || u;
  end loop;
  update profiles set bio = 'Coach des Séniors depuis 2021. Rugby de mouvement, défense agressive.' where id = coach;

  -- 3. Club et équipe
  insert into clubs (id, name, join_code, created_by, is_demo) values (club, 'RC Démo', 'RCDEMO' || substr(md5(random()::text), 1, 2), coach, true);
  insert into teams (id, club_id, name, join_code, created_by, share_default, sheet_settings) values (sen, club, 'Séniors', 'DEMO' || upper(substr(md5(random()::text), 1, 4)), coach, 'app',
    '{"template":"classic","primary":"#7a1f2b","accent":"#ffffff","showPositions":true,"squads":[{"id":"a","label":"Équipe A","size":23}]}'::jsonb);
  insert into team_members (team_id, user_id, role, status, plays, joined_at) values (sen, coach, 'coach', 'active', false, now() - interval '90 days'), (sen, adj, 'admin', 'active', false, now() - interval '88 days');
  for i in 1..20 loop insert into team_members (team_id, user_id, role, status, joined_at) values (sen, pl[i], 'player', 'active', now() - interval '80 days' + i * interval '1 day'); end loop;
  update club_members set role = 'responsable', title = 'Président' where club_id = club and user_id = adj;

  -- 4. Agenda : deux entraînements, un match, avec des réponses variées
  insert into team_events (id, team_id, kind, title, opponent, home, starts_at, meet_at, location, notes, created_by) values
    (tr1, sen, 'training', 'Entraînement', null, null, day0 + interval '1 day 19 hours 30 minutes', day0 + interval '1 day 19 hours 15 minutes', 'Stade des Tilleuls', 'Travail des lancements de jeu', coach),
    (tr2, sen, 'training', 'Entraînement', null, null, day0 + interval '3 days 19 hours 30 minutes', null, 'Stade des Tilleuls', null, coach),
    (mt, sen, 'match', 'Match', 'US Vallée Verte', true, day0 + interval '4 days 15 hours', day0 + interval '4 days 13 hours 30 minutes', 'Stade des Tilleuls', 'Maillots rouges, shorts blancs', coach);
  for i in 1..20 loop
    if i <> 9 then insert into event_responses (event_id, user_id, status, comment, set_by) values (mt, pl[i],
      case when i <= 15 then 'yes' when i <= 18 then 'maybe' else 'no' end,
      case when i = 16 then 'Travail jusqu’à 13 h' when i = 19 then 'Blessé à la cheville' end, pl[i]); end if;
    if i <= 14 then insert into event_responses (event_id, user_id, status, set_by) values (tr1, pl[i], case when i in (8, 13) then 'no' else 'yes' end, pl[i]); end if;
  end loop;

  -- 5. Trois stratégies animées
  -- Joueur et ligne au format de l'éditeur (coordonnées en mètres : x = 40 + 8 m, y = 40 + 8 m)
  P := '[]'::jsonb;
  insert into drawings (id, owner_id, team_id, title, visibility, published_at, data) values
  (s1, coach, sen, 'Croisée 10-12', 'team', now() - interval '2 days', jsonb_build_object('id', s1, 'title', 'Croisée 10-12', 'category', 'Attaque', 'tags', 'lancement', 'settings', '{"field":"full","orientation":"landscape","stepDuration":1200}'::jsonb, 'steps', jsonb_build_array(
    jsonb_build_object('id','a1','note','Le 9 sert le 10 à plat.','objects', jsonb_build_array(
      jsonb_build_object('id','n9','type','player','color','blue','jersey',true,'ball',true,'label','9','scale',1,'x',536,'y',216),
      jsonb_build_object('id','n10','type','player','color','blue','jersey',true,'ball',false,'label','10','scale',1,'x',488,'y',264),
      jsonb_build_object('id','n12','type','player','color','blue','jersey',true,'ball',false,'label','12','scale',1,'x',456,'y',312),
      jsonb_build_object('id','n13','type','player','color','blue','jersey',true,'ball',false,'label','13','scale',1,'x',424,'y',360),
      jsonb_build_object('id','n15','type','player','color','blue','jersey',true,'ball',false,'label','15','scale',1,'x',408,'y',416),
      jsonb_build_object('id','d1','type','player','color','red','jersey',true,'ball',false,'label','','scale',1,'x',616,'y',248),
      jsonb_build_object('id','d2','type','player','color','red','jersey',true,'ball',false,'label','','scale',1,'x',616,'y',304),
      jsonb_build_object('id','d3','type','player','color','red','jersey',true,'ball',false,'label','','scale',1,'x',616,'y',360),
      jsonb_build_object('id','d4','type','player','color','red','jersey',true,'ball',false,'label','','scale',1,'x',600,'y',416),
      jsonb_build_object('id','p1','type','line','style','straight','x1',528,'y1',224,'x2',496,'y2',256,'dashed',true,'arrow',true,'color','white','width',3))),
    jsonb_build_object('id','a2','note','Le 10 fixe vers l’intérieur, le 12 croise dans son dos.','objects', jsonb_build_array(
      jsonb_build_object('id','n9','type','player','color','blue','jersey',true,'ball',false,'label','9','scale',1,'x',528,'y',216),
      jsonb_build_object('id','n10','type','player','color','blue','jersey',true,'ball',true,'label','10','scale',1,'x',512,'y',288),
      jsonb_build_object('id','n12','type','player','color','blue','jersey',true,'ball',false,'label','12','scale',1,'x',488,'y',288),
      jsonb_build_object('id','n13','type','player','color','blue','jersey',true,'ball',false,'label','13','scale',1,'x',432,'y',352),
      jsonb_build_object('id','n15','type','player','color','blue','jersey',true,'ball',false,'label','15','scale',1,'x',416,'y',408),
      jsonb_build_object('id','d1','type','player','color','red','jersey',true,'ball',false,'label','','scale',1,'x',608,'y',256),
      jsonb_build_object('id','d2','type','player','color','red','jersey',true,'ball',false,'label','','scale',1,'x',600,'y',304),
      jsonb_build_object('id','d3','type','player','color','red','jersey',true,'ball',false,'label','','scale',1,'x',616,'y',360),
      jsonb_build_object('id','d4','type','player','color','red','jersey',true,'ball',false,'label','','scale',1,'x',600,'y',416),
      jsonb_build_object('id','r1','type','line','style','wavy','x1',488,'y1',264,'x2',512,'y2',288,'dashed',false,'arrow',true,'color','white','width',3),
      jsonb_build_object('id','r2','type','line','style','straight','x1',456,'y1',312,'x2',488,'y2',288,'dashed',false,'arrow',true,'color','white','width',3))),
    jsonb_build_object('id','a3','note','Le 12 perce entre les deux premiers défenseurs.','objects', jsonb_build_array(
      jsonb_build_object('id','n9','type','player','color','blue','jersey',true,'ball',false,'label','9','scale',1,'x',528,'y',216),
      jsonb_build_object('id','n10','type','player','color','blue','jersey',true,'ball',false,'label','10','scale',1,'x',528,'y',304),
      jsonb_build_object('id','n12','type','player','color','blue','jersey',true,'ball',true,'label','12','scale',1,'x',640,'y',280),
      jsonb_build_object('id','n13','type','player','color','blue','jersey',true,'ball',false,'label','13','scale',1,'x',488,'y',352),
      jsonb_build_object('id','n15','type','player','color','blue','jersey',true,'ball',false,'label','15','scale',1,'x',456,'y',400),
      jsonb_build_object('id','d1','type','player','color','red','jersey',true,'ball',false,'label','','scale',1,'x',600,'y',248),
      jsonb_build_object('id','d2','type','player','color','red','jersey',true,'ball',false,'label','','scale',1,'x',600,'y',320),
      jsonb_build_object('id','d3','type','player','color','red','jersey',true,'ball',false,'label','','scale',1,'x',616,'y',360),
      jsonb_build_object('id','d4','type','player','color','red','jersey',true,'ball',false,'label','','scale',1,'x',600,'y',416),
      jsonb_build_object('id','r3','type','line','style','wavy','x1',528,'y1',296,'x2',632,'y2',280,'dashed',false,'arrow',true,'color','white','width',3)))))),
  (s2, coach, sen, 'Touche à 5 : lancement au milieu', 'team', now() - interval '6 days', jsonb_build_object('id', s2, 'title', 'Touche à 5 : lancement au milieu', 'category', 'Touche', 'tags', 'touche', 'settings', '{"field":"full","orientation":"landscape","stepDuration":1200}'::jsonb, 'steps', jsonb_build_array(
    jsonb_build_object('id','b1','note','Annonce au milieu : le 4 saute en 2e position.','objects', jsonb_build_array(
      jsonb_build_object('id','t2','type','player','color','blue','jersey',true,'ball',true,'label','2','scale',1,'x',400,'y',30),
      jsonb_build_object('id','t1','type','player','color','blue','jersey',true,'ball',false,'label','1','scale',1,'x',392,'y',80),
      jsonb_build_object('id','t4','type','player','color','blue','jersey',true,'ball',false,'label','4','scale',1,'x',392,'y',104),
      jsonb_build_object('id','t3','type','player','color','blue','jersey',true,'ball',false,'label','3','scale',1,'x',392,'y',128),
      jsonb_build_object('id','t5','type','player','color','blue','jersey',true,'ball',false,'label','5','scale',1,'x',392,'y',152),
      jsonb_build_object('id','t9','type','player','color','blue','jersey',true,'ball',false,'label','9','scale',1,'x',376,'y',176),
      jsonb_build_object('id','t10','type','player','color','blue','jersey',true,'ball',false,'label','10','scale',1,'x',336,'y',216),
      jsonb_build_object('id','e1','type','player','color','red','jersey',true,'ball',false,'label','','scale',1,'x',408,'y',80),
      jsonb_build_object('id','e2','type','player','color','red','jersey',true,'ball',false,'label','','scale',1,'x',408,'y',104),
      jsonb_build_object('id','e3','type','player','color','red','jersey',true,'ball',false,'label','','scale',1,'x',408,'y',128),
      jsonb_build_object('id','e4','type','player','color','red','jersey',true,'ball',false,'label','','scale',1,'x',408,'y',152))),
    jsonb_build_object('id','b2','note','Lancer : le 4 est soulevé et capte.','objects', jsonb_build_array(
      jsonb_build_object('id','t2','type','player','color','blue','jersey',true,'ball',false,'label','2','scale',1,'x',400,'y',30),
      jsonb_build_object('id','t1','type','player','color','blue','jersey',true,'ball',false,'label','1','scale',1,'x',392,'y',92),
      jsonb_build_object('id','t4','type','player','color','blue','jersey',true,'ball',true,'label','4','scale',1,'x',396,'y',104),
      jsonb_build_object('id','t3','type','player','color','blue','jersey',true,'ball',false,'label','3','scale',1,'x',392,'y',116),
      jsonb_build_object('id','t5','type','player','color','blue','jersey',true,'ball',false,'label','5','scale',1,'x',392,'y',152),
      jsonb_build_object('id','t9','type','player','color','blue','jersey',true,'ball',false,'label','9','scale',1,'x',384,'y',128),
      jsonb_build_object('id','t10','type','player','color','blue','jersey',true,'ball',false,'label','10','scale',1,'x',336,'y',216),
      jsonb_build_object('id','e1','type','player','color','red','jersey',true,'ball',false,'label','','scale',1,'x',408,'y',80),
      jsonb_build_object('id','e2','type','player','color','red','jersey',true,'ball',false,'label','','scale',1,'x',408,'y',104),
      jsonb_build_object('id','e3','type','player','color','red','jersey',true,'ball',false,'label','','scale',1,'x',408,'y',128),
      jsonb_build_object('id','e4','type','player','color','red','jersey',true,'ball',false,'label','','scale',1,'x',408,'y',152),
      jsonb_build_object('id','l1','type','line','style','straight','x1',400,'y1',38,'x2',396,'y2',96,'dashed',true,'arrow',true,'color','white','width',3))),
    jsonb_build_object('id','b3','note','Ballon donné au 9, passe vers le 10 lancé.','objects', jsonb_build_array(
      jsonb_build_object('id','t2','type','player','color','blue','jersey',true,'ball',false,'label','2','scale',1,'x',400,'y',30),
      jsonb_build_object('id','t1','type','player','color','blue','jersey',true,'ball',false,'label','1','scale',1,'x',392,'y',92),
      jsonb_build_object('id','t4','type','player','color','blue','jersey',true,'ball',false,'label','4','scale',1,'x',392,'y',104),
      jsonb_build_object('id','t3','type','player','color','blue','jersey',true,'ball',false,'label','3','scale',1,'x',392,'y',116),
      jsonb_build_object('id','t5','type','player','color','blue','jersey',true,'ball',false,'label','5','scale',1,'x',392,'y',152),
      jsonb_build_object('id','t9','type','player','color','blue','jersey',true,'ball',false,'label','9','scale',1,'x',376,'y',136),
      jsonb_build_object('id','t10','type','player','color','blue','jersey',true,'ball',true,'label','10','scale',1,'x',352,'y',232),
      jsonb_build_object('id','e1','type','player','color','red','jersey',true,'ball',false,'label','','scale',1,'x',408,'y',80),
      jsonb_build_object('id','e2','type','player','color','red','jersey',true,'ball',false,'label','','scale',1,'x',408,'y',104),
      jsonb_build_object('id','e3','type','player','color','red','jersey',true,'ball',false,'label','','scale',1,'x',408,'y',128),
      jsonb_build_object('id','e4','type','player','color','red','jersey',true,'ball',false,'label','','scale',1,'x',408,'y',152),
      jsonb_build_object('id','l2','type','line','style','straight','x1',376,'y1',144,'x2',352,'y2',224,'dashed',true,'arrow',true,'color','white','width',3)))))),
  (s3, coach, sen, 'Échauffement : passes en triangle', 'team', now() - interval '9 days', jsonb_build_object('id', s3, 'title', 'Échauffement : passes en triangle', 'category', 'Entraînement', 'tags', 'échauffement', 'settings', '{"field":"half","orientation":"landscape","stepDuration":1000}'::jsonb, 'steps', jsonb_build_array(
    jsonb_build_object('id','c1','note','Trois plots à 10 m. Le ballon tourne, on suit sa passe.','objects', jsonb_build_array(
      jsonb_build_object('id','k1','type','equip','kind','cone','x',300,'y',260,'scale',1,'rot',0),
      jsonb_build_object('id','k2','type','equip','kind','cone','x',380,'y',260,'scale',1,'rot',0),
      jsonb_build_object('id','k3','type','equip','kind','cone','x',340,'y',190,'scale',1,'rot',0),
      jsonb_build_object('id','j1','type','player','color','yellow','jersey',false,'ball',true,'label','A','scale',1,'x',300,'y',236),
      jsonb_build_object('id','j2','type','player','color','yellow','jersey',false,'ball',false,'label','B','scale',1,'x',380,'y',236),
      jsonb_build_object('id','j3','type','player','color','yellow','jersey',false,'ball',false,'label','C','scale',1,'x',340,'y',166))),
    jsonb_build_object('id','c2','note','A passe à B et court à son plot.','objects', jsonb_build_array(
      jsonb_build_object('id','k1','type','equip','kind','cone','x',300,'y',260,'scale',1,'rot',0),
      jsonb_build_object('id','k2','type','equip','kind','cone','x',380,'y',260,'scale',1,'rot',0),
      jsonb_build_object('id','k3','type','equip','kind','cone','x',340,'y',190,'scale',1,'rot',0),
      jsonb_build_object('id','j1','type','player','color','yellow','jersey',false,'ball',false,'label','A','scale',1,'x',364,'y',240),
      jsonb_build_object('id','j2','type','player','color','yellow','jersey',false,'ball',true,'label','B','scale',1,'x',380,'y',236),
      jsonb_build_object('id','j3','type','player','color','yellow','jersey',false,'ball',false,'label','C','scale',1,'x',340,'y',166),
      jsonb_build_object('id','q1','type','line','style','straight','x1',308,'y1',236,'x2',372,'y2',236,'dashed',true,'arrow',true,'color','white','width',3))),
    jsonb_build_object('id','c3','note','B passe à C, et ainsi de suite. Changer de sens après 2 minutes.','objects', jsonb_build_array(
      jsonb_build_object('id','k1','type','equip','kind','cone','x',300,'y',260,'scale',1,'rot',0),
      jsonb_build_object('id','k2','type','equip','kind','cone','x',380,'y',260,'scale',1,'rot',0),
      jsonb_build_object('id','k3','type','equip','kind','cone','x',340,'y',190,'scale',1,'rot',0),
      jsonb_build_object('id','j1','type','player','color','yellow','jersey',false,'ball',false,'label','A','scale',1,'x',372,'y',244),
      jsonb_build_object('id','j2','type','player','color','yellow','jersey',false,'ball',false,'label','B','scale',1,'x',352,'y',178),
      jsonb_build_object('id','j3','type','player','color','yellow','jersey',false,'ball',true,'label','C','scale',1,'x',340,'y',166),
      jsonb_build_object('id','q2','type','line','style','straight','x1',376,'y1',228,'x2',346,'y2',174,'dashed',true,'arrow',true,'color','white','width',3))))));
  -- Vues « qui a vu » : la combinaison du week-end vue par 15 joueurs sur 20
  for i in 1..20 loop
    if i <= 15 then insert into drawing_views (drawing_id, user_id, views, played) values (s1, pl[i], 2, true); end if;
    if i <= 19 then insert into drawing_views (drawing_id, user_id, views, played) values (s2, pl[i], 1, true); end if;
    insert into drawing_views (drawing_id, user_id, views, played) values (s3, pl[i], 1, i % 3 <> 0);
  end loop;
  insert into drawing_comments (drawing_id, user_id, body, created_at) values
    (s1, pl[12], 'Je pars à quelle distance du 10 ?', now() - interval '1 day 2 hours'),
    (s1, coach, 'Deux mètres derrière lui, et tu accélères au moment de la passe.', now() - interval '1 day 1 hour');

  -- 6. Feuille du match publiée (les 15 présents + remplaçants)
  for i in 1..20 loop
    if i not in (19, 20) then squad := squad || jsonb_build_object('name', names[i], 'user_id', pl[i], 'marks', case when i = 8 then '["C"]'::jsonb when i in (1, 2, 3) then '["1"]'::jsonb else '[]'::jsonb end); end if;
  end loop;
  insert into match_sheets (team_id, event_id, published, published_at, updated_by, data) values (sen, mt, true, now() - interval '1 day', coach,
    jsonb_build_object('opponent', 'US Vallée Verte', 'meet', '13:30', 'values', jsonb_build_object('rouge', 'Julien Moreau', 'blanc', 'Pierre Faure'), 'squads', jsonb_build_object('a', squad), 'squadValues', '{}'::jsonb, 'notes', 'Maillots rouges, shorts blancs. Covoiturage : parking du stade à 13 h.'));

  return 'Démo recréée : RC Démo, Séniors, 20 joueurs fictifs, 3 stratégies, 3 événements, une feuille publiée.';
end $$;
revoke execute on function public.demo_reset() from anon, public, authenticated;

-- Dates de la démo recalées chaque lundi matin
select cron.unschedule('demo-reset') where exists (select 1 from cron.job where jobname = 'demo-reset');
select cron.schedule('demo-reset', '17 4 * * 1', 'select public.demo_reset()');
select public.demo_reset();
