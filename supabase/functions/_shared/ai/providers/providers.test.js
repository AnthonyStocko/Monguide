import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AI_PROVIDERS, gemini, groq, mistral, openrouter } from './index.js';

const SCHEMA = { type: 'object', required: ['a'], properties: { a: { type: 'string' } } };
const CALL = { apiKey: 'k-123', model: 'm', system: 'S', user: 'U', jsonSchema: SCHEMA, timeoutMs: 8000 };
const ok = (body) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

describe('adaptateurs d\'IA', () => {
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

  it.each([
    [mistral, 'https://api.mistral.ai/v1/chat/completions'],
    [groq, 'https://api.groq.com/openai/v1/chat/completions'],
    [openrouter, 'https://openrouter.ai/api/v1/chat/completions']
  ])('%#. format « chat completions » : schéma JSON strict, clé en Bearer', async (provider, url) => {
    fetchMock.mockResolvedValue(ok({ choices: [{ message: { content: '{"a":"x"}' } }], usage: { prompt_tokens: 10, completion_tokens: 3 } }));
    const r = await provider.request(CALL);
    const [calledUrl, init] = fetchMock.mock.calls[0];
    expect(calledUrl).toBe(url);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer k-123');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      model: 'm',
      messages: [
        { role: 'system', content: 'S' },
        { role: 'user', content: 'U' }
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'response', strict: true, schema: SCHEMA } }
    });
    expect(r).toEqual({ text: '{"a":"x"}', usage: { input: 10, output: 3 } });
    expect(provider.secretName).toBe(`AI_API_KEY_${provider.name.toUpperCase()}`);
  });

  it('OpenRouter : seuls les hébergeurs qui respectent le schéma', async () => {
    fetchMock.mockResolvedValue(ok({ choices: [{ message: { content: '{}' } }] }));
    await openrouter.request(CALL);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).provider).toEqual({ require_parameters: true });
  });

  it('Gemini : generateContent, clé dans l\'en-tête (jamais dans l\'URL), responseJsonSchema', async () => {
    fetchMock.mockResolvedValue(ok({ candidates: [{ content: { parts: [{ text: '{"a":' }, { text: '"x"}' }] } }], usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 4 } }));
    const r = await gemini.request({ ...CALL, model: 'gemini-3.8-flash' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent');
    expect(url).not.toContain('k-123');
    expect(init.headers['x-goog-api-key']).toBe('k-123');
    expect(JSON.parse(init.body)).toEqual({
      systemInstruction: { parts: [{ text: 'S' }] },
      contents: [{ role: 'user', parts: [{ text: 'U' }] }],
      generationConfig: { responseMimeType: 'application/json', responseJsonSchema: SCHEMA, temperature: 0.2 }
    });
    expect(r).toEqual({ text: '{"a":"x"}', usage: { input: 12, output: 4 } });
  });

  it('réponse sans texte (bloquée, vide) : text null, jetons à 0', async () => {
    fetchMock.mockResolvedValueOnce(ok({ candidates: [{ finishReason: 'SAFETY' }] }));
    expect(await gemini.request(CALL)).toEqual({ text: null, usage: { input: 0, output: 0 } });
    fetchMock.mockResolvedValueOnce(ok({ choices: [] }));
    expect(await mistral.request(CALL)).toEqual({ text: null, usage: { input: 0, output: 0 } });
  });

  it('une seule tentative, même après une erreur réseau ou un 5xx', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 503 }));
    await expect(mistral.request(CALL)).rejects.toMatchObject({ upstreamStatus: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('registre : mistral, groq, openrouter, gemini et off (sans clé)', () => {
    expect(Object.keys(AI_PROVIDERS)).toEqual(['mistral', 'groq', 'openrouter', 'gemini', 'off']);
    expect(AI_PROVIDERS.off.secretName).toBeNull();
  });
});
