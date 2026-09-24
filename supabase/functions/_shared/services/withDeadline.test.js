import { describe, expect, it } from 'vitest';
import { withDeadline } from './withDeadline.js';

const later = (ms, value) => new Promise((r) => setTimeout(() => r(value), ms));

describe('withDeadline', () => {
  it('renvoie la valeur si elle arrive à temps', async () => {
    expect(await withDeadline(later(5, 'ok'), 200, 'fallback')).toEqual({ value: 'ok', timedOut: false });
  });

  it('renvoie la valeur de repli au-delà du délai', async () => {
    expect(await withDeadline(later(200, 'ok'), 10, 'fallback')).toEqual({ value: 'fallback', timedOut: true });
  });

  it('renvoie la valeur de repli si la promesse échoue', async () => {
    expect(await withDeadline(Promise.reject(new Error('x')), 200, 'fallback')).toEqual({ value: 'fallback', timedOut: false, failed: true });
  });
});
