-- Rejoindre un séjour (migration 20261016140000_trip_join.sql) :
-- trip_add_editor, réservée à la clé service_role ; forme des invitations.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(10);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'a@example.com'),
  ('aaaaaaaa-0000-4000-8000-00000000000b', 'b@example.com');
insert into auth.users (id, email)
select ('bbbbbbbb-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'p' || n || '@example.com' from generate_series(1, 9) n;

insert into public.trips (id, user_id, title, destination, start_date, end_date, params, planning, created_at, updated_at) values
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-00000000000a', 'Lyon', '{}', '2026-11-06', '2026-11-08', '{}', '[]', now(), now());

select is(public.trip_add_editor('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-00000000000b'), true, 'ajoute un editor');
select is((select role from public.trip_members where user_id = 'aaaaaaaa-0000-4000-8000-00000000000b'), 'editor', 'rôle editor');
select is((select summary from public.trip_changes where author_id = 'aaaaaaaa-0000-4000-8000-00000000000b'), 'a rejoint le séjour', 'historique : a rejoint le séjour');
select is(public.trip_add_editor('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-00000000000b'), false, 'déjà participant : sans effet');
select is((select count(*)::int from public.trip_changes), 1, 'déjà participant : pas de nouvel historique');

-- A et B, plus 8 : 10 participants ; le 11e est refusé.
select lives_ok($$select public.trip_add_editor('11111111-1111-4111-8111-111111111111', ('bbbbbbbb-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid) from generate_series(1, 8) n$$, '10 participants');
select throws_ok($$select public.trip_add_editor('11111111-1111-4111-8111-111111111111', 'bbbbbbbb-0000-4000-8000-000000000009')$$, 'P0001', 'trip_full', 'séjour complet');

-- Le jeton en clair ne peut pas être enregistré : seule une empreinte SHA-256 hexadécimale est acceptée.
select throws_ok($$insert into public.trip_invites (trip_id, kind, token_hash) values ('11111111-1111-4111-8111-111111111111', 'link', 'q3Jx8m2Vb7Lw0Yk5Hn4Tz9Pd1Rf6Sg8Ua2Ce5Ki7Ob0Q')$$,
  '23514', null, 'un jeton en clair est refusé dans token_hash');

update public.trips set deleted = true where id = '11111111-1111-4111-8111-111111111111';
select throws_ok($$select public.trip_add_editor('11111111-1111-4111-8111-111111111111', 'bbbbbbbb-0000-4000-8000-000000000009')$$, 'P0002', 'trip_not_found', 'séjour supprimé');

set local role authenticated;
set local request.jwt.claims to '{"sub": "aaaaaaaa-0000-4000-8000-00000000000a", "role": "authenticated"}';
select throws_ok($$select public.trip_add_editor('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-00000000000a')$$, '42501', null, 'un client ne peut pas appeler trip_add_editor');

select * from finish();
rollback;
