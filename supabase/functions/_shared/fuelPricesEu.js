import { getAdminClient } from './supabaseAdmin.js';

/**
 * Accès à la table fuel_prices_eu (prix du Bulletin pétrolier par pays),
 * réservée aux Edge Functions (RLS sans règle d'accès).
 */
export const fuelPricesEu = {
  /**
   * Lignes des deux derniers bulletins d'un pays (le fournisseur garde le plus récent).
   * @param {string} countryCode
   */
  async latest(countryCode) {
    const { data, error } = await getAdminClient()
      .from('fuel_prices_eu')
      .select('country_code, fuel, price, currency, bulletin_date')
      .eq('country_code', countryCode)
      .order('bulletin_date', { ascending: false })
      .limit(12);
    if (error) throw new Error(`fuel_prices_eu: ${error.code}`);
    return data;
  },

  /**
   * Enregistre un bulletin (remplace les lignes existantes du même bulletin).
   * @param {object[]} rows voir providers/eu/oilBulletin.js, toFuelRows
   */
  async save(rows) {
    const { error } = await getAdminClient().from('fuel_prices_eu').upsert(rows, { onConflict: 'country_code,fuel,bulletin_date' });
    if (error) throw new Error(`fuel_prices_eu: ${error.code}`);
  }
};
