import { describe, expect, it } from 'vitest';
import { API_VERSION } from './domain/version.js';
import { assertMinAppVersion, readClientVersions } from './clientVersion.js';

const headers = (api, app) => {
  const h = new Headers();
  if (api !== undefined) h.set('x-monguide-api', api);
  if (app !== undefined) h.set('x-monguide-app', app);
  return h;
};

describe('readClientVersions', () => {
  it('accepte la version courante du contrat', () => {
    expect(readClientVersions(headers(String(API_VERSION), '0.1.0'))).toEqual({ apiVersion: API_VERSION, appVersion: '0.1.0' });
  });

  it('refuse un contrat absent, illisible ou futur (400)', () => {
    for (const api of [undefined, '', 'abc', '1.0', String(API_VERSION + 1)]) {
      expect(() => readClientVersions(headers(api, '0.1.0'))).toThrow(
        expect.objectContaining({ status: 400, code: 'unsupported_api_version' })
      );
    }
  });

  it('refuse une version d\'application absente ou mal formée (400)', () => {
    expect(() => readClientVersions(headers(String(API_VERSION)))).toThrow(
      expect.objectContaining({ status: 400, code: 'invalid_app_version' })
    );
    expect(() => readClientVersions(headers(String(API_VERSION), 'v1'))).toThrow(
      expect.objectContaining({ code: 'invalid_app_version' })
    );
  });
});

describe('assertMinAppVersion', () => {
  it("laisse passer une application à jour", () => {
    expect(() => assertMinAppVersion('0.2.0', '0.2.0')).not.toThrow();
    expect(() => assertMinAppVersion('1.0.0', '0.9.9')).not.toThrow();
  });

  it('refuse une application trop ancienne (426)', () => {
    expect(() => assertMinAppVersion('0.1.0', '0.2.0')).toThrow(
      expect.objectContaining({ status: 426, code: 'app_outdated' })
    );
  });
});
