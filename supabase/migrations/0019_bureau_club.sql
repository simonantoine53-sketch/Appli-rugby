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
