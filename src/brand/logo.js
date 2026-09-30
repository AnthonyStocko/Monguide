import { WORDMARK } from './wordmark.js';

/**
 * Logo « Mon guide » : repère de carte contenant un paysage de collines et un
 * soleil, et le nom en Fraunces converti en tracés (wordmark.js). Source
 * unique : l'application (composant Logo) et le script des fichiers de marque
 * (scripts/brand/build.mjs : assets/brand, icônes Android, Play Store, site)
 * lisent tous cette géométrie. Couleurs du design system uniquement.
 *
 * Repère dessiné dans un carré de 1024 × 1024 (boîte du repère : x 212 à
 * 812, y 130 à 900).
 */

export const BRAND_COLORS = Object.freeze({
  green: '#059669',
  greenDark: '#047857',
  sand: '#F7F3EC',
  sky: '#FAEBD0',
  gold: '#D9A441',
  ink: '#0F172A'
});

export const PIN_BOX = Object.freeze({ x: 212, y: 130, width: 600, height: 770 });

const PIN = 'M512 900C430 780 212 610 212 430A300 300 0 1 1 812 430C812 610 594 780 512 900Z';
/** Fenêtre ronde du repère (cercle de centre 512, 430 et de rayon 205), en tracé. */
const WINDOW = 'M307 430A205 205 0 1 0 717 430A205 205 0 1 0 307 430Z';
/** Fenêtre un peu plus grande (rayon 215) : en monochrome, la colline passe sous le contour, sans liseré. */
const WINDOW_BLEED = 'M297 430A215 215 0 1 0 727 430A215 215 0 1 0 297 430Z';
const SUN = 'M535 365A50 50 0 1 0 635 365A50 50 0 1 0 535 365Z';
const HILL_BACK = 'M290 500C370 420 455 425 535 470C600 425 680 420 740 455L740 660L290 660Z';
const HILL_FRONT = 'M290 560C380 490 500 510 590 560C650 530 700 530 740 545L740 660L290 660Z';

/**
 * Tracés et couleurs du repère selon la variante :
 *  - color : repère vert, fenêtre ciel, collines vertes, soleil doré (logo principal) ;
 *  - onGreen : repère sable sur fond vert (premier plan de l'icône Android) ;
 *  - mono : une seule couleur, fenêtre évidée (monochrome, icônes à thème Android 13+).
 * @param {'color' | 'onGreen' | 'mono'} variant
 * @param {string} [monoColor]
 * @returns {{ clip: string, layers: { d: string, fill: string, evenOdd?: boolean, clipped?: boolean }[] }}
 */
export function pinLayers(variant, monoColor = BRAND_COLORS.ink) {
  const c = BRAND_COLORS;
  if (variant === 'mono') {
    return {
      clip: WINDOW_BLEED,
      layers: [
        { d: `${PIN}${WINDOW}`, fill: monoColor, evenOdd: true },
        { d: SUN, fill: monoColor },
        { d: HILL_BACK, fill: monoColor, clipped: true }
      ]
    };
  }
  return {
    clip: WINDOW,
    layers: [
      { d: PIN, fill: variant === 'onGreen' ? c.sand : c.green },
      { d: WINDOW, fill: c.sky },
      { d: SUN, fill: c.gold },
      { d: HILL_BACK, fill: c.green, clipped: true },
      { d: HILL_FRONT, fill: c.greenDark, clipped: true }
    ]
  };
}

/** Contenu SVG du repère (coordonnées 1024), pour un <svg> ou un <g transform>. */
export function pinMarkup(variant, { idPrefix = 'mg', monoColor } = {}) {
  const { clip, layers } = pinLayers(variant, monoColor);
  const clipId = `${idPrefix}-window`;
  const paths = layers
    .map((l) => `<path d="${l.d}" fill="${l.fill}"${l.evenOdd ? ' fill-rule="evenodd"' : ''}${l.clipped ? ` clip-path="url(#${clipId})"` : ''}/>`)
    .join('');
  return `<defs><clipPath id="${clipId}"><path d="${clip}"/></clipPath></defs>${paths}`;
}

/**
 * Icône seule (repère), fond transparent ou plein.
 * @param {{ variant?: 'color' | 'onGreen' | 'mono', size?: number, background?: string, scale?: number, monoColor?: string }} [options]
 *   scale : taille du repère dans le carré (1 = dessin d'origine) ; background : couleur de fond pleine
 */
export function iconSvg({ variant = 'color', size = 1024, background, scale = 1, monoColor } = {}) {
  const t = `translate(${512 - 512 * scale} ${512 - 515 * scale}) scale(${scale})`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">${background ? `<rect width="1024" height="1024" fill="${background}"/>` : ''}<g transform="${t}">${pinMarkup(variant, { monoColor })}</g></svg>`;
}

/** Dimensions du logo principal (repère + nom), en unités SVG. */
export const LOGO_SIZE = Object.freeze({ width: 1290, height: 320 });

const PIN_SCALE = 300 / PIN_BOX.height;
/** Placement dans le logo principal : repère (coordonnées 1024 réduites) et nom (ligne de base). */
export const LOGO_LAYOUT = Object.freeze({
  pin: `translate(${10 - PIN_BOX.x * PIN_SCALE} ${10 - PIN_BOX.y * PIN_SCALE}) scale(${PIN_SCALE})`,
  text: 'translate(270 222)'
});

/**
 * Logo principal : repère à gauche, nom en tracés à droite.
 * @param {{ variant?: 'color' | 'mono', textColor?: string, monoColor?: string, title?: string }} [options]
 */
export function logoSvg({ variant = 'color', textColor = BRAND_COLORS.ink, monoColor = BRAND_COLORS.ink, title = 'Mon guide' } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LOGO_SIZE.width} ${LOGO_SIZE.height}" role="img" aria-label="${title}"><title>${title}</title>${logoMarkup({ variant, textColor, monoColor })}</svg>`;
}

/** Contenu du logo principal (sans l'élément <svg>), pour l'intégrer dans une autre image. */
export function logoMarkup({ variant = 'color', textColor = BRAND_COLORS.ink, monoColor = BRAND_COLORS.ink } = {}) {
  const pin = `<g transform="${LOGO_LAYOUT.pin}">${pinMarkup(variant, { idPrefix: 'logo', monoColor })}</g>`;
  const text = `<path transform="${LOGO_LAYOUT.text}" d="${WORDMARK.d}" fill="${variant === 'mono' ? monoColor : textColor}"/>`;
  return pin + text;
}
