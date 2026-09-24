import { toMinutes } from './time.js';

/**
 * Étapes personnelles (ex. "Visite d'un proche") : validation du formulaire
 * et construction de l'étape. Une étape personnelle est verrouillée (point
 * fixe : jamais remplacée, déplacée ni permutée pour la météo par
 * l'application) et a un horaire personnalisé.
 */

/** Suggestions de titre, traduites par l'application (personal.suggestions.<code>). */
export const PERSONAL_SUGGESTIONS = Object.freeze(['relative', 'appointment', 'friendsMeal', 'break']);

/**
 * @param {{ title: string, start: string, end: string }} values
 * @returns {Record<string, string>} erreurs par champ : title (required, tooLong), end (beforeStart)
 */
export function validatePersonalStep({ title, start, end }, rules) {
  const errors = {};
  const text = (title ?? '').trim();
  if (!text) errors.title = 'required';
  else if (text.length > rules.personalStep.titleMaxLength) errors.title = 'tooLong';
  if (toMinutes(end) <= toMinutes(start)) errors.end = 'beforeStart';
  return errors;
}

/**
 * @param {{
 *   id: string, title: string, note?: string, start: string, end: string, indoor: boolean,
 *   location?: { address: string, lat: number, lon: number, name?: string } | null
 * }} values
 * @returns {object} étape (Step)
 */
export function makePersonalStep({ id, title, note, start, end, indoor, location }) {
  const step = {
    id,
    type: 'personal',
    category: 'personal',
    source: 'user',
    title: title.trim(),
    start,
    end,
    indoor,
    status: 'planned',
    customTime: true,
    locked: true,
    badges: []
  };
  const text = note?.trim();
  if (text) step.note = text;
  if (location) {
    step.place = {
      id: `user:${id}`,
      name: location.name ?? step.title,
      address: location.address,
      lat: location.lat,
      lon: location.lon,
      category: 'personal',
      source: 'user',
      certified: false,
      indoor
    };
  }
  return step;
}
