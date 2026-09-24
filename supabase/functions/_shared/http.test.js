import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExternalError } from './errors.js';
import { fetchExternal, fetchExternalJson } from './http.js';

const URL_ = 'https://api.example.org/v1/forecast?latitude=48.856613';
const opts = { source: 'test', retryDelayMs: 0 };

describe('fetchExternal', () => {
  let fetchMock;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('envoie le User-Agent Mon guide et renvoie une réponse 2xx', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
    const res = await fetchExternal(URL_, opts);
    expect(res.status).toBe(200);
    expect(fetchMock.mock.calls[0][1].headers['User-Agent']).toMatch(/^MonGuide\/\d+\.\d+\.\d+/);
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it('refait une tentative après un 5xx (2 au total par défaut)', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 503 }));
    await expect(fetchExternal(URL_, opts)).rejects.toMatchObject({ status: 502, upstreamStatus: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('réussit si la seconde tentative aboutit', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('network')).mockResolvedValueOnce(new Response('ok'));
    const res = await fetchExternal(URL_, opts);
    expect(await res.text()).toBe('ok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('ne refait jamais de tentative sur un 429', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 429 }));
    await expect(fetchExternal(URL_, opts)).rejects.toBeInstanceOf(ExternalError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('ne refait pas de tentative sur un autre 4xx', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 404 }));
    await expect(fetchExternal(URL_, opts)).rejects.toMatchObject({ upstreamStatus: 404 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('respecte un nombre de tentatives propre à une API', async () => {
    fetchMock.mockRejectedValue(new TypeError('network'));
    await expect(fetchExternal(URL_, { ...opts, maxAttempts: 3 })).rejects.toMatchObject({ upstreamStatus: null });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("ne journalise jamais l'URL complète", async () => {
    fetchMock.mockResolvedValue(new Response('{}'));
    await fetchExternal(URL_, opts);
    const line = console.log.mock.calls.map((c) => c[0]).join('\n');
    expect(line).toContain('api.example.org');
    expect(line).not.toContain('48.856613');
    expect(line).not.toContain('forecast');
  });
});

describe('fetchExternalJson', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('lit le JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"a":1}')));
    expect(await fetchExternalJson(URL_, opts)).toEqual({ a: 1 });
  });

  it('transforme un JSON illisible en erreur 502', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>')));
    await expect(fetchExternalJson(URL_, opts)).rejects.toMatchObject({ status: 502 });
  });
});
