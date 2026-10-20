-- Équipe démo « RC Démo » : un club marqué is_demo, une équipe Séniors préremplie (joueurs fictifs, 3 stratégies,
-- agenda avec réponses, feuille de match, vues « qui a vu »).
-- - Les joueurs fictifs sont des comptes sans mot de passe, à une adresse en .invalid : ils ne peuvent pas se connecter
--   et ne reçoivent jamais de notification ni d'e-mail (aucun appareil inscrit, aucune adresse joignable).
-- - « Voir la démo » (visiteur sans compte) lit une copie de ce club avec demo_snapshot(), en lecture seule :
--   aucune donnée privée (ni e-mail, ni infos privées, ni codes d'invitation), et l'appli n'écrit rien.
-- - select public.demo_reset(); recrée la démo (dates recalées sur aujourd'hui) ; tâche planifiée chaque lundi.
-- Contient des suppressions (demo_reset) : à coller dans l'éditeur SQL (base de test d'abord, production ensuite).

alter table public.clubs add column if not exists is_demo boolean not null default false;

-- Copie en lecture seule du club démo
create or replace function public.demo_snapshot() returns jsonb
language sql stable security definer set search_path = public as $$
  with c as (select * from clubs where is_demo order by created_at limit 1),
  t as (select * from teams where club_id = (select id from c)),
  m as (select team_id, user_id, role, status, plays, requested_as, joined_at from team_members where team_id in (select id from t) and status = 'active'),
  e as (select * from team_events where team_id in (select id from t)),
  d as (select id, owner_id, team_id, title, data, visibility, share_mode, published_at, created_at, updated_at from drawings where team_id in (select id from t) and visibility = 'team')
  select case when exists (select 1 from c) then jsonb_build_object(
    'club', (select to_jsonb(c) - 'join_code' from c),
    'teams', (select coalesce(jsonb_agg(to_jsonb(t) - 'join_code'), '[]'::jsonb) from t),
    'team_members', (select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb) from m),
    'club_members', (select coalesce(jsonb_agg(jsonb_build_object('club_id', club_id, 'user_id', user_id, 'role', role, 'title', title, 'joined_at', joined_at)), '[]'::jsonb)
                     from club_members where club_id = (select id from c) and user_id in (select user_id from m)),
    'profiles', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'display_name', display_name, 'avatar', avatar, 'positions', positions, 'jersey_number', jersey_number,
                  'strong_foot', strong_foot, 'height_cm', height_cm, 'weight_kg', weight_kg, 'bio', bio, 'is_superadmin', false, 'guardian_id', null)), '[]'::jsonb)
                 from profiles where id in (select user_id from m)),
    'team_events', (select coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb) from e),
    'event_responses', (select coalesce(jsonb_agg(jsonb_build_object('event_id', event_id, 'user_id', user_id, 'status', status, 'comment', comment, 'set_by', set_by, 'updated_at', updated_at)), '[]'::jsonb)
                        from event_responses where event_id in (select id from e)),
    'drawings', (select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) from d),
    'drawing_views', (select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb) from drawing_views v where drawing_id in (select id from d)),
    'drawing_comments', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'drawing_id', drawing_id, 'user_id', user_id, 'body', body, 'created_at', created_at)), '[]'::jsonb)
                         from drawing_comments where drawing_id in (select id from d)),
    'match_sheets', (select coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) from match_sheets s where team_id in (select id from t) and published)
  ) end $$;
revoke execute on function public.demo_snapshot() from public;
grant execute on function public.demo_snapshot() to anon, authenticated;

-- Compte fictif de la démo (sans mot de passe, adresse non joignable)
create or replace function public.demo_user(p_id uuid, p_name text, p_pos text, p_num int) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', 'demo-' || p_id || '@demo.rugbeo.invalid', '', now(),
          '{"provider":"demo","providers":["demo"]}'::jsonb, jsonb_build_object('display_name', p_name, 'demo', true), now() - interval '90 days', now(), '', '', '', '');
  update profiles set positions = case when p_pos is null then '{}' else array[p_pos] end, jersey_number = p_num where id = p_id;
  return p_id;
end $$;
revoke execute on function public.demo_user(uuid, text, text, int) from anon, public, authenticated;

create or replace function public.demo_reset() returns text
language plpgsql security definer set search_path = public as $$
declare
  club uuid := 'd0000000-0000-4000-8000-000000000001';
  sen  uuid := 'd0000000-0000-4000-8000-000000000011';
  coach uuid := 'd0000000-0000-4000-8000-000000000100';
  adj uuid := 'd0000000-0000-4000-8000-000000000101';
  tr1 uuid := 'd0000000-0000-4000-8000-000000000201';
  tr2 uuid := 'd0000000-0000-4000-8000-000000000202';
  mt  uuid := 'd0000000-0000-4000-8000-000000000203';
  s1 uuid := 'd0000000-0000-4000-8000-000000000301';
  s2 uuid := 'd0000000-0000-4000-8000-000000000302';
  s3 uuid := 'd0000000-0000-4000-8000-000000000303';
  names text[] := array['Kevin Durand','Mathis Roux','Yanis Petit','Bastien Lambert','Florian Girard','Romain Fontaine','Maxime Chevalier','Alexis Robin',
                        'Léo Garnier','Hugo Perrin','Enzo Marchand','Thomas Blanc','Lucas Fabre','Nathan Guérin','Clément Bonnet','Antoine Mercier',
                        'Jules Lemoine','Quentin Dupuis','Samuel Rey','Adrien Barbier'];
  posts text[] := array['Pilier','Talonneur','Pilier','2e ligne','2e ligne','3e ligne','3e ligne','3e ligne','Demi de mêlée','Demi d’ouverture',
                        'Ailier','Centre','Centre','Ailier','Arrière','Talonneur','Pilier','2e ligne','3e ligne','Centre'];
  pl uuid[] := '{}'; u uuid; i int;
  day0 timestamptz := date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris';
  P jsonb; L jsonb; Q jsonb; squad jsonb := '[]'::jsonb;
begin
  -- 1. On efface l'ancienne démo (club, équipe, comptes fictifs et tout ce qui leur est lié)
  delete from auth.users where email like '%@demo.rugbeo.invalid';
  delete from clubs where id = club or is_demo;

  -- 2. Comptes fictifs
  perform demo_user(coach, 'Julien Moreau', null, null);
  perform demo_user(adj, 'Pierre Faure', null, null);
  for i in 1..20 loop
    u := ('d0000000-0000-4000-8000-0000000010' || lpad(i::text, 2, '0'))::uuid;
    perform demo_user(u, names[i], posts[i], i);
    pl := pl || u;
  end loop;
  update profiles set bio = 'Coach des Séniors depuis 2021. Rugby de mouvement, défense agressive.' where id = coach;

  -- 3. Club et équipe
  insert into clubs (id, name, join_code, created_by, is_demo) values (club, 'RC Démo', 'RCDEMO' || substr(md5(random()::text), 1, 2), coach, true);
  insert into teams (id, club_id, name, join_code, created_by, share_default, sheet_settings) values (sen, club, 'Séniors', 'DEMO' || upper(substr(md5(random()::text), 1, 4)), coach, 'app',
    '{"template":"classic","primary":"#7a1f2b","accent":"#ffffff","showPositions":true,"squads":[{"id":"a","label":"Équipe A","size":23}]}'::jsonb);
  insert into team_members (team_id, user_id, role, status, plays, joined_at) values (sen, coach, 'coach', 'active', false, now() - interval '90 days'), (sen, adj, 'admin', 'active', false, now() - interval '88 days');
  for i in 1..20 loop insert into team_members (team_id, user_id, role, status, joined_at) values (sen, pl[i], 'player', 'active', now() - interval '80 days' + i * interval '1 day'); end loop;
  update club_members set role = 'responsable', title = 'Président' where club_id = club and user_id = adj;

  -- 4. Agenda : deux entraînements, un match, avec des réponses variées
  insert into team_events (id, team_id, kind, title, opponent, home, starts_at, meet_at, location, notes, created_by) values
    (tr1, sen, 'training', 'Entraînement', null, null, day0 + interval '1 day 19 hours 30 minutes', day0 + interval '1 day 19 hours 15 minutes', 'Stade des Tilleuls', 'Travail des lancements de jeu', coach),
    (tr2, sen, 'training', 'Entraînement', null, null, day0 + interval '3 days 19 hours 30 minutes', null, 'Stade des Tilleuls', null, coach),
    (mt, sen, 'match', 'Match', 'US Vallée Verte', true, day0 + interval '4 days 15 hours', day0 + interval '4 days 13 hours 30 minutes', 'Stade des Tilleuls', 'Maillots rouges, shorts blancs', coach);
  for i in 1..20 loop
    if i <> 9 then insert into event_responses (event_id, user_id, status, comment, set_by) values (mt, pl[i],
      case when i <= 15 then 'yes' when i <= 18 then 'maybe' else 'no' end,
      case when i = 16 then 'Travail jusqu’à 13 h' when i = 19 then 'Blessé à la cheville' end, pl[i]); end if;
    if i <= 14 then insert into event_responses (event_id, user_id, status, set_by) values (tr1, pl[i], case when i in (8, 13) then 'no' else 'yes' end, pl[i]); end if;
  end loop;

  -- 5. Trois stratégies animées
  -- Joueur et ligne au format de l'éditeur (coordonnées en mètres : x = 40 + 8 m, y = 40 + 8 m)
  P := '[]'::jsonb;
  insert into drawings (id, owner_id, team_id, title, visibility, published_at, data) values
  (s1, coach, sen, 'Croisée 10-12', 'team', now() - interval '2 days', jsonb_build_object('id', s1, 'title', 'Croisée 10-12', 'category', 'Attaque', 'tags', 'lancement', 'settings', '{"field":"full","orientation":"landscape","stepDuration":1200}'::jsonb, 'steps', jsonb_build_array(
    jsonb_build_object('id','a1','note','Le 9 sert le 10 à plat.','objects', jsonb_build_array(
      jsonb_build_object('id','n9','type','player','color','blue','jersey',true,'ball',true,'label','9','scale',1,'x',536,'y',216),
      jsonb_build_object('id','n10','type','player','color','blue','jersey',true,'ball',false,'label','10','scale',1,'x',488,'y',264),
      jsonb_build_object('id','n12','type','player','color','blue','jersey',true,'ball',false,'label','12','scale',1,'x',456,'y',312),
      jsonb_build_object('id','n13','type','player','color','blue','jersey',true,'ball',false,'label','13','scale',1,'x',424,'y',360),
      jsonb_build_object('id','n15','type','player','color','blue','jersey',true,'ball',false,'label','15','scale',1,'x',408,'y',416),
      jsonb_build_object('id','d1','type','player','color','red','jersey',true,'ball',false,'label','','scale',1,'x',616,'y',248),
      jsonb_build_object('id','d2','type','player','color','red','jersey',true,'ball',false,'label','','scale',1,'x',616,'y',304),
      jsonb_build_object('id','d3','type','player','color','red','jersey',true,'ball',false,'label','','scale',1,'x',616,'y',360),
      jsonb_build_object('id','d4','type','player','color','red','jersey',true,'ball',false,'label','','scale',1,'x',600,'y',416),
      jsonb_build_object('id','p1','type','line','style','straight','x1',528,'y1',224,'x2',496,'y2',256,'dashed',true,'arrow',true,'color','white','width',3))),
    jsonb_build_object('id','a2','note','Le 10 fixe vers l’intérieur, le 12 croise dans son dos.','objects', jsonb_build_array(
      jsonb_build_object('id','n9','type','player','color','blue','jersey',true,'ball',false,'label','9','scale',1,'x',528,'y',216),
      jsonb_build_object('id','n10','type','player','color','blue','jersey',true,'ball',true,'label','10','scale',1,'x',512,'y',288),
      jsonb_build_object('id','n12','type','player','color','blue','jersey',true,'ball',false,'label','12','scale',1,'x',488,'y',288),
      jsonb_build_object('id','n13','type','player','color','blue','jersey',true,'ball',false,'label','13','scale',1,'x',432,'y',352),
      jsonb_build_object('id','n15','type','player','color','blue','jersey',true,'ball',false,'label','15','scale',1,'x',416,'y',408),
      jsonb_build_object('id','d1','type','player','color','red','jersey',true,'ball',false,'label','','scale',1,'x',608,'y',256),
      jsonb_build_object('id','d2','type','player','color','red','jersey',true,'ball',false,'label','','scale',1,'x',600,'y',304),
      jsonb_build_object('id','d3','type','player','color','red','jersey',true,'ball',false,'label','','scale',1,'x',616,'y',360),
      jsonb_build_object('id','d4','type','player','color','red','jersey',true,'ball',false,'label','','scale',1,'x',600,'y',416),
      jsonb_build_object('id','r1','type','line','style','wavy','x1',488,'y1',264,'x2',512,'y2',288,'dashed',false,'arrow',true,'color','white','width',3),
      jsonb_build_object('id','r2','type','line','style','straight','x1',456,'y1',312,'x2',488,'y2',288,'dashed',false,'arrow',true,'color','white','width',3))),
    jsonb_build_object('id','a3','note','Le 12 perce entre les deux premiers défenseurs.','objects', jsonb_build_array(
      jsonb_build_object('id','n9','type','player','color','blue','jersey',true,'ball',false,'label','9','scale',1,'x',528,'y',216),
      jsonb_build_object('id','n10','type','player','color','blue','jersey',true,'ball',false,'label','10','scale',1,'x',528,'y',304),
      jsonb_build_object('id','n12','type','player','color','blue','jersey',true,'ball',true,'label','12','scale',1,'x',640,'y',280),
      jsonb_build_object('id','n13','type','player','color','blue','jersey',true,'ball',false,'label','13','scale',1,'x',488,'y',352),
      jsonb_build_object('id','n15','type','player','color','blue','jersey',true,'ball',false,'label','15','scale',1,'x',456,'y',400),
      jsonb_build_object('id','d1','type','player','color','red','jersey',true,'ball',false,'label','','scale',1,'x',600,'y',248),
      jsonb_build_object('id','d2','type','player','color','red','jersey',true,'ball',false,'label','','scale',1,'x',600,'y',320),
      jsonb_build_object('id','d3','type','player','color','red','jersey',true,'ball',false,'label','','scale',1,'x',616,'y',360),
      jsonb_build_object('id','d4','type','player','color','red','jersey',true,'ball',false,'label','','scale',1,'x',600,'y',416),
      jsonb_build_object('id','r3','type','line','style','wavy','x1',528,'y1',296,'x2',632,'y2',280,'dashed',false,'arrow',true,'color','white','width',3)))))),
  (s2, coach, sen, 'Touche à 5 : lancement au milieu', 'team', now() - interval '6 days', jsonb_build_object('id', s2, 'title', 'Touche à 5 : lancement au milieu', 'category', 'Touche', 'tags', 'touche', 'settings', '{"field":"full","orientation":"landscape","stepDuration":1200}'::jsonb, 'steps', jsonb_build_array(
    jsonb_build_object('id','b1','note','Annonce au milieu : le 4 saute en 2e position.','objects', jsonb_build_array(
      jsonb_build_object('id','t2','type','player','color','blue','jersey',true,'ball',true,'label','2','scale',1,'x',400,'y',30),
      jsonb_build_object('id','t1','type','player','color','blue','jersey',true,'ball',false,'label','1','scale',1,'x',392,'y',80),
      jsonb_build_object('id','t4','type','player','color','blue','jersey',true,'ball',false,'label','4','scale',1,'x',392,'y',104),
      jsonb_build_object('id','t3','type','player','color','blue','jersey',true,'ball',false,'label','3','scale',1,'x',392,'y',128),
      jsonb_build_object('id','t5','type','player','color','blue','jersey',true,'ball',false,'label','5','scale',1,'x',392,'y',152),
      jsonb_build_object('id','t9','type','player','color','blue','jersey',true,'ball',false,'label','9','scale',1,'x',376,'y',176),
      jsonb_build_object('id','t10','type','player','color','blue','jersey',true,'ball',false,'label','10','scale',1,'x',336,'y',216),
      jsonb_build_object('id','e1','type','player','color','red','jersey',true,'ball',false,'label','','scale',1,'x',408,'y',80),
      jsonb_build_object('id','e2','type','player','color','red','jersey',true,'ball',false,'label','','scale',1,'x',408,'y',104),
      jsonb_build_object('id','e3','type','player','color','red','jersey',true,'ball',false,'label','','scale',1,'x',408,'y',128),
      jsonb_build_object('id','e4','type','player','color','red','jersey',true,'ball',false,'label','','scale',1,'x',408,'y',152))),
    jsonb_build_object('id','b2','note','Lancer : le 4 est soulevé et capte.','objects', jsonb_build_array(
      jsonb_build_object('id','t2','type','player','color','blue','jersey',true,'ball',false,'label','2','scale',1,'x',400,'y',30),
      jsonb_build_object('id','t1','type','player','color','blue','jersey',true,'ball',false,'label','1','scale',1,'x',392,'y',92),
      jsonb_build_object('id','t4','type','player','color','blue','jersey',true,'ball',true,'label','4','scale',1,'x',396,'y',104),
      jsonb_build_object('id','t3','type','player','color','blue','jersey',true,'ball',false,'label','3','scale',1,'x',392,'y',116),
      jsonb_build_object('id','t5','type','player','color','blue','jersey',true,'ball',false,'label','5','scale',1,'x',392,'y',152),
      jsonb_build_object('id','t9','type','player','color','blue','jersey',true,'ball',false,'label','9','scale',1,'x',384,'y',128),
      jsonb_build_object('id','t10','type','player','color','blue','jersey',true,'ball',false,'label','10','scale',1,'x',336,'y',216),
      jsonb_build_object('id','e1','type','player','color','red','jersey',true,'ball',false,'label','','scale',1,'x',408,'y',80),
      jsonb_build_object('id','e2','type','player','color','red','jersey',true,'ball',false,'label','','scale',1,'x',408,'y',104),
      jsonb_build_object('id','e3','type','player','color','red','jersey',true,'ball',false,'label','','scale',1,'x',408,'y',128),
      jsonb_build_object('id','e4','type','player','color','red','jersey',true,'ball',false,'label','','scale',1,'x',408,'y',152),
      jsonb_build_object('id','l1','type','line','style','straight','x1',400,'y1',38,'x2',396,'y2',96,'dashed',true,'arrow',true,'color','white','width',3))),
    jsonb_build_object('id','b3','note','Ballon donné au 9, passe vers le 10 lancé.','objects', jsonb_build_array(
      jsonb_build_object('id','t2','type','player','color','blue','jersey',true,'ball',false,'label','2','scale',1,'x',400,'y',30),
      jsonb_build_object('id','t1','type','player','color','blue','jersey',true,'ball',false,'label','1','scale',1,'x',392,'y',92),
      jsonb_build_object('id','t4','type','player','color','blue','jersey',true,'ball',false,'label','4','scale',1,'x',392,'y',104),
      jsonb_build_object('id','t3','type','player','color','blue','jersey',true,'ball',false,'label','3','scale',1,'x',392,'y',116),
      jsonb_build_object('id','t5','type','player','color','blue','jersey',true,'ball',false,'label','5','scale',1,'x',392,'y',152),
      jsonb_build_object('id','t9','type','player','color','blue','jersey',true,'ball',false,'label','9','scale',1,'x',376,'y',136),
      jsonb_build_object('id','t10','type','player','color','blue','jersey',true,'ball',true,'label','10','scale',1,'x',352,'y',232),
      jsonb_build_object('id','e1','type','player','color','red','jersey',true,'ball',false,'label','','scale',1,'x',408,'y',80),
      jsonb_build_object('id','e2','type','player','color','red','jersey',true,'ball',false,'label','','scale',1,'x',408,'y',104),
      jsonb_build_object('id','e3','type','player','color','red','jersey',true,'ball',false,'label','','scale',1,'x',408,'y',128),
      jsonb_build_object('id','e4','type','player','color','red','jersey',true,'ball',false,'label','','scale',1,'x',408,'y',152),
      jsonb_build_object('id','l2','type','line','style','straight','x1',376,'y1',144,'x2',352,'y2',224,'dashed',true,'arrow',true,'color','white','width',3)))))),
  (s3, coach, sen, 'Échauffement : passes en triangle', 'team', now() - interval '9 days', jsonb_build_object('id', s3, 'title', 'Échauffement : passes en triangle', 'category', 'Entraînement', 'tags', 'échauffement', 'settings', '{"field":"half","orientation":"landscape","stepDuration":1000}'::jsonb, 'steps', jsonb_build_array(
    jsonb_build_object('id','c1','note','Trois plots à 10 m. Le ballon tourne, on suit sa passe.','objects', jsonb_build_array(
      jsonb_build_object('id','k1','type','equip','kind','cone','x',300,'y',260,'scale',1,'rot',0),
      jsonb_build_object('id','k2','type','equip','kind','cone','x',380,'y',260,'scale',1,'rot',0),
      jsonb_build_object('id','k3','type','equip','kind','cone','x',340,'y',190,'scale',1,'rot',0),
      jsonb_build_object('id','j1','type','player','color','yellow','jersey',false,'ball',true,'label','A','scale',1,'x',300,'y',236),
      jsonb_build_object('id','j2','type','player','color','yellow','jersey',false,'ball',false,'label','B','scale',1,'x',380,'y',236),
      jsonb_build_object('id','j3','type','player','color','yellow','jersey',false,'ball',false,'label','C','scale',1,'x',340,'y',166))),
    jsonb_build_object('id','c2','note','A passe à B et court à son plot.','objects', jsonb_build_array(
      jsonb_build_object('id','k1','type','equip','kind','cone','x',300,'y',260,'scale',1,'rot',0),
      jsonb_build_object('id','k2','type','equip','kind','cone','x',380,'y',260,'scale',1,'rot',0),
      jsonb_build_object('id','k3','type','equip','kind','cone','x',340,'y',190,'scale',1,'rot',0),
      jsonb_build_object('id','j1','type','player','color','yellow','jersey',false,'ball',false,'label','A','scale',1,'x',364,'y',240),
      jsonb_build_object('id','j2','type','player','color','yellow','jersey',false,'ball',true,'label','B','scale',1,'x',380,'y',236),
      jsonb_build_object('id','j3','type','player','color','yellow','jersey',false,'ball',false,'label','C','scale',1,'x',340,'y',166),
      jsonb_build_object('id','q1','type','line','style','straight','x1',308,'y1',236,'x2',372,'y2',236,'dashed',true,'arrow',true,'color','white','width',3))),
    jsonb_build_object('id','c3','note','B passe à C, et ainsi de suite. Changer de sens après 2 minutes.','objects', jsonb_build_array(
      jsonb_build_object('id','k1','type','equip','kind','cone','x',300,'y',260,'scale',1,'rot',0),
      jsonb_build_object('id','k2','type','equip','kind','cone','x',380,'y',260,'scale',1,'rot',0),
      jsonb_build_object('id','k3','type','equip','kind','cone','x',340,'y',190,'scale',1,'rot',0),
      jsonb_build_object('id','j1','type','player','color','yellow','jersey',false,'ball',false,'label','A','scale',1,'x',372,'y',244),
      jsonb_build_object('id','j2','type','player','color','yellow','jersey',false,'ball',false,'label','B','scale',1,'x',352,'y',178),
      jsonb_build_object('id','j3','type','player','color','yellow','jersey',false,'ball',true,'label','C','scale',1,'x',340,'y',166),
      jsonb_build_object('id','q2','type','line','style','straight','x1',376,'y1',228,'x2',346,'y2',174,'dashed',true,'arrow',true,'color','white','width',3))))));
  -- Vues « qui a vu » : la combinaison du week-end vue par 15 joueurs sur 20
  for i in 1..20 loop
    if i <= 15 then insert into drawing_views (drawing_id, user_id, views, played) values (s1, pl[i], 2, true); end if;
    if i <= 19 then insert into drawing_views (drawing_id, user_id, views, played) values (s2, pl[i], 1, true); end if;
    insert into drawing_views (drawing_id, user_id, views, played) values (s3, pl[i], 1, i % 3 <> 0);
  end loop;
  insert into drawing_comments (drawing_id, user_id, body, created_at) values
    (s1, pl[12], 'Je pars à quelle distance du 10 ?', now() - interval '1 day 2 hours'),
    (s1, coach, 'Deux mètres derrière lui, et tu accélères au moment de la passe.', now() - interval '1 day 1 hour');

  -- 6. Feuille du match publiée (les 15 présents + remplaçants)
  for i in 1..20 loop
    if i not in (19, 20) then squad := squad || jsonb_build_object('name', names[i], 'user_id', pl[i], 'marks', case when i = 8 then '["C"]'::jsonb when i in (1, 2, 3) then '["1"]'::jsonb else '[]'::jsonb end); end if;
  end loop;
  insert into match_sheets (team_id, event_id, published, published_at, updated_by, data) values (sen, mt, true, now() - interval '1 day', coach,
    jsonb_build_object('opponent', 'US Vallée Verte', 'meet', '13:30', 'values', jsonb_build_object('rouge', 'Julien Moreau', 'blanc', 'Pierre Faure'), 'squads', jsonb_build_object('a', squad), 'squadValues', '{}'::jsonb, 'notes', 'Maillots rouges, shorts blancs. Covoiturage : parking du stade à 13 h.'));

  return 'Démo recréée : RC Démo, Séniors, 20 joueurs fictifs, 3 stratégies, 3 événements, une feuille publiée.';
end $$;
revoke execute on function public.demo_reset() from anon, public, authenticated;

-- Dates de la démo recalées chaque lundi matin
select cron.unschedule('demo-reset') where exists (select 1 from cron.job where jobname = 'demo-reset');
select cron.schedule('demo-reset', '17 4 * * 1', 'select public.demo_reset()');
select public.demo_reset();
