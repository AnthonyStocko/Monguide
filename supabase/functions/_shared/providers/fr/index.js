import { co2FactorsFr } from './co2.js';
import { fuel } from './fuel.js';
import { heritage } from './heritage.js';
import { terroir } from './terroir.js';

/**
 * Fournisseur "fr" : données propres à la France.
 * @type {import('../types.js').CountryProvider}
 */
const fr = {
  code: 'fr',
  heritage,
  terroir,
  fuel,
  co2Factors: async () => co2FactorsFr(),
  certificationLabels: () => ['monument_historique', 'musee_de_france']
};

export default fr;
