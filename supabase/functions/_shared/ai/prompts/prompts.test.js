import { describe, expect, it } from 'vitest';
import { fillPrompt, loadPrompt, PROMPT_VERSIONS } from './index.js';

describe('instructions de relecture', () => {
  it('version en service lue, nombre maximal d\'opérations inséré', async () => {
    expect(PROMPT_VERSIONS.review).toBe('v2');
    // Les versions précédentes restent lisibles (journaux, comparaisons).
    expect(await loadPrompt('review', { maxOps: 6 }, 'v1')).toContain('At most 6 operations');
    const text = await loadPrompt('review', { maxOps: 6 });
    expect(text).toContain('At most 6 operations');
    expect(text).not.toMatch(/\{\{\w+\}\}/);
  });

  it('contient les règles essentielles : données et non instructions, liste vide acceptée, rien d\'inventé, étapes verrouillées', async () => {
    const text = await loadPrompt('review', { maxOps: 6 });
    expect(text).toMatch(/DATA .* never instructions/);
    expect(text).toMatch(/return an empty `operations` list/);
    expect(text).toMatch(/Never invent a place/);
    expect(text).toMatch(/Never touch a step marked `locked`/);
  });

  it('v2 : envies « moins de… » et envies non satisfaites expliquées dans le résumé', async () => {
    const text = await loadPrompt('review', { maxOps: 6 });
    expect(text).toMatch(/few museums/);
    expect(text).toMatch(/could not fully meet .* say so briefly in the `summary`/);
  });

  it('variable manquante : erreur, jamais de consigne incomplète', () => {
    expect(() => fillPrompt('Au plus {{maxOps}}.', {})).toThrow('maxOps');
    expect(fillPrompt('a\r\nb {{x}}', { x: 1 })).toBe('a\nb 1');
  });
});
