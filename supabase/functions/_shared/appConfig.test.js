import { describe, expect, it } from 'vitest';
import { readWebUrl } from './appConfig.js';

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
