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
