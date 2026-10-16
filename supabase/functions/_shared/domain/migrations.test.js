import { describe, expect, it } from 'vitest';
import { migrate } from './migrations.js';
import { SCHEMA_VERSION } from './model.js';
import { dayId, stepId } from './stableId.js';

describe('migrate', () => {
  it('laisse intact un séjour à la version courante', () => {
    const trip = { schemaVersion: SCHEMA_VERSION, id: 't' };
    expect(migrate(trip)).toEqual({ trip, readOnly: false });
  });

  it('considère un séjour sans version comme version 1 (et le migre)', () => {
    expect(migrate({ id: 't' }, 1).trip.schemaVersion).toBe(1);
    expect(migrate({ id: 't' }, 2).trip).toEqual({ id: 't', schemaVersion: 2, dinner: 'free' });
    expect(migrate({ id: 't' }).trip).toEqual({ id: 't', schemaVersion: 3, dinner: 'free', days: [] });
  });

  it("v1 -> v2 : dîner « libre », journées intactes, sans modifier l'original", () => {
    const day = { date: '2026-10-06', weatherAvailable: false, steps: [{ id: 's1', type: 'culture', start: '10:00', end: '11:30', badges: [] }] };
    const v1 = { schemaVersion: 1, id: 't', lunch: 'both', days: [day], candidates: [] };
    const { trip, readOnly } = migrate(v1, 2);
    expect(readOnly).toBe(false);
    expect(trip).toEqual({ ...v1, schemaVersion: 2, dinner: 'free' });
    expect(trip.days[0]).toBe(day);
    expect(v1).not.toHaveProperty('dinner');
  });

  describe('v2 -> v3 : identifiants stables des journées', () => {
    const tripId = '0b9d6a7e-1c2f-4e3a-8b5d-6f7a8b9c0d1e';
    const day = (date, steps) => ({ date, weatherAvailable: false, steps });
    const v2 = () => ({
      schemaVersion: 2,
      id: tripId,
      dinner: 'free',
      candidates: [],
      days: [day('2026-10-06', [{ id: 's1', type: 'culture', start: '10:00', end: '11:30' }, { type: 'lunch', start: '12:30', end: '13:30' }]), day('2026-10-07', [])]
    });

    it('donne un identifiant déterministe à chaque journée et aux étapes sans identifiant', () => {
      const { trip } = migrate(v2());
      expect(trip.schemaVersion).toBe(3);
      expect(trip.days.map((d) => d.id)).toEqual([dayId(tripId, '2026-10-06'), dayId(tripId, '2026-10-07')]);
      expect(trip.days[0].steps.map((s) => s.id)).toEqual(['s1', stepId(tripId, '2026-10-06', 1)]);
    });

    it("redonne les mêmes identifiants à chaque lecture, sans modifier l'original", () => {
      const original = v2();
      expect(migrate(original).trip).toEqual(migrate(v2()).trip);
      expect(original.days[0]).not.toHaveProperty('id');
    });

    it('garde un identifiant déjà présent', () => {
      const trip = v2();
      trip.days[1] = { ...trip.days[1], id: 'deja-la' };
      const migrated = migrate(trip).trip;
      expect(migrated.days[1].id).toBe('deja-la');
      expect(migrated.days[1]).toBe(trip.days[1]);
    });

    it("migre aussi les versions d'origine et relue de la relecture IA", () => {
      const trip = { ...v2(), review: { status: 'applied', originalDays: [day('2026-10-06', [{ type: 'relax', start: '15:00', end: '16:00' }])], reviewedDays: undefined } };
      const { review, days } = migrate(trip).trip;
      expect(review.originalDays[0].id).toBe(days[0].id);
      expect(review.originalDays[0].steps[0].id).toBe(stepId(tripId, '2026-10-06', 0));
      expect(review.reviewedDays).toBeUndefined();
    });
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
