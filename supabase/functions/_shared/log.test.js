import { afterEach, describe, expect, it, vi } from 'vitest';
import { log, sanitize } from './log.js';

describe('sanitize', () => {
  it('supprime les champs e-mail, adresse, IP et jetons', () => {
    expect(
      sanitize({ email: 'a@b.fr', userEmail: 'x', address: '1 rue X', adresse: 'y', ip: '1.2.3.4', token: 't', fn: 'config' })
    ).toEqual({ fn: 'config' });
  });

  it('arrondit les coordonnées à 2 décimales, y compris en profondeur', () => {
    expect(sanitize({ lat: 48.856613, lon: 2.352222, place: { latitude: -3.704379 } })).toEqual({
      lat: 48.86,
      lon: 2.35,
      place: { latitude: -3.7 }
    });
  });

  it('masque les e-mails et les coordonnées précises dans les chaînes', () => {
    expect(sanitize({ message: 'échec pour jean.dupont@example.com' })).toEqual({ message: 'échec pour [email]' });
    expect(sanitize({ message: 'GET /search?lat=48.856613&lon=2.352222' })).toEqual({
      message: 'GET /search?lat=48.86&lon=2.35'
    });
  });

  it('laisse intacts les autres nombres et valeurs', () => {
    expect(sanitize({ status: 200, durationMs: 12, ok: true, v: null, list: [1, 'a'] })).toEqual({
      status: 200,
      durationMs: 12,
      ok: true,
      v: null,
      list: [1, 'a']
    });
  });
});

describe('log', () => {
  afterEach(() => vi.restoreAllMocks());

  it('écrit une ligne JSON nettoyée', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    log('info', 'request', { fn: 'config', lat: 48.8566, email: 'a@b.fr' });
    const entry = JSON.parse(spy.mock.calls[0][0]);
    expect(entry).toMatchObject({ level: 'info', event: 'request', fn: 'config', lat: 48.86 });
    expect(entry).not.toHaveProperty('email');
  });

  it('envoie les erreurs sur console.error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    log('error', 'boom');
    expect(spy).toHaveBeenCalledOnce();
  });
});
