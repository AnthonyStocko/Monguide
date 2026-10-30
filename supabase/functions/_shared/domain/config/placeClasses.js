/**
 * Classes Wikidata (nature P31, désignation P1435) utilisées par la notoriété
 * et les règles d'exclusion des lieux (scoring/notoriety.js,
 * scoring/exclusions.js). Listes FERMÉES, sans remontée des sous-classes
 * (wdt:P279*), comme les types de musées. Identifiants vérifiés sur
 * wikidata.org le 2026-10-30 (wbgetentities, libellés fr/en, ou natures relevées
 * sur les séjours de référence de scripts/quality).
 * Les seuils (nombres d'articles, scores) sont dans rules.notoriety.
 */

/** Désignations de premier rang (signal secondaire de notoriété). */
export const TOP_DESIGNATIONS = Object.freeze({
  /** patrimoine mondial */
  Q9259: 'world_heritage',
  /** monument historique classé (France) */
  Q10387684: 'top',
  /** bien d'intérêt culturel (Espagne) */
  Q23712: 'top',
  /** Grade I listed building (Angleterre, pays de Galles) */
  Q15700818: 'top',
  /** partie d'un site du patrimoine mondial */
  Q43113623: 'world_heritage',
  /** bien culturel d'intérêt national (Catalogne) */
  Q1019352: 'top',
  /** liste indicative du patrimoine mondial */
  Q1459900: 'tentative'
});

/**
 * Natures trop génériques : un élément d'inventaire de cette seule nature,
 * avec moins de rules.notoriety.exclusion.minSitelinks articles, est écarté.
 */
export const GENERIC_CLASSES = Object.freeze({
  Q41176: 'bâtiment',
  Q3947: 'maison',
  Q11755959: 'immeuble',
  Q11755880: "bâtiment d'habitation",
  Q13402009: "immeuble d'habitation",
  Q1307276: 'maison unifamiliale',
  Q699405: 'logement',
  Q1577547: 'immeuble de rapport',
  Q811979: 'structure architecturale',
  Q1497375: 'ensemble architectural'
});

/**
 * Natures de lieux non visitables (écoles, crèches, bureaux, logements
 * privés, commerces, gares…) : écartés, sauf notoriété élevée
 * (rules.notoriety.exclusion.glanceScore), où ils deviennent un « coup d'œil ».
 */
export const NON_VISITABLE_CLASSES = Object.freeze({
  Q3914: 'école',
  Q126807: 'école maternelle',
  Q364005: 'crèche',
  Q3918: 'université',
  Q1021645: 'immeuble de bureaux',
  Q10882966: "centre d'affaires",
  Q11755880: "bâtiment d'habitation",
  Q13402009: "immeuble d'habitation",
  Q3947: 'maison',
  Q1307276: 'maison unifamiliale',
  Q699405: 'logement',
  Q1577547: 'immeuble de rapport',
  Q83405: 'usine',
  Q213441: 'magasin',
  Q3058833: 'estaminet',
  Q27686: 'hôtel',
  Q16917: 'hôpital',
  Q3917681: 'ambassade',
  Q1220959: 'bâtiment administratif public',
  Q1498804: 'habitat collectif',
  Q3580134: 'collège des jésuites',
  Q455403: 'palace',
  Q11707: 'restaurant',
  Q131734: 'brasserie'
});

/**
 * Natures qui ne sont jamais un lieu de visite, quelle que soit leur
 * notoriété : communes, quartiers et centres historiques (des périmètres, pas
 * des lieux ; parfois sans population dans Wikidata), gares, organisations,
 * événements.
 */
export const NOT_A_PLACE_CLASSES = Object.freeze({
  Q486972: 'établissement humain',
  Q484170: 'commune française',
  Q493522: 'commune de Belgique',
  Q2074737: "municipalité d'Espagne",
  Q33146843: 'municipalité de Catalogne',
  Q747074: "commune d'Italie",
  Q262166: 'commune en Allemagne',
  Q15284: 'municipalité',
  Q515: 'ville',
  Q3957: 'petite ville',
  Q532: 'village',
  Q1549591: 'grande ville',
  Q1637706: "ville de plus d'un million d'habitants",
  Q5119: 'capitale',
  Q123705: 'quartier',
  Q702492: 'aire urbaine',
  Q676050: 'centre historique',
  Q15243209: 'secteur historique',
  Q55488: 'gare ferroviaire',
  Q55678: 'halte ferroviaire',
  Q18543139: 'gare centrale',
  Q55491: 'gare souterraine',
  Q22808403: 'gare ou arrêt de transport en commun souterrain',
  Q928830: 'station de métro',
  Q4830453: 'entreprise',
  Q43229: 'organisation',
  Q1656682: 'événement',
  Q1190554: 'occurrence'
});

/** Natures vues en passant (« coup d'œil ») : statues, fontaines, façades… */
export const GLANCE_CLASSES = Object.freeze({
  Q860861: 'sculpture',
  Q179700: 'statue',
  Q659396: 'statue équestre',
  Q241045: 'buste',
  Q483453: 'fontaine',
  Q183061: 'façade',
  Q245117: 'relief',
  Q557141: 'art public',
  Q170980: 'obélisque',
  Q4817: 'colonne',
  Q5003624: 'mémorial'
});

/** Natures classées comme parc (requête des lieux connus). */
export const PARK_CLASSES = Object.freeze({
  Q22698: 'parc',
  Q22746: 'jardin public',
  Q1107656: 'jardin',
  Q2026833: 'square-jardin',
  Q167346: 'jardin botanique'
});

/**
 * Natures acceptées par la requête des lieux connus sans autre indice
 * d'édifice ou d'œuvre (désignation, architecte, style, créateur) : sites
 * touristiques, aquariums, zoos, parcs d'attractions (avec les musées et
 * les parcs).
 */
export const ATTRACTION_CLASSES = Object.freeze({
  Q570116: 'site touristique',
  Q2281788: 'aquarium public',
  Q43501: 'parc zoologique',
  Q194195: "parc d'attractions"
});

/**
 * États d'usage (P5817) d'un lieu fermé, disparu ou pas encore ouvert :
 * écarté. Valeurs les plus courantes de P5817 relevées le 2026-10-30
 * (requête de comptage sur wikidata.org).
 */
export const CLOSED_STATES = Object.freeze({
  Q11639308: 'désaffecté',
  Q104664889: 'fermé définitivement',
  Q56651571: 'hors service',
  Q63065035: 'abandonné',
  Q56556915: 'démoli ou détruit',
  Q30108381: 'annulé/abandonné',
  Q55570340: 'fermé au public',
  Q55653430: 'temporairement fermé',
  Q811683: 'bâtiment ou structure en projet',
  Q12377751: 'en construction',
  Q110713763: 'construit mais pas encore en fonctionnement',
  Q125582222: 'aboli'
});

/** États d'usage d'un lieu ouvert : ils l'emportent sur une date de fermeture ancienne (lieu rouvert). */
export const OPEN_STATES = Object.freeze({
  Q55654238: 'en fonctionnement',
  Q55570821: 'ouvert au public',
  Q29415466: 'en activité',
  Q109551035: 'en fonctionnement partiel'
});

/**
 * Badges Wikidata d'un lien vers une redirection : l'article ne décrit pas
 * le lieu lui-même (lieu fusionné, renommé ou disparu, ex. le « Museum voor
 * moderne en hedendaagse kunst » de Bruxelles, redirigé vers KANAL).
 */
export const REDIRECT_BADGES = Object.freeze({
  Q70893996: 'lien vers une redirection',
  Q70894304: 'lien intentionnel vers une redirection'
});
