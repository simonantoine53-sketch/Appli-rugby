-- Partenaires : annonces dans l'appli (accueil, agenda), réservées aux adultes si besoin (loi Évin : bars, brasseries…),
-- et compteur anonyme d'affichages et de clics pour le super-admin.

-- 1. Partenaire réservé aux adultes : jamais affiché sur une équipe de jeunes
alter table public.club_sponsors add column if not exists adults_only boolean not null default false;

-- 2. Équipe de jeunes : devinée d'après le nom à la création (U16, Cadets, École de rugby…), modifiable par le staff
alter table public.teams add column if not exists youth boolean not null default false;
create or replace function public.guess_youth(p_name text) returns boolean
language sql immutable set search_path = public as $$
  select coalesce(p_name, '') ~* '(^|[^a-z0-9])(u ?-? ?(5|6|7|8|9|10|11|12|13|14|15|16|17|18|19)|-(1[0-9]|[5-9]) ?ans|moins de|jeunes|[éeÉE]cole|edr|cadet|cadette|junior|minime|benjamin|benjamine|poussin|baby|crabos|alamercery|gaudermen|balandrade|teuli[èeÈE]re)s?([^a-z0-9]|$)'
$$;
create or replace function public.teams_guess_youth() returns trigger
language plpgsql set search_path = public as $$
begin
  if not new.youth then new.youth := public.guess_youth(new.name); end if;
  return new;
end $$;
create or replace trigger teams_youth before insert on public.teams for each row execute function public.teams_guess_youth();
-- Équipes déjà créées : cochées « Jeunes » à la main par le bureau (Équipe › Club) ; seules les nouvelles sont devinées.
grant update (youth) on public.teams to authenticated;

-- 3. Compteur anonyme (aucun identifiant de personne) : affichages et clics par partenaire et par jour
create table if not exists public.sponsor_counts (
  day date not null,
  sponsor_id uuid not null references public.club_sponsors(id) on delete cascade,
  views integer not null default 0,
  clicks integer not null default 0,
  primary key (day, sponsor_id)
);
alter table public.sponsor_counts enable row level security;   -- aucune règle : lu et écrit seulement par les fonctions ci-dessous

create or replace function public.count_sponsor(p_sponsor uuid, p_kind text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_kind not in ('view', 'click') or not exists (select 1 from club_sponsors where id = p_sponsor) then return; end if;
  insert into sponsor_counts (day, sponsor_id, views, clicks)
  values ((now() at time zone 'Europe/Paris')::date, p_sponsor, (p_kind = 'view')::int, (p_kind = 'click')::int)
  on conflict (day, sponsor_id) do update set views = sponsor_counts.views + excluded.views, clicks = sponsor_counts.clicks + excluded.clicks;
end $$;
revoke execute on function public.count_sponsor(uuid, text) from public;
grant execute on function public.count_sponsor(uuid, text) to anon, authenticated;   -- anon : bas de page des liens publics

create or replace function public.admin_sponsor_stats(p_weeks integer default 12)
returns table (club text, sponsor text, adults_only boolean, views bigint, clicks bigint)
language sql stable security definer set search_path = public as $$
  select c.name, s.name, s.adults_only, coalesce(sum(k.views), 0), coalesce(sum(k.clicks), 0)
  from club_sponsors s join clubs c on c.id = s.club_id
  left join sponsor_counts k on k.sponsor_id = s.id
    and k.day >= date_trunc('week', (now() at time zone 'Europe/Paris')::date)::date - (greatest(1, least(coalesce(p_weeks, 12), 60)) - 1) * 7
  where public.is_superadmin() and not public.is_demo(c.id)
  group by s.id, c.name, s.name, s.adults_only, s.position
  order by c.name, coalesce(sum(k.clicks), 0) desc, s.position;
$$;
revoke execute on function public.admin_sponsor_stats(integer) from public, anon;
grant execute on function public.admin_sponsor_stats(integer) to authenticated;

-- 4. Lien public d'une stratégie : l'identifiant du partenaire (pour compter), sans les partenaires réservés aux adultes sur une équipe de jeunes
create or replace function public.get_shared_drawing(p_token text) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'id', d.id, 'title', d.title, 'data', d.data, 'published_at', d.published_at, 'updated_at', d.updated_at,
    'owner_name', coalesce(p.display_name, ''), 'team_name', coalesce(t.name, ''),
    'club_name', coalesce(c.name, ''),
    'sponsors', coalesce((select json_agg(json_build_object('id', s.id, 'name', s.name, 'logo', s.logo, 'url', s.url) order by s.position, s.created_at)
                          from club_sponsors s where s.club_id = t.club_id and not (s.adults_only and coalesce(t.youth, false))), '[]'::json)
  )
  from drawings d left join profiles p on p.id = d.owner_id left join teams t on t.id = d.team_id left join clubs c on c.id = t.club_id
  where d.share_token is not null and length(p_token) >= 16 and d.share_token = p_token
    and coalesce(d.share_mode, t.share_default, 'public') = 'public'
  limit 1;
$$;
