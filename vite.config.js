import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, searchForWorkspaceRoot } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { headersFile, REDIRECTS_FILE, securityHeaders } from './scripts/web/hosting.js';
import { WEB_HEAD_TAGS, WEB_ICONS, WEB_MANIFEST, workboxOptions } from './scripts/web/pwa.js';
import { IMAGE_ORIGIN } from './src/config/images.js';
import { TILE_URL } from './src/config/map.js';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
// Release : version = tag Git (MONGUIDE_VERSION, fournie par release.yml), sinon package.json.
const version = process.env.MONGUIDE_VERSION || pkg.version;
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Version invalide : ${version} (attendu x.y.z)`);

// Domaine partagé avec les Edge Functions (Deno) : importé via "@domain".
const domainDir = fileURLToPath(
  new URL('./supabase/functions/_shared/domain', import.meta.url)
);

/**
 * Version web (npm run build:web, mode "web") : fichiers d'hébergement
 * _headers et _redirects et icônes (assets/web/) ajoutés à dist-web/, balises
 * pour l'iPhone ajoutées à index.html. Le build Android n'en reçoit aucun.
 */
function webHosting(sources) {
  return {
    name: 'monguide-web-hosting',
    apply: 'build',
    transformIndexHtml: () => WEB_HEAD_TAGS,
    generateBundle() {
      for (const name of WEB_ICONS) {
        this.emitFile({ type: 'asset', fileName: `icons/${name}`, source: readFileSync(new URL(`./assets/web/${name}`, import.meta.url)) });
      }
      this.emitFile({ type: 'asset', fileName: '_headers', source: headersFile(sources) });
      this.emitFile({ type: 'asset', fileName: '_redirects', source: REDIRECTS_FILE });
    }
  };
}

export default defineConfig(({ mode }) => {
  // Même code pour les deux cibles : Android (Capacitor, dist/) et web (dist-web/).
  const web = mode === 'web' || process.env.VITE_TARGET === 'web';
  const supabaseUrl = loadEnv(mode, process.cwd(), 'VITE_').VITE_SUPABASE_URL;
  if (web && !supabaseUrl) throw new Error('VITE_SUPABASE_URL manquante : nécessaire à la Content-Security-Policy de la version web.');
  const sources = { supabaseUrl, tileUrl: TILE_URL, imageOrigin: IMAGE_ORIGIN };

  return {
    plugins: [
      react(),
      tailwindcss(),
      ...(web ? [webHosting(sources)] : []),
      // Service worker et manifeste : version web seulement. Désactivé ailleurs, le module
      // virtual:pwa-register (src/platform/appUpdate.web.js) reste résolu, sans effet.
      VitePWA({
        disable: !web,
        registerType: 'prompt',
        injectRegister: false,
        includeManifestIcons: false,
        manifest: WEB_MANIFEST,
        workbox: workboxOptions({ tileUrl: TILE_URL })
      })
    ],
    define: {
      // Version de l'application, envoyée au serveur (en-tête x-monguide-app).
      __APP_VERSION__: JSON.stringify(version),
      // Cible connue à la compilation : le build web n'embarque aucun plugin natif (src/platform/).
      'import.meta.env.VITE_TARGET': JSON.stringify(web ? 'web' : 'native')
    },
    resolve: {
      alias: {
        '@domain': domainDir
      }
    },
    build: {
      outDir: web ? 'dist-web' : 'dist'
    },
    // npm run preview:web : mêmes en-têtes de sécurité que l'hébergement.
    preview: web ? { headers: securityHeaders(sources) } : {},
    server: {
      fs: {
        allow: [searchForWorkspaceRoot(process.cwd()), domainDir]
      }
    },
    test: {
      // Domaine partagé et modules purs du serveur (_shared), l'application et
      // les scripts (génération des tuiles OSM).
      include: [
        'src/**/*.test.{js,jsx}',
        'supabase/functions/_shared/**/*.test.js',
        'scripts/**/*.test.js'
      ],
      passWithNoTests: true
    }
  };
});
