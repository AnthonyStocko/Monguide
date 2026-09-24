/**
 * Bilan carbone et coût carburant des déplacements du séjour (estimations).
 * Facteurs fournis par le fournisseur du pays (co2Factors) :
 *  - voiture : kg CO2e par litre de carburant (ADEME), × consommation ;
 *  - transports en commun : kg CO2e par passager-km, × nombre de voyageurs ;
 *  - à pied, vélo : 0.
 * Une voiture émet la même chose quel que soit le nombre de passagers.
 */

// Précision au gramme : les trajets courts en transports en commun ne doivent pas s'arrondir à zéro.
const round = (n, digits = 3) => Math.round(n * 10 ** digits) / 10 ** digits;

/**
 * Émissions (kg CO2e) d'une distance selon le mode.
 * @param {number} km distance estimée par la route
 * @param {'walk' | 'transit' | 'bike' | 'car'} mode
 * @param {{ car: Record<string, number>, transitKgPerPkm: number }} factors
 * @param {{ travelers: number, fuelType: string, consumptionL100: number }} trip
 */
export function emissionsKg(km, mode, factors, { travelers, fuelType, consumptionL100 }) {
  if (mode === 'car') return km * (consumptionL100 / 100) * (factors.car[fuelType] ?? factors.car.sp95);
  if (mode === 'transit') return km * factors.transitKgPerPkm * travelers;
  return 0;
}

/**
 * @param {number[][]} legsKmByDay distances de chaque trajet, par jour (départ et retour compris)
 * @param {{ mode: string, travelers: number, fuelType?: string, fuelConsumption?: number }} trip
 * @param {{ car: Record<string, number>, transitKgPerPkm: number } | null} factors
 * @returns {{ totalKgCo2e: number, byDay: number[], byMode: Record<string, number>, distanceKm: number } | undefined}
 */
export function computeCarbon(legsKmByDay, trip, factors, rules) {
  if (!factors) return undefined;
  const opts = {
    travelers: trip.travelers,
    fuelType: trip.fuelType ?? 'sp95',
    consumptionL100: trip.fuelConsumption ?? rules.fuel.defaultConsumptionL100
  };
  const kmByDay = legsKmByDay.map((legs) => legs.reduce((a, b) => a + b, 0));
  const totalKm = kmByDay.reduce((a, b) => a + b, 0);
  const byDay = kmByDay.map((km) => round(emissionsKg(km, trip.mode, factors, opts)));
  const byMode = Object.fromEntries(['walk', 'transit', 'bike', 'car'].map((m) => [m, round(emissionsKg(totalKm, m, factors, opts))]));
  return { totalKgCo2e: round(byDay.reduce((a, b) => a + b, 0)), byDay, byMode, distanceKm: round(totalKm) };
}

/**
 * Coût carburant estimé (voiture), dans la monnaie des prix fournis.
 * @param {number} distanceKm
 * @param {{ fuelType: string, fuelConsumption?: number }} trip
 * @param {{ currency: string, prices: Record<string, { average: number }> } | null} fuel
 * @returns {{ amount: number, currency: string } | undefined}
 */
export function computeFuelCost(distanceKm, trip, fuel, rules) {
  const price = fuel?.prices?.[trip.fuelType]?.average;
  if (!price) return undefined;
  const litres = distanceKm * ((trip.fuelConsumption ?? rules.fuel.defaultConsumptionL100) / 100);
  return { amount: round(litres * price, 2), currency: fuel.currency };
}
