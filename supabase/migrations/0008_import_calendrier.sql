-- Import du calendrier des matchs depuis un fichier agenda (.ics), par exemple celui de Mon Club House (FFR).
-- external_id garde l'identifiant du match dans le fichier (UID) : un nouvel import met à jour les matchs
-- déjà importés (date, lieu, annulation) au lieu de créer des doublons.
-- teams.calendar_club mémorise le nom du club tel qu'il apparaît dans le calendrier fédéral.
-- Appliqué sur le projet « Appli Rugby Strat » le 2026-10-13.

alter table public.team_events add column if not exists external_id text check (length(external_id) <= 200);
create unique index if not exists team_events_external_idx on public.team_events (team_id, external_id) where external_id is not null;

alter table public.teams add column if not exists calendar_club text check (length(calendar_club) <= 120);
