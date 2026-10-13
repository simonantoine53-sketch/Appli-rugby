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
