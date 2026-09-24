# Mon guide

Guide touristique sur-mesure (France et Europe), en architecture hybride :

- `src/` : l'application (Vite + React + Tailwind CSS v4), empaquetée pour
  Android avec Capacitor (`android/`, versionné). Elle ne parle qu'à
  Supabase, via `src/services/api.js` (seule exception : les tuiles de carte).
- `supabase/` : le serveur (migrations PostgreSQL, Edge Functions en Deno).
- `supabase/functions/_shared/domain/` : le domaine partagé (fonctions pures,
  testées), importé par l'application via l'alias `@domain`.
- `docs/api.md` : contrat d'API versionné.

## Prérequis

- Node.js 24 et npm.
- Pour construire l'APK en local seulement : JDK 21 et le SDK Android
  (sinon, utiliser le workflow GitHub, voir « Application Android »).

## Installation et lancement

```
npm ci
cp .env.example .env    # puis renseigner l'URL et la clé publique Supabase
npm run dev             # application sur http://localhost:5173
npm test                # tests Vitest (application, domaine partagé, serveur)
npm run build           # build web dans dist/
```

Variables d'environnement de l'application : **uniquement**
`VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` (Supabase > Project Settings
> API). Aucune autre clé dans l'application ; la clé `service_role` reste
côté serveur. Le serveur est déployé par son propre workflow (voir plus bas).

## Application Android

Le dossier `android/` a été créé une seule fois (`npm run build` puis
`npx cap add android`) et il est versionné. Ne jamais relancer `cap add`.

- **Sans Android Studio** : le workflow `.github/workflows/android.yml`
  construit un APK de débogage à chaque push sur `main` qui touche
  l'application (ou à la demande : Actions > Application Android > Run
  workflow). L'APK est à télécharger dans les artefacts du run
  (`mon-guide-debug-apk`). Secrets GitHub requis : `VITE_SUPABASE_URL` et
  `VITE_SUPABASE_ANON_KEY`. La marche à suivre pour une version release
  signée est décrite en commentaire dans le workflow.
- **En local** :

  ```
  npm run build
  npx cap sync android
  cd android && ./gradlew assembleDebug   # APK : android/app/build/outputs/apk/debug/
  ```

  ou `npm run android` pour ouvrir le projet dans Android Studio.

Identifiant de l'application : `com.monguide.app` (`capacitor.config.json`),
à vérifier et fixer définitivement avant la première publication sur le
Play Store.

Permissions Android : Internet ; localisation (« Utiliser ma position »,
demandée au moment du clic) ; notifications (`POST_NOTIFICATIONS`, Android
13 et plus) ; alarmes exactes (`SCHEDULE_EXACT_ALARM`, accordée par
l'utilisateur ; sans elle, les rappels peuvent arriver avec quelques minutes
de retard) ; `RECEIVE_BOOT_COMPLETED` et `WAKE_LOCK` (rappels réinscrits au
redémarrage du téléphone). `USE_EXACT_ALARM`, réservée par Google Play aux
réveils et agendas, n'est jamais déclarée (le workflow le vérifie dans le
manifeste fusionné).

## Publication sur Google Play

- **Release signée** : pousser un tag `vX.Y.Z` (`git tag v1.0.0 && git push
  origin v1.0.0`). Le workflow `.github/workflows/release.yml` construit
  l'Android App Bundle (`.aab`, format exigé par Google Play) et une APK
  release de test, minifiés (R8) et signés, publiés en artefacts
  (`mon-guide-X.Y.Z-aab`, `mon-guide-X.Y.Z-release-apk`). `versionName` = tag
  sans le « v » (aussi affichée dans l'application) ; `versionCode` = numéro
  d'exécution du workflow, qui augmente à chaque release.
- **Keystore d'upload** : jamais dans le dépôt (`*.jks` et
  `keystore.properties` sont exclus par `android/.gitignore`). Il est fourni
  au workflow par les secrets GitHub `ANDROID_KEYSTORE_BASE64` (fichier en
  base64), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` et
  `ANDROID_KEY_PASSWORD`. **Sauvegarder le fichier `.jks` et ses mots de
  passe hors de GitHub** (gestionnaire de mots de passe, sauvegarde chiffrée) :
  les secrets GitHub ne peuvent pas être relus.
- **Signature des applications par Google Play (recommandée)** : à activer à la
  création de l'application dans la Play Console. Google conserve la clé de
  signature ; le keystore du dépôt n'est qu'une clé d'upload, réinitialisable
  auprès de Google en cas de perte. Sans elle, perdre le keystore empêche
  toute mise à jour de l'application.
- **Build release en local** (facultatif) : créer `android/keystore.properties`
  (`storeFile`, `storePassword`, `keyAlias`, `keyPassword`), puis
  `cd android && ./gradlew bundleRelease -PmonguideVersionCode=1 -PmonguideVersionName=1.0.0`.
- **Fiche, sécurité des données, checklist** : dossier `store/`
  (`node store/check-listing.mjs` vérifie les longueurs de la fiche).

## Pages web publiques

Le dossier `site/` (politique de confidentialité et suppression de compte,
en français et en anglais) est publié sur GitHub Pages par
`.github/workflows/pages.yml` : https://anthonystocko.github.io/Monguide/.
`site/config.js` (URL et clé publique Supabase) est généré au déploiement
depuis les secrets GitHub et n'est pas versionné. La page de suppression
utilise la même connexion par code e-mail que l'application (sans jamais
créer de compte), puis la fonction `delete-account` ; l'origine
`https://anthonystocko.github.io` est autorisée par le serveur (CORS).

## Pays pris en charge (32)

Union européenne : Allemagne, Autriche, Belgique, Bulgarie, Chypre, Croatie,
Danemark, Espagne, Estonie, Finlande, France, Grèce, Hongrie, Irlande,
Italie, Lettonie, Lituanie, Luxembourg, Malte, Pays-Bas, Pologne, Portugal,
Roumanie, Slovaquie, Slovénie, Suède, Tchéquie.

Hors Union européenne : Islande, Liechtenstein, Norvège, Royaume-Uni, Suisse.

Liste de référence : `supabase/functions/_shared/domain/config/countries.js`.
La France a des sources nationales dédiées (Mérimée, Muséofile, INAO, prix
des carburants) ; les autres pays utilisent Wikidata et OpenStreetMap.

## Mise en place de Supabase (une fois)

1. **Créer le projet** sur supabase.com, dans une région de l'Union
   européenne (Mon guide : `eu-west-1`, Irlande).
2. **Lier le dépôt et créer la base** (le « script SQL » est l'ensemble des
   migrations de `supabase/migrations/`, appliquées dans l'ordre) :

   ```
   npx supabase login
   npx supabase link --project-ref <ref du projet>
   npx supabase db push
   ```

3. **Secrets des fonctions** :

   ```
   npx supabase secrets set RATE_LIMIT_SALT=<longue chaîne aléatoire> MONGUIDE_CONTACT=<URL ou e-mail de l'équipe>
   ```

   `MONGUIDE_CONTACT` est aussi affiché dans l'écran Confidentialité.
   Facultatifs : `OVERPASS_URL` (Overpass ; l'instance overpass-api.de
   refuse les requêtes venant de Supabase, voir
   `supabase/functions/_shared/services/osm.js`) et `PHOTON_URL` (instance
   Photon dédiée en cas de diffusion large).

4. **Déployer les fonctions**, dont `delete-account` (suppression du compte
   et, en cascade, de ses séjours ; seule fonction qui utilise la clé
   `service_role`, fournie par Supabase côté serveur) :

   ```
   npx supabase functions deploy --use-api
   ```

5. **Activer la connexion par code reçu par e-mail** (Authentication >
   Sign In / Providers > Email) :
   - activer le fournisseur Email ;
   - « Email OTP Length » : **6** (valeur de `rules.auth.otpLength`) ;
   - Authentication > Emails > Templates : dans « Magic Link » et
     « Confirm signup », afficher le code avec `{{ .Token }}` (pas de lien) ;
   - configurer un serveur SMTP (Authentication > Emails > SMTP Settings) :
     le serveur intégré de Supabase est très limité et n'envoie qu'aux
     adresses de l'équipe.

6. **Tâche hebdomadaire des prix des carburants** (fuel-eu-refresh) : créer
   deux secrets Vault depuis le SQL Editor (jamais dans le dépôt) :

   ```sql
   select vault.create_secret('https://<ref>.supabase.co', 'monguide_project_url');
   select vault.create_secret('<clé service_role>', 'monguide_service_role_key');
   ```

7. **GitHub** (Settings > Secrets and variables > Actions) :
   - serveur : `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`,
     `SUPABASE_DB_PASSWORD` — chaque push sur `main` qui modifie `supabase/`
     lance les tests, applique les migrations et déploie les fonctions
     (`.github/workflows/deploy-server.yml`) ;
   - application : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

Toute évolution de la base passe par une migration SQL dans
`supabase/migrations/` (jamais de modification manuelle dans le tableau de
bord), sauf les valeurs de `app_config`, faites pour être modifiées en direct
(voir `docs/api.md`).

Développement local du serveur (facultatif, Docker requis) :

```
npx supabase start
npx supabase functions serve
```

## API et données utilisées

Toutes les API externes sont appelées par le serveur (module
`_shared/http.js`), sauf les tuiles de carte. Les conditions marquées « à
vérifier » doivent être confirmées avant une diffusion publique, et a
fortiori commerciale.

| Source | Usage | Licence et conditions |
|---|---|---|
| OpenStreetMap (Overpass) | lieux (parcs, restaurants, marchés, petit patrimoine) | données ODbL 1.0, « © contributeurs OpenStreetMap » ; instances Overpass publiques à usage raisonnable (instance dédiée recommandée) |
| Tuiles tile.openstreetmap.org | fond de carte | ODbL ; politique d'usage de la fondation OSM : pas d'usage intensif, prévoir un fournisseur de tuiles pour une diffusion large |
| Photon (komoot) | recherche d'adresses et de communes | données OpenStreetMap, ODbL 1.0 ; instance publique à usage raisonnable |
| Open-Meteo | prévisions météo | données CC BY 4.0 ; API gratuite pour un usage **non commercial** (abonnement payant sinon) |
| Wikidata | patrimoine et musées hors de France | CC0 1.0 |
| Ministère de la Culture (Mérimée, Muséofile), via data.gouv.fr | monuments historiques et musées en France | Licence Ouverte (Etalab) 2.0 |
| INAO (aires AOC/AOP), via data.gouv.fr | produits du terroir en France | Licence Ouverte (Etalab) 2.0 |
| Prix des carburants (ministère de l'Économie), via data.gouv.fr | prix en France | Licence Ouverte (Etalab) 2.0 |
| geo.api.gouv.fr | découpage administratif (départements) | Licence Ouverte (Etalab) 2.0 |
| Nager.Date | jours fériés | code sous licence MIT ; conditions d'usage de l'API publique **à vérifier** |
| Bulletin pétrolier (Weekly Oil Bulletin, Commission européenne) | prix des carburants dans l'UE | réutilisation selon la décision 2011/833/UE ; conditions **à vérifier** |
| Banque centrale européenne | taux de change de référence | réutilisation avec mention de la source ; conditions **à vérifier** |
| ADEME, Base Carbone® | facteurs d'émission | conditions d'utilisation de la Base Carbone **à vérifier** (licence indiquée dans l'application : Licence Ouverte) |
| Ember, Yearly electricity data | intensité carbone de l'électricité par pays | CC BY 4.0 |

Les mêmes sources, adaptées au pays et au mode de déplacement, sont citées
dans l'export PDF de chaque séjour
(`supabase/functions/_shared/domain/config/dataSources.js`).

Police de l'export PDF : DejaVu Sans (licence Bitstream Vera et domaine
public pour les modifications DejaVu), choisie pour couvrir toutes les
langues des pays pris en charge (latin étendu, grec, cyrillique).

## Export PDF

Depuis l'onglet Planning, « Exporter en PDF » : titre, dates, planning jour
par jour (étapes personnelles et hébergements compris), bilan carbone et
sources des données, dans la langue de l'interface. Les adresses des
hébergements et des étapes personnelles sont masquées, sauf si
« Inclure les adresses personnelles » est coché. Généré avec jsPDF (sans
`window.print`) ; sur Android, le fichier est enregistré dans le cache de
l'application puis proposé au partage ; sur le web, il est téléchargé.
