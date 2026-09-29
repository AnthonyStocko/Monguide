import { daysBetween, todayIn } from '@domain/dates.js';

/**
 * Situation d'un séjour par rapport à aujourd'hui (dans son fuseau) :
 * current (en cours, jour dayNumber sur dayCount), upcoming (à venir, dans
 * daysUntil jours), past (terminé).
 * @param {{ startDate: string, endDate: string, timezone: string }} trip
 * @param {string} [today] "YYYY-MM-DD" (par défaut : aujourd'hui dans le fuseau du séjour)
 */
export function tripStatus(trip, today = todayIn(trip.timezone)) {
  const dayCount = daysBetween(trip.startDate, trip.endDate) + 1;
  if (today < trip.startDate) return { status: 'upcoming', daysUntil: daysBetween(today, trip.startDate), dayCount };
  if (today > trip.endDate) return { status: 'past', dayCount };
  return { status: 'current', dayNumber: daysBetween(trip.startDate, today) + 1, dayCount };
}

/**
 * Prochain séjour à mettre en avant : celui en cours, sinon le plus proche à venir.
 * @param {object[]} trips
 */
export function nextTrip(trips) {
  const withStatus = trips.map((trip) => ({ trip, ...tripStatus(trip) }));
  return (
    withStatus.find((t) => t.status === 'current') ??
    withStatus.filter((t) => t.status === 'upcoming').sort((a, b) => a.daysUntil - b.daysUntil)[0] ??
    null
  );
}

/** Groupe de temps d'un code météo WMO (Open-Meteo), pour un libellé court. */
export function weatherKind(code) {
  if (code === 0) return 'clear';
  if (code <= 2) return 'partly';
  if (code === 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 57) return 'drizzle';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'storm';
  return null;
}

/**
 * Météo de la mi-journée d'un jour (fonction weather) : { temperature, kind } ou null.
 * @param {{ available: boolean, hours?: { hour: string, temperature: number | null, weatherCode: number | null }[] } | undefined} day
 */
export function middayWeather(day) {
  if (!day?.available || !day.hours?.length) return null;
  const h = day.hours.find((x) => x.hour === '13:00') ?? day.hours.find((x) => x.hour === '12:00') ?? day.hours[Math.floor(day.hours.length / 2)];
  if (h?.temperature === null || h?.temperature === undefined) return null;
  return { temperature: Math.round(h.temperature), kind: weatherKind(h.weatherCode) };
}
