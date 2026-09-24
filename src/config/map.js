// Seul appel réseau direct autorisé de l'application : les tuiles de la carte.
// À VÉRIFIER : politique d'usage des tuiles OSM
// (https://operations.osmfoundation.org/policies/tiles/) ; prévoir un
// fournisseur de tuiles dédié avant la publication de l'application.
export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const TILE_COPYRIGHT_URL = 'https://www.openstreetmap.org/copyright';
export const TILE_MAX_ZOOM = 19;

// Vue par défaut, sans séjour : l'Europe.
export const DEFAULT_CENTER = [48.5, 8];
export const DEFAULT_ZOOM = 4;
