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
