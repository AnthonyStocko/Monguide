/**
 * Lignes du bilan carbone : d'abord le trajet réellement prévu (mode du
 * séjour), puis les comparaisons « Si vous aviez pris… » (transports en
 * commun, voiture, puis à pied et à vélo). Partagé par l'écran et l'export
 * PDF.
 * @param {{ mode: string, carbon: { byMode: Record<string, number> } }} trip
 * @returns {{ mode: string, actual: boolean, kg: number, key: string }[]} key : clé de traduction du libellé
 */
export function carbonLines(trip) {
  const order = ['transit', 'car', 'walk', 'bike'].filter((m) => m !== trip.mode);
  return [trip.mode, ...order]
    .filter((m) => typeof trip.carbon?.byMode?.[m] === 'number')
    .map((m) => ({ mode: m, actual: m === trip.mode, kg: trip.carbon.byMode[m], key: m === trip.mode ? 'generation.carbonActual' : `generation.carbonIf.${m}` }));
}
