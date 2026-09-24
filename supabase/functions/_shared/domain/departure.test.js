import { describe, expect, it } from 'vitest';
import { adviseDeparture } from './departure.js';
import { travelMinutes } from './travel.js';
import { at, museum, personal, restaurant, rules, standardDay, step } from './testing/dayFixture.js';

const hotel = at(-0.4);

describe('adviseDeparture', () => {
  it('cas général : début de la première étape moins le trajet', () => {
    const leg = travelMinutes(hotel, museum, 'walk', rules);
    expect(adviseDeparture(standardDay().steps, hotel, 'walk', rules)).toEqual({ time: `09:${60 - leg}`, travelMin: leg });
  });

  it('journée qui commence par un temps libre : départ à 09:00, trajet vers la première étape ayant un lieu', () => {
    const steps = [step('free', 'culture', '10:00', '11:00', null), step('lunch', 'lunch', '12:30', '13:45', restaurant)];
    expect(adviseDeparture(steps, hotel, 'walk', rules)).toEqual({ time: '09:00', travelMin: travelMinutes(hotel, restaurant, 'walk', rules) });
  });

  it('temps libre plus tôt que 09:00 : départ au début du temps libre', () => {
    const steps = [step('free', 'culture', '08:30', '09:30', null), step('lunch', 'lunch', '12:30', '13:45', restaurant)];
    expect(adviseDeparture(steps, hotel, 'walk', rules).time).toBe('08:30');
  });

  it("une étape personnelle sans lieu en tête n'est pas un temps libre : cas général", () => {
    const steps = [personal('p', '10:00', '10:30'), step('lunch', 'lunch', '12:30', '13:45', restaurant)];
    const leg = travelMinutes(hotel, restaurant, 'walk', rules);
    expect(adviseDeparture(steps, hotel, 'walk', rules).time).toBe(`12:${30 - leg}`);
  });

  it("aucun départ sans hébergement ni étape ayant un lieu", () => {
    expect(adviseDeparture(standardDay().steps, null, 'walk', rules)).toBeNull();
    expect(adviseDeparture([step('free', 'culture', '10:00', '11:00', null)], hotel, 'walk', rules)).toBeNull();
  });
});
