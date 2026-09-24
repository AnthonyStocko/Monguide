import { RULES } from '@domain/config/rules.js';

/**
 * Règles effectives en cours d'utilisation : valeurs embarquées au départ,
 * remplacées par celles du serveur une fois la configuration chargée
 * (services/config.js).
 */
let current = RULES;

export function getRules() {
  return current;
}

/** @param {typeof RULES} rules */
export function setRules(rules) {
  current = rules;
}
