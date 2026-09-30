import { describe, expect, it } from 'vitest';
import { validateJson } from './jsonSchema.js';
import { buildReviewSchema, REVIEW_OPS } from './reviewSchema.js';
import { rules } from './testing/dayFixture.js';

const REQUEST = { editableSteps: ['s2', 's3', 's5'], candidateAliases: ['c1', 'c2'], dates: ['2026-10-06', '2026-10-07'] };
const schema = buildReviewSchema(REQUEST, rules);
const titles = { '2026-10-06': 'Vieille ville', '2026-10-07': 'Parcs et belvédères' };
const answer = (operations, patch = {}) => ({ operations, dayTitles: titles, summary: 'Un séjour équilibré.', ...patch });
const valid = (value) => validateJson(value, schema).length === 0;

describe('buildReviewSchema', () => {
  it('accepte les trois opérations et une liste vide', () => {
    expect(REVIEW_OPS).toEqual(['swap', 'replace', 'shift']);
    expect(
      valid(
        answer([
          { op: 'swap', stepA: 's2', stepB: 's3', reason: 'Le musée d\'abord, avant la pluie.' },
          { op: 'replace', step: 's5', candidate: 'c2', reason: 'Un point de vue plutôt qu\'un troisième monument.' },
          { op: 'shift', step: 's3', newStart: '15:30', reason: 'Moins de hâte après le déjeuner.' }
        ])
      )
    ).toBe(true);
    expect(valid(answer([]))).toBe(true);
  });

  it('rejette une opération inconnue', () => {
    expect(valid(answer([{ op: 'delete', step: 's2', reason: 'x' }]))).toBe(false);
  });

  it('rejette un identifiant absent du résumé, ou d\'une étape verrouillée', () => {
    expect(valid(answer([{ op: 'replace', step: 's2', candidate: 'c9', reason: 'x' }]))).toBe(false);
    expect(valid(answer([{ op: 'replace', step: 'osm:node/123', candidate: 'c1', reason: 'x' }]))).toBe(false);
    // s4 : étape verrouillée, absente des étapes modifiables.
    expect(valid(answer([{ op: 'swap', stepA: 's2', stepB: 's4', reason: 'x' }]))).toBe(false);
  });

  it('rejette une heure mal formée', () => {
    for (const newStart of ['25:00', '9:30', '09h30', '09:60', '']) {
      expect(valid(answer([{ op: 'shift', step: 's2', newStart, reason: 'x' }])), newStart).toBe(false);
    }
  });

  it('rejette un texte trop long (motif 120, titre 40, résumé 280) ou vide', () => {
    expect(valid(answer([{ op: 'shift', step: 's2', newStart: '10:00', reason: 'x'.repeat(121) }]))).toBe(false);
    expect(valid(answer([{ op: 'shift', step: 's2', newStart: '10:00', reason: 'x'.repeat(120) }]))).toBe(true);
    expect(valid(answer([], { dayTitles: { ...titles, '2026-10-06': 'x'.repeat(41) } }))).toBe(false);
    expect(valid(answer([], { summary: 'x'.repeat(281) }))).toBe(false);
    expect(valid(answer([], { summary: '' }))).toBe(false);
  });

  it('rejette un champ en trop, un champ manquant, un jour inconnu ou trop d\'opérations', () => {
    expect(valid(answer([{ op: 'swap', stepA: 's2', stepB: 's3', reason: 'x', place: 'Tour Eiffel' }]))).toBe(false);
    expect(valid(answer([{ op: 'replace', step: 's2', reason: 'x' }]))).toBe(false);
    expect(valid(answer([], { dayTitles: { ...titles, '2026-12-25': 'Noël' } }))).toBe(false);
    expect(valid({ operations: [], dayTitles: titles })).toBe(false);
    const op = { op: 'shift', step: 's2', newStart: '10:00', reason: 'x' };
    expect(valid(answer(Array(rules.ai.maxOpsPerTrip).fill(op)))).toBe(true);
    expect(valid(answer(Array(rules.ai.maxOpsPerTrip + 1).fill(op)))).toBe(false);
  });

  it('forme stricte : objets fermés, toutes les propriétés requises', () => {
    for (const v of schema.properties.operations.items.anyOf) {
      expect(v.additionalProperties).toBe(false);
      expect([...v.required].sort()).toEqual(Object.keys(v.properties).sort());
    }
  });

  it('sans candidat : pas de remplacement ; aucune étape modifiable : pas de schéma (IA non appelée)', () => {
    const noCandidates = buildReviewSchema({ ...REQUEST, candidateAliases: [] }, rules);
    expect(noCandidates.properties.operations.items.anyOf.map((v) => v.properties.op.enum[0])).toEqual(['swap', 'shift']);
    expect(buildReviewSchema({ ...REQUEST, editableSteps: [] }, rules)).toBeNull();
  });
});
