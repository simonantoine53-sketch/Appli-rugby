-- Profil personnalisable (inspiré de SportEasy).
-- Profil sportif, visible par les coéquipiers : photo, postes, numéro préféré, pied fort, taille, poids, présentation.
-- Infos privées (profile_private), visibles seulement par la personne et le staff (coach, admin) de ses équipes :
-- téléphone, date de naissance, contact d'urgence.
-- Appliqué sur le projet « Appli Rugby Strat » le 2026-10-15.

alter table public.profiles add column if not exists avatar text
  check (avatar is null or (avatar ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$' and length(avatar) < 200000));
alter table public.profiles add column if not exists positions text[] not null default '{}'
  check (coalesce(array_length(positions, 1), 0) <= 4);
alter table public.profiles add column if not exists jersey_number smallint check (jersey_number between 1 and 99);
alter table public.profiles add column if not exists strong_foot text check (strong_foot in ('droit', 'gauche', 'les deux'));
alter table public.profiles add column if not exists height_cm smallint check (height_cm between 100 and 230);
alter table public.profiles add column if not exists weight_kg smallint check (weight_kg between 30 and 200);
alter table public.profiles add column if not exists bio text check (length(bio) <= 200);
-- Chacun modifie son profil (jamais is_superadmin, protégé par ailleurs)
grant update (display_name, avatar, positions, jersey_number, strong_foot, height_cm, weight_kg, bio) on public.profiles to authenticated;

-- Le staff d'une équipe de la personne (ou un super-admin)
create or replace function public.is_staff_of(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from team_members me join team_members them on them.team_id = me.team_id
    where me.user_id = auth.uid() and me.status = 'active' and me.role in ('coach', 'admin')
      and them.user_id = p_user and them.status in ('active', 'pending')
  ) or public.is_superadmin();
$$;
revoke execute on function public.is_staff_of(uuid) from anon, public;

create table if not exists public.profile_private (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  phone text check (length(phone) <= 30),
  birth_date date check (birth_date > date '1920-01-01' and birth_date < current_date),
  emergency_name text check (length(emergency_name) <= 60),
  emergency_phone text check (length(emergency_phone) <= 30),
  updated_at timestamptz not null default now()
);
drop trigger if exists profile_private_updated_at on public.profile_private;
create trigger profile_private_updated_at before update on public.profile_private for each row execute function public.set_updated_at();
alter table public.profile_private enable row level security;
drop policy if exists private_select on public.profile_private;
create policy private_select on public.profile_private for select to authenticated using (user_id = auth.uid() or public.is_staff_of(user_id));
drop policy if exists private_insert on public.profile_private;
create policy private_insert on public.profile_private for insert to authenticated with check (user_id = auth.uid());
drop policy if exists private_update on public.profile_private;
create policy private_update on public.profile_private for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists private_delete on public.profile_private;
create policy private_delete on public.profile_private for delete to authenticated using (user_id = auth.uid());
