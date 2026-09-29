import { beforeEach, describe, expect, it, vi } from 'vitest';

const prefs = new Map();
let appReduced = false;
const impact = vi.fn();
const notification = vi.fn();
vi.mock('@capacitor/haptics', () => ({
  Haptics: { impact: (...a) => impact(...a), notification: (...a) => notification(...a) },
  ImpactStyle: { Light: 'LIGHT' },
  NotificationType: { Success: 'SUCCESS', Error: 'ERROR' }
}));
vi.mock('./settings.js', () => ({
  SETTINGS_KEYS: { haptics: 'haptics' },
  get: async (k, fallback) => (prefs.has(k) ? prefs.get(k) : fallback),
  set: async (k, v) => void prefs.set(k, v)
}));
vi.mock('./motion.js', () => ({ isAppReducedMotion: () => appReduced }));

const { hapticConfirm, hapticError, hapticStepValidated, setHapticsEnabled } = await import('./haptics.js');

beforeEach(async () => {
  impact.mockClear();
  notification.mockClear();
  appReduced = false;
  await setHapticsEnabled(true);
});

describe('vibrations', () => {
  it('étape validée : impact léger ; confirmation et erreur : notifications', async () => {
    await hapticStepValidated();
    await hapticConfirm();
    await hapticError();
    expect(impact).toHaveBeenCalledWith({ style: 'LIGHT' });
    expect(notification.mock.calls).toEqual([[{ type: 'SUCCESS' }], [{ type: 'ERROR' }]]);
  });

  it('"Réduire les animations" : seule la vibration d’erreur reste', async () => {
    appReduced = true;
    await hapticStepValidated();
    await hapticConfirm();
    await hapticError();
    expect(impact).not.toHaveBeenCalled();
    expect(notification.mock.calls).toEqual([[{ type: 'ERROR' }]]);
  });

  it('réglage "Vibrations" désactivé : aucune vibration', async () => {
    await setHapticsEnabled(false);
    await hapticStepValidated();
    await hapticError();
    expect(impact).not.toHaveBeenCalled();
    expect(notification).not.toHaveBeenCalled();
  });

  it('pas de vibreur : pas d’erreur', async () => {
    impact.mockRejectedValueOnce(new Error('unavailable'));
    await expect(hapticStepValidated()).resolves.toBeUndefined();
  });
});
