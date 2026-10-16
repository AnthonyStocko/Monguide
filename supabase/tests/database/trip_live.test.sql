-- Modifications en direct (migration 20261016160000_trip_live.sql) :
-- publication Realtime, étapes touchées, dernière version vue,
-- notifications web « Paul a modifié votre séjour ».

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(16);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'a@example.com'),
  ('aaaaaaaa-0000-4000-8000-00000000000b', 'b@example.com'),
  ('aaaaaaaa-0000-4000-8000-00000000000c', 'c@example.com');
insert into public.trips (id, user_id, title, destination, start_date, end_date, params, planning, created_at, updated_at) values
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-00000000000a', 'Lyon', '{}', '2026-11-06', '2026-11-08', '{}', '[]', now(), now());
insert into public.trip_members (trip_id, user_id, role) values ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-00000000000b', 'editor');
insert into public.profiles (user_id, display_name) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'Anthony');

-- Appareils web : B (activé), B2 (désactivé), A (auteur), C (étranger, activé).
insert into public.push_subscriptions (device_id, user_id, endpoint, p256dh, auth, lang, notify_trip_changes) values
  ('device-b-0000000001', 'aaaaaaaa-0000-4000-8000-00000000000b', 'https://push/b', 'k', 'a', 'fr', true),
  ('device-b-0000000002', 'aaaaaaaa-0000-4000-8000-00000000000b', 'https://push/b2', 'k', 'a', 'fr', false),
  ('device-a-0000000001', 'aaaaaaaa-0000-4000-8000-00000000000a', 'https://push/a', 'k', 'a', 'en', true),
  ('device-c-0000000001', 'aaaaaaaa-0000-4000-8000-00000000000c', 'https://push/c', 'k', 'a', 'fr', true);

select ok(exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trip_changes'), 'trip_changes publiée dans Realtime');

select is((select new_version from public.trip_commit('11111111-1111-4111-8111-111111111111', 1,
  '{"title": "Lyon", "destination": {}, "start_date": "2026-11-06", "end_date": "2026-11-08", "params": {}, "planning": [], "deleted": false}',
  'aaaaaaaa-0000-4000-8000-00000000000a', array['c0000000-0000-4000-8000-000000000001'::uuid], 'move_step', 'a déplacé « Dîner » à 20:00 (samedi) ; a validé « Musée »',
  array['dinner', 'museum'], 2)), 2, 'trip_commit à 9 paramètres');
select is((select step_ids from public.trip_changes where version = 2), array['dinner', 'museum'], 'étapes touchées enregistrées');
select is((select summary_count from public.trip_changes where version = 2), 2, 'nombre de modifications enregistré');

-- Notifications web : B seulement (activé, participant, pas l'auteur).
select is(public.trip_queue_change_pushes('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-00000000000a'), 1, 'une notification mise en file');
select is((select device_id from public.scheduled_reminders), 'device-b-0000000001', 'pour l''appareil de B qui l''a activée');
select is((select body from public.scheduled_reminders), 'Anthony a modifié votre séjour « Lyon »', 'texte avec le prénom de l''auteur');
select ok((select reminder_key < 0 from public.scheduled_reminders), 'clé négative, distincte des rappels');
select is(public.trip_queue_change_pushes('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-00000000000a'), 0, 'déjà en attente : pas de doublon');
update public.scheduled_reminders set sent_at = now() - interval '10 minutes';
select is(public.trip_queue_change_pushes('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-00000000000a'), 0, 'envoyée il y a moins d''une heure : rien');
update public.scheduled_reminders set sent_at = now() - interval '61 minutes';
select is(public.trip_queue_change_pushes('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-00000000000a'), 1, 'envoyée il y a plus d''une heure : nouvelle notification');
select ok((select sent_at is null from public.scheduled_reminders), 'remise en file');

-- Dernière version vue : B met à jour la sienne, rien d'autre.
set local role authenticated;
set local request.jwt.claims to '{"sub": "aaaaaaaa-0000-4000-8000-00000000000b", "role": "authenticated"}';
select isnt_empty($$update public.trip_members set last_seen_version = 2 where trip_id = '11111111-1111-4111-8111-111111111111' and user_id = 'aaaaaaaa-0000-4000-8000-00000000000b' returning 1$$, 'B met à jour sa dernière version vue');
select is_empty($$update public.trip_members set last_seen_version = 9 where user_id = 'aaaaaaaa-0000-4000-8000-00000000000a' returning 1$$, 'B ne touche pas la ligne de A');
select throws_ok($$update public.trip_members set role = 'owner' where user_id = 'aaaaaaaa-0000-4000-8000-00000000000b'$$, '42501', null, 'B ne change pas son rôle');
select throws_ok($$select public.trip_queue_change_pushes('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-00000000000b')$$, '42501', null, 'un client ne met rien en file');

select * from finish();
rollback;
