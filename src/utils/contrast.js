/**
 * Contraste WCAG 2 entre deux couleurs "#rrggbb", avec mélange alpha pour
 * vérifier un texte posé sur un voile semi-transparent.
 */

/** @param {string} hex "#rrggbb" @returns {[number, number, number]} */
export function parseHex(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`Couleur invalide : ${hex}`);
  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
}

/** Luminance relative (WCAG 2). @param {[number, number, number]} rgb */
export function luminance(rgb) {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Couleur obtenue en posant `top` avec l'opacité `alpha` sur `bottom`.
 * @returns {[number, number, number]}
 */
export function blend(top, alpha, bottom) {
  return top.map((v, i) => v * alpha + bottom[i] * (1 - alpha));
}

/** Rapport de contraste (1 à 21). Couleurs en "#rrggbb" ou en triplets RVB. */
export function contrastRatio(a, b) {
  const [la, lb] = [a, b].map((c) => luminance(typeof c === 'string' ? parseHex(c) : c));
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
