import { describe, expect, it } from 'vitest';
import { durationBucket, FEEDBACK_EVENTS, reviewMetrics } from './reviewStats.js';

const review = (patch) => ({ status: 'applied', provider: 'mistral', model: 'mistral-small-latest', appliedOps: [], rejectedOps: [], ...patch });

describe('compteurs anonymes de la relecture', () => {
  it('tranches de durée', () => {
    expect([0, 1999, 2000, 5999, 7999, 8000, 30000].map(durationBucket)).toEqual(['0-2s', '0-2s', '2-4s', '4-6s', '6-8s', '8s+', '8s+']);
  });

  it('relecture appliquée : statut, durée, modèle, opérations et raisons des refus', () => {
    const metrics = reviewMetrics(
      review({ appliedOps: [{ op: 'swap' }, { op: 'shift' }], rejectedOps: [{ rejection: 'closed' }, { rejection: 'closed' }, { rejection: 'unknown_step' }] }),
      { attempted: true, durationMs: 4200 }
    );
    expect(metrics).toEqual({
      'review:applied': 1,
      'duration:4-6s': 1,
      'model:mistral/mistral-small-latest': 1,
      'ops:applied': 2,
      'ops:rejected': 3,
      'rejected:closed': 2,
      'rejected:unknown_step': 1
    });
  });

  it('sautée (par raison) ; non tentée (consentement, désactivée) comptée à part', () => {
    expect(reviewMetrics(review({ status: 'skipped', reason: 'timeout', provider: null }), { attempted: true, durationMs: 8003 })).toEqual({
      'review:skipped': 1,
      'skipped:timeout': 1,
      'duration:8s+': 1
    });
    expect(reviewMetrics(review({ status: 'skipped', reason: 'no_consent' }), { attempted: false })).toEqual({ 'review:not_attempted': 1, 'not_attempted:no_consent': 1 });
  });

  it('noms de métriques sûrs, sans contenu libre', () => {
    const metrics = reviewMetrics(review({ provider: 'mistral', model: 'modèle "piégé"; drop table', rejectedOps: [{ rejection: 'a b' }] }), { attempted: true });
    for (const key of Object.keys(metrics)) expect(key).toMatch(/^[a-z_]+:[A-Za-z0-9_./:-]{1,80}$/);
  });

  it('retours à la version d\'origine et à la version relue', () => {
    expect(FEEDBACK_EVENTS).toEqual({ revert_original: 'revert:original', revert_reviewed: 'revert:reviewed' });
  });
});
