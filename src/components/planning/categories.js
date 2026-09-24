import { Binoculars, Castle, Landmark, Milestone, Mountain, ShoppingBasket, Tractor, Trees, UtensilsCrossed } from 'lucide-react';

/** Icône Lucide de chaque catégorie de lieu. */
export const CATEGORY_ICONS = {
  museum: Landmark,
  monument: Castle,
  restaurant: UtensilsCrossed,
  market: ShoppingBasket,
  farm: Tractor,
  park: Trees,
  nature: Mountain,
  viewpoint: Binoculars,
  small_heritage: Milestone
};

/** Groupes de marqueurs de la carte : Culture, Gastronomie, Nature, Petit patrimoine. */
export const CATEGORY_GROUPS = {
  museum: 'culture',
  monument: 'culture',
  restaurant: 'food',
  market: 'food',
  farm: 'food',
  park: 'nature',
  nature: 'nature',
  viewpoint: 'nature',
  small_heritage: 'heritage'
};

/** Couleur de chaque groupe (contraste ≥ 4,5:1 avec le blanc de l'icône). */
export const GROUP_COLORS = {
  culture: '#0369a1',
  food: '#b45309',
  nature: '#047857',
  heritage: '#6d28d9',
  lodging: '#0f172a'
};
