/**
 * Facteurs d'émission des carburants routiers, en kg CO2e par litre (amont +
 * combustion), communs à tous les pays (les voitures sont identiques en
 * France et ailleurs).
 * Source : ADEME, Base Carbone® (data.ademe.fr, jeu "base-carboner"),
 * éléments "Valide générique", France continentale, consultés le 2026-09-24 :
 *  - Essence, supercarburant sans plomb (95, 95-E10, 98) : 2,69 (modifié le 2021-06-18)
 *  - Essence E85 : 1,11 (2021-06-18)
 *  - Gazole routier B7 : 3,10 (2021-06-18)
 *  - GPL pour véhicule routier : 1,86 (2014-10-20)
 */
export const CAR_FUEL_KG_CO2E_PER_LITRE = Object.freeze({
  sp95: 2.69,
  sp98: 2.69,
  e10: 2.69,
  e85: 1.11,
  diesel: 3.1,
  lpg: 1.86
});

export const CAR_FACTORS_SOURCE = { name: 'ADEME, Base Carbone', date: '2021-06-18' };
