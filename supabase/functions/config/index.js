import { API_VERSION } from '../_shared/domain/version.js';
import { serveFunction } from '../_shared/handler.js';

// GET /functions/v1/config -> { apiVersion, minAppVersion, rules } (docs/api.md).
serveFunction({
  name: 'config',
  methods: ['GET'],
  handle: ({ appConfig }) => ({
    apiVersion: API_VERSION,
    minAppVersion: appConfig.minAppVersion,
    rules: appConfig.rules
  })
});
