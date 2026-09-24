import { describe, expect, it } from 'vitest';
import { RULES } from './config/rules.js';
import {
  STEPS,
  beyondForecast,
  buildTrip,
  effectiveNightLodgings,
  emptyDraft,
  farLodgings,
  firstInvalidStep,
  groupLodgings,
  includesRestaurants,
  tripNights,
  validateStep
} from './tripDraft.js';

const TODAY = '2026-09-24';
const ctx = { rules: RULES, today: TODAY };
const ANNECY = { name: 'Hôtel du Lac', address: '1 quai Napoléon III, 74000 Annecy', lat: 45.8992, lon: 6.1294 };
const CHAMONIX = { address: '5 rue du Lyret, 74400 Chamonix-Mont-Blanc', lat: 45.9237, lon: 6.8694 };
const destination = { name: 'Annecy', country: 'France', countryCode: 'FR', lat: 45.8992, lon: 6.1294, timezone: 'Europe/Paris' };

let n = 0;
const makeId = () => `id-${(n += 1)}`;

function validDraft(patch = {}) {
  return {
    ...emptyDraft(RULES),
    destination,
    radiusKm: 20,
    startDate: '2026-10-01',
    endDate: '2026-10-05',
    travelers: 2,
    lodgingMode: 'unknown',
    mode: 'car',
    fuelType: 'diesel',
    ...patch
  };
}

describe('tripNights', () => {
  it('liste les nuits de l\'arrivée à la veille du départ', () => {
    expect(tripNights('2026-10-01', '2026-10-05')).toEqual(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
    expect(tripNights('2026-10-01', '2026-10-01')).toEqual([]);
    expect(tripNights('', '2026-10-01')).toEqual([]);
  });
});

describe('validateStep', () => {
  it('refuse une destination absente ou hors des pays pris en charge', () => {
    expect(validateStep('destination', emptyDraft(RULES), ctx)).toEqual({ destination: 'destinationRequired' });
    expect(validateStep('destination', validDraft({ destination: { ...destination, countryCode: 'TR' } }), ctx)).toEqual({
      destination: 'destinationUnsupported'
    });
    expect(validateStep('destination', validDraft({ radiusKm: 15 }), ctx)).toEqual({ radiusKm: 'radiusRequired' });
    expect(validateStep('destination', validDraft(), ctx)).toEqual({});
  });

  it('limite le séjour à 1 à 7 jours, à partir d\'aujourd\'hui', () => {
    expect(validateStep('dates', validDraft({ startDate: '', endDate: '' }), ctx)).toMatchObject({ startDate: 'startDateRequired', endDate: 'endDateRequired' });
    expect(validateStep('dates', validDraft({ startDate: '2026-09-23' }), ctx)).toMatchObject({ startDate: 'startDatePast' });
    expect(validateStep('dates', validDraft({ endDate: '2026-09-30' }), ctx)).toEqual({ endDate: 'endBeforeStart' });
    expect(validateStep('dates', validDraft({ endDate: '2026-10-08' }), ctx)).toEqual({ endDate: 'tooLong' });
    expect(validateStep('dates', validDraft({ endDate: '2026-10-07' }), ctx)).toEqual({});
    expect(validateStep('dates', validDraft({ startDate: TODAY, endDate: TODAY }), ctx)).toEqual({});
  });

  it('refuse un nombre de voyageurs invalide', () => {
    for (const travelers of [0, 1.5, RULES.trip.maxTravelers + 1, Number.NaN]) {
      expect(validateStep('dates', validDraft({ travelers }), ctx)).toEqual({ travelers: 'travelersInvalid' });
    }
  });

  it('demande un choix d\'hébergement, sauf pour un séjour d\'une journée', () => {
    expect(validateStep('lodging', validDraft({ lodgingMode: null }), ctx)).toEqual({ lodgingMode: 'lodgingModeRequired' });
    expect(validateStep('lodging', validDraft({ lodgingMode: 'same' }), ctx)).toEqual({ lodging: 'lodgingRequired' });
    expect(validateStep('lodging', validDraft({ lodgingMode: 'multiple' }), ctx)).toEqual({
      'night-0': 'nightLodgingRequired',
      'night-1': 'nightLodgingRequired',
      'night-2': 'nightLodgingRequired',
      'night-3': 'nightLodgingRequired'
    });
    expect(validateStep('lodging', validDraft({ lodgingMode: 'multiple', nightLodgings: [ANNECY] }), ctx)).toEqual({});
    expect(validateStep('lodging', validDraft({ lodgingMode: null, endDate: '2026-10-01' }), ctx)).toEqual({});
  });

  it('demande le carburant si le déplacement se fait en voiture', () => {
    expect(validateStep('transport', validDraft({ mode: null }), ctx)).toEqual({ mode: 'modeRequired' });
    expect(validateStep('transport', validDraft({ fuelType: null }), ctx)).toEqual({ fuelType: 'fuelTypeRequired' });
    expect(validateStep('transport', validDraft({ mode: 'walk', fuelType: null }), ctx)).toEqual({});
  });

  it('valide le profil et la pause déjeuner', () => {
    expect(validateStep('profile', validDraft({ profile: 'x', lunch: 'y' }), ctx)).toEqual({ profile: 'profileRequired', lunch: 'lunchRequired' });
  });

  it('au récapitulatif, signale les étapes incomplètes', () => {
    expect(validateStep('summary', validDraft({ mode: null }), ctx)).toEqual({ transport: 'stepIncomplete' });
    expect(firstInvalidStep(validDraft({ mode: null }), ctx)).toBe(STEPS.indexOf('transport'));
    expect(firstInvalidStep(validDraft(), ctx)).toBe(-1);
  });
});

describe('hébergements', () => {
  it('pré-remplit chaque nuit avec l\'hébergement de la veille', () => {
    const draft = validDraft({ lodgingMode: 'multiple', nightLodgings: [ANNECY, null, CHAMONIX] });
    expect(effectiveNightLodgings(draft)).toEqual([ANNECY, ANNECY, CHAMONIX, CHAMONIX]);
  });

  it('regroupe les nuits consécutives au même endroit, pas les nuits séparées', () => {
    const nights = ['n1', 'n2', 'n3', 'n4'];
    const lodgings = groupLodgings(nights, [ANNECY, CHAMONIX, CHAMONIX, ANNECY], () => 'x');
    expect(lodgings.map((l) => l.nights)).toEqual([['n1'], ['n2', 'n3'], ['n4']]);
  });

  it('séjour de 4 nuits : 2 à Annecy puis 2 à Chamonix -> deux hébergements', () => {
    n = 0;
    const trip = buildTrip(validDraft({ lodgingMode: 'multiple', nightLodgings: [ANNECY, null, CHAMONIX] }), {
      id: 'trip-1',
      now: '2026-09-24T10:00:00.000Z',
      makeId
    });
    expect(trip.lodgings).toEqual([
      { id: 'id-1', name: 'Hôtel du Lac', address: ANNECY.address, lat: ANNECY.lat, lon: ANNECY.lon, nights: ['2026-10-01', '2026-10-02'] },
      { id: 'id-2', address: CHAMONIX.address, lat: CHAMONIX.lat, lon: CHAMONIX.lon, nights: ['2026-10-03', '2026-10-04'] }
    ]);
  });

  it('un seul hébergement couvre toutes les nuits ; "je ne sais pas" n\'en crée aucun', () => {
    const same = buildTrip(validDraft({ lodgingMode: 'same', lodging: ANNECY }), { id: 't', now: 'n', makeId });
    expect(same.lodgings).toHaveLength(1);
    expect(same.lodgings[0].nights).toHaveLength(4);
    expect(buildTrip(validDraft({ lodgingMode: 'unknown' }), { id: 't', now: 'n', makeId }).lodgings).toEqual([]);
  });

  it('signale un hébergement au-delà de 1,5 fois le rayon', () => {
    // Chamonix est à ~57 km d'Annecy ; rayon 20 km -> limite 30 km.
    const far = farLodgings([ANNECY, CHAMONIX, CHAMONIX], destination, 20, RULES);
    expect(far).toEqual([{ place: CHAMONIX, km: 57 }]);
    expect(farLodgings([CHAMONIX], destination, 40, RULES)).toEqual([]);
  });
});

describe('buildTrip', () => {
  it('construit un Trip complet : pays, fuseau, monnaie, préférences', () => {
    const trip = buildTrip(validDraft({ lunch: 'both', prefs: { vegetarian: true, wheelchair: false } }), { id: 'trip-9', now: '2026-09-24T10:00:00.000Z', makeId });
    expect(trip).toMatchObject({
      schemaVersion: 1,
      id: 'trip-9',
      title: 'Annecy',
      deleted: false,
      destination: { name: 'Annecy', countryCode: 'FR', lat: 45.8992, lon: 6.1294, radiusKm: 20 },
      timezone: 'Europe/Paris',
      currency: 'EUR',
      startDate: '2026-10-01',
      endDate: '2026-10-05',
      travelers: 2,
      mode: 'car',
      fuelType: 'diesel',
      prefs: { vegetarian: true, wheelchair: false },
      days: [],
      candidates: []
    });
  });

  it('prend la monnaie du pays et ignore carburant et préférences inutiles', () => {
    const krakow = { name: 'Cracovie', country: 'Pologne', countryCode: 'PL', lat: 50.06, lon: 19.94, timezone: 'Europe/Warsaw' };
    const trip = buildTrip(validDraft({ destination: krakow, mode: 'walk', lunch: 'market', prefs: { vegetarian: true, wheelchair: true } }), {
      id: 't',
      now: 'n',
      makeId
    });
    expect(trip.currency).toBe('PLN');
    expect(trip).not.toHaveProperty('fuelType');
    expect(trip.prefs).toEqual({ vegetarian: false, wheelchair: false });
  });
});

describe('divers', () => {
  it('détecte un séjour au-delà de la fenêtre de prévision (16 jours)', () => {
    expect(beyondForecast('2026-10-09', TODAY, RULES)).toBe(false);
    expect(beyondForecast('2026-10-10', TODAY, RULES)).toBe(true);
  });

  it('sait si les restaurants sont inclus', () => {
    expect(includesRestaurants('both')).toBe(true);
    expect(includesRestaurants('market')).toBe(false);
  });
});
