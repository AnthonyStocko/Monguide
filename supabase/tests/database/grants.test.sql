-- Droits du schéma public (migration 20261023100000_explicit_grants.sql et
-- règle du README « Droits d'accès aux tables ») : toute table a la RLS et
-- des GRANT explicites ; anon n'a accès à rien ; authenticated seulement à ce
-- que l'application utilise. Échoue dès qu'une nouvelle migration oublie
-- l'un ou l'autre (config.toml : auto_expose_new_tables = false).

begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(14);

-- Tables, vues et séquences du schéma public, hors extensions.
create temporary view rels as
select c.oid, c.relname, c.relkind, c.relrowsecurity, c.relacl, c.reloptions
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p', 'v', 'm', 'S')
  and not exists (select 1 from pg_depend d where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e');

create temporary view funcs as
select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e');

-- 1. RLS et GRANT explicites.
select is_empty(
  $$select relname from rels where relkind in ('r', 'p') and not relrowsecurity$$,
  'toutes les tables ont la RLS activée'
);
select is_empty(
  $$select relname from rels r where relkind in ('r', 'p', 'v', 'm')
    and not exists (select 1 from aclexplode(r.relacl) a where a.grantee = 'service_role'::regrole)$$,
  'toutes les tables et vues ont des GRANT explicites pour service_role'
);
select is_empty(
  $$select relname from rels where relkind = 'v' and not coalesce('security_invoker=true' = any (reloptions), false)$$,
  'toutes les vues appliquent la RLS de l''appelant (security_invoker)'
);

-- 2. anon : rien.
select is_empty(
  $$select relname from rels r where relkind <> 'S'
    and (has_table_privilege('anon', r.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
         or has_any_column_privilege('anon', r.oid, 'SELECT, INSERT, UPDATE, REFERENCES'))$$,
  'anon n''a aucun droit sur les tables et vues'
);
select is_empty(
  $$select relname from rels r where case when relkind = 'S' then has_sequence_privilege('anon', r.oid, 'USAGE, SELECT, UPDATE') else false end$$,
  'anon n''a aucun droit sur les séquences'
);
select is_empty(
  $$select proname || '(' || args || ')' from funcs f where has_function_privilege('anon', f.oid, 'EXECUTE')$$,
  'anon n''exécute aucune fonction'
);

-- 3. authenticated : seulement ce que l'application utilise.
select set_eq(
  $$select relname::text from rels r where relkind <> 'S'
    and (has_table_privilege('authenticated', r.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
         or has_any_column_privilege('authenticated', r.oid, 'SELECT, INSERT, UPDATE, REFERENCES'))$$,
  array['trips', 'trip_members', 'trip_invites', 'trip_changes', 'profiles'],
  'authenticated n''accède qu''aux tables lues ou écrites par l''application'
);
select is_empty(
  $$select relname from rels r where relkind <> 'S'
    and has_table_privilege('authenticated', r.oid, 'TRUNCATE, REFERENCES, TRIGGER')$$,
  'authenticated n''a ni TRUNCATE, ni REFERENCES, ni TRIGGER'
);
select is_empty(
  $$select relname from rels r where case when relkind = 'S' then has_sequence_privilege('authenticated', r.oid, 'USAGE, SELECT, UPDATE') else false end$$,
  'authenticated n''a aucun droit sur les séquences'
);
select set_eq(
  $$select proname::text from funcs f where has_function_privilege('authenticated', f.oid, 'EXECUTE')$$,
  array['is_trip_member', 'is_trip_owner', 'is_trip_shared', 'shares_trip_with'],
  'authenticated n''exécute que les fonctions des politiques RLS'
);
select is(
  has_table_privilege('authenticated', 'public.trips', 'DELETE'),
  false,
  'authenticated ne supprime pas de séjour directement'
);

-- 4. Avec la clé anon, sans être connecté : ni séjour, ni profil.
set local role anon;
set local request.jwt.claims to '{"role": "anon"}';
select throws_ok($$select 1 from public.trips$$, '42501', null, 'anon ne lit pas les séjours');
select throws_ok($$select 1 from public.profiles$$, '42501', null, 'anon ne lit pas les profils');
reset role;

-- 5. service_role lit et écrit (Edge Functions).
set local role service_role;
select lives_ok(
  $$insert into public.api_cache (key, source, value, expires_at) values ('grants-test', 'test', '{}', now())$$,
  'service_role écrit dans les tables internes'
);
reset role;

select * from finish();
rollback;
