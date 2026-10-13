-- Droits de partage des stratégies, choisis par le coach.
--   app      : visible dans l'appli seulement (pas de téléchargement, pas de copie, pas de lien public)
--   download : téléchargement et copie autorisés, pas de lien public
--   public   : tout est autorisé, y compris le lien public
-- teams.share_default : réglage par défaut de l'équipe ; drawings.share_mode : réglage d'une stratégie (vide = défaut).
-- Le lien public ne fonctionne que si le mode effectif est « public » (vérifié côté serveur).
-- Appliqué sur le projet « Appli Rugby Strat » le 2026-10-15.

alter table public.teams add column if not exists share_default text not null default 'public' check (share_default in ('app', 'download', 'public'));
alter table public.drawings add column if not exists share_mode text check (share_mode in ('app', 'download', 'public'));

create or replace function public.get_shared_drawing(p_token text) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'id', d.id, 'title', d.title, 'data', d.data, 'published_at', d.published_at, 'updated_at', d.updated_at,
    'owner_name', coalesce(p.display_name, ''), 'team_name', coalesce(t.name, '')
  )
  from drawings d left join profiles p on p.id = d.owner_id left join teams t on t.id = d.team_id
  where d.share_token is not null and length(p_token) >= 16 and d.share_token = p_token
    and coalesce(d.share_mode, t.share_default, 'public') = 'public'
  limit 1;
$$;
