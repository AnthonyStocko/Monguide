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
  });
});
