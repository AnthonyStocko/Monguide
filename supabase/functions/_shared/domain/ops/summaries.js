import { stepName } from '../stepTiming.js';

/**
 * Résumés en français des opérations, pour l'historique (table
 * trip_changes). Sans le nom de l'auteur : l'écran « Modifications » ajoute
 * son prénom actuel devant (« Paul a déplacé « Dîner » à 20:00 (samedi) »),
 * ou « Ancien participant » si son compte a été supprimé.
 */

const WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

const TYPE_LABELS = { culture: 'Visite', lunch: 'Déjeuner', outdoor: 'Balade', relax: 'Pause', dinner: 'Dîner', personal: 'Étape personnelle' };

/**
 * Jour de la semaine d'une date du séjour ("YYYY-MM-DD", déjà dans le fuseau
 * du séjour) : calcul en UTC, indépendant du fuseau de l'appareil ou du serveur.
 * @param {string} date
 */
export function weekday(date) {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return Number.isInteger(day) ? WEEKDAYS[day] : date;
}

/** Nom affiché d'une étape (lieu, titre, sinon type ; dîner sans lieu : « Soirée libre »). */
export function stepLabel(step) {
  const name = stepName(step);
  if (name) return name;
  if (step.type === 'dinner') return 'Soirée libre';
  return TYPE_LABELS[step.type] ?? 'Étape';
}

const q = (text) => `« ${text} »`;
const lodgingLabel = (l) => l.name || l.address || 'Hébergement';

export const summaries = {
  createTrip: () => 'a créé le séjour',
  renameTrip: ({ title }) => `a renommé le séjour en ${q(title)}`,
  addStep: ({ step, date }) => `a ajouté ${q(stepLabel(step))} (${weekday(date)})`,
  removeStep: ({ step, date }) => `a supprimé ${q(stepLabel(step))} (${weekday(date)})`,
  moveStep: ({ step, fromDate, toDate, start, timeChanged }) => {
    if (fromDate !== toDate) return `a déplacé ${q(stepLabel(step))} au ${weekday(toDate)} à ${start}`;
    return timeChanged ? `a déplacé ${q(stepLabel(step))} à ${start} (${weekday(toDate)})` : `a déplacé ${q(stepLabel(step))} (${weekday(toDate)})`;
  },
  setStepTime: ({ step, date, start, end }) => `a changé l'horaire de ${q(stepLabel(step))} : ${start}–${end} (${weekday(date)})`,
  replaceStep: ({ before, after, date }) => {
    if (!before.place && after.place) return `a choisi ${q(stepLabel(after))} (${weekday(date)})`;
    return `a remplacé ${q(stepLabel(before))} par ${q(stepLabel(after))} (${weekday(date)})`;
  },
  setStepDone: ({ step, date, status }) =>
    status === 'done'
      ? `a validé ${q(stepLabel(step))} (${weekday(date)})`
      : status === 'skipped'
        ? `a passé ${q(stepLabel(step))} (${weekday(date)})`
        : `a remis ${q(stepLabel(step))} à faire (${weekday(date)})`,
  updateStep: ({ step, date }) => `a modifié ${q(stepLabel(step))} (${weekday(date)})`,
  setLodging: ({ lodging, added }) => `${added ? "a ajouté l'hébergement" : "a modifié l'hébergement"} ${q(lodgingLabel(lodging))}`,
  removeLodging: ({ lodging }) => `a supprimé l'hébergement ${q(lodgingLabel(lodging))}`,
  switchReview: ({ to }) => (to === 'original' ? "a affiché la version d'origine du planning" : "a affiché la version relue par l'assistant")
};

/** Longueur maximale d'un résumé (contrainte de trip_changes.summary). */
export const SUMMARY_MAX = 280;

/**
 * Résumé d'un lot d'opérations (une ligne de l'historique par appel) : les
 * résumés à la suite, coupés à SUMMARY_MAX caractères.
 * @param {string[]} texts
 * @returns {string | null}
 */
export function batchSummary(texts) {
  if (!texts.length) return null;
  const text = texts.join(' ; ');
  return text.length <= SUMMARY_MAX ? text : `${text.slice(0, SUMMARY_MAX - 1)}…`;
}
