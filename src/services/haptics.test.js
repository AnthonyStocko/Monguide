import { beforeEach, describe, expect, it, vi } from 'vitest';

const prefs = new Map();
let appReduced = false;
const impact = vi.fn();
const notification = vi.fn();
vi.mock('../platform/haptics.js', () => ({
  hapticsAvailable: true,
  impactLight: (...a) => impact(...a),
  notifySuccess: () => notification('SUCCESS'),
  notifyError: () => notification('ERROR')
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
    expect(impact).toHaveBeenCalledTimes(1);
    expect(notification.mock.calls).toEqual([['SUCCESS'], ['ERROR']]);
  });

  it('"Réduire les animations" : seule la vibration d’erreur reste', async () => {
    appReduced = true;
    await hapticStepValidated();
    await hapticConfirm();
    await hapticError();
    expect(impact).not.toHaveBeenCalled();
    expect(notification.mock.calls).toEqual([['ERROR']]);
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
