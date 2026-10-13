// Fichiers d'hébergement de la version web (Cloudflare), écrits dans
// dist-web/ par vite.config.js : _headers (sécurité et cache). Le renvoi de
// toutes les adresses vers index.html est réglé dans wrangler.jsonc.

/** Origine (schéma + hôte) d'une adresse, modèle de tuiles compris. */
const originOf = (url) => new URL(url.replace(/[{}]/g, '')).origin;

/**
 * Content-Security-Policy : uniquement l'application elle-même (scripts,
 * styles, polices embarquées), le serveur Supabase, les tuiles de la carte et
 * les miniatures Wikimedia. 'unsafe-inline' pour les styles seulement
 * (marqueurs de la carte et animations posent des attributs style).
 * @param {{ supabaseUrl: string, tileUrl: string, imageOrigin: string }} sources
 */
export function contentSecurityPolicy({ supabaseUrl, tileUrl, imageOrigin }) {
  const supabase = originOf(supabaseUrl);
  const tiles = originOf(tileUrl);
  const images = originOf(imageOrigin);
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    `img-src 'self' data: blob: ${tiles} ${images}`,
    // fetch : serveur Supabase (HTTPS et WebSocket) ; photos enregistrées pour le hors ligne ;
    // tuiles de la carte, demandées par le service worker pour son cache.
    `connect-src 'self' ${supabase} ${supabase.replace(/^http/, 'ws')} ${images} ${tiles}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'"
  ].join('; ');
}

/** En-têtes de sécurité, envoyés avec toutes les réponses. */
export function securityHeaders(sources) {
  return {
    'Content-Security-Policy': contentSecurityPolicy(sources),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin'
  };
}

/** Jamais gardés en cache : une nouvelle version est servie dès sa publication. */
export const NO_CACHE_PATHS = ['/', '/index.html', '/sw.js', '/manifest.webmanifest'];

/**
 * Fichier _headers : sécurité partout, cache d'un an pour les fichiers
 * versionnés (nom avec empreinte, dossier assets/), pas de cache pour
 * index.html et le service worker.
 */
export function headersFile(sources) {
  const block = (path, headers) => [path, ...Object.entries(headers).map(([name, value]) => `  ${name}: ${value}`)].join('\n');
  return `${[
    block('/*', securityHeaders(sources)),
    block('/assets/*', { 'Cache-Control': 'public, max-age=31536000, immutable' }),
    ...NO_CACHE_PATHS.map((path) => block(path, { 'Cache-Control': 'no-cache' }))
  ].join('\n\n')}\n`;
}

/**
 * Fichier /.well-known/assetlinks.json (Android App Links) : autorise
 * l'application Android à ouvrir les adresses de la version web. Empreintes
 * SHA-256 du certificat de signature (Play Console > Intégrité de
 * l'application), séparées par des virgules.
 * @param {string} fingerprints
 * @param {string} packageName identifiant de l'application Android
 */
export function assetLinksFile(fingerprints, packageName) {
  const list = fingerprints
    .split(',')
    .map((f) => f.trim().toUpperCase())
    .filter((f) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(f));
  if (!list.length) throw new Error('ANDROID_CERT_SHA256 : empreinte SHA-256 attendue (32 octets en hexadécimal, séparés par des deux-points).');
  return `${JSON.stringify([{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: packageName, sha256_cert_fingerprints: list } }], null, 2)}\n`;
}
