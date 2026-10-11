-- Paquet 3 : notifications push (Web Push). Déjà appliqué sur le projet « Appli Rugby Strat ».
-- La fonction Edge `push-notify` (supabase/functions/push-notify) lit les clés VAPID dans app_secrets
-- avec la clé service et envoie les notifications aux membres de l'équipe.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
create policy push_own_select on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
create policy push_own_insert on public.push_subscriptions for insert to authenticated with check (user_id = auth.uid());
create policy push_own_update on public.push_subscriptions for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy push_own_delete on public.push_subscriptions for delete to authenticated using (user_id = auth.uid());

-- Secrets lus uniquement par la clé service (RLS activée, aucune policy)
create table if not exists public.app_secrets (key text primary key, value text not null);
alter table public.app_secrets enable row level security;
-- insert into public.app_secrets (key, value) values ('vapid_public', '…'), ('vapid_private', '…');
