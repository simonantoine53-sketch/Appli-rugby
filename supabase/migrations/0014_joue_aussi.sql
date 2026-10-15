-- Fonction « joue aussi » : un coach ou un admin peut aussi être convoqué comme un joueur
-- (Présent / Peut-être / Absent, relances, compos). Les joueurs sont toujours convoqués.
-- Le rôle reste les droits (coach, admin, joueur) ; « plays » est la première fonction.
-- Seul le staff de l'équipe la modifie (politique members_update existante : is_staff).
-- Appliqué sur le projet « Appli Rugby Strat » le 2026-10-15.

alter table public.team_members add column if not exists plays boolean not null default false;
comment on column public.team_members.plays is 'Fonction « joue aussi » : un coach ou un admin convoqué comme un joueur (les joueurs le sont toujours)';
grant update (role, status, plays) on public.team_members to authenticated;
