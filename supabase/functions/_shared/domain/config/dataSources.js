/**
 * Sources de données de Mon guide, avec leur licence : citées dans l'export
 * PDF (section "Sources des données") et dans le README. Les noms sont des
 * noms propres ; l'usage de chaque source est traduit par l'application
 * (export.sourceUses.<id>).
 *
 * scope : "all" (tous les pays), "fr" (France), "eu" (hors France), "eu-members"
 * (pays de l'Union européenne hors France) ; carOnly : cité seulement pour un
 * séjour en voiture.
 */
export const DATA_SOURCES = Object.freeze([
  { id: 'osm', name: 'OpenStreetMap', holder: '© contributeurs OpenStreetMap', license: 'ODbL 1.0', url: 'https://www.openstreetmap.org/copyright', scope: 'all' },
  { id: 'photon', name: 'Photon (komoot)', holder: 'données © contributeurs OpenStreetMap', license: 'ODbL 1.0', url: 'https://photon.komoot.io', scope: 'all' },
  { id: 'openMeteo', name: 'Open-Meteo', holder: 'Open-Meteo.com', license: 'CC BY 4.0', url: 'https://open-meteo.com', scope: 'all' },
  { id: 'nagerDate', name: 'Nager.Date', holder: 'Nager.Date', license: 'MIT', url: 'https://date.nager.at', scope: 'all' },
  { id: 'ademe', name: 'Base Carbone®', holder: 'ADEME', license: 'Licence Ouverte (Etalab)', url: 'https://base-empreinte.ademe.fr', scope: 'all' },
  { id: 'culture', name: 'Mérimée et Muséofile', holder: 'Ministère de la Culture', license: 'Licence Ouverte (Etalab)', url: 'https://www.data.gouv.fr', scope: 'fr' },
  { id: 'inao', name: 'Aires géographiques des AOC/AOP', holder: 'INAO', license: 'Licence Ouverte (Etalab)', url: 'https://www.data.gouv.fr', scope: 'fr' },
  { id: 'fuelFr', name: 'Prix des carburants', holder: 'Ministère de l’Économie', license: 'Licence Ouverte (Etalab)', url: 'https://www.data.gouv.fr', scope: 'fr', carOnly: true },
  { id: 'wikidata', name: 'Wikidata', holder: 'Wikimedia Foundation', license: 'CC0 1.0', url: 'https://www.wikidata.org', scope: 'eu' },
  { id: 'ember', name: 'Ember, Yearly electricity data', holder: 'Ember', license: 'CC BY 4.0', url: 'https://ember-energy.org', scope: 'eu' },
  { id: 'oilBulletin', name: 'Weekly Oil Bulletin', holder: 'Commission européenne', license: 'Décision 2011/833/UE (réutilisation)', url: 'https://energy.ec.europa.eu', scope: 'eu-members', carOnly: true },
  { id: 'ecb', name: 'Taux de change de référence', holder: 'Banque centrale européenne', license: 'Réutilisation avec mention de la source', url: 'https://www.ecb.europa.eu', scope: 'eu', carOnly: true }
]);

/**
 * Sources utiles pour un séjour (pays de destination et mode de déplacement).
 * @param {string} countryCode
 * @param {string} mode
 * @param {string[]} euMembers codes des pays de l'Union européenne
 */
export function sourcesFor(countryCode, mode, euMembers) {
  const fr = countryCode === 'FR';
  return DATA_SOURCES.filter((s) => {
    if (s.carOnly && mode !== 'car') return false;
    if (s.scope === 'fr') return fr;
    if (s.scope === 'eu') return !fr;
    if (s.scope === 'eu-members') return !fr && euMembers.includes(countryCode);
    return true;
  });
}
