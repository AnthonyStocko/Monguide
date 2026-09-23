# Mon guide

Coquille de départ, même architecture que Child App :
- `src/` : l'API REST (Node.js + Express + MySQL), seule source de vérité
  métier (validation, règles, données).
- `web/` : le client React (PWA : Vite, Tailwind, React Query, React Router),
  interface uniquement — tout passe par l'API.
- `web/android/` : l'appli Android (Capacitor) qui charge le site en ligne
  (`server.url` dans `web/capacitor.config.json`).

En production, l'API sert aussi le build du client React : un seul serveur à
déployer/mettre à jour.

## Démarrage local (développement)

Deux process en parallèle :
```
copy .env.exemple .env    # renseigne DB_* et JWT_SECRET
npm install
npm run dev                # API sur http://localhost:3000

npm run install:web        # une seule fois
npm run dev:web             # client React sur http://localhost:5173 (proxy /api -> :3000)
```
Au démarrage, l'API crée les tables si besoin (`sql/schema.sql`).

## Build et déploiement

```
npm run install:web
npm run build               # build le client React dans web/dist
NODE_ENV=production npm start   # une seule appli, sert l'API et le client sur le même port
```

Sur alwaysdata : un site Node.js (commande `npm start`, variables d'environnement
de `.env.exemple`) et une base MySQL. Après une modification de `src/`, redémarrer
le site depuis l'admin alwaysdata ; une modification de `web/` ne demande que de
recopier `web/dist`.

## Appli Android

```
cd web
npx vite build && npx cap sync android
cd android && gradlew.bat bundleRelease    # AAB signé pour le Play Store
```
La signature release lit `web/android/keystore.properties` (hors git, voir
`web/android/app/build.gradle`). Incrémenter `versionCode` à chaque envoi.

## Authentification
`POST /api/auth/register` et `POST /api/auth/login` renvoient `{ token, user }`.
Toutes les autres routes exigent `Authorization: Bearer <token>` (jeton valable 30 jours)
et ne donnent accès qu'aux données de l'utilisateur connecté.

## Routes

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/health` | Statut de l'API et de la base |
| POST | `/api/auth/register` | `{ name, email, password }` (mot de passe 8 à 72 caractères) |
| POST | `/api/auth/login` | `{ email, password }` |
| POST | `/api/auth/delete-account` | `{ email, password }` : supprime le compte et ses données |
| GET | `/api/me` | Utilisateur connecté |

Erreurs : `{ "error": "code_technique", "message": "Message en français" }`.

## Pages publiques (exigées par Google Play)
- `/confidentialite` : règles de confidentialité (à compléter selon les données collectées).
- `/suppression-compte` : suppression du compte sans passer par l'appli.

## Sécurité
- Mots de passe hachés avec bcrypt, jamais renvoyés.
- Requêtes SQL paramétrées (pas d'injection).
- Limitation des essais sur `/api/auth` (30 par 15 min et par IP).
- `JWT_SECRET` obligatoire (32 caractères minimum) : l'API refuse de démarrer sans.
