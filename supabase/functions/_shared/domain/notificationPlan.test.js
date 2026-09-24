import { afterEach, describe, expect, it } from 'vitest';
import { Settings } from 'luxon';
import { notificationId, planTripNotifications, reconcilePlan } from './notificationPlan.js';
import { personal, rules, standardDay, step, trip } from './testing/dayFixture.js';

const threeDays = () => {
  const days = ['2026-10-06', '2026-10-07', '2026-10-08'].map((date, d) => {
    const day = standardDay(date);
    day.steps = day.steps.map((s) => ({ ...s, id: `${d}-${s.id}` }));
    return day;
  });
  days[1].steps[3] = step('1-free', 'relax', '17:30', '19:00', null);
  return trip(days);
};
const all = { summaries: true, reminders: true };
const iso = (n) => n.at.toISOString();

describe('notificationId', () => {
  it('entier positif stable sur 31 bits, différent selon le type et le créneau', () => {
    const a = notificationId('trip-1', '2026-10-06', 'step-1', 'reminder');
    expect(a).toBe(notificationId('trip-1', '2026-10-06', 'step-1', 'reminder'));
    expect(Number.isInteger(a) && a > 0 && a <= 0x7fffffff).toBe(true);
    expect(notificationId('trip-1', '2026-10-06', 'step-1', 'summary')).not.toBe(a);
    expect(notificationId('trip-2', '2026-10-06', 'step-1', 'reminder')).not.toBe(a);
  });
});

describe('planTripNotifications', () => {
  afterEach(() => {
    Settings.defaultZone = 'system';
  });

  it('séjour de 3 jours : 3 résumés la veille à 19:00 et un rappel H-1 par créneau avec un lieu', () => {
    const t = threeDays();
    const plan = planTripNotifications(t, { now: Date.UTC(2026, 9, 1), ...all }, rules);
    const summaries = plan.filter((n) => n.kind === 'summary');
    const reminders = plan.filter((n) => n.kind === 'reminder');
    expect(summaries.map(iso)).toEqual(['2026-10-05T17:00:00.000Z', '2026-10-06T17:00:00.000Z', '2026-10-07T17:00:00.000Z']);
    expect(reminders).toHaveLength(11); // 12 créneaux, dont un temps libre
    expect(reminders.some((n) => n.stepId === '1-free')).toBe(false);
    expect(summaries.length).toBeLessThanOrEqual(3);
    expect(reminders.length).toBeLessThanOrEqual(15);
    expect(new Set(plan.map((n) => n.id)).size).toBe(plan.length);
  });

  it('étape à 10h00 à Paris : rappel à 09h00 heure de Paris, même si le téléphone est à New York', () => {
    Settings.defaultZone = 'America/New_York';
    const plan = planTripNotifications(threeDays(), { now: Date.UTC(2026, 9, 1), summaries: false, reminders: true }, rules);
    expect(iso(plan[0])).toBe('2026-10-06T07:00:00.000Z'); // 09:00 à Paris (UTC+2)
  });

  it('étape à 10h00 à Lisbonne : rappel à 09h00 heure de Lisbonne', () => {
    const t = { ...threeDays(), timezone: 'Europe/Lisbon' };
    const plan = planTripNotifications(t, { now: Date.UTC(2026, 9, 1), summaries: false, reminders: true }, rules);
    expect(iso(plan[0])).toBe('2026-10-06T08:00:00.000Z'); // 09:00 à Lisbonne (UTC+1)
  });

  it('jamais dans le passé : en cours de séjour, seules les notifications à venir', () => {
    const now = Date.UTC(2026, 9, 7, 11, 0); // 13:00 à Paris le 2e jour
    const plan = planTripNotifications(threeDays(), { now, ...all }, rules);
    expect(plan.every((n) => n.at.getTime() > now)).toBe(true);
    expect(plan.filter((n) => n.kind === 'summary').map((n) => n.date)).toEqual(['2026-10-08']);
    expect(plan.filter((n) => n.date === '2026-10-07').map((n) => n.stepId)).toEqual(['1-outdoor']);
    // Fin du séjour : plus rien à programmer.
    expect(planTripNotifications(threeDays(), { now: Date.UTC(2026, 9, 9), ...all }, rules)).toEqual([]);
  });

  it("résumé : étapes du lendemain et départ conseillé de l'hébergement", () => {
    const t = threeDays();
    t.lodgings = [{ id: 'h', name: 'Hôtel du Parc', address: 'Place des Arts', lat: 45.98, lon: 4.72, nights: ['2026-10-06'] }];
    t.days[0] = { ...t.days[0], startLodgingId: 'h', departure: { time: '09:42', travelMin: 18 } };
    const [summary] = planTripNotifications(t, { now: Date.UTC(2026, 9, 1), summaries: true, reminders: false }, rules);
    expect(summary.data.departure).toEqual({ time: '09:42', lodgingName: 'Hôtel du Parc' });
    expect(summary.data.steps.map((s) => s.name)).toEqual(['Musée Paul-Dini', 'Le Bouchon', 'Parc Vermorel', 'Jardin de la Garenne']);
  });

  it("heure du résumé réglable ; types désactivables ; étapes terminées et séjour supprimé ignorés", () => {
    const t = threeDays();
    const now = Date.UTC(2026, 9, 1);
    expect(iso(planTripNotifications(t, { now, summaries: true, reminders: false, summaryTime: '20:30' }, rules)[0])).toBe('2026-10-05T18:30:00.000Z');
    expect(planTripNotifications(t, { now, summaries: false, reminders: false }, rules)).toEqual([]);
    t.days[0].steps[0] = { ...t.days[0].steps[0], status: 'done' };
    expect(planTripNotifications(t, { now, summaries: false, reminders: true }, rules).some((n) => n.stepId === '0-culture')).toBe(false);
    expect(planTripNotifications({ ...t, deleted: true }, { now, ...all }, rules)).toEqual([]);
  });

  it("une étape personnelle, même sans lieu, reçoit son rappel H-1", () => {
    const t = threeDays();
    t.days[0].steps.splice(2, 0, personal('p', '14:00', '14:20', { title: 'Rendez-vous' }));
    const plan = planTripNotifications(t, { now: Date.UTC(2026, 9, 1), summaries: false, reminders: true }, rules);
    expect(plan.find((n) => n.stepId === 'p')).toMatchObject({ at: new Date('2026-10-06T11:00:00.000Z'), data: { name: 'Rendez-vous' } });
  });
});

describe('reconcilePlan', () => {
  it('programme les manquants, annule les orphelins, sans doublon', () => {
    const plan = planTripNotifications(threeDays(), { now: Date.UTC(2026, 9, 1), ...all }, rules);
    const pending = plan.slice(1).map((n) => n.id);
    const { toSchedule, toCancel } = reconcilePlan(plan, [...pending, 42]);
    expect(toSchedule).toEqual([plan[0]]);
    expect(toCancel).toEqual([42]);
    expect(reconcilePlan(plan, plan.map((n) => n.id))).toEqual({ toSchedule: [], toCancel: [] });
  });
});
