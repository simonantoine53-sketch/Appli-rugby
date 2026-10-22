-- Lien d'invitation : la personne qui l'ouvre (sans compte) voit le nom de l'équipe ou du club qui l'invite
-- (« Vous êtes invité à rejoindre Séniors · SC Bernay »). Ne renvoie que les noms, rien sur les membres.
-- Les codes sont aléatoires (6 à 8 caractères) : deviner un code ne donne qu'un nom d'équipe.
create or replace function public.invite_info(p_code text)
returns table (kind text, team text, club text)
language sql stable security definer set search_path = public as $$
  select 'team'::text, t.name, c.name from teams t left join clubs c on c.id = t.club_id where t.join_code = upper(trim(p_code))
  union all
  select 'club'::text, null::text, c.name from clubs c where c.join_code = upper(trim(p_code))
  limit 1;
$$;
revoke execute on function public.invite_info(text) from public;
grant execute on function public.invite_info(text) to anon, authenticated;
