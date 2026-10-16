import { describe, expect, it } from 'vitest';
import { dayId, ID_NAMESPACE, stepId, uuidV5 } from './stableId.js';

const DNS = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

describe('uuidV5', () => {
  it('donne les valeurs de référence (RFC 9562, uuid_generate_v5 de PostgreSQL)', () => {
    expect(uuidV5('www.example.com', DNS)).toBe('2ed6657d-e927-568b-95e1-2665a8aea6a2');
    expect(uuidV5('python.org', DNS)).toBe('886313e1-3b8a-5372-9b90-0c9aee199e5d');
  });

  it('gère les noms longs (plusieurs blocs) et non ASCII', () => {
    expect(uuidV5('x'.repeat(200), DNS)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(uuidV5('Évora', DNS)).not.toBe(uuidV5('Evora', DNS));
  });
});

describe('dayId / stepId', () => {
  const trip = '0b9d6a7e-1c2f-4e3a-8b5d-6f7a8b9c0d1e';

  it('sont déterministes et distincts', () => {
    expect(dayId(trip, '2026-10-06')).toBe(dayId(trip, '2026-10-06'));
    expect(dayId(trip, '2026-10-06')).not.toBe(dayId(trip, '2026-10-07'));
    expect(stepId(trip, '2026-10-06', 0)).not.toBe(stepId(trip, '2026-10-06', 1));
    expect(stepId(trip, '2026-10-06', 0)).not.toBe(dayId(trip, '2026-10-06'));
  });

  it("utilisent l'espace de noms de Mon guide", () => {
    expect(dayId(trip, '2026-10-06')).toBe(uuidV5(`day:${trip}:2026-10-06`, ID_NAMESPACE));
  });
});
