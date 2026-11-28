import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchInstagramPlaces } from './instagramAgent.js';

const ENTRY = { url: 'https://www.instagram.com/p/AAA111/', name: 'Mont-Saint-Michel', city: 'Le Mont-Saint-Michel' };

describe('fetchInstagramPlaces', () => {
  let fetchMock;
  let env;
  beforeEach(() => {
    env = { INSTAGRAM_AGENT_URL: 'https://agent.example/functions/v1/', INSTAGRAM_AGENT_API_KEY: 'cle-de-test' };
    vi.stubGlobal('Deno', { env: { get: (name) => env[name] } });
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("lit /lieux-commentes avec la clé d'API et renvoie les lieux", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ places: [ENTRY] })));
    const result = await fetchInstagramPlaces();
    expect(fetchMock.mock.calls[0][0]).toBe('https://agent.example/functions/v1/lieux-commentes');
    expect(fetchMock.mock.calls[0][1].headers['x-api-key']).toBe('cle-de-test');
    expect(result).toEqual({ places: [ENTRY], ok: true });
  });

  it("renvoie une liste vide, sans erreur, quand l'agent répond 500", async () => {
    fetchMock.mockResolvedValue(new Response('boom', { status: 500 }));
    expect(await fetchInstagramPlaces()).toEqual({ places: [], ok: false });
  });

  it("renvoie une liste vide quand l'agent est injoignable ou répond du texte illisible", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('network'));
    expect(await fetchInstagramPlaces()).toEqual({ places: [], ok: false });
    fetchMock.mockResolvedValueOnce(new Response('<html>'));
    expect(await fetchInstagramPlaces()).toEqual({ places: [], ok: false });
  });

  it('renvoie une liste vide, sans appel réseau, si les variables ne sont pas configurées', async () => {
    env = {};
    expect(await fetchInstagramPlaces()).toEqual({ places: [], ok: false });
    expect(fetchMock).not.toHaveBeenCalled();
    // Le journal nomme les secrets manquants (jamais leur valeur).
    const logged = console.warn.mock.calls.map((call) => String(call[0])).join('\n');
    expect(logged).toContain('instagram_agent_not_configured');
    expect(logged).toContain('INSTAGRAM_AGENT_URL');
  });

  it('lit une réponse { lieux } ou un tableau nu, coordonnées en texte comprises', async () => {
    const entry = { postUrl: 'https://www.instagram.com/p/AQUA1/', placeName: 'Aquarium La Rochelle', ville: 'La Rochelle', latitude: '46.1475', longitude: '-1.1707' };
    const expected = { url: 'https://www.instagram.com/p/AQUA1/', name: 'Aquarium La Rochelle', city: 'La Rochelle', lat: 46.1475, lon: -1.1707 };
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ lieux: [entry] })));
    expect(await fetchInstagramPlaces()).toEqual({ places: [expected], ok: true });
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify([entry])));
    expect(await fetchInstagramPlaces()).toEqual({ places: [expected], ok: true });
  });

  it("ne garde pas longtemps en cache une réponse dont aucun élément n'est lisible", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ places: [{ url: 'https://exemple.fr/x', name: 'Aquarium' }] })));
    expect(await fetchInstagramPlaces()).toEqual({ places: [], ok: false });
  });
});
