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
