import L from 'leaflet';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { House } from 'lucide-react';
import { CATEGORY_GROUPS, CATEGORY_ICONS, GROUP_COLORS } from '../planning/categories.js';

/**
 * Marqueurs en SVG (icônes Lucide) via L.divIcon : pas de PNG par défaut de
 * Leaflet, dont les fichiers manquent après le build Vite.
 */
function divIcon(Icon, color, badge) {
  const svg = renderToStaticMarkup(createElement(Icon, { size: 20, color: '#ffffff', 'aria-hidden': 'true' }));
  const number = badge ? `<span class="map-marker-number">${badge}</span>` : '';
  return L.divIcon({
    className: 'map-marker-wrapper',
    html: `<span class="map-marker" style="background:${color}">${svg}${number}</span>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18]
  });
}

/** Marqueur d'un lieu : couleur de son groupe (Culture, Gastronomie, Nature, Petit patrimoine), numéro d'ordre. */
export function placeIcon(category, order) {
  return divIcon(CATEGORY_ICONS[category], GROUP_COLORS[CATEGORY_GROUPS[category]], order);
}

/** Marqueur de l'hébergement du jour. */
export function lodgingIcon() {
  return divIcon(House, GROUP_COLORS.lodging);
}
