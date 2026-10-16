-- Écriture des séjours par opérations (migration 20261016120000_trip_ops.sql) :
-- trip_commit (version attendue, verrou, idempotence, historique) et
-- trip_create, réservées à la clé service_role.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(17);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'a@example.com'),
  ('aaaaaaaa-0000-4000-8000-00000000000b', 'b@example.com');

insert into public.trips (id, user_id, title, destination, start_date, end_date, params, planning, created_at, updated_at) values
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-00000000000a', 'Lisbonne', '{}', '2026-10-06', '2026-10-07', '{"schemaVersion": 3}', '[]', now(), '2026-10-01T00:00:00Z');

-- Version attendue : écriture, version + 1, opérations et historique enregistrés.
select is(
  (select new_version from public.trip_commit('11111111-1111-4111-8111-111111111111', 1,
    '{"title": "Lisbonne", "destination": {}, "start_date": "2026-10-06", "end_date": "2026-10-07", "params": {"schemaVersion": 3}, "planning": [{"id": "j1"}], "deleted": false}',
    'aaaaaaaa-0000-4000-8000-00000000000b', array['c0000000-0000-4000-8000-000000000001'::uuid], 'set_step_time', 'a changé l''horaire')),
  2, 'trip_commit écrit la nouvelle version');
select is((select planning from public.trips where id = '11111111-1111-4111-8111-111111111111'), '[{"id": "j1"}]'::jsonb, 'contenu écrit');
select ok((select updated_at > '2026-10-01T00:00:00Z' from public.trips where id = '11111111-1111-4111-8111-111111111111'), 'updated_at fixé par le serveur');
select is((select version from public.trip_applied_ops where op_id = 'c0000000-0000-4000-8000-000000000001'), 2, 'opération enregistrée avec sa version');
select is((select summary from public.trip_changes where trip_id = '11111111-1111-4111-8111-111111111111' and version = 2), 'a changé l''horaire', 'historique écrit');
select is((select author_id from public.trip_changes where version = 2), 'aaaaaaaa-0000-4000-8000-00000000000b'::uuid, 'auteur de l''historique');

-- Version périmée : rien n'est écrit.
select is_empty($$select * from public.trip_commit('11111111-1111-4111-8111-111111111111', 1, '{"title": "Périmé", "destination": {}, "start_date": "2026-10-06", "end_date": "2026-10-07", "params": {}, "planning": [], "deleted": false}', 'aaaaaaaa-0000-4000-8000-00000000000a', array['c0000000-0000-4000-8000-000000000002'::uuid], 'rename_trip', 'x')$$,
  'version périmée : aucune ligne renvoyée');
select is((select title from public.trips where id = '11111111-1111-4111-8111-111111111111'), 'Lisbonne', 'version périmée : séjour inchangé');

-- Opération déjà appliquée : tout le lot est annulé (l'appelant relit et l'ignore).
select is_empty($$select * from public.trip_commit('11111111-1111-4111-8111-111111111111', 2, '{"title": "Doublon", "destination": {}, "start_date": "2026-10-06", "end_date": "2026-10-07", "params": {}, "planning": [], "deleted": false}', 'aaaaaaaa-0000-4000-8000-00000000000a', array['c0000000-0000-4000-8000-000000000001'::uuid], 'rename_trip', 'x')$$,
  'opération déjà appliquée : aucune ligne renvoyée');
select is((select version from public.trips where id = '11111111-1111-4111-8111-111111111111'), 2, 'opération déjà appliquée : rien écrit');
select is((select count(*)::int from public.trip_changes), 1, 'opération déjà appliquée : pas de doublon dans l''historique');

-- Sans résumé : pas de ligne d'historique (photos, météo…).
select is((select new_version from public.trip_commit('11111111-1111-4111-8111-111111111111', 2, '{"title": "Lisbonne", "destination": {}, "start_date": "2026-10-06", "end_date": "2026-10-07", "params": {}, "planning": [], "deleted": false}', 'aaaaaaaa-0000-4000-8000-00000000000a', array['c0000000-0000-4000-8000-000000000003'::uuid], 'set_images', null)),
  3, 'écriture sans résumé');
select is((select count(*)::int from public.trip_changes), 1, 'sans résumé : historique inchangé');

-- Création : owner inscrit ; identifiant existant : rien.
select is((select new_version from public.trip_create('22222222-2222-4222-8222-222222222222', 'aaaaaaaa-0000-4000-8000-00000000000b',
  '{"title": "Gand", "destination": {}, "start_date": "2026-12-01", "end_date": "2026-12-02", "params": {}, "planning": [], "created_at": "2026-10-16T08:00:00Z"}',
  array['c0000000-0000-4000-8000-000000000004'::uuid], 'create_trip', 'a créé le séjour')), 1, 'trip_create crée le séjour en version 1');
select is((select role from public.trip_members where trip_id = '22222222-2222-4222-8222-222222222222' and user_id = 'aaaaaaaa-0000-4000-8000-00000000000b'), 'owner', 'le créateur est owner');
select is_empty($$select * from public.trip_create('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-00000000000b', '{"title": "Vol", "destination": {}, "start_date": "2026-12-01", "end_date": "2026-12-02", "params": {}, "planning": []}', array['c0000000-0000-4000-8000-000000000005'::uuid], 'create_trip', null)$$,
  'trip_create sur un identifiant existant : rien');

-- Clients : aucun accès.
set local role authenticated;
set local request.jwt.claims to '{"sub": "aaaaaaaa-0000-4000-8000-00000000000a", "role": "authenticated"}';
select throws_ok($$select * from public.trip_commit('11111111-1111-4111-8111-111111111111', 3, '{}', 'aaaaaaaa-0000-4000-8000-00000000000a', array[]::uuid[], 'x', null)$$,
  '42501', null, 'un client ne peut pas appeler trip_commit');

select * from finish();
rollback;
