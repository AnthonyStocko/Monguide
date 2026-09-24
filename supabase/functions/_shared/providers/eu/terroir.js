/**
 * Produits du terroir hors de France.
 *
 * Vérification du 2026-09-24 : le registre européen eAmbrosia a une API
 * publique (webgate.ec.europa.eu/eambrosia-api/api/v1/geographical-indications,
 * JSON, sans clé), mais elle renvoie le registre entier (~4 000 indications,
 * 6,6 Mo) sans filtre efficace, et chaque indication ne porte que son PAYS,
 * jamais sa région ni son aire géographique. Impossible donc de renvoyer les
 * AOP/IGP de la région de destination sans deviner : on renvoie une liste
 * vide (l'étape gourmande s'affiche sans la ligne "Spécialité locale"). Aucune
 * appellation n'est jamais inventée.
 *
 * @returns {Promise<import('../../services/sourceRunner.js').SourceOutcome<import('../types.js').Appellation[]>>}
 */
export async function terroir() {
  return { name: 'terroir', status: 'ok', message: 'no_regional_data', data: [] };
}
