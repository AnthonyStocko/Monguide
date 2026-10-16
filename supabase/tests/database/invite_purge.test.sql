-- Conservation des invitations (migration 20261016200000_invite_purge.sql) :
-- adresses e-mail effacées une fois rattachées, désactivées ou expirées ;
-- liens effacés 30 jours après leur fin.

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(7);

insert into auth.users (id, email) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'a@example.com');
insert into public.trips (id, user_id, title, destination, start_date, end_date, params, planning, created_at, updated_at) values
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-00000000000a', 'Lyon', '{}', '2026-11-06', '2026-11-08', '{}', '[]', now(), now());

insert into public.trip_invites (trip_id, kind, email_normalized, created_at, expires_at, accepted_at) values
  ('11111111-1111-4111-8111-111111111111', 'email', 'pending@example.com', now(), now() + interval '30 days', null),
  ('11111111-1111-4111-8111-111111111111', 'email', 'accepted@example.com', now() - interval '2 days', now() + interval '28 days', now() - interval '1 day'),
  ('11111111-1111-4111-8111-111111111111', 'email', 'expired@example.com', now() - interval '31 days', now() - interval '1 hour', null);
insert into public.trip_invites (trip_id, kind, email_normalized, revoked_at) values
  ('11111111-1111-4111-8111-111111111111', 'email', 'revoked@example.com', now());
insert into public.trip_invites (trip_id, kind, token_hash, created_at, expires_at) values
  ('11111111-1111-4111-8111-111111111111', 'link', repeat('a', 64), now() - interval '40 days', now() - interval '33 days'),
  ('11111111-1111-4111-8111-111111111111', 'link', repeat('b', 64), now() - interval '10 days', now() - interval '3 days'),
  ('11111111-1111-4111-8111-111111111111', 'link', repeat('c', 64), now(), now() + interval '7 days');

select is(public.purge_trip_invites(), 4, 'quatre invitations effacées');
select is((select array_agg(email_normalized) from public.trip_invites where kind = 'email'), array['pending@example.com'], 'seule l''adresse en attente reste');
select ok(not exists (select 1 from public.trip_invites where email_normalized in ('accepted@example.com', 'expired@example.com', 'revoked@example.com')), 'adresses rattachées, expirées, désactivées effacées');
select is((select count(*)::int from public.trip_invites where kind = 'link'), 2, 'liens récents gardés');
select ok(not exists (select 1 from public.trip_invites where token_hash = repeat('a', 64)), 'lien expiré depuis plus de 30 jours effacé');
select ok(exists (select 1 from cron.job where jobname = 'monguide-purge-trip-invites'), 'purge programmée');

set local role authenticated;
set local request.jwt.claims to '{"sub": "aaaaaaaa-0000-4000-8000-00000000000a", "role": "authenticated"}';
select throws_ok($$select public.purge_trip_invites()$$, '42501', null, 'un client ne peut pas lancer la purge');

select * from finish();
rollback;
