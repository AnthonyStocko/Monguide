# Mon guide

Guide touristique sur-mesure (France et Europe), en architecture hybride :

- `src/` : l'application (Vite + React + Tailwind CSS v4), empaquetée pour
  Android avec Capacitor (`android/`). Elle ne parle qu'à Supabase, via
  `src/services/api.js`.
- `supabase/` : le serveur (migrations PostgreSQL, Edge Functions en Deno).
- `supabase/functions/_shared/domain/` : le domaine partagé (fonctions pures),
  importé par l'application via l'alias `@domain`.
- `docs/api.md` : contrat d'API versionné.

## Commandes

```
npm install
npm run dev        # application sur http://localhost:5173
npm test           # tests Vitest (application, domaine partagé, modules serveur)
npm run android    # build, synchronisation Capacitor, ouverture d'Android Studio
```

## Mise en place du serveur (une fois)

1. Créer un projet sur supabase.com, puis :

   ```
   npx supabase login
   npx supabase link --project-ref <ref du projet>
   npx supabase db push                 # applique supabase/migrations/
   npx supabase secrets set RATE_LIMIT_SALT=<longue chaîne aléatoire> MONGUIDE_CONTACT=<URL ou e-mail de l'équipe>
   npx supabase functions deploy --use-api
   ```

   Secrets facultatifs, pour remplacer une instance publique sans changer le
   code : `OVERPASS_URL` (Overpass ; l'instance overpass-api.de refuse les
   requêtes venant de Supabase, voir `supabase/functions/_shared/services/osm.js`)
   et `PHOTON_URL` (Photon, pour une instance dédiée en cas de diffusion large).

   Tâche hebdomadaire des prix des carburants (fuel-eu-refresh) : créer une
   fois deux secrets Vault depuis le SQL Editor (jamais dans le dépôt) :

   ```sql
   select vault.create_secret('https://<ref>.supabase.co', 'monguide_project_url');
   select vault.create_secret('<clé service_role>', 'monguide_service_role_key');
   ```

2. Copier `.env.example` en `.env` et y mettre l'URL du projet et sa clé
   publique (Project Settings > API). Aucune autre clé dans l'application.

3. Déploiement automatique : dans GitHub (Settings > Secrets and variables >
   Actions), créer `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF` et
   `SUPABASE_DB_PASSWORD`. Chaque push sur `main` qui modifie `supabase/`
   lance les tests, applique les migrations et déploie les fonctions
   (`.github/workflows/deploy-server.yml`).

Toute évolution de la base passe par une migration SQL dans
`supabase/migrations/` (jamais de modification manuelle dans le tableau de
bord), sauf les valeurs de `app_config`, faites pour être modifiées en direct
(voir `docs/api.md`).

## Développement local du serveur (facultatif, Docker requis)

```
npx supabase start
npx supabase functions serve
```
