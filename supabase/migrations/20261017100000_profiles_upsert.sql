-- Correctif du Prompt 8.0 : l'application enregistre le prénom affiché par
-- un upsert (services/api.js, saveProfile), que PostgREST traduit en
-- insert ... on conflict (user_id) do update set user_id = excluded.user_id, ...
-- Sans droit UPDATE sur user_id, Postgres refusait l'opération (42501), même
-- pour un premier enregistrement : « Le serveur a rencontré une erreur ».
-- Le droit reste sans effet : profiles_update_self n'accepte que les lignes
-- de l'utilisateur, avant comme après (user_id = auth.uid()).
--
-- Retour arrière : supabase/rollbacks/20261017100000_profiles_upsert.down.sql

grant update (user_id) on table public.profiles to authenticated;
