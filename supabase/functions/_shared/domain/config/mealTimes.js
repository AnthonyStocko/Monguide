import { fromMinutes, toMinutes } from '../time.js';

/**
 * Horaires des repas et fin de la journée de visites, par pays de la
 * destination du séjour (trip.destination.countryCode). Valeurs par défaut
 * (DEFAULT_MEAL_TIMES) reprises par rules.js (dayTemplate.lunch,
 * dayTemplate.dinner, dayTemplate.relax, lunchWindow) ; un pays ne précise
 * que ce qui change. Valeurs modifiables ici (pas par app_config).
 *
 * - lunch.start : heure du déjeuner dans le gabarit de journée ;
 * - lunch.window : plage dans laquelle le déjeuner commence, et sur laquelle
 *   l'ouverture du restaurant est vérifiée ; sans elle, rules.lunchWindow
 *   décalée de l'écart entre lunch.start et l'heure par défaut ;
 * - lunch.durationMin : durée conseillée d'un déjeuner au restaurant ;
 * - dinner.start : heure du dîner dans le gabarit, jamais avant
 *   dinner.earliest (heure minimale du dîner dans le pays) ;
 * - visits.relax : heure de la dernière visite (détente) du gabarit. Elle
 *   commence au plus tard à rules.schedule.latestStart.activity (19:00),
 *   donc finit au plus tard vers 20:00.
 * Le plein air suit le déjeuner : décalé d'autant quand le déjeuner est plus
 * tardif que l'heure par défaut.
 */
export const DEFAULT_MEAL_TIMES = Object.freeze({
  lunch: Object.freeze({ start: '12:30', window: Object.freeze({ start: '12:30', end: '14:00' }), durationMin: 75 }),
  dinner: Object.freeze({ start: '19:30', earliest: '19:00' }),
  visits: Object.freeze({ relax: '17:30' })
});

export const COUNTRY_MEAL_TIMES = Object.freeze({
  // Espagne : déjeuner entre 13:30 et 14:30, dîner pas avant 20:30 (fin au
  // plus tard 23:00 : rules.schedule.lateEnd.dinner), visites jusqu'à 20:00.
  ES: { lunch: { start: '14:00', window: { start: '13:30', end: '14:30' }, durationMin: 75 }, dinner: { start: '21:00', earliest: '20:30' }, visits: { relax: '18:30' } },
  GR: { lunch: { start: '14:00' }, dinner: { start: '21:00' } },
  IT: { dinner: { start: '20:00' } },
  PT: { dinner: { start: '20:00' } }
});

/**
 * Horaires des repas d'un pays : valeurs par défaut lues dans rules (qui les
 * tient de DEFAULT_MEAL_TIMES), puis celles du pays.
 * @param {string | undefined} countryCode code ISO, casse indifférente
 * @returns {{ lunch: { start: string, window: { start: string, end: string }, durationMin: number }, dinner: { start: string, earliest: string }, visits: { relax: string } }}
 */
export function mealTimesFor(countryCode, rules) {
  const country = COUNTRY_MEAL_TIMES[String(countryCode ?? '').toUpperCase()] ?? {};
  const lunchStart = country.lunch?.start ?? rules.dayTemplate.lunch;
  const shift = toMinutes(lunchStart) - toMinutes(rules.dayTemplate.lunch);
  const window = country.lunch?.window ?? {
    start: fromMinutes(toMinutes(rules.lunchWindow.start) + shift),
    end: fromMinutes(toMinutes(rules.lunchWindow.end) + shift)
  };
  const earliest = country.dinner?.earliest ?? DEFAULT_MEAL_TIMES.dinner.earliest;
  const dinnerStart = country.dinner?.start ?? rules.dayTemplate.dinner;
  return {
    lunch: { start: lunchStart, window: { ...window }, durationMin: country.lunch?.durationMin ?? rules.durations.restaurant.recommendedMin },
    dinner: { start: toMinutes(dinnerStart) < toMinutes(earliest) ? earliest : dinnerStart, earliest },
    visits: { relax: country.visits?.relax ?? rules.dayTemplate.relax }
  };
}
