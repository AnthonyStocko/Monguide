import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { RULES } from '../../supabase/functions/_shared/domain/config/rules.js';
import { dedupePlaces } from '../../supabase/functions/_shared/domain/dedupePlaces.js';
import { generateTrip } from '../../supabase/functions/_shared/domain/generateTrip.js';
import { applyPlaceQuality } from '../../supabase/functions/_shared/domain/scoring/exclusions.js';
import { tripMetrics } from './metrics.js';

/**
 * Séjours de référence (Prompt 10.0) en CI, sans réseau : lieux collectés
 * figés dans fixtures/ (reference-trips.js --local --save-fixtures, signaux
 * Wikidata compris), puis lieux écartés, dédoublonnage et génération par le
 * code du dépôt. Échoue si un critère se dégrade : incontournable de
 * Bruxelles absent, repas manquant, temps mort de plus de 45 min, libellé
 * générique ou dans une langue non voulue, visite en extérieur après la nuit,
 * moins de visites qu'avant à Villefranche.
 * Régénérer les données : node --use-system-ca scripts/quality/reference-trips.js --local --save-fixtures
 */

const dir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const MAX_GAP_MIN = 45;
/** Grand-Place, Galeries royales Saint-Hubert, Manneken-Pis, Mont des Arts. */
const BRUSSELS_MUST_SEE = ['Q215429', 'Q1491935', 'Q152072', 'Q1865794'];
/** Visites par jour à Villefranche avant le Prompt 10.0 (séjour de référence du 2026-10-30) : 3. */
const VILLEFRANCHE_VISITS_BEFORE = 6;

function run(id) {
  const f = JSON.parse(readFileSync(join(dir, `${id}.json`), 'utf8'));
  const { places } = applyPlaceQuality(f.collected, RULES, { today: f.today });
  let seq = 0;
  const { trip } = generateTrip(
    { trip: f.request, places: dedupePlaces(places, RULES.places.dedupDistanceM), appellations: f.appellations, co2Factors: f.co2, makeId: () => `${id}-${(seq += 1)}` },
    RULES
  );
  return { trip, metrics: tripMetrics(trip, { mustSee: id === 'bruxelles' ? BRUSSELS_MUST_SEE : [] }) };
}

describe.each(['bruxelles', 'lyon', 'villefranche', 'colmar', 'barcelone'])('séjour de référence : %s', (id) => {
  const { trip, metrics } = run(id);

  it('un déjeuner et un dîner chaque jour', () => {
    expect(metrics.missingMeals).toBe(0);
  });

  it(`aucun temps mort de plus de ${MAX_GAP_MIN} min`, () => {
    for (const d of metrics.days) expect(d.maxGapMin, d.date).toBeLessThanOrEqual(MAX_GAP_MIN);
  });

  it('aucun libellé générique, aucun libellé dans une langue non voulue', () => {
    expect(metrics.genericLabels).toEqual([]);
    expect(metrics.unwantedLanguage).toEqual([]);
    expect(metrics.reserveGeneric).toEqual([]);
    expect(metrics.reserveUnwanted).toEqual([]);
  });

  it('aucune visite en extérieur après la tombée de la nuit', () => {
    for (const d of metrics.days) expect(d.outdoorAfterDark, d.date).toEqual([]);
  });

  it('aucun lieu répété', () => {
    const ids = trip.days.flatMap((d) => d.steps.map((s) => s.place?.id).filter(Boolean));
    expect(new Set(ids).size).toBe(ids.length);
  });

  if (id === 'bruxelles') {
    it('Grand-Place, Galeries royales Saint-Hubert, Manneken-Pis (coup d’œil) et Mont des Arts présents', () => {
      expect(metrics.mustSee.sort()).toEqual([...BRUSSELS_MUST_SEE].sort());
      const manneken = trip.days.flatMap((d) => d.steps).find((s) => s.place?.wikidata === 'Q152072');
      expect(manneken.badges).toContain('glance');
    });

    it('temps morts cumulés de moins de 45 min par jour, une activité du soir chaque jour', () => {
      for (const d of metrics.days) expect(d.deadMin, d.date).toBeLessThan(45);
      for (const day of trip.days) {
        const evening = day.steps.some((s) => s.place && !['lunch', 'dinner'].includes(s.type) && s.start >= day.sunset);
        expect(evening, day.date).toBe(true);
      }
    });
  }

  if (id === 'villefranche') {
    it('au moins autant de visites qu’avant le Prompt 10.0', () => {
      expect(metrics.days.reduce((n, d) => n + d.visits, 0)).toBeGreaterThanOrEqual(VILLEFRANCHE_VISITS_BEFORE);
    });
  }
}, 30000);
