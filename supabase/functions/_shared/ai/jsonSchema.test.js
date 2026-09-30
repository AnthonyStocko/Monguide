import { describe, expect, it } from 'vitest';
import { parseJsonResponse, validateJson } from './jsonSchema.js';

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['ops'],
  properties: {
    ops: {
      type: 'array',
      maxItems: 2,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'stepId'],
        properties: {
          kind: { type: 'string', enum: ['replace', 'remove'] },
          stepId: { type: 'string', minLength: 1, maxLength: 40, pattern: '^[a-z0-9-]+$' },
          minutes: { type: ['integer', 'null'], minimum: 0, maximum: 120 }
        }
      }
    }
  }
};

describe('validateJson', () => {
  it('accepte une valeur conforme', () => {
    expect(validateJson({ ops: [{ kind: 'replace', stepId: 'a-1', minutes: 30 }, { kind: 'remove', stepId: 'b', minutes: null }] }, SCHEMA)).toEqual([]);
  });

  it('signale type, liste, bornes, champ requis ou non prévu, format', () => {
    const errors = validateJson({ ops: [{ kind: 'move', stepId: 'A B', minutes: 1.5 }, { stepId: '' }, {}], extra: 1 }, SCHEMA);
    expect(errors).toEqual(
      expect.arrayContaining([
        '$.ops: plus de 2 éléments',
        '$.ops[0].kind: valeur hors liste',
        '$.ops[0].stepId: format invalide',
        '$.ops[0].minutes: type integer|null attendu',
        '$.ops[1].kind: requis',
        '$.ops[1].stepId: trop court',
        '$.extra: non prévu'
      ])
    );
    expect(validateJson('x', SCHEMA)).toEqual(['$: type object attendu']);
  });
});

describe('parseJsonResponse', () => {
  it('lit le JSON, y compris dans un bloc de code', () => {
    expect(parseJsonResponse('{"ops":[]}', SCHEMA)).toEqual({ ok: true, json: { ops: [] } });
    expect(parseJsonResponse('```json\n{"ops":[]}\n```', SCHEMA)).toEqual({ ok: true, json: { ops: [] } });
  });

  it('refuse un texte vide, illisible ou non conforme', () => {
    expect(parseJsonResponse('', SCHEMA).ok).toBe(false);
    expect(parseJsonResponse(null, SCHEMA).ok).toBe(false);
    expect(parseJsonResponse('Voici mes propositions : …', SCHEMA)).toEqual({ ok: false, errors: ['JSON illisible'] });
    expect(parseJsonResponse('{"ops":"non"}', SCHEMA).ok).toBe(false);
  });
});
