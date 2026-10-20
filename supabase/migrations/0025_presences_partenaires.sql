-- Lot 3 : statistiques de présence (saison du club ou 30 derniers jours) et partenaires (sponsors) du club.
-- Rien n'est supprimé.

-- ---------- Statistiques de présence ----------
-- Début de la saison en cours d'une équipe : clubs.season_start (« MM-JJ »), 1er juillet sans club
create or replace function public.season_start_of(p_team uuid) returns timestamptz
language sql stable security definer set search_path = public as $$
  with s as (
    select coalesce((select c.season_start from teams t join clubs c on c.id = t.club_id where t.id = p_team), '07-01') as mmdd,
           (now() at time zone 'Europe/Paris')::date as today
  ), d as (
    select make_date(extract(year from today)::int, split_part(mmdd, '-', 1)::int, split_part(mmdd, '-', 2)::int) as this_year, today from s
  )
  select (case when this_year <= today then this_year else (this_year - interval '1 year')::date end)::timestamp at time zone 'Europe/Paris' from d;
$$;
revoke execute on function public.season_start_of(uuid) from anon, public;
grant execute on function public.season_start_of(uuid) to authenticated;

-- Par joueur convoqué (joueur, ou staff qui joue aussi) : entraînements et matchs passés, non annulés,
-- depuis le début de la saison (p_days null) ou les p_days derniers jours, et depuis son arrivée dans l'équipe.
-- Le staff voit toute l'équipe ; un joueur (ou le parent d'un jeune) seulement ses propres chiffres.
create or replace function public.attendance_stats(p_team uuid, p_days int default null)
returns table (user_id uuid, display_name text, kind text, total int, present int, maybe int, absent int, unanswered int)
language sql stable security definer set search_path = public as $$
  with since as (
    select case when p_days is null then public.season_start_of(p_team) else now() - make_interval(days => least(greatest(p_days, 1), 400)) end as t
  ), m as (
    select tm.user_id, tm.joined_at from team_members tm
    where tm.team_id = p_team and tm.status = 'active' and (tm.role = 'player' or tm.plays)
      and (public.is_staff(p_team) or public.is_me(tm.user_id))
  ), ev as (
    select e.id, e.kind, e.starts_at from team_events e, since
    where e.team_id = p_team and not e.cancelled and e.kind in ('training', 'match') and e.starts_at >= since.t and e.starts_at < now()
  )
  select m.user_id, p.display_name, k.kind,
    count(ev.id)::int,
    count(*) filter (where r.status = 'yes')::int,
    count(*) filter (where r.status = 'maybe')::int,
    count(*) filter (where r.status = 'no')::int,
    count(ev.id) filter (where r.status is null)::int
  from m
  join profiles p on p.id = m.user_id
  cross join (values ('training'), ('match')) as k(kind)
  left join ev on ev.kind = k.kind and ev.starts_at >= m.joined_at
  left join event_responses r on r.event_id = ev.id and r.user_id = m.user_id
  group by m.user_id, p.display_name, k.kind;
$$;
revoke execute on function public.attendance_stats(uuid, int) from anon, public;
grant execute on function public.attendance_stats(uuid, int) to authenticated;

-- ---------- Partenaires du club ----------
create table if not exists public.club_sponsors (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  logo text check (logo is null or (logo ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$' and length(logo) < 200000)),
  url text check (url is null or (url ~* '^https?://[^\s]+$' and length(url) <= 300)),
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists club_sponsors_club_idx on public.club_sponsors (club_id, position);
alter table public.club_sponsors enable row level security;
-- Lecture : les membres du club et de ses équipes ; écriture : la direction du club (et le super-admin)
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'club_sponsors' and policyname = 'sponsors_select') then
    create policy sponsors_select on public.club_sponsors for select to authenticated
      using (public.is_club_member(club_id) or exists (select 1 from teams t where t.club_id = club_sponsors.club_id and public.is_member(t.id)));
    create policy sponsors_insert on public.club_sponsors for insert to authenticated with check (public.is_club_admin(club_id));
    create policy sponsors_update on public.club_sponsors for update to authenticated using (public.is_club_admin(club_id)) with check (public.is_club_admin(club_id));
    create policy sponsors_delete on public.club_sponsors for delete to authenticated using (public.is_club_admin(club_id));
  end if;
end $$;

-- Lien public d'une stratégie : les partenaires du club de l'équipe sont affichés en bas de page
create or replace function public.get_shared_drawing(p_token text) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'id', d.id, 'title', d.title, 'data', d.data, 'published_at', d.published_at, 'updated_at', d.updated_at,
    'owner_name', coalesce(p.display_name, ''), 'team_name', coalesce(t.name, ''),
    'club_name', coalesce(c.name, ''),
    'sponsors', coalesce((select json_agg(json_build_object('name', s.name, 'logo', s.logo, 'url', s.url) order by s.position, s.created_at)
                          from club_sponsors s where s.club_id = t.club_id), '[]'::json)
  )
  from drawings d left join profiles p on p.id = d.owner_id left join teams t on t.id = d.team_id left join clubs c on c.id = t.club_id
  where d.share_token is not null and length(p_token) >= 16 and d.share_token = p_token
    and coalesce(d.share_mode, t.share_default, 'public') = 'public'
  limit 1;
$$;
