import { describe, expect, it } from 'vitest';
import { bookingAdvice } from './booking.js';
import { planTripNotifications } from './notificationPlan.js';
import { dayWithDinner, rules, trip } from './testing/dayFixture.js';

// Vendredi 11, samedi 12, dimanche 13 décembre 2026.
const DATES = ['2026-12-11', '2026-12-12', '2026-12-13'];
const group = (travelers) => {
  const t = trip(DATES.map((date) => dayWithDinner(date)));
  return { ...t, travelers, timezone: 'Europe/Brussels' };
};
const restaurantSteps = (t) => t.days.flatMap((d) => d.steps.filter((s) => s.place?.category === 'restaurant').map((s) => ({ date: d.date, s })));

describe('bookingAdvice', () => {
  it('6 voyageurs : conseil sur tous les restaurants (déjeuners et dîners)', () => {
    const t = group(6);
    const steps = restaurantSteps(t);
    expect(steps.length).toBeGreaterThanOrEqual(6);
    for (const { date, s } of steps) expect(bookingAdvice(t, date, s, rules), `${date} ${s.type}`).not.toBeNull();
  });

  it('mis en avant pour les dîners du vendredi et du samedi seulement', () => {
    const t = group(6);
    const highlighted = restaurantSteps(t).filter(({ date, s }) => bookingAdvice(t, date, s, rules).highlight).map(({ date, s }) => `${date} ${s.type}`);
    expect(highlighted).toEqual(['2026-12-11 dinner', '2026-12-12 dinner']);
  });

  it('2 voyageurs (ou 4) : aucun conseil ; jamais pour une visite', () => {
    for (const n of [2, 4]) {
      const t = group(n);
      for (const { date, s } of restaurantSteps(t)) expect(bookingAdvice(t, date, s, rules)).toBeNull();
    }
    const t = group(6);
    expect(bookingAdvice(t, DATES[0], t.days[0].steps[0], rules)).toBeNull();
  });
});

describe('rappel de réservation la veille', () => {
  const now = Date.parse('2026-12-01T00:00:00Z');
  it('6 voyageurs : rappel la veille à 10:00 pour les dîners du vendredi et du samedi', () => {
    const booking = planTripNotifications(group(6), { now, summaries: false, reminders: true }, rules).filter((n) => n.kind === 'booking');
    expect(booking.map((n) => n.date)).toEqual(['2026-12-11', '2026-12-12']);
    // Samedi 12 : rappel le vendredi 11 à 10:00 (heure de Bruxelles = 09:00 UTC).
    expect(booking[1].at.toISOString()).toBe('2026-12-11T09:00:00.000Z');
    expect(booking[1].data).toMatchObject({ travelers: 6, start: '19:30' });
  });

  it('2 voyageurs ou rappels désactivés : aucun rappel de réservation', () => {
    expect(planTripNotifications(group(2), { now, summaries: true, reminders: true }, rules).some((n) => n.kind === 'booking')).toBe(false);
    expect(planTripNotifications(group(6), { now, summaries: true, reminders: false }, rules).some((n) => n.kind === 'booking')).toBe(false);
  });
});
