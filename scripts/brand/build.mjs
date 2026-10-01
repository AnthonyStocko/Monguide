// Fichiers de marque « Mon guide », générés depuis la source unique src/brand/logo.js.
// Tout régénérer : npm run brand, qui enchaîne
//   1. node scripts/brand/build.mjs
//   2. npx @capacitor/assets generate --android --assetPath assets/capacitor
//      (outil officiel de Capacitor, commande vérifiée avec @capacitor/assets 3.0.5)
//   3. node scripts/brand/build.mjs --android-finish : couche monochrome des icônes
//      adaptatives (Android 13+), que @capacitor/assets n'écrit pas.
// Voir docs/brand.md.
//
// Écrit :
//  - assets/brand/ : logo principal (repère + nom en tracés), icône seule,
//    versions monochromes, icône d'application 1024 × 1024 (SVG et PNG) ;
//  - assets/capacitor/ : sources de @capacitor/assets pour les icônes (mode personnalisé) ;
//  - assets/store/ : Play Store, icône 512 × 512 et image de présentation 1024 × 500 ;
//  - android/app/src/main/res/drawable/ : icône monochrome (Android 13+, non gérée par
//    @capacitor/assets) et icône de l'écran de démarrage, en vecteurs ;
//  - public/favicon.svg, site/assets/favicon.svg, site/assets/logo.svg et logo-dark.svg.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { BRAND_COLORS as C, iconSvg, logoMarkup, logoSvg, LOGO_SIZE, pinLayers } from '../../src/brand/logo.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = (path, content) => {
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
  console.log('écrit', path);
};
const png = async (path, svg, width, height = width) => out(path, await sharp(Buffer.from(svg), { density: 300 }).resize(width, height).png().toBuffer());
// PNG 24 bits sans couche alpha : exigé par Google Play pour l'image de présentation.
const opaquePng = async (path, svg, width, height = width) => out(path, await sharp(Buffer.from(svg), { density: 300 }).resize(width, height).removeAlpha().png().toBuffer());

/**
 * Taille du repère dans les icônes. @capacitor/assets pose le premier plan
 * avec un retrait de 16,7 % (inset) : l'image de 1024 couvre la partie visible
 * de 72 dp, dont le cercle sûr de 66 dp : le repère (0,92) y tient entier.
 * Icône pleine (Play Store, Android 7 et avant) : 0,8 du carré.
 */
const FOREGROUND_SCALE = 0.92;
const FULL_ICON_SCALE = 0.8;
const res = 'android/app/src/main/res';

if (process.argv.includes('--android-finish')) {
  addMonochromeLayer();
  process.exit(0);
}

/**
 * Ajoute la couche monochrome (icônes à thème, Android 13+) aux icônes
 * adaptatives écrites par @capacitor/assets, avec le même retrait que le premier plan.
 */
function addMonochromeLayer() {
  for (const name of ['ic_launcher', 'ic_launcher_round']) {
    const path = join(root, res, 'mipmap-anydpi-v26', `${name}.xml`);
    const xml = readFileSync(path, 'utf8');
    if (xml.includes('<monochrome>')) continue;
    const layer = ['    <monochrome>', '        <inset android:drawable="@drawable/ic_launcher_monochrome" android:inset="16.7%" />', '    </monochrome>', ''].join('\n');
    writeFileSync(path, xml.replace('</adaptive-icon>', `${layer}</adaptive-icon>\n`));
    console.log('monochrome ajouté', `${res}/mipmap-anydpi-v26/${name}.xml`);
  }
}

// --- assets/brand ---
out('assets/brand/logo.svg', `${logoSvg()}\n`);
out('assets/brand/logo-mono.svg', `${logoSvg({ variant: 'mono' })}\n`);
out('assets/brand/logo-on-dark.svg', `${logoSvg({ textColor: C.sand })}\n`);
out('assets/brand/icon.svg', `${iconSvg()}\n`);
out('assets/brand/icon-mono.svg', `${iconSvg({ variant: 'mono' })}\n`);
const appIcon = iconSvg({ variant: 'onGreen', background: C.green, scale: FULL_ICON_SCALE });
out('assets/brand/app-icon-1024.svg', `${appIcon}\n`);
await png('assets/brand/app-icon-1024.png', appIcon, 1024);

// --- assets/capacitor : sources de @capacitor/assets (mode personnalisé) ---
await png('assets/capacitor/icon-only.png', appIcon, 1024);
await png('assets/capacitor/icon-foreground.png', iconSvg({ variant: 'onGreen', scale: FOREGROUND_SCALE }), 1024);
await png('assets/capacitor/icon-background.png', `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="${C.green}"/></svg>`, 1024);
// Pas de splash.png : l'écran de démarrage utilise l'API SplashScreen d'Android (fond sable,
// icône vectorielle centrée, drawable/splash_icon.xml ci-dessous), jamais étirée, et seule
// affichée par Android 12+ (qui ignore une image de fond plein écran).

// --- assets/store : Play Store ---
await png('assets/store/play-icon-512.png', appIcon, 512);
const feature = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500"><rect width="1024" height="500" fill="${C.sand}"/><path d="M0 400C180 330 330 350 470 395C610 340 820 330 1024 380L1024 500L0 500Z" fill="${C.green}"/><path d="M0 450C200 400 380 420 560 455C720 425 880 420 1024 440L1024 500L0 500Z" fill="${C.greenDark}"/><g transform="translate(${(1024 - 820) / 2} 110) scale(${820 / LOGO_SIZE.width})">${logoMarkup()}</g></svg>`;
out('assets/store/play-feature-1024x500.svg', `${feature}\n`);
await opaquePng('assets/store/play-feature-1024x500.png', feature, 1024, 500);

// --- Web : application et pages du site ---
const favicon = iconSvg({ size: 64, scale: 1.2 });
out('public/favicon.svg', `${favicon}\n`);
out('site/assets/favicon.svg', `${favicon}\n`);
out('site/assets/logo.svg', `${logoSvg()}\n`);
// Site en mode sombre : nom en sable.
out('site/assets/logo-dark.svg', `${logoSvg({ textColor: C.sand })}\n`);

// --- Android : vecteurs (monochrome Android 13+, icône de l'écran de démarrage) ---
/** VectorDrawable du repère dans un carré de 1024, repère réduit de `scale` au centre. */
function vectorDrawable({ variant, sizeDp, scale, monoColor }) {
  const { clip, layers } = pinLayers(variant, monoColor);
  const tx = 512 - 512 * scale;
  const ty = 512 - 515 * scale;
  const path = (l) => `        <path android:fillColor="${l.fill}" android:pathData="${l.d}"${l.evenOdd ? ' android:fillType="evenOdd"' : ''}/>`;
  const plain = layers.filter((l) => !l.clipped).map(path);
  const clipped = layers.filter((l) => l.clipped).map(path);
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- Généré par scripts/brand/build.mjs depuis src/brand/logo.js : ne pas modifier à la main. -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="${sizeDp}dp"
    android:height="${sizeDp}dp"
    android:viewportWidth="1024"
    android:viewportHeight="1024">
    <group android:translateX="${tx}" android:translateY="${ty}" android:scaleX="${scale}" android:scaleY="${scale}">
${plain.join('\n')}
        <group>
            <clip-path android:pathData="${clip}"/>
${clipped.map((l) => `    ${l}`).join('\n')}
        </group>
    </group>
</vector>
`;
}
// Monochrome : même cadrage que le premier plan (icon-foreground.png) ; Android le teinte.
out(`${res}/drawable/ic_launcher_monochrome.xml`, vectorDrawable({ variant: 'mono', sizeDp: 108, scale: FOREGROUND_SCALE, monoColor: '#FF000000' }));
// Écran de démarrage Android 12+ : icône sans fond de 288 dp, dessin dans le cercle central de 192 dp.
out(`${res}/drawable/splash_icon.xml`, vectorDrawable({ variant: 'color', sizeDp: 288, scale: 0.62 }));
