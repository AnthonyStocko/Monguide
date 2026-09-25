import { API_VERSION } from '../_shared/domain/version.js';
import { serveFunction } from '../_shared/handler.js';
import { osmInfo } from '../_shared/services/osmSource.js';

// GET /functions/v1/config -> { apiVersion, minAppVersion, rules, contact, osm } (docs/api.md).
serveFunction({
  name: 'config',
  methods: ['GET'],
  handle: ({ appConfig }) => ({
    apiVersion: API_VERSION,
    minAppVersion: appConfig.minAppVersion,
    rules: appConfig.rules,
    // Contact de l'équipe (écran Confidentialité), repris du secret MONGUIDE_CONTACT.
    contact: globalThis.Deno?.env.get('MONGUIDE_CONTACT') || null,
    // Source des lieux OSM et date des données en service (écran « À propos », /debug).
    osm: osmInfo(appConfig.rules, appConfig.osmPointer)
  })
});
