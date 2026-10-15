-- Partager une stratégie avec une autre équipe du club : le staff de l'équipe d'origine envoie une COPIE,
-- reçue en proposition par le coach de l'équipe cible ; l'original n'est jamais modifiable par l'autre équipe.
-- Le coach de l'équipe cible ne peut pas parcourir les stratégies des autres équipes : il ne reçoit que ce qu'on lui partage.
-- Appliqué sur le projet « Appli Rugby Strat » le 2026-10-15.
create or replace function public.share_drawing(p_drawing uuid, p_team uuid) returns uuid
language plpgsql security definer set search_path = public as $f$
declare d public.drawings; src text; nid uuid := gen_random_uuid();
begin
  if auth.uid() is null then raise exception 'Non connecté'; end if;
  select * into d from drawings where id = p_drawing;
  if not found or d.team_id is null then raise exception 'Stratégie introuvable'; end if;
  if not public.is_staff(d.team_id) then raise exception 'Réservé au staff de l''équipe'; end if;
  if p_team = d.team_id or public.team_club(p_team) is distinct from public.team_club(d.team_id) then
    raise exception 'Partage possible seulement avec une autre équipe du club';
  end if;
  select name into src from teams where id = d.team_id;
  insert into drawings (id, owner_id, team_id, title, data, visibility)
  values (nid, auth.uid(), p_team, left(d.title || ' (' || src || ')', 120),
          jsonb_set(jsonb_set(d.data, '{id}', to_jsonb(nid::text)), '{sharedFrom}', to_jsonb(src)), 'proposed');
  return nid;
end $f$;
revoke execute on function public.share_drawing(uuid, uuid) from anon, public;
