-- Données de test de Rugbeo : à coller UNE FOIS dans l'éditeur SQL de la base de TEST (après schema_complet.sql).
-- Crée la marque « base de test » et la fonction public.test_seed(), qui remet la base à zéro et la remplit.
-- Ensuite, pour tout remettre à zéro : select public.test_seed();
-- Sécurité : test_seed() refuse de tourner sans la marque, qui n'est jamais posée par une migration (donc jamais en production).
--
-- Comptes (mot de passe commun : RugbeoTest2026!) — adresses en .test, un domaine qui ne reçoit jamais de mail :
--   coach@exemple.test        Julien Moreau, coach des Séniors
--   admin@exemple.test        Pierre Faure, admin des Séniors, coach des U16
--   presidente@exemple.test   Sandrine Leroy, présidente du club (bureau)
--   joueur@exemple.test       Léo Garnier, joueur des Séniors (n°9)
--   joueur2@exemple.test … joueur20@exemple.test : les autres joueurs des Séniors
--   parent@exemple.test       Sophie Garnier, parent de Tom et Lina (U16, comptes gérés par le parent, accord parental enregistré)
--   super@exemple.test        Super-admin (back-office)

create table if not exists public.app_env (name text primary key);
alter table public.app_env enable row level security;   -- aucune politique : invisible depuis l'appli
insert into public.app_env (name) values ('test') on conflict do nothing;

create or replace function public.test_user(p_id uuid, p_email text, p_name text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_email, crypt('RugbeoTest2026!', gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('display_name', p_name, 'terms_version', '2026-10-21'),
          now() - interval '60 days', now(), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), p_id, p_id::text, 'email', jsonb_build_object('sub', p_id::text, 'email', p_email, 'email_verified', true), now(), now(), now());
  return p_id;
end $$;
revoke execute on function public.test_user(uuid, text, text) from anon, public, authenticated;

create or replace function public.test_seed() returns text
language plpgsql security definer set search_path = public, extensions as $$
declare
  u uuid; i int; k uuid; kid1 uuid; kid2 uuid;
  coach uuid := '10000000-0000-4000-8000-000000000001';
  adm   uuid := '10000000-0000-4000-8000-000000000002';
  pres  uuid := '10000000-0000-4000-8000-000000000003';
  par   uuid := '10000000-0000-4000-8000-000000000004';
  sup   uuid := '10000000-0000-4000-8000-000000000005';
  club  uuid := '20000000-0000-4000-8000-000000000001';
  sen   uuid := '20000000-0000-4000-8000-000000000011';
  u16   uuid := '20000000-0000-4000-8000-000000000012';
  ev_tr1 uuid := '30000000-0000-4000-8000-000000000001';
  ev_match uuid := '30000000-0000-4000-8000-000000000002';
  ev_tr2 uuid := '30000000-0000-4000-8000-000000000003';
  ev_past uuid := '30000000-0000-4000-8000-000000000004';
  ev_u16 uuid := '30000000-0000-4000-8000-000000000005';
  ev_match2 uuid := '30000000-0000-4000-8000-000000000006';
  ev_old1 uuid := '30000000-0000-4000-8000-000000000007';
  ev_old2 uuid := '30000000-0000-4000-8000-000000000008';
  d1 uuid := '40000000-0000-4000-8000-000000000001';
  d2 uuid := '40000000-0000-4000-8000-000000000002';
  names text[] := array['Léo Garnier','Kevin Durand','Mathis Roux','Yanis Petit','Bastien Lambert','Florian Girard','Romain Fontaine','Maxime Chevalier',
                        'Alexis Robin','Hugo Perrin','Enzo Marchand','Thomas Blanc','Lucas Fabre','Nathan Guérin','Clément Bonnet','Antoine Mercier',
                        'Jules Lemoine','Quentin Dupuis','Samuel Rey','Adrien Barbier'];
  posts text[] := array['Demi de mêlée','Pilier','Talonneur','Pilier','2e ligne','2e ligne','3e ligne','3e ligne','3e ligne','Demi d’ouverture',
                        'Ailier','Centre','Centre','Ailier','Arrière','Talonneur','Pilier','2e ligne','3e ligne','Centre'];
  nums int[] := array[9,1,2,3,4,5,6,7,8,10,11,12,13,14,15,16,17,18,19,20];
  players uuid[] := '{}';
  day0 timestamptz := date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris';
  steps jsonb; squad jsonb := '[]'::jsonb;
begin
  if not exists (select 1 from app_env where name = 'test') then
    raise exception 'test_seed() ne tourne que sur la base de test';
  end if;

  -- 1. Remise à zéro : tous les comptes de test (et ce qui leur est lié), le club de test
  delete from auth.users where email like '%@exemple.test' or email like '%@rugbeo.invalid';
  delete from clubs where id = club;
  delete from teams where id in (sen, u16);

  -- 2. Comptes
  perform test_user(coach, 'coach@exemple.test', 'Julien Moreau');
  perform test_user(adm, 'admin@exemple.test', 'Pierre Faure');
  perform test_user(pres, 'presidente@exemple.test', 'Sandrine Leroy');
  perform test_user(sup, 'super@exemple.test', 'Super Admin');
  update profiles set is_superadmin = true where id = sup;
  for i in 1..20 loop
    u := ('10000000-0000-4000-8000-0000000001' || lpad(i::text, 2, '0'))::uuid;
    perform test_user(u, case when i = 1 then 'joueur@exemple.test' else 'joueur' || i || '@exemple.test' end, names[i]);
    update profiles set positions = array[posts[i]], jersey_number = nums[i] where id = u;
    players := players || u;
  end loop;
  perform test_user(par, 'parent@exemple.test', 'Sophie Garnier');
  kid1 := create_child_for(par, 'Tom Garnier');
  kid2 := create_child_for(par, 'Lina Garnier');
  update profiles set positions = array['Ailier'], jersey_number = 11 where id = kid1;
  update profiles set positions = array['Centre'], jersey_number = 12 where id = kid2;
  update profile_private set terms_version = '2026-10-21', terms_accepted_at = now() where user_id in (kid1, kid2);

  -- 3. Club et équipes
  insert into clubs (id, name, join_code, created_by) values (club, 'RC Test', 'RCTEST26', pres);
  insert into teams (id, club_id, name, join_code, created_by, share_default) values
    (sen, club, 'Séniors', 'TESTSEN1', coach, 'app'),
    (u16, club, 'U16', 'TESTU161', adm, 'app');
  insert into club_members (club_id, user_id, role, title) values (club, pres, 'responsable', 'Présidente') on conflict (club_id, user_id) do update set role = 'responsable', title = 'Présidente';
  insert into team_members (team_id, user_id, role, status, plays) values
    (sen, coach, 'coach', 'active', false), (sen, adm, 'admin', 'active', false), (u16, adm, 'coach', 'active', false),
    (u16, kid1, 'player', 'active', false), (u16, kid2, 'player', 'active', false);
  for i in 1..20 loop
    insert into team_members (team_id, user_id, role, status, joined_at) values (sen, players[i], 'player', 'active', now() - interval '50 days');
  end loop;
  -- Une demande d'adhésion en attente (le parent demande aussi les Séniors pour Tom, pour tester la validation)
  insert into team_members (team_id, user_id, role, status, requested_as) values (sen, kid1, 'player', 'pending', 'player');

  -- 4. Agenda (heure de Paris) et réponses
  insert into team_events (id, team_id, kind, title, opponent, home, starts_at, meet_at, location, notes, created_by) values
    (ev_tr1, sen, 'training', 'Entraînement', null, null, day0 + interval '1 day 19 hours 30 minutes', day0 + interval '1 day 19 hours 15 minutes', 'Stade des Tilleuls', 'Travail des lancements de jeu', coach),
    (ev_tr2, sen, 'training', 'Entraînement', null, null, day0 + interval '3 days 19 hours 30 minutes', null, 'Stade des Tilleuls', null, coach),
    (ev_match, sen, 'match', 'Match', 'US Vallée Verte', true, day0 + interval '4 days 15 hours', day0 + interval '4 days 13 hours 30 minutes', 'Stade des Tilleuls', 'Maillots rouges, shorts blancs', coach),
    (ev_past, sen, 'match', 'Match', 'AS Les Prés', false, day0 - interval '3 days' + interval '15 hours', day0 - interval '3 days' + interval '13 hours', 'Stade municipal des Prés', null, coach),
    (ev_u16, u16, 'training', 'Entraînement', null, null, day0 + interval '2 days 18 hours', null, 'Stade des Tilleuls, terrain 2', 'Protège-dents obligatoire', adm),
    (ev_match2, sen, 'match', 'Match', 'RC Les Collines', false, day0 + interval '11 days 15 hours', day0 + interval '11 days 12 hours 30 minutes', 'Stade des Collines', null, coach),
    -- Deux entraînements passés (statistiques de présence)
    (ev_old1, sen, 'training', 'Entraînement', null, null, day0 - interval '6 days' + interval '19 hours 30 minutes', null, 'Stade des Tilleuls', null, coach),
    (ev_old2, sen, 'training', 'Entraînement', null, null, day0 - interval '13 days' + interval '19 hours 30 minutes', null, 'Stade des Tilleuls', null, coach);
  -- Second match : pas encore de compo (pour « Reprendre la compo du dernier match »), Romain Fontaine (n°7 sur la feuille) absent
  insert into event_responses (event_id, user_id, status, comment, set_by) values (ev_match2, players[7], 'no', 'En vacances', players[7]);
  -- Match : 14 présents, 3 peut-être, 2 absents ; Léo (joueur@) n'a pas encore répondu
  for i in 2..20 loop
    insert into event_responses (event_id, user_id, status, comment, set_by) values (ev_match, players[i],
      case when i <= 15 then 'yes' when i <= 18 then 'maybe' else 'no' end,
      case when i = 16 then 'Travail jusqu’à 13 h' when i = 19 then 'Blessé à la cheville' end, players[i]);
  end loop;
  for i in 2..13 loop
    insert into event_responses (event_id, user_id, status, set_by) values (ev_tr1, players[i], case when i in (8, 13) then 'no' else 'yes' end, players[i]);
  end loop;
  for i in 1..20 loop
    insert into event_responses (event_id, user_id, status, set_by) values (ev_past, players[i], case when i <= 17 then 'yes' else 'no' end, players[i]);
  end loop;
  insert into event_responses (event_id, user_id, status, set_by) values (ev_u16, kid2, 'yes', par);
  -- Entraînements passés : la plupart présents, quelques absents ou peut-être, les n° 19 et 20 sans réponse
  for i in 1..18 loop
    insert into event_responses (event_id, user_id, status, set_by) values
      (ev_old1, players[i], case when i in (4, 11) then 'no' when i = 7 then 'maybe' else 'yes' end, players[i]),
      (ev_old2, players[i], case when i in (4, 15, 16) then 'no' else 'yes' end, players[i]);
  end loop;

  -- 5. Stratégies : une combinaison animée (3 étapes) publiée, une stratégie privée du coach
  steps := jsonb_build_array(
    jsonb_build_object('id', 's1', 'note', 'Le 9 sert le 10 à plat.', 'objects', jsonb_build_array(
      jsonb_build_object('id','n9','type','player','color','blue','jersey',true,'ball',true,'label','9','scale',1,'x',536,'y',216),
      jsonb_build_object('id','n10','type','player','color','blue','jersey',true,'ball',false,'label','10','scale',1,'x',488,'y',264),
      jsonb_build_object('id','n12','type','player','color','blue','jersey',true,'ball',false,'label','12','scale',1,'x',456,'y',312),
      jsonb_build_object('id','n13','type','player','color','blue','jersey',true,'ball',false,'label','13','scale',1,'x',424,'y',360),
      jsonb_build_object('id','d1','type','player','color','red','jersey',true,'ball',false,'label','','scale',1,'x',616,'y',248),
      jsonb_build_object('id','d2','type','player','color','red','jersey',true,'ball',false,'label','','scale',1,'x',616,'y',304),
      jsonb_build_object('id','d3','type','player','color','red','jersey',true,'ball',false,'label','','scale',1,'x',616,'y',360))),
    jsonb_build_object('id', 's2', 'note', 'Le 10 fixe vers l’intérieur, le 12 croise dans son dos.', 'objects', jsonb_build_array(
      jsonb_build_object('id','n9','type','player','color','blue','jersey',true,'ball',false,'label','9','scale',1,'x',528,'y',216),
      jsonb_build_object('id','n10','type','player','color','blue','jersey',true,'ball',true,'label','10','scale',1,'x',512,'y',288),
      jsonb_build_object('id','n12','type','player','color','blue','jersey',true,'ball',false,'label','12','scale',1,'x',488,'y',288),
      jsonb_build_object('id','n13','type','player','color','blue','jersey',true,'ball',false,'label','13','scale',1,'x',424,'y',360),
      jsonb_build_object('id','d1','type','player','color','red','jersey',true,'ball',false,'label','','scale',1,'x',608,'y',256),
      jsonb_build_object('id','d2','type','player','color','red','jersey',true,'ball',false,'label','','scale',1,'x',608,'y',304),
      jsonb_build_object('id','d3','type','player','color','red','jersey',true,'ball',false,'label','','scale',1,'x',616,'y',360))),
    jsonb_build_object('id', 's3', 'note', 'Le 12 perce entre les deux premiers défenseurs.', 'objects', jsonb_build_array(
      jsonb_build_object('id','n9','type','player','color','blue','jersey',true,'ball',false,'label','9','scale',1,'x',528,'y',216),
      jsonb_build_object('id','n10','type','player','color','blue','jersey',true,'ball',false,'label','10','scale',1,'x',528,'y',304),
      jsonb_build_object('id','n12','type','player','color','blue','jersey',true,'ball',true,'label','12','scale',1,'x',632,'y',280),
      jsonb_build_object('id','n13','type','player','color','blue','jersey',true,'ball',false,'label','13','scale',1,'x',480,'y',360),
      jsonb_build_object('id','d1','type','player','color','red','jersey',true,'ball',false,'label','','scale',1,'x',600,'y',248),
      jsonb_build_object('id','d2','type','player','color','red','jersey',true,'ball',false,'label','','scale',1,'x',600,'y',320),
      jsonb_build_object('id','d3','type','player','color','red','jersey',true,'ball',false,'label','','scale',1,'x',616,'y',360))));
  insert into drawings (id, owner_id, team_id, title, visibility, published_at, data) values
    (d1, coach, sen, 'Croisée 10-12', 'team', now() - interval '2 days',
     jsonb_build_object('id', d1, 'title', 'Croisée 10-12', 'category', 'Attaque', 'tags', '', 'settings', jsonb_build_object('field','full','orientation','landscape','stepDuration',1200), 'steps', steps)),
    (d2, coach, sen, 'Défense en rideau', 'private', null,
     jsonb_build_object('id', d2, 'title', 'Défense en rideau', 'category', 'Défense', 'tags', '', 'settings', jsonb_build_object('field','full','orientation','landscape','stepDuration',1200), 'steps', jsonb_build_array(steps->0)));
  -- Lien public de la combinaison (page publique : partenaires du club en bas)
  update drawings set share_token = 'test-lien-public-croisee', share_mode = 'public' where id = d1;
  for i in 2..12 loop
    insert into drawing_views (drawing_id, user_id, views, played) values (d1, players[i], 2, true);
  end loop;
  insert into drawing_comments (drawing_id, user_id, body) values
    (d1, players[12], 'Je pars à quelle distance du 10 ?'),
    (d1, coach, 'Deux mètres derrière lui, et tu accélères au moment de la passe.');

  -- 6. Feuille du match publiée
  for i in 1..20 loop
    if i <> 19 then squad := squad || jsonb_build_object('name', names[i], 'user_id', players[i], 'marks', case when i = 9 then '["C"]'::jsonb when i in (2, 3, 4) then '["1"]'::jsonb else '[]'::jsonb end); end if;
  end loop;
  insert into match_sheets (team_id, event_id, published, published_at, updated_by, data) values
    (sen, ev_match, true, now() - interval '1 day', coach,
     jsonb_build_object('opponent', 'US Vallée Verte', 'meet', '13:30', 'values', jsonb_build_object('rouge', 'Julien Moreau', 'blanc', 'Pierre Faure'), 'squads', jsonb_build_object('a', squad), 'squadValues', '{}'::jsonb, 'notes', ''));

  -- 7. Conditions acceptées pour tous les comptes de test (pas de barre « Nos conditions évoluent »)
  insert into profile_private (user_id, terms_version, terms_accepted_at)
  select id, '2026-10-21', now() from profiles where id in (select id from auth.users where email like '%@exemple.test')
  on conflict (user_id) do update set terms_version = excluded.terms_version, terms_accepted_at = excluded.terms_accepted_at;

  return format('Base de test remplie : %s comptes, club RC Test (code RCTEST26), Séniors (TESTSEN1), U16 (TESTU161).',
                (select count(*) from auth.users where email like '%@exemple.test' or email like '%@rugbeo.invalid'));
end $$;
revoke execute on function public.test_seed() from anon, public, authenticated;

select public.test_seed();
