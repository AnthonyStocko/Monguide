import { CAR_FACTORS_SOURCE, CAR_FUEL_KG_CO2E_PER_LITRE } from '../carFactors.js';

/**
 * Facteurs d'émission pour la France (ADEME, Base Carbone®, data.ademe.fr,
 * jeu "base-carboner", éléments "Valide générique", consultés le 2026-09-24).
 *
 * Voiture : facteurs par carburant (carFactors.js).
 *
 * Transports en commun : "Métro, tramway, trolleybus", agglomération de
 * 100 000 à 250 000 habitants (2018, modifié le 2021-12-15) :
 * 0,00503 kg CO2e par passager-km. Choisi pour rester cohérent avec les
 * autres pays (facteur fondé sur l'électricité). À titre de comparaison, un
 * autobus moyen (agglomération de 100 000 à 250 000 habitants) vaut
 * 0,147 kg CO2e par passager-km.
 */
export const FR_TRANSIT_KG_PER_PKM = 0.00503;

export function co2FactorsFr() {
  return {
    car: { ...CAR_FUEL_KG_CO2E_PER_LITRE },
    transitKgPerPkm: FR_TRANSIT_KG_PER_PKM,
    sources: {
      car: CAR_FACTORS_SOURCE,
      transit: { name: 'ADEME, Base Carbone (métro, tramway, trolleybus, agglomération de 100 000 à 250 000 habitants)', date: '2021-12-15' }
    }
  };
}
