import { describe, expect, it } from 'vitest';
import { IMAGE_ORIGIN } from '../../src/config/images.js';
import { TILE_URL } from '../../src/config/map.js';
import { contentSecurityPolicy, headersFile, REDIRECTS_FILE, securityHeaders } from './hosting.js';

const sources = { supabaseUrl: 'https://abc.supabase.co', tileUrl: TILE_URL, imageOrigin: IMAGE_ORIGIN };

describe('Content-Security-Policy de la version web', () => {
  const csp = contentSecurityPolicy(sources);
  const directive = (name) => csp.split('; ').find((d) => d.startsWith(`${name} `));

  it('limite le réseau à Supabase et aux miniatures Wikimedia', () => {
    expect(directive('connect-src')).toBe("connect-src 'self' https://abc.supabase.co wss://abc.supabase.co https://upload.wikimedia.org");
  });

  it('limite les images aux tuiles de la carte et à Wikimedia', () => {
    expect(directive('img-src')).toBe("img-src 'self' data: blob: https://tile.openstreetmap.org https://upload.wikimedia.org");
  });

  it('scripts et polices : uniquement ceux de l’application', () => {
    expect(directive('script-src')).toBe("script-src 'self'");
    expect(directive('font-src')).toBe("font-src 'self'");
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).toContain("frame-ancestors 'none'");
  });
});

describe('fichiers d’hébergement', () => {
  it('en-têtes de sécurité demandés', () => {
    expect(Object.keys(securityHeaders(sources))).toEqual(['Content-Security-Policy', 'X-Content-Type-Options', 'Referrer-Policy']);
  });

  it('_headers : sécurité partout, cache long pour assets/, aucun cache pour index.html et le service worker', () => {
    const blocks = headersFile(sources).trim().split('\n\n');
    expect(blocks[0]).toMatch(/^\/\*\n {2}Content-Security-Policy: default-src 'self'/);
    expect(blocks[0]).toContain('  X-Content-Type-Options: nosniff');
    expect(blocks[0]).not.toContain('Cache-Control');
    expect(blocks).toContain('/assets/*\n  Cache-Control: public, max-age=31536000, immutable');
    for (const path of ['/', '/index.html', '/sw.js']) expect(blocks).toContain(`${path}\n  Cache-Control: no-cache`);
  });

  it('_redirects : toutes les adresses renvoient vers index.html', () => {
    expect(REDIRECTS_FILE).toBe('/* /index.html 200\n');
  });
});
