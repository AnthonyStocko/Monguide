import { distanceKm } from './geo.js';

/**
 * Événements de saison (table seasonal_events, saisie à la main : README
 * « Ajouter un événement de saison »). Fonctions pures : conversion d'une
 * ligne en Place, sélection des événements d'un séjour, jour actif. Aucune
 * date n'est inventée : seul ce qui est saisi est proposé.
 *
 * Chaque type a une catégorie de lieu existante (affichage, illustrations) et
 * un meilleur créneau : la fin de journée (visite du soir) pour un marché de
 * Noël ou des illuminations, l'après-midi pour un festival.
 */
export const EVENT_TYPES = Object.freeze({
  christmas_market: Object.freeze({ category: 'market', slot: 'evening' }),
  illuminations: Object.freeze({ category: 'viewpoint', slot: 'evening' }),
  festival: Object.freeze({ category: 'monument', slot: 'afternoon' })
});

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Ligne de seasonal_events -> Place (source "event", place.event) ; null si
 * la ligne est incomplète ou d'un type inconnu.
 * @param {{ id: string, name: string, city?: string, lat: number, lon: number, start_date: string, end_date: string, opening_hours?: string | null, type: string, duration_min?: number, url?: string | null }} row
 * @returns {import('./model.js').Place | null}
 */
export function eventToPlace(row) {
  const kind = EVENT_TYPES[row?.type];
  const name = row?.name?.trim();
  if (!kind || !name || !row.id || !Number.isFinite(row.lat) || !Number.isFinite(row.lon)) return null;
  if (!DATE.test(row.start_date ?? '') || !DATE.test(row.end_date ?? '') || row.end_date < row.start_date) return null;
  const place = {
    id: `event:${row.id}`,
    name,
    category: kind.category,
    lat: row.lat,
    lon: row.lon,
    source: 'event',
    certified: false,
    indoor: false,
    // Marché de Noël, illuminations : à voir à la nuit tombée.
    ...(kind.slot === 'evening' ? { nightSight: 'always' } : {}),
    event: { type: row.type, startDate: row.start_date, endDate: row.end_date, durationMin: Number.isInteger(row.duration_min) ? row.duration_min : 60 }
  };
  if (row.opening_hours?.trim()) place.openingHours = row.opening_hours.trim();
  if (row.url?.trim()) place.url = row.url.trim();
  return place;
}

/** L'événement a-t-il lieu ce jour-là ? */
export const eventActiveOn = (place, date) => Boolean(place.event) && place.event.startDate <= date && date <= place.event.endDate;

/** Meilleur créneau d'un événement : "evening" (fin de journée) ou "afternoon". */
export const eventSlot = (place) => EVENT_TYPES[place.event?.type]?.slot ?? 'afternoon';

/**
 * Événements d'un séjour : qui ont lieu pendant ses dates, à moins du rayon
 * d'exploration de la destination ou d'un hébergement.
 * @param {object[]} rows lignes de seasonal_events
 * @param {{ startDate: string, endDate: string, destination: { lat: number, lon: number, radiusKm: number }, lodgings?: { lat: number, lon: number }[] }} trip
 * @returns {import('./model.js').Place[]}
 */
export function eventsForTrip(rows, trip) {
  const anchors = [trip.destination, ...(trip.lodgings ?? [])];
  return (rows ?? [])
    .map(eventToPlace)
    .filter(Boolean)
    .filter((p) => p.event.startDate <= trip.endDate && p.event.endDate >= trip.startDate)
    .filter((p) => anchors.some((a) => distanceKm(a, p) <= trip.destination.radiusKm));
}
