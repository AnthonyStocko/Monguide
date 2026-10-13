import { afterEach, describe, expect, it, vi } from 'vitest';
import { corsHeaders, preflightResponse } from './cors.js';

const request = (origin) =>
  new Request('https://x.supabase.co/functions/v1/config', { headers: origin ? { Origin: origin } : {} });

describe('corsHeaders', () => {
  it.each(['https://localhost', 'capacitor://localhost', 'http://localhost:5173', 'https://anthonystocko.github.io'])('autorise %s', (origin) => {
    expect(corsHeaders(request(origin))['Access-Control-Allow-Origin']).toBe(origin);
  });

  it("n'autorise pas une autre origine", () => {
    expect(corsHeaders(request('https://evil.example'))).not.toHaveProperty('Access-Control-Allow-Origin');
    expect(corsHeaders(request())).not.toHaveProperty('Access-Control-Allow-Origin');
  });

  describe('version web (secret WEB_APP_ORIGINS)', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('autorise les origines configurées, espaces et barre finale ignorés', () => {
      vi.stubGlobal('Deno', { env: { get: (name) => (name === 'WEB_APP_ORIGINS' ? ' https://monguide.exemple.workers.dev/ , https://app.exemple.fr' : undefined) } });
      for (const origin of ['https://monguide.exemple.workers.dev', 'https://app.exemple.fr', 'https://localhost']) {
        expect(corsHeaders(request(origin))['Access-Control-Allow-Origin']).toBe(origin);
      }
      expect(corsHeaders(request('https://evil.example'))).not.toHaveProperty('Access-Control-Allow-Origin');
    });

    it("sans le secret, n'autorise aucune origine de plus", () => {
      expect(corsHeaders(request('https://monguide.exemple.workers.dev'))).not.toHaveProperty('Access-Control-Allow-Origin');
    });
  });

  it('autorise les en-têtes du SDK et ceux de Mon guide', () => {
    const allowed = corsHeaders(request('https://localhost'))['Access-Control-Allow-Headers'];
    for (const h of ['authorization', 'apikey', 'content-type', 'x-client-info', 'x-monguide-api', 'x-monguide-app']) {
      expect(allowed).toContain(h);
    }
  });
});

describe('preflightResponse', () => {
  it('répond 204 avec les en-têtes CORS', () => {
    const res = preflightResponse(request('https://localhost'));
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://localhost');
  });
});
