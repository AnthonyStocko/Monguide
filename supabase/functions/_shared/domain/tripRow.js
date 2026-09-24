/**
 * Correspondance entre un séjour (Trip) et une ligne de la table trips :
 * colonne planning = days ; colonnes propres pour l'identifiant, le titre,
 * la destination, les dates, les horodatages et la suppression logique ;
 * colonne params = tout le reste du séjour. user_id est fixé par la base
 * (auth.uid()), jamais par l'application.
 */

const OWN_COLUMNS = ['id', 'title', 'destination', 'startDate', 'endDate', 'createdAt', 'updatedAt', 'deleted', 'days', 'userId'];

/**
 * Un séjour supprimé n'est envoyé que comme marqueur de suppression : son
 * contenu (titre, destination, adresses, planning) est effacé du serveur.
 * @param {import('./model.js').Trip} trip
 * @returns {object} ligne de la table trips (sans user_id)
 */
export function tripToRow(trip) {
  if (trip.deleted) {
    return {
      id: trip.id,
      title: '',
      destination: {},
      start_date: trip.startDate,
      end_date: trip.endDate,
      params: {},
      planning: [],
      created_at: trip.createdAt,
      updated_at: trip.updatedAt,
      deleted: true
    };
  }
  const params = Object.fromEntries(Object.entries(trip).filter(([k]) => !OWN_COLUMNS.includes(k)));
  return {
    id: trip.id,
    title: trip.title,
    destination: trip.destination,
    start_date: trip.startDate,
    end_date: trip.endDate,
    params,
    planning: trip.days,
    created_at: trip.createdAt,
    updated_at: trip.updatedAt,
    deleted: Boolean(trip.deleted)
  };
}

/**
 * @param {object} row ligne de la table trips
 * @returns {import('./model.js').Trip}
 */
export function rowToTrip(row) {
  return {
    ...row.params,
    id: row.id,
    title: row.title,
    destination: row.destination,
    startDate: row.start_date,
    endDate: row.end_date,
    days: row.planning ?? [],
    createdAt: row.created_at,
    // Horodatage normalisé (la base renvoie "+00:00" au lieu de "Z").
    updatedAt: new Date(row.updated_at).toISOString(),
    deleted: Boolean(row.deleted)
  };
}
