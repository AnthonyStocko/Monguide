import { describe, expect, it, vi } from 'vitest';
import { AppError } from './errors.js';
import { ndjsonResponse } from './respond.js';

const readLines = async (res) => (await res.text()).trim().split('\n').map((l) => JSON.parse(l));

describe('ndjsonResponse', () => {
  it('événements au fil de l’eau puis le résultat', async () => {
    const res = ndjsonResponse(async (send) => {
      send({ event: 'start', steps: ['weather'] });
      await new Promise((r) => setTimeout(r, 5));
      send({ event: 'step', step: 'weather', status: 'done' });
      return { trip: { id: 't' } };
    });
    expect(res.headers.get('content-type')).toBe('application/x-ndjson; charset=utf-8');
    expect(await readLines(res)).toEqual([
      { event: 'start', steps: ['weather'] },
      { event: 'step', step: 'weather', status: 'done' },
      { event: 'result', trip: { id: 't' } }
    ]);
  });

  it('erreur après le début du flux : événement error', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const known = ndjsonResponse(async () => {
      throw new AppError(502, 'external_unavailable', 'down');
    });
    expect((await readLines(known)).at(-1)).toEqual({ event: 'error', error: { code: 'external_unavailable', message: 'down' } });
    const unknown = ndjsonResponse(async () => {
      throw new Error('bug');
    });
    expect((await readLines(unknown)).at(-1)).toEqual({ event: 'error', error: { code: 'internal_error', message: 'Internal error' } });
    vi.restoreAllMocks();
  });
});
