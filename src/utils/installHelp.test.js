import { describe, expect, it } from 'vitest';
import { installMode, iosHelpDue, storageNoticeNeeded } from './installHelp.js';

const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
};
const mode = (userAgent, extra = {}) => installMode({ userAgent, standalone: false, promptAvailable: false, ...extra });

describe('installMode', () => {
  it('application installée : aucune aide, quel que soit l’appareil', () => {
    for (const userAgent of Object.values(UA)) expect(mode(userAgent, { standalone: true, promptAvailable: true })).toBe('installed');
  });

  it('Android : lien vers le Play Store, même si le navigateur propose l’installation', () => {
    expect(mode(UA.android, { promptAvailable: true })).toBe('playStore');
  });

  it('Safari sur iPhone et sur iPad : écran d’aide', () => {
    expect(mode(UA.iphoneSafari)).toBe('ios');
    expect(mode(UA.mac, { maxTouchPoints: 5 })).toBe('ios');
  });

  it('autre navigateur sur iPhone, Safari sur Mac : rien à proposer', () => {
    expect(mode(UA.iphoneChrome)).toBe('none');
    expect(mode(UA.mac)).toBe('none');
  });

  it('ordinateur : bouton seulement quand le navigateur propose l’installation', () => {
    expect(mode(UA.windows)).toBe('none');
    expect(mode(UA.windows, { promptAvailable: true })).toBe('prompt');
  });
});

describe('iosHelpDue', () => {
  const now = Date.UTC(2026, 9, 13);
  const day = 24 * 60 * 60 * 1000;

  it('jamais affichée : à proposer', () => {
    expect(iosHelpDue(null, now)).toBe(true);
    expect(iosHelpDue({}, now)).toBe(true);
  });

  it('pas plus d’une fois par semaine', () => {
    expect(iosHelpDue({ lastShownAt: now - 6 * day }, now)).toBe(false);
    expect(iosHelpDue({ lastShownAt: now - 7 * day }, now)).toBe(true);
  });

  it('refusée définitivement : plus jamais', () => {
    expect(iosHelpDue({ lastShownAt: now - 30 * day, declined: true }, now)).toBe(false);
  });
});

describe('storageNoticeNeeded', () => {
  const base = { mode: 'none', persisted: false, signedIn: false, alreadyShown: false };

  it('stockage durable refusé : message affiché', () => {
    expect(storageNoticeNeeded(base)).toBe(true);
  });

  it('stockage durable accordé : pas de message, sauf sur iPhone non installé', () => {
    expect(storageNoticeNeeded({ ...base, persisted: true })).toBe(false);
    expect(storageNoticeNeeded({ ...base, persisted: true, mode: 'ios' })).toBe(true);
  });

  it('une seule fois, jamais avec un compte ni dans l’application installée', () => {
    expect(storageNoticeNeeded({ ...base, alreadyShown: true })).toBe(false);
    expect(storageNoticeNeeded({ ...base, signedIn: true })).toBe(false);
    expect(storageNoticeNeeded({ ...base, mode: 'installed' })).toBe(false);
  });
});
