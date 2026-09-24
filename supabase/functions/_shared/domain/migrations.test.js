import { describe, expect, it } from 'vitest';
import { migrate } from './migrations.js';
import { SCHEMA_VERSION } from './model.js';

describe('migrate', () => {
  it('laisse intact un séjour à la version courante', () => {
    const trip = { schemaVersion: SCHEMA_VERSION, id: 't' };
    expect(migrate(trip)).toEqual({ trip, readOnly: false });
  });

  it('considère un séjour sans version comme version 1', () => {
    expect(migrate({ id: 't' }).trip.schemaVersion).toBe(1);
  });

  it('rend en lecture seule un séjour d\'une version plus récente', () => {
    const trip = { schemaVersion: SCHEMA_VERSION + 1, id: 't' };
    expect(migrate(trip)).toEqual({ trip, readOnly: true });
  });

  it('enchaîne les migrations d\'une version ancienne jusqu\'à la courante, sans modifier l\'original', () => {
    const migrations = {
      1: (t) => ({ ...t, travelers: t.travelers ?? 1 }),
      2: (t) => ({ ...t, prefs: t.prefs ?? { vegetarian: false, wheelchair: false } })
    };
    const original = { schemaVersion: 1, id: 't' };
    const { trip, readOnly } = migrate(original, 3, migrations);
    expect(trip).toEqual({ schemaVersion: 3, id: 't', travelers: 1, prefs: { vegetarian: false, wheelchair: false } });
    expect(readOnly).toBe(false);
    expect(original).toEqual({ schemaVersion: 1, id: 't' });
  });

  it('signale une migration manquante', () => {
    expect(() => migrate({ schemaVersion: 1 }, 2, {})).toThrow('Migration manquante');
  });
});
