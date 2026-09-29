import L from 'leaflet';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { House } from 'lucide-react';
import Illustration, { illustrationForCategory } from '../../illustrations/index.jsx';
import { CATEGORY_GROUPS, GROUP_COLORS } from '../planning/categories.js';

/**
 * Marqueurs en SVG (icônes Lucide) via L.divIcon : pas de PNG par défaut de
 * Leaflet, dont les fichiers manquent après le build Vite.
 */
function divIcon(Icon, color, badge, dropIndex) {
  const svg = renderToStaticMarkup(createElement(Icon, { size: 20, color: '#ffffff', 'aria-hidden': 'true' }));
  const number = badge ? `<span class="map-marker-number">${badge}</span>` : '';
  // Chute avec petit rebond (index.css, map-marker-drop), décalée de 50 ms par marqueur.
  const drops = dropIndex !== null && dropIndex !== undefined;
  const className = drops ? 'map-marker map-marker-drop' : 'map-marker';
  const style = `${drops ? `--drop-delay:${dropIndex * 50}ms;` : ''}background:${color}`;
  return L.divIcon({
    className: 'map-marker-wrapper',
    html: `<span class="${className}" style="${style}">${svg}${number}</span>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18]
  });
}

/**
 * Marqueur illustré d'un lieu : vignette de sa catégorie dans un anneau de la
 * couleur de son groupe (Culture, Gastronomie, Nature, Petit patrimoine),
 * numéro d'ordre de visite.
 * dropIndex : rang dans la chute d'apparition (null : affiché directement).
 */
export function placeIcon(category, order, dropIndex = null) {
  const art = renderToStaticMarkup(createElement(Illustration, { name: illustrationForCategory(category), className: 'map-marker-art' }));
  const number = order ? `<span class="map-marker-number">${order}</span>` : '';
  const drops = dropIndex !== null && dropIndex !== undefined;
  const className = drops ? 'map-marker map-marker-illustrated map-marker-drop' : 'map-marker map-marker-illustrated';
  const style = `${drops ? `--drop-delay:${dropIndex * 50}ms;` : ''}border-color:${GROUP_COLORS[CATEGORY_GROUPS[category]]}`;
  return L.divIcon({
    className: 'map-marker-wrapper',
    html: `<span class="${className}" style="${style}">${art}${number}</span>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    popupAnchor: [0, -22]
  });
}

/** Marqueur de l'hébergement du jour. */
export function lodgingIcon(dropIndex = null) {
  return divIcon(House, GROUP_COLORS.lodging, undefined, dropIndex);
}
