import { AppError } from '../../errors.js';
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
  // Facteurs carbone ADEME : ajoutés en phase 4.
  co2Factors: async () => {
    throw new AppError(501, 'not_implemented', 'co2Factors: phase 4');
  },
  certificationLabels: () => ['monument_historique', 'musee_de_france']
};

export default fr;
