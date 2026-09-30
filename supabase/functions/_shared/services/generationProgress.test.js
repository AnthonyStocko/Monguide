import { describe, expect, it } from 'vitest';
import { createProgress } from './generationProgress.js';

const run = (options) => {
  const events = [];
  const progress = createProgress({ send: (e) => events.push(e), zones: 1, restaurants: true, ...options });
  return { events, progress };
};

describe('createProgress : relecture', () => {
  it('review puis review_done avec le statut, hors de la liste des étapes (ajoutée par l\'application si elle est tentée)', () => {
    const { events, progress } = run();
    progress.start();
    progress.planningDone();
    progress.reviewStarted();
    progress.reviewDone('skipped');
    expect(events[0].steps).not.toContain('review');
    expect(events.slice(-2)).toEqual([{ event: 'review' }, { event: 'review_done', status: 'skipped' }]);
  });
});

describe('createProgress', () => {
  it('début : liste des étapes, collecte en cours, planning en attente', () => {
    const { events, progress } = run();
    progress.start();
    expect(events[0]).toEqual({ event: 'start', steps: ['weather', 'heritage', 'places', 'restaurants', 'planning'] });
    expect(events.slice(1).map((e) => `${e.step}:${e.status}`)).toEqual(['weather:running', 'heritage:running', 'places:running', 'restaurants:running']);
  });

  it('sans restaurants : étape absente', () => {
    const { events, progress } = run({ restaurants: false });
    progress.start();
    expect(events[0].steps).not.toContain('restaurants');
    progress.report('restaurants', 'done');
    expect(events.some((e) => e.step === 'restaurants')).toBe(false);
  });

  it('plusieurs zones : fini quand toutes ont répondu, échec seulement si toutes échouent', () => {
    const { events, progress } = run({ zones: 2 });
    progress.report('heritage', 'failed');
    expect(events).toEqual([]);
    progress.report('heritage', 'done');
    expect(events).toEqual([{ event: 'step', step: 'heritage', status: 'done' }]);
    progress.report('places', 'failed');
    progress.report('places', 'failed');
    expect(events.at(-1)).toEqual({ event: 'step', step: 'places', status: 'failed' });
  });

  it('une étape ne finit qu’une fois', () => {
    const { events, progress } = run();
    progress.report('weather', 'done');
    progress.report('weather', 'done');
    expect(events).toHaveLength(1);
  });

  it('budget épuisé : étapes encore en cours signalées en échec (délai), puis planning', () => {
    const { events, progress } = run();
    progress.report('weather', 'done');
    progress.timeoutPending();
    progress.planningStarted();
    progress.planningDone();
    expect(events.map((e) => `${e.step}:${e.status}${e.message ? `:${e.message}` : ''}`)).toEqual([
      'weather:done',
      'heritage:failed:timeout',
      'places:failed:timeout',
      'restaurants:failed:timeout',
      'planning:running',
      'planning:done'
    ]);
  });
});
