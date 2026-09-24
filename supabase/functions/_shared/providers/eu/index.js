import { co2FactorsFor } from './co2.js';
import { fuel } from './fuel.js';
import { heritage } from './heritage.js';
import { terroir } from './terroir.js';

/**
 * Fournisseur "eu" : pays pris en charge hors de France (UE, Royaume-Uni,
 * Suisse, Norvège, Islande, Liechtenstein).
 * @type {import('../types.js').CountryProvider}
 */
const eu = {
  code: 'eu',
  heritage,
  terroir,
  fuel,
  co2Factors: async (countryCode) => co2FactorsFor(countryCode),
  certificationLabels: () => ['protected_heritage', 'referenced_museum']
};

export default eu;
