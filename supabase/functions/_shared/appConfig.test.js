import { describe, expect, it } from 'vitest';
import { readSchemaVersion, readWebUrl } from './appConfig.js';

describe('readSchemaVersion (clé min_shared_schema_version de app_config)', () => {
  it('entier de 1 à 1000, sinon ignoré', () => {
    expect(readSchemaVersion(3)).toBe(3);
    expect(readSchemaVersion(0)).toBeNull();
    expect(readSchemaVersion('3')).toBeNull();
    expect(readSchemaVersion(2.5)).toBeNull();
  });
});

describe('readWebUrl (clé web_url de app_config)', () => {
  it('adresse https sans chemin, sans barre finale ; sinon ignorée', () => {
    expect(readWebUrl('https://monguide.mgapp.workers.dev')).toBe('https://monguide.mgapp.workers.dev');
    expect(readWebUrl('https://monguide.mgapp.workers.dev/')).toBe('https://monguide.mgapp.workers.dev');
    expect(readWebUrl('http://monguide.mgapp.workers.dev')).toBeNull();
    expect(readWebUrl('https://exemple.org/app')).toBeNull();
    expect(readWebUrl('pas une adresse')).toBeNull();
    expect(readWebUrl(42)).toBeNull();
  });
});
