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
