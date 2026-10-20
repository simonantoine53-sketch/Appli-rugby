-- Espace parents : un compte parent gère un ou plusieurs jeunes (moins de 15 ans).
-- Chaque jeune est un vrai compte (auth.users + profiles), sans mot de passe ni e-mail joignable :
-- il ne peut pas se connecter ; c'est le parent qui agit pour lui (convocations, profil, équipes).
-- Toutes les tables existantes (team_members, event_responses, drawing_views…) marchent donc telles quelles.

-- =================================================================
-- Partie 1
-- =================================================================

alter table public.profiles add column if not exists guardian_id uuid references public.profiles(id) on delete cascade;
create index if not exists profiles_guardian_idx on public.profiles (guardian_id) where guardian_id is not null;

-- Moi, ou un jeune dont je suis le parent
create or replace function public.is_me(u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select u = auth.uid() or exists (select 1 from profiles where id = u and guardian_id = auth.uid() and auth.uid() is not null) $$;
revoke execute on function public.is_me(uuid) from anon, public;
grant execute on function public.is_me(uuid) to authenticated;

create or replace function public.my_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
  select auth.uid() where auth.uid() is not null
  union all select id from profiles where guardian_id = auth.uid() and auth.uid() is not null $$;
revoke execute on function public.my_ids() from anon, public;
grant execute on function public.my_ids() to authenticated;

-- Le lien parent / jeune ne se modifie pas depuis l'appli
create or replace function public.protect_guardian() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and new.guardian_id is distinct from old.guardian_id then
    raise exception 'Le parent d''un jeune ne peut pas être changé';
  end if;
  return new;
end $$;
drop trigger if exists profiles_protect_guardian on public.profiles;
create trigger profiles_protect_guardian before update on public.profiles for each row execute function public.protect_guardian();

-- ---------- Fonctions d'accès : les équipes de mes jeunes comptent comme les miennes ----------
create or replace function public.is_member(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from team_members where team_id = t and user_id in (select public.my_ids()) and status = 'active')
    or public.is_club_admin(public.team_club(t)) $$;

create or replace function public.is_club_member(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from club_members where club_id = c and user_id in (select public.my_ids())) or public.is_superadmin() $$;

create or replace function public.is_pending(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from team_members where team_id = t and user_id in (select public.my_ids()) and status = 'pending') $$;

create or replace function public.shares_team_with(u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_me(u) or exists (
    select 1 from team_members a join team_members b on a.team_id = b.team_id
    where a.user_id in (select public.my_ids()) and b.user_id = u and a.status = 'active'
  ) or exists (
    select 1 from club_members a join club_members b on a.club_id = b.club_id
    where a.user_id = auth.uid() and b.user_id = u and (a.role = 'responsable' or b.role = 'responsable')
  ) or public.is_superadmin() $$;

-- ---------- Rejoindre : pour moi ou pour un de mes jeunes (p_for) ----------
drop function if exists public.join_with_code(text);
create or replace function public.join_with_code(p_code text, p_for uuid default null) returns json
language plpgsql security definer set search_path = public as $$
declare me uuid := coalesce(p_for, auth.uid()); c public.clubs; t public.teams; code text := upper(trim(coalesce(p_code, '')));
begin
  if auth.uid() is null then raise exception 'Non connecté'; end if;
  if not public.is_me(me) then raise exception 'Action non autorisée'; end if;
  if (select count(*) from join_attempts where user_id = auth.uid() and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Trop d''essais de code : réessayez dans une heure';
  end if;
  select * into c from clubs where join_code = code;
  if found then
    insert into club_members (club_id, user_id) values (c.id, me) on conflict do nothing;
    return json_build_object('kind', 'club', 'id', c.id, 'name', c.name);
  end if;
  select * into t from teams where join_code = code;
  if found then
    insert into team_members (team_id, user_id, role, status, requested_as) values (t.id, me, 'player', 'pending', 'player') on conflict do nothing;
    if t.club_id is not null then insert into club_members (club_id, user_id) values (t.club_id, me) on conflict do nothing; end if;
    return json_build_object('kind', 'team', 'id', t.id, 'name', t.name, 'club_id', t.club_id);
  end if;
  insert into join_attempts (user_id) values (auth.uid());
  return null;
end $$;
revoke execute on function public.join_with_code(text, uuid) from anon, public;
grant execute on function public.join_with_code(text, uuid) to authenticated;

drop function if exists public.request_team(uuid, text);
create or replace function public.request_team(p_team uuid, p_as text, p_for uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := coalesce(p_for, auth.uid());
begin
  if auth.uid() is null then raise exception 'Non connecté'; end if;
  if not public.is_me(me) then raise exception 'Action non autorisée'; end if;
  if p_as not in ('player', 'staff') then raise exception 'Demande invalide'; end if;
  if me <> auth.uid() and p_as <> 'player' then raise exception 'Un jeune rejoint une équipe comme joueur'; end if;
  if not exists (select 1 from club_members where club_id = public.team_club(p_team) and user_id = me) and not public.is_superadmin() then
    raise exception 'Rejoignez d''abord le club';
  end if;
  insert into team_members (team_id, user_id, role, status, requested_as) values (p_team, me, 'player', 'pending', p_as)
  on conflict (team_id, user_id) do update set requested_as = excluded.requested_as where team_members.status = 'pending';
end $$;
revoke execute on function public.request_team(uuid, text, uuid) from anon, public;
grant execute on function public.request_team(uuid, text, uuid) to authenticated;

drop function if exists public.mark_drawing_viewed(uuid, boolean);
create or replace function public.mark_drawing_viewed(p_drawing uuid, p_played boolean default false, p_for uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := coalesce(p_for, auth.uid());
begin
  if auth.uid() is null or not public.is_me(me) then return; end if;
  -- Le jeune doit être membre de l'équipe ; pour soi, la direction du club compte aussi (is_member)
  if not exists (select 1 from drawings d where d.id = p_drawing and d.visibility = 'team'
                 and (exists (select 1 from team_members m where m.team_id = d.team_id and m.user_id = me and m.status = 'active')
                      or (me = auth.uid() and public.is_member(d.team_id)))) then return; end if;
  insert into drawing_views (drawing_id, user_id, played) values (p_drawing, me, p_played)
  on conflict (drawing_id, user_id) do update
    set last_seen_at = now(),
        views = drawing_views.views + case when p_played then 0 else 1 end,
        played = drawing_views.played or excluded.played;
end $$;
revoke execute on function public.mark_drawing_viewed(uuid, boolean, uuid) from anon, public;
grant execute on function public.mark_drawing_viewed(uuid, boolean, uuid) to authenticated;

-- ---------- Créer un jeune ----------
-- Compte sans mot de passe, adresse en .invalid (domaine réservé, jamais distribué) : connexion impossible.
create or replace function public.create_child_for(p_parent uuid, p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare kid uuid := gen_random_uuid(); nm text := left(trim(coalesce(p_name, '')), 60); pmail text;
begin
  if nm = '' then raise exception 'Indiquez le prénom du jeune'; end if;
  if (select count(*) from profiles where guardian_id = p_parent) >= 6 then raise exception '6 jeunes au maximum par compte'; end if;
  select email into pmail from auth.users where id = p_parent;
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
  values ('00000000-0000-0000-0000-000000000000', kid, 'authenticated', 'authenticated', 'jeune-' || kid || '@rugbeo.invalid', '', now(),
          '{"provider":"managed","providers":["managed"]}'::jsonb, jsonb_build_object('display_name', nm, 'managed', true),
          now(), now(), '', '', '', '');
  update profiles set guardian_id = p_parent where id = kid;
  -- Preuve : compte créé par le parent, qui a accepté la politique de confidentialité pour lui
  insert into profile_private (user_id, under_15, parent_email, parental_consent_at, terms_version, terms_accepted_at)
  select kid, true, pmail, now(), pp.terms_version, now() from (select (select terms_version from profile_private where user_id = p_parent) as terms_version) pp
  on conflict (user_id) do update set under_15 = true, parent_email = excluded.parent_email, parental_consent_at = now();
  return kid;
end $$;
revoke execute on function public.create_child_for(uuid, text) from anon, public, authenticated;

create or replace function public.add_child(p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Non connecté'; end if;
  if exists (select 1 from profiles where id = auth.uid() and guardian_id is not null) then raise exception 'Action non autorisée'; end if;
  return public.create_child_for(auth.uid(), p_name);
end $$;
revoke execute on function public.add_child(text) from anon, public;
grant execute on function public.add_child(text) to authenticated;

-- Inscription d'un parent : les prénoms des jeunes arrivent dans les métadonnées (kids)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb); u15 boolean := coalesce((m->>'under_15')::boolean, false); k text;
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(m->>'display_name', ''), split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  -- Preuve de l'information et de l'accord parental (moins de 15 ans) donnés à l'inscription
  if m ? 'terms_version' then
    insert into public.profile_private (user_id, terms_version, terms_accepted_at, under_15, parent_email, parental_consent_at)
    values (new.id, left(m->>'terms_version', 20), now(), u15,
            case when u15 then left(nullif(trim(m->>'parent_email'), ''), 254) end,
            case when u15 and coalesce((m->>'parental_consent')::boolean, false) then now() end)
    on conflict (user_id) do update set terms_version = excluded.terms_version, terms_accepted_at = excluded.terms_accepted_at,
      under_15 = excluded.under_15, parent_email = excluded.parent_email, parental_consent_at = excluded.parental_consent_at;
  end if;
  -- Parent : création des jeunes (6 au plus)
  if jsonb_typeof(m->'kids') = 'array' and not coalesce((m->>'managed')::boolean, false) then
    for k in select value from jsonb_array_elements_text(m->'kids') limit 6 loop
      if trim(k) <> '' then perform public.create_child_for(new.id, k); end if;
    end loop;
  end if;
  return new;
end $$;

-- ---------- Politiques : « moi » devient « moi ou mes jeunes » ----------
drop policy if exists club_members_remove on public.club_members;
create policy club_members_remove on public.club_members for delete to authenticated using (is_club_admin(club_id) or public.is_me(user_id));
drop policy if exists club_members_select on public.club_members;
create policy club_members_select on public.club_members for select to authenticated
  using (public.is_me(user_id) or (role = 'responsable' and is_club_member(club_id)) or is_club_admin(club_id));

drop policy if exists comments_delete on public.drawing_comments;
create policy comments_delete on public.drawing_comments for delete to authenticated
  using (public.is_me(user_id) or exists (select 1 from drawings d where d.id = drawing_comments.drawing_id and is_staff(d.team_id)));
drop policy if exists comments_insert on public.drawing_comments;
create policy comments_insert on public.drawing_comments for insert to authenticated
  with check (public.is_me(user_id) and exists (select 1 from drawings d where d.id = drawing_comments.drawing_id and d.visibility = 'team'));

drop policy if exists views_select on public.drawing_views;
create policy views_select on public.drawing_views for select to authenticated
  using (public.is_me(user_id) or exists (select 1 from drawings d where d.id = drawing_views.drawing_id and is_staff(d.team_id)));

drop policy if exists drawings_delete on public.drawings;
create policy drawings_delete on public.drawings for delete to authenticated using (public.is_me(owner_id) or is_coach(team_id));
drop policy if exists drawings_insert on public.drawings;
create policy drawings_insert on public.drawings for insert to authenticated
  with check (public.is_me(owner_id) and (team_id is null or is_member(team_id)) and (visibility <> 'team' or is_coach(team_id)));
drop policy if exists drawings_select on public.drawings;
create policy drawings_select on public.drawings for select to authenticated
  using (public.is_me(owner_id) or (visibility = 'team' and is_member(team_id)) or (visibility = 'proposed' and is_coach(team_id)));
drop policy if exists drawings_update on public.drawings;
create policy drawings_update on public.drawings for update to authenticated
  using (public.is_me(owner_id) or is_coach(team_id))
  with check ((public.is_me(owner_id) or is_coach(team_id)) and (team_id is null or is_member(team_id)) and (visibility <> 'team' or is_coach(team_id)));

drop policy if exists responses_delete on public.event_responses;
create policy responses_delete on public.event_responses for delete to authenticated
  using (public.is_me(user_id) or is_staff(event_team(event_id)));
drop policy if exists responses_insert on public.event_responses;
create policy responses_insert on public.event_responses for insert to authenticated
  with check (
    (public.is_me(user_id) and exists (select 1 from team_members m where m.team_id = event_team(event_responses.event_id) and m.user_id = event_responses.user_id and m.status = 'active'))
    or (is_staff(event_team(event_id))
        and exists (select 1 from team_members m where m.team_id = event_team(event_responses.event_id) and m.user_id = event_responses.user_id and m.status = 'active'))
  );
drop policy if exists responses_update on public.event_responses;
create policy responses_update on public.event_responses for update to authenticated
  using (public.is_me(user_id) or is_staff(event_team(event_id)))
  with check (public.is_me(user_id) or is_staff(event_team(event_id)));

drop policy if exists formations_delete on public.formations;
create policy formations_delete on public.formations for delete to authenticated using (public.is_me(owner_id) or is_staff(team_id));
drop policy if exists formations_insert on public.formations;
create policy formations_insert on public.formations for insert to authenticated
  with check (public.is_me(owner_id) and (team_id is null or is_member(team_id)));
drop policy if exists formations_select on public.formations;
create policy formations_select on public.formations for select to authenticated
  using (public.is_me(owner_id) or (team_id is not null and is_member(team_id)));
drop policy if exists formations_update on public.formations;
create policy formations_update on public.formations for update to authenticated
  using (public.is_me(owner_id) or is_staff(team_id)) with check (public.is_me(owner_id) or is_staff(team_id));

drop policy if exists private_delete on public.profile_private;
create policy private_delete on public.profile_private for delete to authenticated using (public.is_me(user_id));
drop policy if exists private_insert on public.profile_private;
create policy private_insert on public.profile_private for insert to authenticated with check (public.is_me(user_id));
drop policy if exists private_select on public.profile_private;
create policy private_select on public.profile_private for select to authenticated using (public.is_me(user_id) or is_staff_of(user_id));
drop policy if exists private_update on public.profile_private;
create policy private_update on public.profile_private for update to authenticated using (public.is_me(user_id)) with check (public.is_me(user_id));

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (public.is_me(id) or shares_team_with(id));
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated using (public.is_me(id)) with check (public.is_me(id));

drop policy if exists members_delete on public.team_members;
create policy members_delete on public.team_members for delete to authenticated using (public.is_me(user_id) or is_staff(team_id));
drop policy if exists members_select on public.team_members;
create policy members_select on public.team_members for select to authenticated using (is_member(team_id) or public.is_me(user_id));

-- =================================================================
-- Partie 2 (contient des suppressions : à coller dans l'éditeur SQL de Supabase)
-- =================================================================

-- Un jeune supprimé (par son parent, ou avec le compte du parent) : son compte de connexion part aussi
create or replace function public.drop_child_login() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.guardian_id is not null then delete from auth.users where id = old.id; end if;
  return old;
end $$;
drop trigger if exists profiles_drop_child_login on public.profiles;
create trigger profiles_drop_child_login after delete on public.profiles for each row execute function public.drop_child_login();

create or replace function public.remove_child(p_child uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not exists (select 1 from profiles where id = p_child and guardian_id = auth.uid()) then
    raise exception 'Action non autorisée';
  end if;
  delete from auth.users where id = p_child;
end $$;
revoke execute on function public.remove_child(uuid) from anon, public;
grant execute on function public.remove_child(uuid) to authenticated;

-- Les jeunes partent avec le compte du parent ; jamais purgés seuls pour inactivité (ils ne se connectent pas)
create or replace function public.purge_old_data() returns void
language plpgsql security definer set search_path = public as $f$
begin
  delete from public.events where created_at < now() - interval '13 months';          -- mesure d'usage
  delete from public.usage_sessions where started_at < now() - interval '13 months';
  delete from public.client_errors where created_at < now() - interval '6 months';     -- erreurs techniques
  delete from public.join_attempts where created_at < now() - interval '24 hours';     -- essais de code
  delete from public.feedback where created_at < now() - interval '2 years';           -- messages
  delete from public.page_counts where day < current_date - interval '25 months';      -- compteurs anonymes
  delete from public.activity_counts where period < current_date - interval '25 months';
  -- Comptes sans activité depuis 3 ans (jamais les super-admins, ni les jeunes gérés par un parent)
  delete from auth.users u
  where greatest(coalesce(u.last_sign_in_at, u.created_at), coalesce((select a.day::timestamptz from public.activity_last a where a.user_id = u.id), u.created_at)) < now() - interval '3 years'
    and not exists (select 1 from public.profiles p where p.id = u.id and (p.is_superadmin or p.guardian_id is not null));
end $f$;
revoke execute on function public.purge_old_data() from anon, public, authenticated;
