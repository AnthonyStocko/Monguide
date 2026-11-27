import { cached } from '../_shared/cache.js';
import { serveFunction } from '../_shared/handler.js';
import { fetchInstagramPlaces } from '../_shared/services/instagramAgent.js';

/** Durée de conservation par défaut de la liste : 4 h. */
const DEFAULT_TTL_SEC = 14400;

/** Durée de conservation quand l'agent ne répond pas : on réessaie vite. */
const FAILURE_TTL_SEC = 300;

// GET /functions/v1/instagram-places -> { places } (docs/api.md). Toujours 200 : si l'agent Instagram
// est absent ou en panne, la liste est vide et le programme s'affiche sans lien.
serveFunction({
  name: 'instagram-places',
  methods: ['GET'],
  handle: async ({ appConfig }) => {
    try {
      const result = await cached('instagram', {}, (value) => (value.ok ? (appConfig.rules.cacheTtlSec.instagram ?? DEFAULT_TTL_SEC) : FAILURE_TTL_SEC), fetchInstagramPlaces);
      return { places: result.places };
    } catch {
      return { places: [] };
    }
  }
});
