// Version web installable (PWA) : manifeste, balises pour l'iPhone et réglages
// du service worker (Workbox, via vite-plugin-pwa), utilisés par vite.config.js.

const SEVEN_DAYS_IN_SECONDS = 7 * 24 * 60 * 60;

/** Icônes générées par scripts/brand/build.mjs dans assets/web/, publiées dans dist-web/icons/. */
export const WEB_ICONS = ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'];

/** Manifeste de l'application web. */
export const WEB_MANIFEST = {
  id: '/',
  name: 'Mon guide',
  short_name: 'Mon guide',
  description: 'Guide touristique sur-mesure : vos séjours, jour par jour.',
  lang: 'fr',
  dir: 'ltr',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  theme_color: '#059669',
  background_color: '#F7F3EC',
  icons: [
    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
  ]
};

/**
 * Balises ajoutées à index.html dans le build web seulement : icône de l'écran
 * d'accueil de l'iPhone, ouverture sans barre de navigateur, nom sous
 * l'icône, barre d'état claire (comme la barre du haut de l'application).
 */
export const WEB_HEAD_TAGS = [
  { tag: 'link', attrs: { rel: 'apple-touch-icon', sizes: '180x180', href: '/icons/apple-touch-icon.png' }, injectTo: 'head' },
  { tag: 'meta', attrs: { name: 'mobile-web-app-capable', content: 'yes' }, injectTo: 'head' },
  { tag: 'meta', attrs: { name: 'apple-mobile-web-app-capable', content: 'yes' }, injectTo: 'head' },
  { tag: 'meta', attrs: { name: 'apple-mobile-web-app-title', content: 'Mon guide' }, injectTo: 'head' },
  { tag: 'meta', attrs: { name: 'apple-mobile-web-app-status-bar-style', content: 'default' }, injectTo: 'head' }
];

/** Limites du cache des tuiles de la carte. */
export const TILE_CACHE = { cacheName: 'map-tiles', maxEntries: 200, maxAgeSeconds: SEVEN_DAYS_IN_SECONDS };

/**
 * Réglages du service worker.
 * - Application (HTML, JS, CSS, polices, icônes) mise en cache à l'installation :
 *   démarrage hors ligne, toute adresse renvoyée vers index.html.
 * - Aucune règle pour Supabase : ses réponses ne passent jamais par le cache du
 *   service worker (l'application a son propre cache IndexedDB).
 * - Tuiles de la carte : seules celles déjà affichées sont gardées, 200 au plus,
 *   7 jours (aucun téléchargement d'avance, conforme à la politique d'usage des
 *   tuiles OpenStreetMap).
 * - Nouvelle version : le service worker attend l'accord de l'utilisateur
 *   (bandeau « Mettre à jour »), jamais de rechargement forcé.
 * @param {{ tileUrl: string }} options
 */
export function workboxOptions({ tileUrl }) {
  const tileOrigin = new URL(tileUrl.replace(/[{}]/g, '')).origin;
  return {
    globPatterns: ['**/*.{js,css,html,svg,png,woff2,ttf}'],
    // Jamais chargés : modules facultatifs de jsPDF.
    globIgnores: ['**/html2canvas-*.js', '**/purify.es-*.js'],
    maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
    navigateFallback: '/index.html',
    cleanupOutdatedCaches: true,
    skipWaiting: false,
    clientsClaim: false,
    runtimeCaching: [
      {
        urlPattern: new RegExp(`^${tileOrigin.replace(/[.]/g, '\\.')}/`),
        handler: 'CacheFirst',
        options: {
          cacheName: TILE_CACHE.cacheName,
          expiration: { maxEntries: TILE_CACHE.maxEntries, maxAgeSeconds: TILE_CACHE.maxAgeSeconds, purgeOnQuotaError: true },
          cacheableResponse: { statuses: [200] }
        }
      }
    ]
  };
}
