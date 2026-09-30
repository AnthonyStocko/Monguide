import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RULES } from '../domain/config/rules.js';
import { mergeRules } from '../domain/config/mergeRules.js';
import { garden, park, personal, rules as fixtureRules, standardDay, trip } from '../domain/testing/dayFixture.js';
import { reviewTrip } from './reviewTrip.js';

const NOW = '2026-09-30T10:00:00.000Z';
const rulesWith = (ai = {}) => mergeRules(RULES, { ai }).rules;
const store = { reserve: vi.fn(async () => true), addTokens: vi.fn(async () => {}) };

function setup({ ai = {}, consent = true, answer } = {}) {
  const events = [];
  const client = vi.fn(async () => 'u:1');
  const completeFn = vi.fn(async (request) => answer?.(request) ?? { ok: false, reason: 'timeout' });
  const ctx = {
    rules: rulesWith(ai),
    language: 'fr',
    consent,
    client,
    usageStore: store,
    completeFn,
    onStart: () => events.push('review'),
    onDone: (status) => events.push(`review_done:${status}`),
    now: () => NOW
  };
  return { ctx, events, client, completeFn };
}

/** Alias de l'étape d'identifiant réel `id` dans le résumé envoyé. */
const aliasOf = (request, id) => Object.entries(JSON.parse(request.user).days.flatMap((d) => d.steps)).find(([, s]) => s.name === id)?.[1].id;

describe('reviewTrip', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('sans consentement : pas de relecture, ni appel, ni événement', async () => {
    const { ctx, events, completeFn, client } = setup({ consent: false });
    const r = await reviewTrip(trip(), ctx);
    expect(r.review).toMatchObject({ status: 'skipped', reason: 'no_consent', originalDays: null });
    expect(completeFn).not.toHaveBeenCalled();
    expect(client).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });

  it('ai.enabled false ou fournisseur "off" : "disabled", sans appel ni événement', async () => {
    for (const ai of [{ enabled: false }, { provider: 'off' }]) {
      const { ctx, events, completeFn } = setup({ ai });
      expect((await reviewTrip(trip(), ctx)).review).toMatchObject({ status: 'skipped', reason: 'disabled' });
      expect(completeFn).not.toHaveBeenCalled();
      expect(events).toEqual([]);
    }
  });

  it('aucune étape modifiable : "nothing_to_review", sans appel', async () => {
    const day = standardDay();
    day.steps = [personal('p', '10:00', '12:00')];
    const { ctx, completeFn } = setup();
    expect((await reviewTrip(trip([day]), ctx)).review).toMatchObject({ status: 'skipped', reason: 'nothing_to_review' });
    expect(completeFn).not.toHaveBeenCalled();
  });

  it('relecture réussie : consignes v1, résumé, schéma, 8 s au plus ; opérations appliquées ; événements review puis review_done', async () => {
    const { ctx, events, completeFn, client } = setup({
      answer: (request) => ({
        ok: true,
        provider: 'mistral',
        model: 'mistral-small-latest',
        json: {
          operations: [{ op: 'swap', stepA: aliasOf(request, park.name), stepB: aliasOf(request, garden.name), reason: 'Le jardin d\'abord.' }],
          dayTitles: { '2026-10-06': 'Musées et jardins' },
          summary: 'Un séjour tranquille.'
        }
      })
    });
    const t = trip();
    const r = await reviewTrip(t, ctx);
    const [request, options] = completeFn.mock.calls[0];
    expect(request.system).toMatch(/At most 6 operations/);
    expect(request.timeoutMs).toBe(8000);
    expect(request.language).toBe('fr');
    expect(JSON.parse(request.user).days).toHaveLength(1);
    expect(request.jsonSchema.properties.operations.maxItems).toBe(6);
    expect(options).toMatchObject({ client: 'u:1', usageStore: store });
    expect(client).toHaveBeenCalledTimes(1);
    expect(r.review).toMatchObject({ status: 'applied', provider: 'mistral', dayTitles: { '2026-10-06': 'Musées et jardins' }, summary: 'Un séjour tranquille.' });
    expect(r.days[0].steps.map((s) => s.id)).toEqual(['culture', 'lunch', 'relax', 'outdoor']);
    expect(r.review.originalDays).toEqual(t.days);
    expect(events).toEqual(['review', 'review_done:applied']);
  });

  it.each(['timeout', 'quota', 'invalid_json', 'error'])('échec « %s » : planning généré livré, status "skipped" avec la raison', async (reason) => {
    const { ctx, events } = setup({ answer: () => ({ ok: false, reason }) });
    const t = trip();
    const r = await reviewTrip(t, ctx);
    expect(r.days).toEqual(t.days);
    expect(r.review).toMatchObject({ status: 'skipped', reason, originalDays: null });
    expect(events).toEqual(['review', 'review_done:skipped']);
  });

  it('exception inattendue (fournisseur, identifiant client) : "skipped", jamais d\'erreur', async () => {
    const { ctx } = setup({ answer: () => { throw new Error('boom'); } });
    expect((await reviewTrip(trip(), ctx)).review).toMatchObject({ status: 'skipped', reason: 'error' });
    const failingClient = setup();
    failingClient.ctx.client = async () => { throw new Error('hash'); };
    expect((await reviewTrip(trip(), failingClient.ctx)).review).toMatchObject({ status: 'skipped', reason: 'error' });
  });

  it('les règles de la fixture sont celles par défaut (relecture active)', () => {
    expect(fixtureRules.ai.enabled).toBe(true);
  });
});
