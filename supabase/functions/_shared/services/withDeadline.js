/**
 * Attend une promesse au plus `ms` millisecondes ; au-delà, renvoie `fallback`
 * sans annuler la promesse (elle peut finir en arrière-plan et remplir le
 * cache partagé pour la génération suivante).
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms
 * @param {T} fallback
 * @returns {Promise<{ value: T, timedOut: boolean }>}
 */
export function withDeadline(promise, ms, fallback) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ value: fallback, timedOut: true }), Math.max(0, ms));
  });
  const settled = promise.then(
    (value) => ({ value, timedOut: false }),
    () => ({ value: fallback, timedOut: false, failed: true })
  );
  return Promise.race([settled, timeout]).finally(() => clearTimeout(timer));
}
