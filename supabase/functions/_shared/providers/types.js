/**
 * Interface commune des fournisseurs de données par pays. Chaque pays pris en
 * charge est servi par un fournisseur (domain/countries.js : "fr" pour la
 * France, "eu" pour les autres pays en phase 2 bis). Seul le registre
 * (providers/index.js) sait quel fournisseur répond pour un pays.
 *
 * Les méthodes de collecte ne lèvent jamais d'exception : elles renvoient des
 * SourceOutcome (services/sourceRunner.js) portant l'état de chaque source
 * ("ok", "cache" ou "failed") et, sauf échec, ses données.
 */

/**
 * @typedef {{ lat: number, lon: number }} Point Position arrondie à 0,01°.
 */

/**
 * @typedef {object} ProviderContext
 * @property {any} rules règles effectives (domain/config/rules.js + app_config)
 * @property {'fr' | 'en'} lang langue de l'interface
 * @property {{ lookup: Function, set: Function }} cache cache partagé (api_cache)
 */

/**
 * @typedef {object} Appellation
 * @property {string} name nom de l'appellation (ex. "Beaujolais")
 * @property {boolean} local true si elle couvre la commune de destination
 */

/**
 * @typedef {object} FuelPrices
 * @property {string} currency ISO 4217
 * @property {number} stationCount stations dans le rayon
 * @property {Record<string, { average: number, stations: number }>} prices par carburant
 *   (codes : diesel, sp95, sp98, e10, e85, lpg)
 */

/**
 * @typedef {object} CountryProvider
 * @property {string} code identifiant du fournisseur ("fr", "eu")
 * @property {(point: Point, radiusKm: number, ctx: ProviderContext) => Promise<import('../services/sourceRunner.js').SourceOutcome<import('../domain/model.js').Place[]>[]>} heritage
 *   patrimoine certifié (monuments, musées) dans le rayon
 * @property {(point: Point, ctx: ProviderContext) => Promise<import('../services/sourceRunner.js').SourceOutcome<Appellation[]>>} terroir
 *   produits du terroir (appellations) de la commune et des communes voisines
 * @property {(point: Point, radiusKm: number, ctx: ProviderContext) => Promise<import('../services/sourceRunner.js').SourceOutcome<FuelPrices>>} fuel
 *   prix moyen des carburants dans le rayon
 * @property {() => Promise<unknown>} co2Factors facteurs d'émission carbone (phase 4)
 * @property {() => string[]} certificationLabels codes des labels de certification, traduits par l'application
 */

export {};
