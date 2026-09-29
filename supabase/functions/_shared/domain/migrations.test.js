import { describe, expect, it } from 'vitest';
import { migrate } from './migrations.js';
import { SCHEMA_VERSION } from './model.js';

describe('migrate', () => {
  it('laisse intact un séjour à la version courante', () => {
    const trip = { schemaVersion: SCHEMA_VERSION, id: 't' };
    expect(migrate(trip)).toEqual({ trip, readOnly: false });
  });

  it('considère un séjour sans version comme version 1 (et le migre)', () => {
    expect(migrate({ id: 't' }, 1).trip.schemaVersion).toBe(1);
    expect(migrate({ id: 't' }).trip).toEqual({ id: 't', schemaVersion: 2, dinner: 'free' });
  });

  it("v1 -> v2 : dîner « libre », journées intactes, sans modifier l'original", () => {
    const day = { date: '2026-10-06', weatherAvailable: false, steps: [{ id: 's1', type: 'culture', start: '10:00', end: '11:30', badges: [] }] };
    const v1 = { schemaVersion: 1, id: 't', lunch: 'both', days: [day], candidates: [] };
    const { trip, readOnly } = migrate(v1);
    expect(readOnly).toBe(false);
    expect(trip).toEqual({ ...v1, schemaVersion: 2, dinner: 'free' });
    expect(trip.days[0]).toBe(day);
    expect(v1).not.toHaveProperty('dinner');
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
