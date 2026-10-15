-- Demandes d'adhésion en temps réel : l'appli est prévenue quand une demande est envoyée, acceptée ou refusée
-- (les règles RLS de team_members s'appliquent : chacun ne reçoit que les lignes qu'il peut lire).
alter publication supabase_realtime add table public.team_members;
