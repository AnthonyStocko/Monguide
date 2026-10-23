-- Séjours partagés (migration 20261016100000_shared_trips.sql) : sécurité
-- des tables trips, trip_members, trip_invites, trip_changes et profiles.
-- A : owner, B : editor (le plus ancien), D et E : editors, C : étranger.
-- Lancé par `supabase test db` (CI, workflow deploy-server.yml).
--
-- A  aaaaaaaa-0000-4000-8000-00000000000a     T  11111111-1111-4111-8111-111111111111 (partagé)
-- B  aaaaaaaa-0000-4000-8000-00000000000b     U  22222222-2222-4222-8222-222222222222 (A seul)
-- C  aaaaaaaa-0000-4000-8000-00000000000c     W  33333333-3333-4333-8333-333333333333 (créé par A au test)
-- D  aaaaaaaa-0000-4000-8000-00000000000d
-- E  aaaaaaaa-0000-4000-8000-00000000000e

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(71);

-- ---------------------------------------------------------------------------
-- Données (rôle postgres, comme les fonctions serveur)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'a@example.com'),
  ('aaaaaaaa-0000-4000-8000-00000000000b', 'b@example.com'),
  ('aaaaaaaa-0000-4000-8000-00000000000c', 'c@example.com'),
  ('aaaaaaaa-0000-4000-8000-00000000000d', 'd@example.com'),
  ('aaaaaaaa-0000-4000-8000-00000000000e', 'e@example.com');

insert into public.trips (id, user_id, title, destination, start_date, end_date, params, planning, created_at, updated_at) values
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-00000000000a', 'Lisbonne', '{}', '2026-10-06', '2026-10-07', '{"schemaVersion": 3}', '[]', now(), now()),
  ('22222222-2222-4222-8222-222222222222', 'aaaaaaaa-0000-4000-8000-00000000000a', 'Annecy', '{}', '2026-11-01', '2026-11-02', '{"schemaVersion": 3}', '[]', now(), now());

insert into public.trip_members (trip_id, user_id, role, joined_at) values
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-00000000000b', 'editor', now() - interval '3 days'),
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-00000000000d', 'editor', now() - interval '2 days'),
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-00000000000e', 'editor', now() - interval '1 day');

insert into public.trip_invites (trip_id, kind, token_hash, created_by) values
  ('11111111-1111-4111-8111-111111111111', 'link', encode(sha256('jeton-de-test'::bytea), 'hex'), 'aaaaaaaa-0000-4000-8000-00000000000a');

insert into public.trip_changes (trip_id, version, author_id, op_type, summary) values
  ('11111111-1111-4111-8111-111111111111', 2, 'aaaaaaaa-0000-4000-8000-00000000000a', 'step.set_times', 'Horaire modifié'),
  ('11111111-1111-4111-8111-111111111111', 3, 'aaaaaaaa-0000-4000-8000-00000000000b', 'step.insert', 'Étape ajoutée');

insert into public.profiles (user_id, display_name, avatar_color) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'Anthony', 'teal'),
  ('aaaaaaaa-0000-4000-8000-00000000000b', 'Béa', 'coral'),
  ('aaaaaaaa-0000-4000-8000-00000000000c', 'Chloé', 'plum');

-- ---------------------------------------------------------------------------
-- Structure
-- ---------------------------------------------------------------------------
select is((select role from public.trip_members where trip_id = '11111111-1111-4111-8111-111111111111' and user_id = 'aaaaaaaa-0000-4000-8000-00000000000a'),
  'owner', 'un nouveau séjour a son créateur comme owner');
select is((select version from public.trips where id = '11111111-1111-4111-8111-111111111111'), 1, 'un nouveau séjour est en version 1');
select throws_ok($$insert into public.trip_members (trip_id, user_id, role) values ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-00000000000c', 'owner')$$,
  '23505', null, 'un seul owner par séjour');
select is(public.with_day_ids('11111111-1111-4111-8111-111111111111', '[{"date": "2026-10-06", "steps": [{"id": "s0"}, {"type": "lunch"}]}]') -> 0 ->> 'id',
  '3fcdfb6c-b185-5873-bb30-a7945b46a945', 'identifiant de journée identique à domain/stableId.js');
select is(public.with_day_ids('11111111-1111-4111-8111-111111111111', '[{"date": "2026-10-06", "steps": [{"id": "s0"}, {"type": "lunch"}]}]') #>> '{0,steps,1,id}',
  'b1c0aa89-0f38-5a90-bcdb-f8c4f5078930', 'identifiant d''étape manquant identique à domain/stableId.js');
select is(public.with_day_ids('11111111-1111-4111-8111-111111111111', '[{"id": "j1", "date": "2026-10-06", "steps": [{"id": "s0"}]}]'),
  '[{"id": "j1", "date": "2026-10-06", "steps": [{"id": "s0"}]}]'::jsonb, 'les identifiants existants sont gardés');

-- ---------------------------------------------------------------------------
-- C, étranger : ne voit rien, ne devine rien, ne modifie rien
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub": "aaaaaaaa-0000-4000-8000-00000000000c", "role": "authenticated"}';

select is_empty($$select 1 from public.trips where id = '11111111-1111-4111-8111-111111111111'$$, 'C ne lit pas le séjour');
select is_empty($$select 1 from public.trip_members where trip_id = '11111111-1111-4111-8111-111111111111'$$, 'C ne lit pas les participants');
select is_empty($$select 1 from public.trip_changes where trip_id = '11111111-1111-4111-8111-111111111111'$$, 'C ne lit pas l''historique');
select is_empty($$select 1 from public.trip_invites$$, 'C ne lit pas les invitations');
select ok(not public.is_trip_member('11111111-1111-4111-8111-111111111111'), 'is_trip_member : C n''est pas participant');
select ok(not public.is_trip_shared('11111111-1111-4111-8111-111111111111'), 'is_trip_shared ne révèle pas à C que le séjour existe et est partagé');
select is_empty($$select 1 from public.profiles where user_id = 'aaaaaaaa-0000-4000-8000-00000000000a'$$, 'C ne lit pas le profil de A (aucun séjour commun)');
select is((select display_name from public.profiles where user_id = 'aaaaaaaa-0000-4000-8000-00000000000c'), 'Chloé', 'C lit son propre profil');
select is_empty($$update public.trips set title = 'Piraté' where id = '11111111-1111-4111-8111-111111111111' returning 1$$, 'C ne modifie pas le séjour');
select throws_ok($$delete from public.trips where id = '11111111-1111-4111-8111-111111111111'$$, '42501', null, 'C ne supprime pas le séjour (aucun DELETE direct)');
select is_empty($$delete from public.trip_members where trip_id = '11111111-1111-4111-8111-111111111111' returning 1$$, 'C ne retire personne');
select throws_ok($$insert into public.trip_members (trip_id, user_id, role) values ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-00000000000c', 'editor')$$,
  '42501', null, 'C ne s''ajoute pas au séjour');
select throws_ok($$insert into public.trips (id, user_id, title, destination, start_date, end_date, created_at, updated_at) values (gen_random_uuid(), 'aaaaaaaa-0000-4000-8000-00000000000a', 'x', '{}', '2026-10-06', '2026-10-06', now(), now())$$,
  '42501', null, 'C ne crée pas de séjour au nom de A');
select throws_ok($$select public.with_day_ids('11111111-1111-4111-8111-111111111111', '[]')$$, '42501', null, 'with_day_ids est réservée au serveur');
select throws_ok($$select public.purge_trip_changes(0)$$, '42501', null, 'purge_trip_changes est réservée au serveur');

-- ---------------------------------------------------------------------------
-- B, editor : lit tout le séjour ; ne le supprime pas, ne retire personne,
-- ne crée ni ne désactive de lien, n'écrit pas directement
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub": "aaaaaaaa-0000-4000-8000-00000000000b", "role": "authenticated"}';

select is((select title from public.trips where id = '11111111-1111-4111-8111-111111111111'), 'Lisbonne', 'B lit le séjour');
select is((select count(*)::int from public.trip_members where trip_id = '11111111-1111-4111-8111-111111111111'), 4, 'B lit les participants');
select is((select count(*)::int from public.trip_changes where trip_id = '11111111-1111-4111-8111-111111111111'), 2, 'B lit l''historique');
select is((select display_name from public.profiles where user_id = 'aaaaaaaa-0000-4000-8000-00000000000a'), 'Anthony', 'B lit le prénom de A');
select is((select avatar_color from public.profiles where user_id = 'aaaaaaaa-0000-4000-8000-00000000000a'), 'teal', 'B lit la couleur de A');
select is_empty($$select 1 from public.profiles where user_id = 'aaaaaaaa-0000-4000-8000-00000000000c'$$, 'B ne lit pas le profil de C');
select is_empty($$select 1 from public.trip_invites$$, 'B ne lit pas les invitations');
select throws_ok($$delete from public.trips where id = '11111111-1111-4111-8111-111111111111'$$, '42501', null, 'B ne supprime pas le séjour (aucun DELETE direct)');
select is_empty($$delete from public.trip_members where user_id = 'aaaaaaaa-0000-4000-8000-00000000000a' returning 1$$, 'B ne retire pas A');
select is_empty($$delete from public.trip_members where user_id = 'aaaaaaaa-0000-4000-8000-00000000000d' returning 1$$, 'B ne retire pas D');
select throws_ok($$insert into public.trip_invites (trip_id, kind, token_hash) values ('11111111-1111-4111-8111-111111111111', 'link', repeat('a', 64))$$,
  '42501', null, 'B ne crée pas de lien');
select is_empty($$update public.trip_invites set revoked_at = now() returning 1$$, 'B ne désactive pas de lien');
select is_empty($$update public.trips set title = 'Lisbonne B' where id = '11111111-1111-4111-8111-111111111111' returning 1$$, 'B n''écrit pas directement dans le séjour');
select throws_ok($$insert into public.trips (id, user_id, title, destination, start_date, end_date, created_at, updated_at) values ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-00000000000b', 'x', '{}', '2026-10-06', '2026-10-06', now(), now()) on conflict (id) do update set title = excluded.title$$,
  '42501', null, 'B n''écrase pas le séjour par un upsert');
select throws_ok($$insert into public.trip_changes (trip_id, version, op_type) values ('11111111-1111-4111-8111-111111111111', 9, 'step.remove')$$,
  '42501', null, 'B n''écrit pas dans l''historique');
select is_empty($$update public.profiles set display_name = 'Pirate' where user_id = 'aaaaaaaa-0000-4000-8000-00000000000a' returning 1$$, 'B ne modifie pas le profil de A');
select isnt_empty($$update public.profiles set display_name = 'Béatrice' where user_id = 'aaaaaaaa-0000-4000-8000-00000000000b' returning 1$$, 'B modifie son profil');
select throws_ok($$update public.profiles set display_name = repeat('x', 41) where user_id = 'aaaaaaaa-0000-4000-8000-00000000000b'$$,
  '23514', null, 'prénom de 40 caractères au plus');
-- Forme exacte envoyée par l'application (upsert PostgREST, services/api.js).
select lives_ok($$insert into public.profiles (user_id, display_name, avatar_color) values ('aaaaaaaa-0000-4000-8000-00000000000b', 'Bea', 'teal')
  on conflict (user_id) do update set user_id = excluded.user_id, display_name = excluded.display_name, avatar_color = excluded.avatar_color$$, 'B enregistre son profil par upsert');
select throws_ok($$insert into public.profiles (user_id, display_name, avatar_color) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'Pirate', 'teal')
  on conflict (user_id) do update set user_id = excluded.user_id, display_name = excluded.display_name, avatar_color = excluded.avatar_color$$,
  '42501', null, 'B n''écrase pas le profil de A par un upsert');

-- ---------------------------------------------------------------------------
-- A, owner
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub": "aaaaaaaa-0000-4000-8000-00000000000a", "role": "authenticated"}';

select is_empty($$update public.trips set title = 'Lisbonne A' where id = '11111111-1111-4111-8111-111111111111' returning 1$$, 'même l''owner n''écrit pas directement dans un séjour partagé');
select throws_ok($$insert into public.trip_changes (trip_id, version, op_type) values ('11111111-1111-4111-8111-111111111111', 9, 'step.remove')$$,
  '42501', null, 'A n''écrit pas dans l''historique');
select throws_ok($$update public.trip_changes set summary = 'x'$$, '42501', null, 'A ne réécrit pas l''historique');
select is_empty($$delete from public.trip_members where user_id = 'aaaaaaaa-0000-4000-8000-00000000000a' returning 1$$, 'la ligne owner n''est jamais supprimée');
select isnt_empty($$select 1 from public.trip_invites where trip_id = '11111111-1111-4111-8111-111111111111'$$, 'A lit ses invitations');
select throws_ok($$update public.trip_invites set uses = 99$$, '42501', null, 'A ne modifie que revoked_at d''une invitation');
select isnt_empty($$update public.trip_invites set revoked_at = now() returning 1$$, 'A désactive son lien');
select throws_ok($$update public.trip_invites set revoked_at = null$$, 'P0001', 'invite_revoked', 'un lien désactivé ne se réactive pas');
select isnt_empty($$delete from public.trip_members where user_id = 'aaaaaaaa-0000-4000-8000-00000000000d' returning 1$$, 'A retire D');

-- Ancien chemin (jusqu'au Bloc B) : séjour non partagé de A.
select lives_ok($$insert into public.trips (id, user_id, title, destination, start_date, end_date, created_at, updated_at) values ('22222222-2222-4222-8222-222222222222', 'aaaaaaaa-0000-4000-8000-00000000000a', 'Annecy 2', '{}', '2026-11-01', '2026-11-02', now(), now()) on conflict (id) do update set title = excluded.title$$,
  'A met à jour son séjour non partagé (upsert de la synchronisation actuelle)');
select is((select version from public.trips where id = '22222222-2222-4222-8222-222222222222'), 2, 'la version augmente à chaque modification');
select lives_ok($$update public.trips set version = 99 where id = '22222222-2222-4222-8222-222222222222'$$, 'A tente de fixer la version');
select is((select version from public.trips where id = '22222222-2222-4222-8222-222222222222'), 3, 'la version est fixée par la base, jamais par l''appareil');
select lives_ok($$insert into public.trips (id, user_id, title, destination, start_date, end_date, created_at, updated_at) values ('33333333-3333-4333-8333-333333333333', 'aaaaaaaa-0000-4000-8000-00000000000a', 'Gand', '{}', '2026-12-01', '2026-12-02', now(), now()) on conflict (id) do update set title = excluded.title$$,
  'A crée un séjour (upsert de la synchronisation actuelle)');
select is((select role from public.trip_members where trip_id = '33333333-3333-4333-8333-333333333333'), 'owner', 'A devient owner du séjour créé');

-- ---------------------------------------------------------------------------
-- E quitte le séjour ; anon n'a accès à rien
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub": "aaaaaaaa-0000-4000-8000-00000000000e", "role": "authenticated"}';
select isnt_empty($$delete from public.trip_members where trip_id = '11111111-1111-4111-8111-111111111111' and user_id = 'aaaaaaaa-0000-4000-8000-00000000000e' returning 1$$, 'E quitte le séjour');
select is_empty($$select 1 from public.trips where id = '11111111-1111-4111-8111-111111111111'$$, 'E ne voit plus le séjour qu''il a quitté');

set local role anon;
set local request.jwt.claims to '{"role": "anon"}';
select throws_ok($$select 1 from public.trips$$, '42501', null, 'anon ne lit pas les séjours');
select throws_ok($$select 1 from public.trip_members$$, '42501', null, 'anon ne lit pas les participants');
select throws_ok($$select 1 from public.profiles$$, '42501', null, 'anon ne lit pas les profils');

-- ---------------------------------------------------------------------------
-- Serveur : plafond de 10 participants, purge de l'historique
-- ---------------------------------------------------------------------------
reset role;

insert into auth.users (id, email)
select ('bbbbbbbb-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'p' || n || '@example.com' from generate_series(1, 9) n;
-- A et B, plus 8 : 10 participants.
select lives_ok($$insert into public.trip_members (trip_id, user_id, role)
  select '11111111-1111-4111-8111-111111111111', ('bbbbbbbb-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'editor' from generate_series(1, 8) n$$,
  'jusqu''à 10 participants');
select throws_ok($$insert into public.trip_members (trip_id, user_id, role) values ('11111111-1111-4111-8111-111111111111', 'bbbbbbbb-0000-4000-8000-000000000009', 'editor')$$,
  'P0001', 'trip_full', 'pas de 11e participant');

insert into public.trip_changes (trip_id, version, author_id, op_type)
select '11111111-1111-4111-8111-111111111111', 3 + n, 'aaaaaaaa-0000-4000-8000-00000000000b', 'step.set_times' from generate_series(1, 205) n;
select is(public.purge_trip_changes(200), 7, 'la purge efface ce qui dépasse 200 entrées');
select is((select min(version) from public.trip_changes where trip_id = '11111111-1111-4111-8111-111111111111'), 9, 'les 200 plus récentes sont gardées');

-- ---------------------------------------------------------------------------
-- Suppression du compte de A
-- ---------------------------------------------------------------------------
insert into public.trip_changes (trip_id, version, author_id, op_type)
values ('11111111-1111-4111-8111-111111111111', 300, 'aaaaaaaa-0000-4000-8000-00000000000a', 'trip.rename');

select lives_ok($$delete from auth.users where id = 'aaaaaaaa-0000-4000-8000-00000000000a'$$, 'suppression du compte de A');
select is((select user_id from public.trip_members where trip_id = '11111111-1111-4111-8111-111111111111' and role = 'owner'),
  'aaaaaaaa-0000-4000-8000-00000000000b'::uuid, 'le séjour partagé passe au participant le plus ancien (B)');
select is((select user_id from public.trips where id = '11111111-1111-4111-8111-111111111111'),
  'aaaaaaaa-0000-4000-8000-00000000000b'::uuid, 'trips.user_id suit le nouvel owner');
select is((select count(*)::int from public.trip_members where trip_id = '11111111-1111-4111-8111-111111111111'), 9, 'A ne fait plus partie du séjour');
select is((select count(*)::int from public.trips where id in ('22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333')), 0,
  'les séjours dont A était seul participant sont supprimés');
select is((select count(*)::int from public.trip_changes where trip_id = '11111111-1111-4111-8111-111111111111' and author_id is null), 1,
  'l''historique de A reste, sans auteur (« Ancien participant »)');

select * from finish();
rollback;
