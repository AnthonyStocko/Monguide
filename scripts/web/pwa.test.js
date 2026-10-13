import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TILE_URL } from '../../src/config/map.js';
import { WEB_HEAD_TAGS, WEB_ICONS, WEB_MANIFEST, workboxOptions } from './pwa.js';

describe('manifeste de la version web', () => {
  it('nom, affichage, couleurs et langue', () => {
    expect(WEB_MANIFEST).toMatchObject({ name: 'Mon guide', short_name: 'Mon guide', display: 'standalone', theme_color: '#059669', background_color: '#F7F3EC', lang: 'fr' });
  });

  it('icônes 192 et 512, dont une « maskable », toutes générées dans assets/web/', () => {
    expect(WEB_MANIFEST.icons.map((i) => `${i.sizes} ${i.purpose}`)).toEqual(['192x192 any', '512x512 any', '512x512 maskable']);
    for (const icon of WEB_MANIFEST.icons) expect(WEB_ICONS).toContain(icon.src.replace('/icons/', ''));
    for (const name of WEB_ICONS) expect(existsSync(new URL(`../../assets/web/${name}`, import.meta.url))).toBe(true);
  });

  it('balises pour l’iPhone : icône 180 × 180, mode application, nom, barre d’état', () => {
    const find = (key, value) => WEB_HEAD_TAGS.find((t) => t.attrs[key] === value)?.attrs;
    expect(find('rel', 'apple-touch-icon')).toMatchObject({ sizes: '180x180', href: '/icons/apple-touch-icon.png' });
    expect(find('name', 'apple-mobile-web-app-capable').content).toBe('yes');
    expect(find('name', 'apple-mobile-web-app-title').content).toBe('Mon guide');
    expect(find('name', 'apple-mobile-web-app-status-bar-style').content).toBe('default');
  });
});

describe('service worker', () => {
  const options = workboxOptions({ tileUrl: TILE_URL });

  it('met l’application en cache et renvoie toute adresse vers index.html', () => {
    expect(options.globPatterns).toEqual(['**/*.{js,css,html,svg,png,woff2,ttf}']);
    expect(options.navigateFallback).toBe('/index.html');
  });

  it('ne met en cache que les tuiles de la carte : 200 au plus, 7 jours', () => {
    expect(options.runtimeCaching).toHaveLength(1);
    const [tiles] = options.runtimeCaching;
    expect(tiles.handler).toBe('CacheFirst');
    expect(tiles.options.expiration).toMatchObject({ maxEntries: 200, maxAgeSeconds: 604800 });
    expect(tiles.urlPattern.test('https://tile.openstreetmap.org/12/2100/1460.png')).toBe(true);
    expect(tiles.urlPattern.test('https://tile.openstreetmap.org.evil.example/1/1/1.png')).toBe(false);
  });

  it('aucune réponse de Supabase ni de Wikimedia dans le cache du service worker', () => {
    const cached = (url) => options.runtimeCaching.some((rule) => rule.urlPattern.test(url));
    expect(cached('https://abc.supabase.co/functions/v1/places')).toBe(false);
    expect(cached('https://abc.supabase.co/auth/v1/token')).toBe(false);
    expect(cached('https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/X.jpg/500px-X.jpg')).toBe(false);
  });

  it('nouvelle version : attend l’accord de l’utilisateur', () => {
    expect(options.skipWaiting).toBe(false);
    expect(options.clientsClaim).toBe(false);
  });
});
