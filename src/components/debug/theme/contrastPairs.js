import { blend, contrastRatio, parseHex } from '../../../utils/contrast.js';

/** Seuils WCAG AA : texte (y compris crédits 13 px) et éléments non textuels. */
export const AA_TEXT = 4.5;
export const AA_NON_TEXT = 3;

/** Opacité minimale du voile image-scrim sous le texte (index.css). */
export const SCRIM_ALPHA = 0.72;

/**
 * Couples utilisés par l'application. Une couleur est un nom de jeton
 * (--color-<nom> dans index.css) ou "#rrggbb". `over` : fond vu à travers le
 * voile (le pire cas, une photo blanche ou jaune vif).
 * `alpha` : opacité du voile (SCRIM_ALPHA par défaut).
 * @type {{ fg: string, bg: string, over?: string, alpha?: number, usage: string, nonText?: boolean }[]}
 */
export const CONTRAST_PAIRS = [
  { fg: 'ink', bg: 'canvas', usage: 'Texte courant sur le fond sable' },
  { fg: 'ink', bg: 'surface', usage: 'Texte des cartes' },
  { fg: 'ink', bg: 'subtle', usage: 'Blocs discrets, onglets de jour non choisis' },
  { fg: 'ink', bg: 'primary-soft', usage: 'Choix coché' },
  { fg: 'ink-muted', bg: 'canvas', usage: 'Texte secondaire sur le fond' },
  { fg: 'ink-muted', bg: 'surface', usage: 'Texte secondaire, crédits photo (13 px)' },
  { fg: 'ink-muted', bg: 'subtle', usage: 'Badge neutre' },
  { fg: '#ffffff', bg: 'primary-strong', usage: 'Bouton principal' },
  { fg: '#ffffff', bg: 'primary-hover', usage: 'Bouton principal survolé' },
  { fg: 'primary-strong', bg: 'surface', usage: 'Texte vert, onglet actif' },
  { fg: 'primary-strong', bg: 'canvas', usage: 'Texte vert sur le fond' },
  { fg: 'primary-on-soft', bg: 'primary-soft', usage: 'Badge et puce primaires' },
  { fg: 'secondary-strong', bg: 'surface', usage: 'Bouton secondaire, liens' },
  { fg: 'secondary-strong', bg: 'canvas', usage: 'Liens sur le fond' },
  { fg: 'secondary-strong', bg: 'secondary-soft', usage: 'Bouton secondaire survolé' },
  { fg: 'secondary-on-soft', bg: 'secondary-soft', usage: 'Badge secondaire (météo)' },
  { fg: 'accent-rust', bg: 'surface', usage: 'Texte d’accent' },
  { fg: 'accent-on-soft', bg: 'accent-soft', usage: 'Badge certification' },
  { fg: 'warning-on-soft', bg: 'warning-soft', usage: 'Badge et bandeau d’avertissement' },
  { fg: 'danger-on-soft', bg: 'danger-soft', usage: 'Badge d’erreur' },
  { fg: 'danger-on-soft', bg: 'surface', usage: 'Erreur de champ' },
  { fg: 'danger-on-soft', bg: 'canvas', usage: 'Erreur de champ sur le fond' },
  { fg: '#ffffff', bg: 'ink', usage: 'Toast' },
  { fg: 'primary-soft', bg: 'ink', usage: 'Action du toast' },
  { fg: '#ffffff', bg: 'ink', over: '#ffffff', usage: 'Texte blanc sur photo blanche, voile' },
  { fg: '#ffffff', bg: 'ink', over: '#ffe600', usage: 'Texte blanc sur photo jaune vif, voile' },
  { fg: '#ffffff', bg: 'ink', over: '#000000', usage: 'Texte blanc sur photo très sombre, voile' },
  { fg: '#ffffff', bg: 'ink', over: '#ffffff', alpha: 0.75, usage: 'Pastille météo sur photo blanche' },
  { fg: 'primary-on-soft', bg: 'surface', usage: 'Pastille « Prochain séjour » sur photo' },
  { fg: '#ffffff', bg: 'ink', usage: 'Onglet de jour choisi' },
  { fg: '#ffffff', bg: 'ink', over: '#ffffff', alpha: 0.75, usage: 'Bouton « i » du crédit sur photo blanche', nonText: true },
  { fg: 'line-strong', bg: 'surface', usage: 'Bordure des champs et interrupteurs', nonText: true },
  { fg: 'line-strong', bg: 'canvas', usage: 'Bordure des champs sur le fond', nonText: true },
  { fg: 'primary', bg: 'surface', usage: 'Icônes vertes', nonText: true },
  { fg: 'primary', bg: 'primary-soft', usage: 'Icône sur pastille verte', nonText: true },
  { fg: 'secondary', bg: 'surface', usage: 'Icônes bleues', nonText: true },
  { fg: 'focus', bg: 'canvas', usage: 'Contour de focus', nonText: true },
  { fg: 'focus', bg: 'surface', usage: 'Contour de focus', nonText: true },
  { fg: 'focus', bg: 'ink', usage: 'Contour de focus sur le toast', nonText: true }
];

/** Couleurs "--color-<nom>: #rrggbb" du bloc @theme d'index.css. */
export function parseThemeColors(css) {
  const colors = {};
  for (const [, name, hex] of css.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/gi)) colors[name] = hex.toLowerCase();
  return colors;
}

/**
 * Rapport de chaque couple, avec les couleurs résolues.
 * @param {Record<string, string>} colors résultat de parseThemeColors
 */
export function evaluatePairs(colors, pairs = CONTRAST_PAIRS) {
  const resolve = (c) => {
    const hex = c.startsWith('#') ? c : colors[c];
    if (!hex) throw new Error(`Jeton de couleur inconnu : ${c}`);
    return hex;
  };
  return pairs.map((pair) => {
    const fg = resolve(pair.fg);
    const bgHex = resolve(pair.bg);
    const bg = pair.over ? blend(parseHex(bgHex), pair.alpha ?? SCRIM_ALPHA, parseHex(pair.over)) : parseHex(bgHex);
    const ratio = contrastRatio(parseHex(fg), bg);
    const min = pair.nonText ? AA_NON_TEXT : AA_TEXT;
    return { ...pair, fgHex: fg, bgHex, ratio, min, pass: ratio >= min };
  });
}
