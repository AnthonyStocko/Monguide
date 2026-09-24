/**
 * Prix des carburants des pays hors UE (non couverts par le Bulletin
 * pétrolier) : valeurs fixes, avec leur source et leur date, affichées comme
 * "estimation". À mettre à jour à la main.
 *
 * Suisse, Liechtenstein et Islande : aucune source officielle vérifiée à ce
 * jour ; aucun prix n'est inventé, le prix est alors indisponible.
 */
export const FUEL_ESTIMATES = Object.freeze({
  GB: {
    currency: 'GBP',
    date: '2026-09-21',
    source: 'DESNZ, Weekly road fuel prices (gov.uk)',
    // pence par litre -> livres par litre (ULSP = sans plomb, ULSD = gazole)
    prices: { sp95: 1.7201, diesel: 1.9553 }
  },
  NO: {
    currency: 'NOK',
    date: '2026-08',
    source: 'Statistics Norway (SSB), table 09654',
    prices: { sp95: 19.42, diesel: 21.48 }
  }
});
