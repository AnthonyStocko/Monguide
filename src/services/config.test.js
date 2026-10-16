import { describe, expect, it, vi } from 'vitest';
import { RULES } from '@domain/config/rules.js';
import { mergeRules } from '@domain/config/mergeRules.js';

const api = vi.hoisted(() => ({ callFunction: vi.fn() }));
vi.mock('./api.js', () => ({ callFunction: api.callFunction }));

const { loadConfig } = await import('./config.js');
const { publicLinks } = await import('../config/links.js');

/** Réponse de la fonction config, règles fusionnées avec app_config comme le fait le serveur. */
const serverResponse = (overrides) => ({ data: { apiVersion: 1, minAppVersion: '0.0.0', rules: mergeRules(RULES, overrides).rules }, fromCache: false, savedAt: null });

describe('adresses publiques (rules.public)', () => {
  it('une adresse modifiée dans app_config remplace la valeur embarquée au lancement', async () => {
    api.callFunction.mockResolvedValue(serverResponse({ 'public.contactEmail': 'nouveau@exemple.org', 'public.webApp': 'https://app.exemple.org' }));
    const config = await loadConfig();
    expect(config.rules.public.contactEmail).toBe('nouveau@exemple.org');
    expect(publicLinks()).toMatchObject({ contactEmail: 'nouveau@exemple.org', webApp: 'https://app.exemple.org', playStore: RULES.public.playStore });
  });

  it('serveur injoignable : valeurs embarquées', async () => {
    api.callFunction.mockImplementation(async () => {
      throw new Error('offline');
    });
    const config = await loadConfig();
    expect(config.rules.public).toEqual(RULES.public);
    expect(publicLinks().contactEmail).toBe(RULES.public.contactEmail);
  });

  it('serveur plus ancien, sans rubrique public : valeurs embarquées', async () => {
    const { public: _, ...older } = RULES;
    api.callFunction.mockResolvedValue({ data: { apiVersion: 1, rules: older }, fromCache: false, savedAt: null });
    expect((await loadConfig()).rules.public).toEqual(RULES.public);
  });
});
