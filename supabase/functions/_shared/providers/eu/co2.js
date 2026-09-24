import { CAR_FACTORS_SOURCE, CAR_FUEL_KG_CO2E_PER_LITRE } from '../carFactors.js';

/**
 * Facteurs d'émission hors de France.
 *
 * Voiture : facteurs par carburant identiques à la France (carFactors.js).
 *
 * Transports en commun : facteur propre à chaque pays, car il dépend de la
 * production d'électricité. Intensité carbone de l'électricité par pays :
 * Ember, "Yearly electricity data" (fichier yearly_full_release_long_format,
 * variable "CO2 intensity", gCO2/kWh), téléchargé le 2026-09-24, dernière
 * année disponible (2025, sauf Islande : 2024). Liechtenstein absent : moyenne
 * de l'UE.
 */
export const ELECTRICITY_G_CO2_PER_KWH = Object.freeze({
  AT: { gPerKwh: 117, year: 2025 },
  BE: { gPerKwh: 109, year: 2025 },
  BG: { gPerKwh: 275, year: 2025 },
  CH: { gPerKwh: 39, year: 2025 },
  CY: { gPerKwh: 489, year: 2025 },
  CZ: { gPerKwh: 401, year: 2025 },
  DE: { gPerKwh: 330, year: 2025 },
  DK: { gPerKwh: 100, year: 2025 },
  EE: { gPerKwh: 317, year: 2025 },
  ES: { gPerKwh: 154, year: 2025 },
  FI: { gPerKwh: 57, year: 2025 },
  FR: { gPerKwh: 41, year: 2025 },
  GB: { gPerKwh: 217, year: 2025 },
  GR: { gPerKwh: 324, year: 2025 },
  HR: { gPerKwh: 159, year: 2025 },
  HU: { gPerKwh: 163, year: 2025 },
  IE: { gPerKwh: 256, year: 2025 },
  IS: { gPerKwh: 28, year: 2024 },
  IT: { gPerKwh: 285, year: 2025 },
  LT: { gPerKwh: 139, year: 2025 },
  LU: { gPerKwh: 123, year: 2025 },
  LV: { gPerKwh: 134, year: 2025 },
  MT: { gPerKwh: 484, year: 2025 },
  NL: { gPerKwh: 254, year: 2025 },
  NO: { gPerKwh: 28, year: 2025 },
  PL: { gPerKwh: 591, year: 2025 },
  PT: { gPerKwh: 128, year: 2025 },
  RO: { gPerKwh: 260, year: 2025 },
  SE: { gPerKwh: 35, year: 2025 },
  SI: { gPerKwh: 183, year: 2025 },
  SK: { gPerKwh: 95, year: 2025 }
});

/** Moyenne de l'UE (Ember, 2025), pour un pays absent de la liste. */
export const EU_AVERAGE_G_CO2_PER_KWH = { gPerKwh: 209, year: 2025 };

/**
 * Énergie électrique par passager-kilomètre des transports en commun urbains
 * (métro, tramway, train), traction et auxiliaires. Proposition, À VÉRIFIER
 * lors du calcul carbone (phase 4).
 */
export const TRANSIT_KWH_PER_PKM = 0.1;

/**
 * @param {string} countryCode
 * @returns {{ car: Record<string, number>, transitKgPerPkm: number, electricity: { gPerKwh: number, year: number, euAverage: boolean }, sources: object }}
 */
export function co2FactorsFor(countryCode) {
  const own = ELECTRICITY_G_CO2_PER_KWH[countryCode?.toUpperCase()];
  const electricity = own ?? EU_AVERAGE_G_CO2_PER_KWH;
  return {
    car: { ...CAR_FUEL_KG_CO2E_PER_LITRE },
    transitKgPerPkm: Math.round(electricity.gPerKwh * TRANSIT_KWH_PER_PKM) / 1000,
    electricity: { ...electricity, euAverage: !own },
    sources: { car: CAR_FACTORS_SOURCE, electricity: { name: 'Ember, Yearly electricity data', date: `${electricity.year}` } }
  };
}
