import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RULES } from '../domain/config/rules.js';
import { mergeRules } from '../domain/config/mergeRules.js';
import { complete } from './complete.js';
import { AI_PROVIDERS } from './providers/index.js';

const KEY = 'fake-api-key-for-tests-0001';
const SCHEMA = { type: 'object', additionalProperties: false, required: ['greeting'], properties: { greeting: { type: 'string' } } };
const REQUEST = { system: 'Réponds en JSON.', user: 'Dis bonjour à Anne Martin, 12 rue des Lilas.', jsonSchema: SCHEMA, language: 'fr' };

const rulesWith = (ai) => mergeRules(RULES, { ai }).rules;
const memoryStore = ({ allowed = true, fails = false } = {}) => ({
  reserve: vi.fn(async () => {
    if (fails) throw new Error('db down');
    return allowed;
  }),
  addTokens: vi.fn(async () => {})
});
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const chat = (content, usage = { prompt_tokens: 40, completion_tokens: 8 }) => json({ choices: [{ message: { content } }], usage });

describe('complete', () => {
  let fetchMock;
  let logs;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    logs = [];
    for (const level of ['log', 'warn', 'error']) vi.spyOn(console, level).mockImplementation((line) => logs.push(line));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  const run = (ai = {}, ctx = {}) => complete(REQUEST, { rules: rulesWith(ai), client: 'u:1', usageStore: memoryStore(), getSecret: () => KEY, ...ctx });

  it('succès : JSON conforme, jetons comptés, journal sans contenu ni clé', async () => {
    fetchMock.mockResolvedValue(chat('{"greeting":"Bonjour"}'));
    const store = memoryStore();
    const r = await run({ provider: 'mistral' }, { usageStore: store });
    expect(r).toMatchObject({ ok: true, json: { greeting: 'Bonjour' }, usage: { input: 40, output: 8 }, provider: 'mistral', model: 'mistral-small-latest' });
    expect(store.addTokens).toHaveBeenCalledWith(expect.objectContaining({ client: 'u:1', tokens: 48 }));
    const all = logs.join('\n');
    expect(all).toContain('"event":"ai_call"');
    expect(all).toContain('"result":"ok"');
    expect(all).not.toContain(KEY);
    expect(all).not.toMatch(/Bonjour|Anne|Lilas|Réponds/);
  });

  it('modèle choisi dans la configuration, sinon celui du fournisseur', async () => {
    fetchMock.mockResolvedValue(chat('{"greeting":"x"}'));
    await run({ provider: 'groq', model: 'openai/gpt-oss-20b' });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe('openai/gpt-oss-20b');
  });

  it('ai.enabled false ou fournisseur "off" : "disabled", aucun appel', async () => {
    expect(await run({ enabled: false })).toEqual({ ok: false, reason: 'disabled' });
    expect(await run({ provider: 'off' })).toEqual({ ok: false, reason: 'disabled' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fournisseur inconnu ou clé absente : "error", aucun appel', async () => {
    expect(await complete(REQUEST, { rules: rulesWith({ provider: 'inconnu' }), client: 'u:1', usageStore: memoryStore(), getSecret: () => KEY })).toEqual({ ok: false, reason: 'error' });
    expect(await run({}, { getSecret: () => undefined })).toEqual({ ok: false, reason: 'error' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('quota du jour atteint : refusé AVANT de contacter le fournisseur', async () => {
    const store = memoryStore({ allowed: false });
    expect(await run({}, { usageStore: store })).toEqual({ ok: false, reason: 'quota' });
    expect(store.reserve).toHaveBeenCalledWith({ day: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), client: 'u:1', userLimit: 5, globalLimit: 500 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('compteurs illisibles : "error", aucun appel au fournisseur', async () => {
    expect(await run({}, { usageStore: memoryStore({ fails: true }) })).toEqual({ ok: false, reason: 'error' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('délai dépassé : "timeout", une seule requête', async () => {
    fetchMock.mockRejectedValue(Object.assign(new Error('timeout'), { name: 'TimeoutError' }));
    expect(await run()).toEqual({ ok: false, reason: 'timeout' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('délai : celui de la requête, jamais au-delà de rules.ai.timeoutMs', async () => {
    const spy = vi.spyOn(AbortSignal, 'timeout');
    fetchMock.mockResolvedValue(chat('{"greeting":"x"}'));
    await complete({ ...REQUEST, timeoutMs: 60000 }, { rules: rulesWith({}), client: 'u:1', usageStore: memoryStore(), getSecret: () => KEY });
    expect(spy).toHaveBeenLastCalledWith(8000);
    await complete({ ...REQUEST, timeoutMs: 3000 }, { rules: rulesWith({}), client: 'u:1', usageStore: memoryStore(), getSecret: () => KEY });
    expect(spy).toHaveBeenLastCalledWith(3000);
  });

  it('clé invalide (401) : "error" ; limite du fournisseur (429) : "quota" ; 5xx : "error", sans nouvelle tentative', async () => {
    fetchMock.mockResolvedValueOnce(json({ message: 'Unauthorized' }, 401));
    expect(await run()).toEqual({ ok: false, reason: 'error' });
    fetchMock.mockResolvedValueOnce(json({ message: 'Too many' }, 429));
    expect(await run()).toEqual({ ok: false, reason: 'quota' });
    fetchMock.mockResolvedValueOnce(json({}, 503));
    expect(await run()).toEqual({ ok: false, reason: 'error' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(logs.join('\n')).not.toContain(KEY);
  });

  it('réponse non JSON ou non conforme au schéma : "invalid_json"', async () => {
    fetchMock.mockResolvedValueOnce(chat('Bien sûr ! Voici : bonjour'));
    expect(await run()).toEqual({ ok: false, reason: 'invalid_json' });
    fetchMock.mockResolvedValueOnce(chat('{"salut":"x"}'));
    expect(await run()).toEqual({ ok: false, reason: 'invalid_json' });
    fetchMock.mockResolvedValueOnce(json({ choices: [] }));
    expect(await run()).toEqual({ ok: false, reason: 'invalid_json' });
    expect(logs.join('\n')).not.toMatch(/bonjour|salut/i);
  });

  it('jamais d\'exception, même si un adaptateur plante', async () => {
    const broken = { ...AI_PROVIDERS, mistral: { ...AI_PROVIDERS.mistral, request: async () => { throw new TypeError('boom'); } } };
    expect(await run({}, { providers: broken })).toEqual({ ok: false, reason: 'error' });
  });

  it('la langue est demandée dans les consignes', async () => {
    fetchMock.mockResolvedValue(chat('{"greeting":"x"}'));
    await run();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).messages[0].content).toMatch(/Language of every human-readable text in the JSON: fr/);
  });
});
