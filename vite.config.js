import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, searchForWorkspaceRoot } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
// Release : version = tag Git (MONGUIDE_VERSION, fournie par release.yml), sinon package.json.
const version = process.env.MONGUIDE_VERSION || pkg.version;
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Version invalide : ${version} (attendu x.y.z)`);

// Domaine partagé avec les Edge Functions (Deno) : importé via "@domain".
const domainDir = fileURLToPath(
  new URL('./supabase/functions/_shared/domain', import.meta.url)
);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    // Version de l'application, envoyée au serveur (en-tête x-monguide-app).
    __APP_VERSION__: JSON.stringify(version)
  },
  resolve: {
    alias: {
      '@domain': domainDir
    }
  },
  server: {
    fs: {
      allow: [searchForWorkspaceRoot(process.cwd()), domainDir]
    }
  },
  test: {
    // Domaine partagé et modules purs du serveur (_shared), plus l'application.
    include: [
      'src/**/*.test.{js,jsx}',
      'supabase/functions/_shared/**/*.test.js'
    ],
    passWithNoTests: true
  }
});
