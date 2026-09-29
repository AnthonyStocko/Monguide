/**
 * Progression de la génération envoyée en flux (docs/api.md, generate) :
 * étapes weather, heritage, places, restaurants, planning. Chaque étape passe
 * de "running" à "done" (ou "failed") sur un VRAI événement : fin d'une
 * source de données, jamais une minuterie. Les sources des différentes zones
 * de collecte (destination et hébergements éloignés) sont regroupées : une
 * étape est finie quand toutes ses zones le sont, en échec seulement si
 * toutes ont échoué.
 */
export const GENERATION_STEPS = Object.freeze(['weather', 'heritage', 'places', 'restaurants', 'planning']);

/**
 * @param {{ send: (event: object) => void, zones: number, restaurants: boolean }} options
 */
export function createProgress({ send, zones, restaurants }) {
  const steps = GENERATION_STEPS.filter((s) => restaurants || s !== 'restaurants');
  const expected = { weather: 1, heritage: zones, places: zones, restaurants: zones, planning: 1 };
  const reports = Object.fromEntries(steps.map((s) => [s, []]));
  const finished = new Set();

  const finish = (step, status, extra = {}) => {
    if (finished.has(step) || !steps.includes(step)) return;
    finished.add(step);
    send({ event: 'step', step, status, ...extra });
  };

  return {
    /** Début : liste des étapes, collecte en cours (les sources partent en parallèle). */
    start() {
      send({ event: 'start', steps });
      for (const step of steps) if (step !== 'planning') send({ event: 'step', step, status: 'running' });
    },
    /** Une source d'une zone a répondu. */
    report(step, status) {
      if (finished.has(step) || !reports[step]) return;
      reports[step].push(status);
      if (reports[step].length >= expected[step]) finish(step, reports[step].every((s) => s === 'failed') ? 'failed' : 'done');
    },
    /** Budget de collecte épuisé : les étapes encore en cours sont marquées en échec (délai). */
    timeoutPending() {
      for (const step of steps) if (step !== 'planning' && !finished.has(step)) finish(step, reports[step].some((s) => s === 'done') ? 'done' : 'failed', { message: 'timeout' });
    },
    planningStarted() {
      send({ event: 'step', step: 'planning', status: 'running' });
    },
    planningDone() {
      finish('planning', 'done');
    }
  };
}
