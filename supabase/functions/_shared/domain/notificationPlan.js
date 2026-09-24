import { addDays } from './dates.js';
import { slotToInstant } from './time.js';

/**
 * Notifications locales attendues pour un séjour (fonctions pures) :
 *  - résumé de la veille : une par jour de séjour, la veille à l'heure
 *    choisie (rules.notifications.eveningSummaryTime par défaut), avec les
 *    étapes du lendemain et le départ conseillé si l'hébergement est connu ;
 *  - rappel : rules.notifications.reminderLeadMin avant chaque créneau
 *    qui contient un lieu, ou étape personnelle (aucun pour un temps libre).
 * Toutes les heures sont celles de la destination, converties en instants
 * par slotToInstant. Rien dans le passé ; rien pour une étape terminée ou passée.
 */

/**
 * Identifiant stable d'une notification : entier positif sur 31 bits (entier
 * Java signé côté Android), hachage FNV-1a de (séjour, date, créneau, type).
 * Reprogrammer un séjour réutilise donc les mêmes identifiants : aucun doublon.
 * @param {string} tripId
 * @param {string} date "YYYY-MM-DD"
 * @param {string} slot identifiant de l'étape, ou "summary"
 * @param {'summary' | 'reminder'} kind
 * @returns {number}
 */
export function notificationId(tripId, date, slot, kind) {
  const text = `${tripId}|${date}|${slot}|${kind}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash & 0x7fffffff) || 1;
}

/**
 * @typedef {object} PlannedNotification
 * @property {number} id
 * @property {'summary' | 'reminder'} kind
 * @property {Date} at instant de déclenchement
 * @property {string} tripId
 * @property {string} date jour du séjour concerné
 * @property {string} [stepId] rappel : étape concernée
 * @property {object} data contenu, mis en forme (et traduit) par l'application
 */

/**
 * @param {import('./model.js').Trip} trip
 * @param {{ now: number, summaries: boolean, reminders: boolean, summaryTime?: string }} options now : instant (ms)
 * @returns {PlannedNotification[]} triées par instant
 */
export function planTripNotifications(trip, { now, summaries, reminders, summaryTime }, rules) {
  if (!trip || trip.deleted || !trip.timezone) return [];
  const out = [];
  const lead = rules.notifications.reminderLeadMin * 60000;
  const lodging = (id) => trip.lodgings?.find((l) => l.id === id) ?? null;

  for (const day of trip.days) {
    const planned = day.steps.filter((s) => (s.status ?? 'planned') === 'planned');
    if (summaries && planned.length) {
      const at = slotToInstant(addDays(day.date, -1), summaryTime ?? rules.notifications.eveningSummaryTime, trip.timezone);
      const start = lodging(day.startLodgingId);
      if (at.getTime() > now) {
        out.push({
          id: notificationId(trip.id, day.date, 'summary', 'summary'),
          kind: 'summary',
          at,
          tripId: trip.id,
          date: day.date,
          data: {
            tripTitle: trip.title,
            date: day.date,
            steps: planned.map((s) => ({ id: s.id, start: s.start, name: s.place?.name ?? s.title ?? null, type: s.type })),
            departure: start && day.departure ? { time: day.departure.time, lodgingName: start.name ?? start.address } : null
          }
        });
      }
    }
    if (!reminders) continue;
    for (const s of planned) {
      if (!s.place && s.type !== 'personal') continue;
      const at = new Date(slotToInstant(day.date, s.start, trip.timezone).getTime() - lead);
      if (at.getTime() <= now) continue;
      out.push({
        id: notificationId(trip.id, day.date, s.id, 'reminder'),
        kind: 'reminder',
        at,
        tripId: trip.id,
        date: day.date,
        stepId: s.id,
        data: { tripTitle: trip.title, date: day.date, start: s.start, end: s.end, name: s.place?.name ?? s.title ?? null, type: s.type }
      });
    }
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/**
 * Réconciliation : compare les notifications attendues à celles réellement
 * en attente (getPending) et renvoie ce qu'il faut programmer et annuler.
 * @param {PlannedNotification[]} expected
 * @param {number[]} pendingIds
 * @returns {{ toSchedule: PlannedNotification[], toCancel: number[] }}
 */
export function reconcilePlan(expected, pendingIds) {
  const pending = new Set(pendingIds);
  const wanted = new Set(expected.map((n) => n.id));
  return {
    toSchedule: expected.filter((n) => !pending.has(n.id)),
    toCancel: [...pending].filter((id) => !wanted.has(id))
  };
}
