import { AppError } from '../errors.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Identifiant de séjour d'un corps de requête (uuid, en minuscules). */
export function readTripId(body) {
  if (typeof body?.tripId !== 'string' || !UUID.test(body.tripId)) throw new AppError(400, 'invalid_input', 'tripId: uuid required');
  return body.tripId.toLowerCase();
}
