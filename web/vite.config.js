import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Le client parle a l'API sous /api : en dev Vite proxifie vers le serveur Express
// (port 3000), en prod l'API sert le build de cette appli sur la meme origine.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      workbox: {
        // Les navigations vers /api (ex. un retour OAuth)
        // doivent atteindre le serveur, pas l'index.html mis en cache.
        navigateFallbackDenylist: [/^\/api\//]
      },
      manifest: {
        name: 'Mon guide',
        short_name: 'Mon guide',
        description: 'Mon guide',
        theme_color: '#4f46e5',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }
        ]
      }
    })
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  }
});
