import { readdirSync, readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reevaluatePlanning } from './reevaluatePlanning.js';
import { replanDay } from './replanDay.js';
import { personal, rules, standardDay, trip } from './testing/dayFixture.js';

/**
 * La relecture par une IA ne concerne que la génération initiale (fonction
 * generate) : le domaine partagé, exécuté aussi sur le téléphone (recalcul de
 * journée, suivi, hors ligne), n'appelle jamais l'IA ni le réseau.
 */
const dir = new URL('./', import.meta.url);
const sources = (url) =>
  readdirSync(url, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? sources(new URL(`${e.name}/`, url)) : e.name.endsWith('.js') && !e.name.endsWith('.test.js') ? [new URL(e.name, url)] : []
  );

describe('aucun appel à l\'IA hors de la génération initiale', () => {
  let fetchMock;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('aucun module du domaine n\'importe la couche IA ni n\'appelle le réseau', () => {
    for (const file of sources(dir)) {
      const text = readFileSync(file, 'utf8');
      expect(text, file.pathname).not.toMatch(/from ['"][^'"]*\/ai\//);
      expect(text, file.pathname).not.toMatch(/\bfetch\(/);
    }
  });

  it('recalcul d\'une journée (replanDay) et suivi en temps réel : aucune requête', () => {
    const t = trip();
    replanDay(t, 0, personal('p', '14:00', '16:00', { km: 0.9 }), rules);
    const done = { ...t, days: [{ ...t.days[0], steps: t.days[0].steps.map((s, i) => (i === 0 ? { ...s, status: 'done' } : s)) }] };
    reevaluatePlanning(done, 0, 'culture', { now: '12:00', online: true }, rules);
    expect(standardDay().steps).toHaveLength(4);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
