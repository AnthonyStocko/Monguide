import * as Categories from './categories.jsx';
import { C } from './palette.js';
import * as Scenes from './scenes.jsx';

/**
 * Illustrations maison "carnet de voyage" (SVG en composants React, aucun
 * réseau). Toutes décoratives (aria-hidden) : le sens est porté par le texte
 * voisin. Formats : square (vignette de catégorie, 96 × 96, affichée entière
 * sur son fond quelle que soit la forme du cadre), wide (paysage, recadré
 * pour remplir le cadre), empty (états vides), onboarding (premier lancement).
 */
const square = (Art) => ({ Art, format: 'square', viewBox: '0 0 96 96', bg: C.sky, fit: 'meet' });

export const ILLUSTRATIONS = Object.freeze({
  restaurant: square(Categories.Restaurant),
  market: square(Categories.Market),
  farm: square(Categories.Farm),
  park: square(Categories.Park),
  nature: square(Categories.Nature),
  viewpoint: square(Categories.Viewpoint),
  smallHeritage: square(Categories.SmallHeritage),
  monument: square(Categories.Monument),
  museum: square(Categories.Museum),
  personal: square(Categories.Personal),
  lodging: square(Categories.Lodging),
  landscape: { Art: Scenes.Landscape, format: 'wide', viewBox: '0 0 320 180', bg: C.sky, fit: 'slice' },
  noTrips: { Art: Scenes.NoTrips, format: 'empty', viewBox: '0 0 240 180', bg: C.sand, fit: 'meet' },
  offline: { Art: Scenes.Offline, format: 'empty', viewBox: '0 0 240 180', bg: C.sand, fit: 'meet' },
  error: { Art: Scenes.ErrorScene, format: 'empty', viewBox: '0 0 240 180', bg: C.sand, fit: 'meet' },
  noResults: { Art: Scenes.NoResults, format: 'empty', viewBox: '0 0 240 180', bg: C.sand, fit: 'meet' },
  onboardingPrepare: { Art: Scenes.OnboardingPrepare, format: 'onboarding', viewBox: '0 0 320 240', bg: C.sand, fit: 'meet' },
  onboardingFollow: { Art: Scenes.OnboardingFollow, format: 'onboarding', viewBox: '0 0 320 240', bg: C.sky, fit: 'slice' },
  onboardingFree: { Art: Scenes.OnboardingFree, format: 'onboarding', viewBox: '0 0 320 240', bg: C.sky, fit: 'slice' }
});

/** @typedef {keyof typeof ILLUSTRATIONS} IllustrationName */

const BY_CATEGORY = {
  restaurant: 'restaurant',
  market: 'market',
  farm: 'farm',
  park: 'park',
  nature: 'nature',
  viewpoint: 'viewpoint',
  small_heritage: 'smallHeritage',
  monument: 'monument',
  museum: 'museum',
  personal: 'personal'
};

// Étape sans lieu (temps libre) : selon le type de l'étape.
const BY_STEP_TYPE = { culture: 'museum', lunch: 'restaurant', outdoor: 'nature', relax: 'park', dinner: 'restaurant', personal: 'personal' };

/**
 * Vignette d'un lieu (catégorie) ; paysage si la catégorie est inconnue.
 * @param {string | undefined} category
 * @returns {IllustrationName}
 */
export function illustrationForCategory(category) {
  return BY_CATEGORY[category] ?? 'landscape';
}

/**
 * Vignette d'une étape : catégorie de son lieu, sinon son type (temps libre,
 * étape personnelle sans lieu). Jamais d'étape sans image.
 * @param {{ type: string, place?: { category: string } }} step
 * @returns {IllustrationName}
 */
export function illustrationForStep(step) {
  if (step.type === 'personal') return 'personal';
  if (step.place) return illustrationForCategory(step.place.category);
  return BY_STEP_TYPE[step.type] ?? 'landscape';
}

/**
 * Illustration décorative qui remplit son cadre (className règle la taille).
 * @param {{ name?: IllustrationName, className?: string }} props
 */
export default function Illustration({ name = 'landscape', className = '' }) {
  const { Art, viewBox, bg, fit } = ILLUSTRATIONS[name] ?? ILLUSTRATIONS.landscape;
  return (
    <svg
      viewBox={viewBox}
      preserveAspectRatio={fit === 'slice' ? 'xMidYMid slice' : 'xMidYMid meet'}
      aria-hidden="true"
      focusable="false"
      className={`block ${className}`}
      style={{ backgroundColor: bg }}
    >
      <rect width="100%" height="100%" fill={bg} />
      <Art />
    </svg>
  );
}
