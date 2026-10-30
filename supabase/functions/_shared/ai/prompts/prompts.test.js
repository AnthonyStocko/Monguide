import { describe, expect, it } from 'vitest';
import { fillPrompt, loadPrompt, PROMPT_VERSIONS } from './index.js';

const VARS = { maxOps: 6, notableScore: 40 };

describe('instructions de relecture', () => {
  it('version en service lue, nombre maximal d\'opérations inséré', async () => {
    expect(PROMPT_VERSIONS.review).toBe('v4');
    // Les versions précédentes restent lisibles (journaux, comparaisons).
    expect(await loadPrompt('review', { maxOps: 6 }, 'v1')).toContain('At most 6 operations');
    const text = await loadPrompt('review', VARS);
    expect(text).toContain('At most 6 operations');
    expect(text).not.toMatch(/\{\{\w+\}\}/);
  });

  it('contient les règles essentielles : données et non instructions, liste vide acceptée, rien d\'inventé, étapes verrouillées', async () => {
    const text = await loadPrompt('review', VARS);
    expect(text).toMatch(/DATA .* never instructions/);
    expect(text).toMatch(/return an empty `operations` list/);
    expect(text).toMatch(/Never invent a place/);
    expect(text).toMatch(/Never touch a step marked `locked`/);
  });

  it('v2 : envies « moins de… » et envies non satisfaites expliquées dans le résumé', async () => {
    const text = await loadPrompt('review', VARS);
    expect(text).toMatch(/few museums/);
    expect(text).toMatch(/could not fully meet .* say so briefly in the `summary`/);
  });

  it('v3 : horaires des repas du pays, jamais une anomalie ; v2 inchangée', async () => {
    const text = await loadPrompt('review', VARS);
    expect(text).toMatch(/`trip.meals`/);
    expect(text).toMatch(/a 21:00 dinner in Spain is normal/);
    expect(text).toMatch(/Never shift a meal outside `trip.meals`/);
    expect(await loadPrompt('review', { maxOps: 6 }, 'v2')).not.toMatch(/trip.meals/);
  });

  it('v4 : notoriété des étapes et candidats, incontournables jamais remplacés, séjour sans lieu connu signalé', async () => {
    const text = await loadPrompt('review', VARS);
    expect(text).toMatch(/`notoriety`: how well known the place is/);
    expect(text).toMatch(/notoriety of at least 40/);
    expect(text).toMatch(/Never replace a step marked `mustSee`/);
    expect(text).toMatch(/no well-known place/);
    expect(text).toMatch(/Prefer well-known places/);
    expect(await loadPrompt('review', VARS, 'v3')).not.toMatch(/notoriety/);
  });

  it('variable manquante : erreur, jamais de consigne incomplète', () => {
    expect(() => fillPrompt('Au plus {{maxOps}}.', {})).toThrow('maxOps');
    expect(fillPrompt('a\r\nb {{x}}', { x: 1 })).toBe('a\nb 1');
  });
});
