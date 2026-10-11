-- Paquet 2 : lien de partage public (lecture seule) et commentaires des joueurs sous les stratégies publiées.
-- Déjà appliqué sur le projet « Appli Rugby Strat » ; conservé ici pour mémoire.

-- 1. Jeton de partage public sur un dessin (null = pas de partage)
alter table public.drawings add column if not exists share_token text unique;

-- Lecture anonyme d'un dessin par son jeton (pas besoin de compte)
create or replace function public.get_shared_drawing(p_token text)
returns json
language sql
security definer
set search_path = public
as $$
  select json_build_object(
    'title', d.title,
    'data', d.data,
    'published_at', d.published_at,
    'updated_at', d.updated_at,
    'owner_name', p.display_name,
    'team_name', t.name
  )
  from public.drawings d
  left join public.profiles p on p.id = d.owner_id
  left join public.teams t on t.id = d.team_id
  where d.share_token = p_token and length(p_token) >= 16
  limit 1;
$$;
grant execute on function public.get_shared_drawing(text) to anon, authenticated;

-- 2. Commentaires
create table if not exists public.drawing_comments (
  id uuid primary key default gen_random_uuid(),
  drawing_id uuid not null references public.drawings(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
alter table public.drawing_comments enable row level security;

-- Lecture : toute personne qui voit le dessin voit ses commentaires
create policy comments_select on public.drawing_comments for select to authenticated
  using (exists (select 1 from public.drawings d where d.id = drawing_id));
-- Écriture : uniquement sur les stratégies publiées à l'équipe, en son nom
create policy comments_insert on public.drawing_comments for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.drawings d where d.id = drawing_id and d.visibility = 'team'));
-- Suppression : son propre commentaire, ou le staff (coach / admin) de l'équipe du dessin
create policy comments_delete on public.drawing_comments for delete to authenticated
  using (user_id = auth.uid() or public.is_staff((select d.team_id from public.drawings d where d.id = drawing_id)));
