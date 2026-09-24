// Générateur de journées aléatoires valides (fast-check), partagé par les tests.
import fc from 'fast-check';
import { fromMinutes } from '../time.js';
import { travelMinutes } from '../travel.js';
import { personal, place, rules, step } from './dayFixture.js';

export const TYPES = {
  culture: ['museum', 'monument'],
  lunch: ['restaurant', 'market'],
  outdoor: ['park', 'nature', 'viewpoint'],
  relax: ['park', 'viewpoint']
};
export const HOURS = [undefined, 'Mo-Su 09:00-18:00', 'Mo-Su 12:00-14:30,19:00-22:00', 'Mo-Fr 10:00-12:00', 'Mo-Su 11:00-23:00'];

export const rawStep = fc.record({
  gap: fc.integer({ min: 0, max: 90 }),
  duration: fc.integer({ min: 15, max: 150 }),
  type: fc.constantFrom('culture', 'lunch', 'outdoor', 'relax'),
  km: fc.option(fc.integer({ min: -30, max: 30 }), { nil: null, freq: 6 }),
  cat: fc.nat(10),
  hours: fc.nat(HOURS.length - 1),
  flag: fc.constantFrom('none', 'none', 'none', 'none', 'custom', 'personal', 'done')
});

/** Journée valide (aucun chevauchement, trajets compris) construite pas à pas. */
export function buildDay(raws, prefix, date) {
  const steps = [];
  let cursor = 8 * 60;
  let previous = null;
  raws.forEach((r, i) => {
    const id = `${prefix}${i}`;
    let s;
    if (r.flag === 'personal') s = personal(id, '00:00', '00:01', { km: r.km === null ? null : r.km / 10, title: `Perso ${id}` });
    else {
      const categories = TYPES[r.type];
      const category = categories[r.cat % categories.length];
      const extra = category === 'restaurant' ? { food: { regional: false, ...(HOURS[r.hours] ? { openingHours: HOURS[r.hours] } : {}) } } : HOURS[r.hours] ? { openingHours: HOURS[r.hours] } : {};
      const p = r.km === null ? null : place(`pl-${id}`, category, r.km / 10, extra);
      s = step(id, r.type, '00:00', '00:01', p, { customTime: r.flag === 'custom', status: r.flag === 'done' ? 'done' : 'planned' });
    }
    const leg = previous?.place && s.place ? travelMinutes(previous.place, s.place, 'walk', rules) : 0;
    const start = cursor + leg + r.gap;
    const end = start + r.duration;
    if (end > 23 * 60) return;
    s.start = fromMinutes(start);
    s.end = fromMinutes(end);
    steps.push(s);
    cursor = end;
    previous = s;
  });
  return { date, weatherAvailable: false, steps };
}

export const scenario = fc.record({
  main: fc.array(rawStep, { minLength: 1, maxLength: 6 }),
  others: fc.array(fc.array(rawStep, { minLength: 0, maxLength: 4 }), { minLength: 0, maxLength: 2 }),
  personalStart: fc.integer({ min: 7 * 12, max: 21 * 12 }).map((n) => n * 5),
  personalDuration: fc.integer({ min: 1, max: 48 }).map((n) => n * 5),
  personalKm: fc.option(fc.integer({ min: -30, max: 30 }), { nil: null, freq: 3 }),
  candidates: fc.array(fc.record({ km: fc.integer({ min: -30, max: 30 }), cat: fc.constantFrom('museum', 'monument', 'restaurant', 'market', 'park', 'nature', 'viewpoint'), hours: fc.nat(HOURS.length - 1) }), { maxLength: 8 }),
  rain: fc.option(fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 24, maxLength: 24 }), { nil: null }),
  choices: fc.array(fc.boolean(), { minLength: 10, maxLength: 10 })
});
