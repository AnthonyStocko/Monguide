import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, searchForWorkspaceRoot } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

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
