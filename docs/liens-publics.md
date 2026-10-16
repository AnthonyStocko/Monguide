# Liens publics de Mon guide

Adresses à communiquer (fiche Play Store, réseaux sociaux, presse). Dans
l'application, elles viennent de la rubrique `public` de
`supabase/functions/_shared/domain/config/rules.js`, surchargeable sans
nouvelle version par `app_config` (clé `public.<nom>`, voir `docs/api.md`).
Les pages statiques de `public/` contiennent les mêmes adresses en clair :
les mettre à jour à la main si l'une d'elles change.

## Adresses

| Nom (`public.…`) | Adresse |
|---|---|
| `webApp` (version web) | https://monguide.mgapp.workers.dev |
| `playStore` (application Android) | https://play.google.com/store/apps/details?id=com.monguide.app |
| `presentation` | https://monguide.mgapp.workers.dev/decouvrir.html |
| `privacy` (confidentialité) | https://monguide.mgapp.workers.dev/confidentialite.html |
| `legal` (mentions légales) | https://monguide.mgapp.workers.dev/mentions-legales.html |
| `accountDeletion` (suppression du compte) | https://monguide.mgapp.workers.dev/suppression-compte.html |
| `contactEmail` | monguide.app@outlook.com |

Play Console : « Règles de confidentialité » = `privacy`, « Suppression des
données » (URL de suppression du compte) = `accountDeletion`, site web =
`presentation`, e-mail de contact = `contactEmail`.

## Liens Play Store suivis, par canal

Campagne `lancement`. Les installations par canal apparaissent dans Play
Console (Statistiques > Acquisition d'utilisateurs, par source UTM).

| Canal | Lien |
|---|---|
| Instagram | https://play.google.com/store/apps/details?id=com.monguide.app&referrer=utm_source%3Dinstagram%26utm_medium%3Dsocial%26utm_campaign%3Dlancement |
| Facebook | https://play.google.com/store/apps/details?id=com.monguide.app&referrer=utm_source%3Dfacebook%26utm_medium%3Dsocial%26utm_campaign%3Dlancement |
| TikTok | https://play.google.com/store/apps/details?id=com.monguide.app&referrer=utm_source%3Dtiktok%26utm_medium%3Dsocial%26utm_campaign%3Dlancement |
| YouTube | https://play.google.com/store/apps/details?id=com.monguide.app&referrer=utm_source%3Dyoutube%26utm_medium%3Dvideo%26utm_campaign%3Dlancement |
| Presse | https://play.google.com/store/apps/details?id=com.monguide.app&referrer=utm_source%3Dpresse%26utm_medium%3Dpresse%26utm_campaign%3Dlancement |
| Site (page de présentation) | https://play.google.com/store/apps/details?id=com.monguide.app&referrer=utm_source%3Dsite%26utm_medium%3Dweb%26utm_campaign%3Dlancement |

Prêts à copier :

```
https://play.google.com/store/apps/details?id=com.monguide.app&referrer=utm_source%3Dinstagram%26utm_medium%3Dsocial%26utm_campaign%3Dlancement
https://play.google.com/store/apps/details?id=com.monguide.app&referrer=utm_source%3Dfacebook%26utm_medium%3Dsocial%26utm_campaign%3Dlancement
https://play.google.com/store/apps/details?id=com.monguide.app&referrer=utm_source%3Dtiktok%26utm_medium%3Dsocial%26utm_campaign%3Dlancement
https://play.google.com/store/apps/details?id=com.monguide.app&referrer=utm_source%3Dyoutube%26utm_medium%3Dvideo%26utm_campaign%3Dlancement
https://play.google.com/store/apps/details?id=com.monguide.app&referrer=utm_source%3Dpresse%26utm_medium%3Dpresse%26utm_campaign%3Dlancement
https://play.google.com/store/apps/details?id=com.monguide.app&referrer=utm_source%3Dsite%26utm_medium%3Dweb%26utm_campaign%3Dlancement
```

Pour un nouveau canal : même lien, en changeant `utm_source` (et
`utm_medium` si besoin). Garder l'encodage (`%3D` pour `=`, `%26` pour `&`)
dans la valeur de `referrer`.
