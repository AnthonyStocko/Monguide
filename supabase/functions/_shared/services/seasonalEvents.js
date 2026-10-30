import { log } from '../log.js';
import { getAdminClient } from '../supabaseAdmin.js';

/**
 * Lignes de la table seasonal_events qui chevauchent les dates d'un séjour
 * (lecture à chaque génération, sans cache : un événement ajouté ou supprimé
 * compte dès le séjour suivant). Un échec ne bloque jamais la génération :
 * liste vide, journalisé.
 * @param {{ startDate: string, endDate: string }} trip
 * @returns {Promise<object[]>}
 */
export async function loadSeasonalEvents({ startDate, endDate }) {
  try {
    const { data, error } = await getAdminClient()
      .from('seasonal_events')
      .select('id, name, city, lat, lon, start_date, end_date, opening_hours, type, duration_min, url')
      .lte('start_date', endDate)
      .gte('end_date', startDate)
      .limit(200);
    if (error) throw new Error(`seasonal_events: ${error.code}`);
    return data ?? [];
  } catch (err) {
    log('warn', 'seasonal_events_failed', { message: String(err?.message ?? err) });
    return [];
  }
}
