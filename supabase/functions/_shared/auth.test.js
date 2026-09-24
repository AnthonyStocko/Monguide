import { describe, expect, it } from 'vitest';
import { decodeJwtPayload, getCaller } from './auth.js';

const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const jwt = (payload) => `${b64url({ alg: 'HS256' })}.${b64url(payload)}.signature`;
const req = (token) =>
  new Request('https://x.supabase.co/functions/v1/config', {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });

describe('decodeJwtPayload', () => {
  it('décode la charge utile, y compris en UTF-8', () => {
    expect(decodeJwtPayload(jwt({ role: 'anon', name: 'Élodie' }))).toEqual({ role: 'anon', name: 'Élodie' });
  });

  it('renvoie null pour un jeton illisible', () => {
    expect(decodeJwtPayload('abc')).toBeNull();
    expect(decodeJwtPayload('a.!!!.c')).toBeNull();
    expect(decodeJwtPayload(`a.${Buffer.from('"x"').toString('base64url')}.c`)).toBeNull();
  });
});

describe('getCaller', () => {
  it('reconnaît un utilisateur connecté', () => {
    expect(getCaller(req(jwt({ role: 'authenticated', sub: 'user-1' })))).toEqual({ type: 'user', userId: 'user-1' });
  });

  it('reconnaît un invité (clé publique)', () => {
    expect(getCaller(req(jwt({ role: 'anon' })))).toEqual({ type: 'guest' });
  });

  it('refuse une requête sans jeton ou avec un autre rôle (401)', () => {
    expect(() => getCaller(req())).toThrow(expect.objectContaining({ status: 401, code: 'unauthorized' }));
    expect(() => getCaller(req(jwt({ role: 'service_role' })))).toThrow(expect.objectContaining({ status: 401 }));
    expect(() => getCaller(req('sb_publishable_xyz'))).toThrow(expect.objectContaining({ status: 401 }));
  });
});
