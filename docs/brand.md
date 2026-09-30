# Logo et icônes « Mon guide »

Repère de carte vert contenant un paysage de collines et un soleil, avec le
nom « Mon guide » en Fraunces SemiBold. Couleurs du design system
uniquement : vert `#059669` et `#047857`, sable `#F7F3EC`, ciel `#FAEBD0`,
or `#D9A441`, encre `#0F172A`.

## Source unique

- `src/brand/logo.js` : géométrie du repère (carré de 1024), variantes
  `color`, `onGreen` (repère sable sur fond vert) et `mono`, et générateurs
  SVG (`logoSvg`, `iconSvg`).
- `src/brand/wordmark.js` : le nom converti en tracés (généré une fois avec
  opentype.js depuis `@fontsource/fraunces`, licence SIL OFL 1.1). Le logo
  ne contient aucun texte ni police : il s'affiche à l'identique sans
  Fraunces (vérifié par `src/brand/logo.test.js`).
- Dans l'application : `src/components/brand/Logo.jsx` (`Logo`, `LogoMark`),
  dans l'en-tête de l'accueil, l'écran « À propos » et les écrans du premier
  lancement.

## Régénérer les fichiers

```
npm run brand
```

La commande enchaîne :

1. `node scripts/brand/build.mjs` : `assets/brand/`, `assets/capacitor/`,
   `assets/store/`, favicons et logos web, vecteurs Android ;
2. `capacitor-assets generate --android --assetPath assets/capacitor` : outil
   officiel `@capacitor/assets` (commande vérifiée avec la version 3.0.5,
   mode personnalisé : `icon-only.png`, `icon-foreground.png`,
   `icon-background.png`) ; il écrit les icônes `mipmap-*` et
   `mipmap-anydpi-v26/ic_launcher*.xml`. Il reformate aussi
   `AndroidManifest.xml` sans le modifier : `git checkout` ce fichier si le
   diff ne contient que de la mise en forme ;
3. `node scripts/brand/build.mjs --android-finish` : ajoute la couche
   `<monochrome>` (icônes à thème, Android 13+), que `@capacitor/assets`
   n'écrit pas.

`src/brand/logo.test.js` échoue si les fichiers publiés ne correspondent plus
à la source.

## Fichiers

| Fichier | Usage |
|---|---|
| `assets/brand/logo.svg`, `logo-mono.svg`, `logo-on-dark.svg` | logo principal (repère + nom) |
| `assets/brand/icon.svg`, `icon-mono.svg` | icône seule |
| `assets/brand/app-icon-1024.svg` / `.png` | icône d'application 1024 × 1024 |
| `assets/store/play-icon-512.png` | Play Store : icône 512 × 512 |
| `assets/store/play-feature-1024x500.png` | Play Store : image de présentation |
| `public/favicon.svg` | favicon de l'application web |
| `site/assets/favicon.svg`, `logo.svg`, `logo-dark.svg` | pages web (confidentialité, suppression de compte) |

## Android

- Icône adaptative : premier plan = repère sable, fond = vert `#059669`
  (`@capacitor/assets`, retrait de 16,7 % : le repère, à 0,92 de l'image,
  tient dans le cercle sûr de 66 dp) ; couche monochrome =
  `drawable/ic_launcher_monochrome.xml` (vecteur, même cadrage).
- Écran de démarrage : API SplashScreen (`Theme.SplashScreen` de
  `androidx.core:core-splashscreen`, thème `AppTheme.NoActionBarLaunch`) :
  fond sable `@color/splash_background`, icône vectorielle centrée
  `drawable/splash_icon.xml`, sans texte. Pas d'image `splash.png` plein
  écran : elle serait étirée selon les proportions de l'écran, et Android 12+
  l'ignore (il n'affiche que l'icône sur la couleur de fond).
- Vérifié le 2026-09-29 sur émulateur Pixel 6 (Android 16, 1080 × 2400) :
  icône nette sur l'écran d'accueil et dans le tiroir, icône à thème,
  écran de démarrage en portrait et en paysage.
