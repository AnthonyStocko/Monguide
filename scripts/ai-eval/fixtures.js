// Jeu de 12 séjours types pour évaluer la relecture par l'assistant IA (docs/ai-review.md, Bloc G).
// Lieux de démonstration générés de façon déterministe (graine fixe) autour de vraies
// destinations : mêmes séjours à chaque évaluation, sans réseau ni données personnelles.
import { destinationPoint } from '../../supabase/functions/_shared/domain/geo.js';

/**
 * @typedef {object} EvalFixture
 * @property {string} id
 * @property {string} label
 * @property {{ name: string, countryCode: string, lat: number, lon: number, radiusKm: number }} destination
 * @property {string} timezone
 * @property {string} startDate
 * @property {number} days
 * @property {'walk' | 'transit' | 'bike' | 'car'} mode
 * @property {'certified' | 'balanced' | 'explorer'} profile
 * @property {'market' | 'restaurant' | 'both'} lunch
 * @property {string} [wishes] texte « Vos envies »
 * @property {Record<number, number | { am: number, pm: number }>} [rain] pluie (%) par jour (index) : toute la journée ou matin / après-midi
 * @property {number} density 1 = ville, moins = village (moins de lieux)
 */

/** @type {readonly EvalFixture[]} */
export const EVAL_FIXTURES = Object.freeze([
  { id: 'paris', label: 'Paris, 3 j, à pied, patrimoine certifié', destination: { name: 'Paris', countryCode: 'FR', lat: 48.8566, lon: 2.3522, radiusKm: 5 }, timezone: 'Europe/Paris', startDate: '2026-11-05', days: 3, mode: 'walk', profile: 'certified', lunch: 'restaurant', density: 1.4 },
  { id: 'lyon', label: 'Lyon, 2 j, transports, pluie', destination: { name: 'Lyon', countryCode: 'FR', lat: 45.764, lon: 4.8357, radiusKm: 10 }, timezone: 'Europe/Paris', startDate: '2026-11-12', days: 2, mode: 'transit', profile: 'balanced', lunch: 'both', wishes: 'Peu de musées', rain: { 1: 85 }, density: 1.1 },
  { id: 'villefranche', label: 'Villefranche-sur-Saône, 3 j, voiture', destination: { name: 'Villefranche-sur-Saône', countryCode: 'FR', lat: 45.9865, lon: 4.7266, radiusKm: 20 }, timezone: 'Europe/Paris', startDate: '2026-10-16', days: 3, mode: 'car', profile: 'balanced', lunch: 'restaurant', wishes: 'On adore le vin', density: 0.8 },
  { id: 'annecy', label: 'Annecy, 2 j, vélo, pluie l\'après-midi', destination: { name: 'Annecy', countryCode: 'FR', lat: 45.8992, lon: 6.1294, radiusKm: 10 }, timezone: 'Europe/Paris', startDate: '2026-10-22', days: 2, mode: 'bike', profile: 'explorer', lunch: 'both', wishes: 'Plutôt nature', rain: { 0: { am: 10, pm: 80 } }, density: 0.9 },
  { id: 'saint-emilion', label: 'Saint-Émilion (village), 2 j, voiture', destination: { name: 'Saint-Émilion', countryCode: 'FR', lat: 44.8938, lon: -0.1553, radiusKm: 20 }, timezone: 'Europe/Paris', startDate: '2026-10-09', days: 2, mode: 'car', profile: 'balanced', lunch: 'market', wishes: 'On adore le vin', density: 0.4 },
  { id: 'conques', label: 'Conques (village), 1 j, à pied', destination: { name: 'Conques', countryCode: 'FR', lat: 44.5993, lon: 2.3979, radiusKm: 5 }, timezone: 'Europe/Paris', startDate: '2026-10-10', days: 1, mode: 'walk', profile: 'explorer', lunch: 'restaurant', density: 0.3 },
  { id: 'barcelona', label: 'Barcelone, 3 j, à pied, enfants', destination: { name: 'Barcelona', countryCode: 'ES', lat: 41.3874, lon: 2.1686, radiusKm: 5 }, timezone: 'Europe/Madrid', startDate: '2026-11-19', days: 3, mode: 'walk', profile: 'balanced', lunch: 'restaurant', wishes: 'Avec des enfants', density: 1.3 },
  { id: 'lisboa', label: 'Lisbonne, 2 j, transports, peu de marche', destination: { name: 'Lisboa', countryCode: 'PT', lat: 38.7223, lon: -9.1393, radiusKm: 10 }, timezone: 'Europe/Lisbon', startDate: '2026-11-26', days: 2, mode: 'transit', profile: 'certified', lunch: 'restaurant', wishes: 'Pas trop de marche', density: 1.1 },
  { id: 'firenze', label: 'Florence, 3 j, à pied, peu de musées, pluie', destination: { name: 'Firenze', countryCode: 'IT', lat: 43.7696, lon: 11.2558, radiusKm: 5 }, timezone: 'Europe/Rome', startDate: '2026-10-29', days: 3, mode: 'walk', profile: 'certified', lunch: 'both', wishes: 'Peu de musées', rain: { 0: 75 }, density: 1.2 },
  { id: 'brugge', label: 'Bruges, 2 j, vélo, pluie continue', destination: { name: 'Brugge', countryCode: 'BE', lat: 51.2093, lon: 3.2247, radiusKm: 10 }, timezone: 'Europe/Brussels', startDate: '2026-11-03', days: 2, mode: 'bike', profile: 'balanced', lunch: 'both', rain: { 0: 90, 1: 70 }, density: 0.8 },
  { id: 'hallstatt', label: 'Hallstatt (village), 1 j, à pied, nature', destination: { name: 'Hallstatt', countryCode: 'AT', lat: 47.5622, lon: 13.6493, radiusKm: 10 }, timezone: 'Europe/Vienna', startDate: '2026-10-14', days: 1, mode: 'walk', profile: 'explorer', lunch: 'restaurant', wishes: 'Plutôt nature', density: 0.35 },
  { id: 'krakow', label: 'Cracovie, 3 j, transports, enfants', destination: { name: 'Kraków', countryCode: 'PL', lat: 50.0647, lon: 19.945, radiusKm: 10 }, timezone: 'Europe/Warsaw', startDate: '2026-11-10', days: 3, mode: 'transit', profile: 'balanced', lunch: 'both', wishes: 'Avec des enfants, pas trop de marche', density: 1.1 }
]);

/** Nombre de lieux par catégorie pour une ville (densité 1). */
const BASE_COUNTS = { museum: 10, monument: 12, park: 8, nature: 5, viewpoint: 5, market: 4, farm: 3, small_heritage: 8, restaurant: 18 };

const PREFIX = {
  FR: { museum: 'Musée', monument: 'Église', park: 'Parc', nature: 'Bois', viewpoint: 'Belvédère', market: 'Marché', farm: 'Domaine', small_heritage: 'Fontaine', restaurant: 'Restaurant' },
  ES: { museum: 'Museu', monument: 'Basílica', park: 'Parc', nature: 'Jardí', viewpoint: 'Mirador', market: 'Mercat', farm: 'Celler', small_heritage: 'Font', restaurant: 'Restaurant' },
  PT: { museum: 'Museu', monument: 'Igreja', park: 'Jardim', nature: 'Mata', viewpoint: 'Miradouro', market: 'Mercado', farm: 'Quinta', small_heritage: 'Chafariz', restaurant: 'Tasca' },
  IT: { museum: 'Museo', monument: 'Chiesa', park: 'Giardino', nature: 'Parco', viewpoint: 'Belvedere', market: 'Mercato', farm: 'Cantina', small_heritage: 'Fontana', restaurant: 'Trattoria' },
  BE: { museum: 'Museum', monument: 'Kerk', park: 'Park', nature: 'Bos', viewpoint: 'Uitkijkpunt', market: 'Markt', farm: 'Hoeve', small_heritage: 'Pomp', restaurant: 'Restaurant' },
  AT: { museum: 'Museum', monument: 'Kirche', park: 'Park', nature: 'Wald', viewpoint: 'Aussichtspunkt', market: 'Markt', farm: 'Hof', small_heritage: 'Brunnen', restaurant: 'Gasthaus' },
  PL: { museum: 'Muzeum', monument: 'Kościół', park: 'Park', nature: 'Las', viewpoint: 'Punkt widokowy', market: 'Targ', farm: 'Gospodarstwo', small_heritage: 'Kapliczka', restaurant: 'Restauracja' }
};
const SUFFIXES = ['du Centre', 'Saint-Jean', 'des Arts', 'de la Gare', 'du Château', 'Sainte-Anne', 'du Port', 'des Remparts', 'du Marché', 'Saint-Pierre', 'des Tilleuls', 'du Belvédère', 'de la Source', 'des Carmes', 'Notre-Dame', 'du Moulin', 'de l\'Horloge', 'des Halles', 'du Lac', 'Saint-Michel'];
const HOURS = {
  museum: ['Tu-Su 10:00-18:00', 'Mo-Su 09:30-17:30', 'We-Mo 10:00-17:00'],
  monument: ['Mo-Su 09:00-18:00', undefined],
  market: ['Sa 08:00-13:00', 'Tu,Fr 08:00-12:30', 'Mo-Sa 07:30-13:30'],
  farm: ['Mo-Sa 10:00-12:00,14:00-18:00'],
  restaurant: ['Mo-Su 12:00-14:30,19:00-22:30', 'Tu-Sa 12:00-14:00,19:30-22:00', 'Mo-Su 12:00-14:00', 'Mo-Su 19:00-23:00', 'Mo-Fr 11:45-14:15', undefined]
};
const CUISINES = [['regional'], ['pizza'], ['french'], ['burger'], ['vegetarian'], ['seafood']];

/** Générateur pseudo-aléatoire déterministe (mulberry32). */
function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const seedOf = (text) => [...text].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);

/**
 * Lieux de démonstration d'un séjour type (déterministes).
 * @param {EvalFixture} f
 */
export function fixturePlaces(f) {
  const rnd = random(seedOf(f.id));
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  const prefix = PREFIX[f.destination.countryCode] ?? PREFIX.FR;
  const places = [];
  for (const [category, base] of Object.entries(BASE_COUNTS)) {
    const n = Math.max(1, Math.round(base * f.density));
    for (let i = 0; i < n; i += 1) {
      const p = destinationPoint(f.destination, 0.2 + rnd() * f.destination.radiusKm * 0.7, rnd() * 360);
      const hours = HOURS[category] ? pick(HOURS[category]) : undefined;
      const place = {
        id: `${f.id}:${category}:${i}`,
        name: `${prefix[category]} ${SUFFIXES[(i * 7 + category.length) % SUFFIXES.length]}${i >= SUFFIXES.length ? ` ${i}` : ''}`,
        category,
        lat: p.lat,
        lon: p.lon,
        source: 'eval',
        certified: (category === 'museum' || category === 'monument') && rnd() < 0.7,
        indoor: category === 'museum' || category === 'restaurant' ? true : category === 'monument' ? rnd() < 0.5 : false
      };
      if (place.certified) place.certification = f.destination.countryCode === 'FR' ? (category === 'museum' ? 'musee_de_france' : 'monument_historique') : category === 'museum' ? 'referenced_museum' : 'protected_heritage';
      if (category === 'restaurant') place.food = { regional: rnd() < 0.4, cuisine: pick(CUISINES), ...(hours ? { openingHours: hours } : {}), ...(rnd() < 0.3 ? { vegetarian: true } : {}) };
      else if (hours) place.openingHours = hours;
      places.push(place);
    }
  }
  return places;
}

/** Jours de météo du séjour type (pluie par jour, ou matin / après-midi). */
export function fixtureWeather(f, dates) {
  return dates.map((date, i) => {
    const r = f.rain?.[i];
    const pct = (h) => (r === undefined ? 5 : typeof r === 'number' ? r : h < 13 ? r.am : r.pm);
    return { date, available: true, hours: Array.from({ length: 24 }, (_, h) => ({ hour: `${String(h).padStart(2, '0')}:00`, precipitationProbability: pct(h), temperature: 14, weatherCode: pct(h) > 50 ? 61 : 1 })) };
  });
}
