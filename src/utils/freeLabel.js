/**
 * Clé de traduction du nom d'une étape sans lieu : « Soirée libre » pour un
 * dîner (dîner libre, ou aucun restaurant trouvé), « Temps libre » sinon.
 * @param {{ type?: string } | null | undefined} step
 * @returns {string}
 */
export const freeLabelKey = (step) => (step?.type === 'dinner' ? 'generation.freeEvening' : 'generation.freeTime');
