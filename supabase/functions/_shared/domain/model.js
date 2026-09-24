/**
 * Modèle de données de référence de Mon guide. Toutes les phases utilisent
 * exclusivement ces structures ; un champ nouveau est d'abord ajouté ici.
 * Heures "HH:mm" et dates "YYYY-MM-DD" : toujours dans le fuseau du séjour.
 */

/** Version courante du schéma des séjours (voir migrations.js, phase 5). */
export const SCHEMA_VERSION = 1;

/**
 * @typedef {object} PlaceFood Renseigné uniquement pour les restaurants.
 * @property {string[]} [cuisine] valeurs OSM "cuisine" (ex. ["regional", "pizza"])
 * @property {boolean} regional cuisine régionale (rules.places.regionalCuisines)
 * @property {string} [openingHours] syntaxe OSM opening_hours
 * @property {'yes' | 'limited' | 'no'} [wheelchair]
 * @property {boolean} [vegetarian] menu végétarien ou végétalien
 * @property {string} [phone]
 * @property {string} [website]
 */

/**
 * @typedef {object} Place Lieu normalisé, quelle que soit sa source.
 * @property {string} id identifiant stable préfixé par la source (ex. "merimee:PA00118092", "osm:node/123")
 * @property {string} name
 * @property {PlaceCategory} category
 * @property {number} lat
 * @property {number} lon
 * @property {string} source nom de la source (ex. "monuments", "museums", "osm")
 * @property {boolean} certified lieu labellisé par une source officielle
 * @property {Certification} [certification] code du label, traduit par l'application
 * @property {string} [wikidata] identifiant Wikidata (ex. "Q1234") : deux lieux de même identifiant sont un seul lieu
 * @property {boolean | null} indoor true intérieur, false extérieur, null inconnu (traité comme extérieur)
 * @property {string} [description]
 * @property {string} [url]
 * @property {PlaceFood} [food]
 */

/**
 * @typedef {'monument_historique' | 'musee_de_france' | 'protected_heritage' | 'referenced_museum'} Certification
 * France : Mérimée, Muséofile ; autres pays : Wikidata (ou OpenStreetMap en repli).
 */

/** @type {readonly Certification[]} */
export const CERTIFICATIONS = Object.freeze(['monument_historique', 'musee_de_france', 'protected_heritage', 'referenced_museum']);

/**
 * @typedef {'museum' | 'monument' | 'restaurant' | 'market' | 'farm' | 'park' | 'nature' | 'viewpoint' | 'small_heritage'} PlaceCategory
 */

/** @type {readonly PlaceCategory[]} */
export const PLACE_CATEGORIES = Object.freeze([
  'museum',
  'monument',
  'restaurant',
  'market',
  'farm',
  'park',
  'nature',
  'viewpoint',
  'small_heritage'
]);

/** Carburants possibles d'une voiture (Trip.fuelType), codes communs aux prix et aux facteurs CO2. */
export const FUEL_TYPES = Object.freeze(['sp95', 'sp98', 'e10', 'e85', 'diesel', 'lpg']);

/** Modes de déplacement sur place (Trip.mode). */
export const TRAVEL_MODES = Object.freeze(['walk', 'transit', 'bike', 'car']);

/** Profils d'exploration (Trip.profile). */
export const PROFILES = Object.freeze(['certified', 'balanced', 'explorer']);

/** Choix de la pause déjeuner (Trip.lunch). */
export const LUNCH_OPTIONS = Object.freeze(['market', 'restaurant', 'both']);

/**
 * @typedef {object} Lodging
 * @property {string} id
 * @property {string} [name]
 * @property {string} address
 * @property {number} lat
 * @property {number} lon
 * @property {string[]} nights dates "YYYY-MM-DD"
 */

/**
 * @typedef {object} Step
 * @property {string} id
 * @property {'culture' | 'lunch' | 'outdoor' | 'relax' | 'personal'} type
 * @property {string} start "HH:mm"
 * @property {string} end "HH:mm"
 * @property {Place} [place]
 * @property {string} [title]
 * @property {string} [note]
 * @property {boolean | null} indoor
 * @property {'planned' | 'done' | 'skipped'} status
 * @property {string} [completedAt] "HH:mm"
 * @property {boolean} customTime
 * @property {boolean} locked
 * @property {number} [travelFromPreviousMin]
 * @property {string[]} badges codes STEP_BADGES, traduits par l'application
 * @property {string[]} [conflicts]
 * @property {string[]} [specialties] appellations locales (AOC/AOP) associées à une pause gourmande
 */

/**
 * Badges d'une étape : adaptée à la météo, horaires non confirmés, information
 * (végétarien, fauteuil) non renseignée, temps libre (aucun lieu trouvé).
 */
export const STEP_BADGES = Object.freeze(['weather_adapted', 'hours_unconfirmed', 'info_missing', 'free_time']);

/**
 * @typedef {object} Day
 * @property {string} date "YYYY-MM-DD"
 * @property {string} [startLodgingId]
 * @property {string} [endLodgingId]
 * @property {{ time: string, travelMin: number }} [departure]
 * @property {number} [returnTravelMin]
 * @property {boolean} weatherAvailable
 * @property {Record<string, number>} [weather] heure "HH" -> probabilité de pluie en %
 * @property {string} [holiday]
 * @property {Step[]} steps
 */

/**
 * @typedef {object} Trip
 * @property {number} schemaVersion
 * @property {string} id uuid
 * @property {string} title
 * @property {string} createdAt ISO
 * @property {string} updatedAt ISO
 * @property {boolean} deleted
 * @property {{ name: string, countryCode: string, lat: number, lon: number, radiusKm: number }} destination
 * @property {string} timezone IANA
 * @property {string} currency ISO 4217
 * @property {string} startDate
 * @property {string} endDate
 * @property {number} travelers
 * @property {'walk' | 'transit' | 'bike' | 'car'} mode
 * @property {string} [fuelType] voir FUEL_TYPES (voiture uniquement)
 * @property {number} [fuelConsumption] L/100 km (défaut rules.fuel.defaultConsumptionL100)
 * @property {'certified' | 'balanced' | 'explorer'} profile
 * @property {'market' | 'restaurant' | 'both'} lunch
 * @property {{ vegetarian: boolean, wheelchair: boolean }} prefs
 * @property {Lodging[]} lodgings
 * @property {Day[]} days
 * @property {Place[]} candidates au plus rules.places.maxCandidates
 * @property {{ totalKgCo2e: number, byDay: number[], byMode: Record<'walk' | 'transit' | 'bike' | 'car', number>, distanceKm: number }} [carbon]
 *   émissions estimées des déplacements (mode choisi, par jour, et comparaison des 4 modes)
 * @property {{ amount: number, currency: string }} [fuelCost]
 */

const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);
const WHEELCHAIR = ['yes', 'limited', 'no'];

/**
 * Vérifie qu'un objet respecte le format Place (champs obligatoires et types).
 * @param {unknown} place
 * @returns {place is Place}
 */
export function isPlace(place) {
  if (!place || typeof place !== 'object') return false;
  const p = /** @type {Record<string, any>} */ (place);
  if (typeof p.id !== 'string' || !p.id) return false;
  if (typeof p.name !== 'string' || !p.name.trim()) return false;
  if (!PLACE_CATEGORIES.includes(p.category)) return false;
  if (!isFiniteNumber(p.lat) || p.lat < -90 || p.lat > 90) return false;
  if (!isFiniteNumber(p.lon) || p.lon < -180 || p.lon > 180) return false;
  if (typeof p.source !== 'string' || typeof p.certified !== 'boolean') return false;
  if (!(p.indoor === null || typeof p.indoor === 'boolean')) return false;
  if (p.certification !== undefined && !CERTIFICATIONS.includes(p.certification)) return false;
  if (p.wikidata !== undefined && !/^Q\d+$/.test(p.wikidata)) return false;
  if (p.food !== undefined) {
    if (!p.food || typeof p.food.regional !== 'boolean') return false;
    if (p.food.wheelchair !== undefined && !WHEELCHAIR.includes(p.food.wheelchair)) return false;
    if (p.food.cuisine !== undefined && !Array.isArray(p.food.cuisine)) return false;
  }
  return true;
}
