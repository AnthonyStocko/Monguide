-- Prompt 8.0, Bloc E : version de schéma des séjours (schemaVersion,
-- domain/model.js) qu'une application doit connaître pour modifier un séjour
-- partagé. Une application plus ancienne reçoit toujours le séjour complet ;
-- ses modifications d'un séjour partagé sont refusées (409
-- shared_schema_outdated) et gardées en attente jusqu'à sa mise à jour.
-- Clé réservée de app_config (supabase/functions/_shared/appConfig.js),
-- modifiable sans redéploiement.
--
-- Retour arrière : delete from public.app_config where key = 'min_shared_schema_version';

insert into public.app_config (key, value) values ('min_shared_schema_version', '3')
on conflict (key) do nothing;
