/**
 * Couleurs des pastilles des participants (profiles.avatar_color : nom de la
 * couleur, jamais une valeur CSS). Initiale en blanc : contraste vérifié
 * (au moins 4,5:1, avatarColors.test.js), dans les deux thèmes.
 */
export const AVATAR_COLORS = Object.freeze({
  teal: '#0f6b63',
  coral: '#b4381f',
  plum: '#7a3b84',
  ocean: '#1d5fa8',
  moss: '#3f6b22',
  rose: '#a8325e',
  amber: '#8a5300',
  slate: '#4a5566'
});

/** Couleur d'un profil ; inconnue ou absente : couleur stable déduite de l'identifiant. */
export function avatarColor(name, userId = '') {
  if (name && AVATAR_COLORS[name]) return AVATAR_COLORS[name];
  const values = Object.values(AVATAR_COLORS);
  const hash = [...userId].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 0);
  return values[hash % values.length];
}
