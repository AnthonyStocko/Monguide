import { describe, expect, it } from 'vitest';
import { RULES } from '../config/rules.js';
import { activityType, placeDuration } from './duration.js';

const p = (category, name = 'Lieu', extra = {}) => ({ category, name, ...extra });
const rec = (place, pace) => placeDuration(place, RULES, { pace }).recommendedMin;

describe('placeDuration : durée de base par type', () => {
  it('musée 1 h 30, monument 45 min, église 30 min, place 40 min, parc 1 h, coup d’œil 10 min', () => {
    expect(rec(p('museum'))).toBe(90);
    expect(rec(p('monument', 'Hôtel de ville'))).toBe(45);
    expect(rec(p('monument', 'Église Saint-Nizier'))).toBe(30);
    expect(rec(p('monument', 'Cathédrale Saint-Jean'))).toBe(30);
    expect(rec(p('monument', 'Place Bellecour'))).toBe(40);
    expect(rec(p('park', 'Parc de la Tête d’Or'))).toBe(60);
    expect(rec(p('monument', 'Fontaine', { glance: true }))).toBe(10);
  });

  it('la nature Wikidata (place.kind) l’emporte sur le nom', () => {
    expect(activityType(p('monument', 'Sainte-Chapelle de la ville', { kind: 'square' }))).toBe('square');
    expect(activityType(p('monument', 'Grand-Place'))).toBe('square');
    expect(activityType(p('monument', 'Notre-Dame du Sablon', { kind: 'church' }))).toBe('church');
  });
});

describe('placeDuration : notoriété et durées connues', () => {
  it('grand musée plus long (2 h 30)', () => {
    expect(rec(p('museum', 'Musée', { notoriety: 74 }))).toBe(90);
    expect(rec(p('museum', 'Musée', { notoriety: RULES.durationRules.bigMuseumScore }))).toBe(150);
  });

  it('monument ou église très connus : un quart d’heure de plus', () => {
    expect(rec(p('monument', 'Hôtel de ville', { notoriety: 85 }))).toBe(60);
    expect(rec(p('monument', 'Cathédrale', { notoriety: 85 }))).toBe(45);
  });

  it('table des durées connues (config/durations.json) prioritaire', () => {
    expect(rec(p('monument', 'Sagrada Família', { wikidata: 'Q48435', notoriety: 95 }))).toBe(90);
    expect(rec(p('museum', 'Musées royaux des Beaux-Arts', { wikidata: 'Q377500', notoriety: 70 }))).toBe(150);
    // Coup d'œil : jamais allongé par la table.
    expect(rec(p('monument', 'Manneken-Pis', { wikidata: 'Q152072', glance: true }))).toBe(10);
  });
});

describe('placeDuration : rythme et bornes', () => {
  it('coefficient du rythme (tranquille plus long, soutenu plus court), jamais pour un coup d’œil ni un repas', () => {
    const museum = p('museum');
    expect(rec(museum, 'relaxed')).toBe(115);
    expect(rec(museum, 'balanced')).toBe(90);
    expect(rec(museum, 'intense')).toBe(75);
    expect(rec(p('monument', 'Statue', { glance: true }), 'relaxed')).toBe(10);
    expect(rec(p('restaurant', 'Chez Léon'), 'intense')).toBe(RULES.durations.restaurant.recommendedMin);
  });

  it('minimum ≤ conseillée ≤ maximum (conseillée × maxFactor)', () => {
    for (const place of [p('museum'), p('monument'), p('park'), p('monument', 'Statue', { glance: true }), p('museum', 'M', { notoriety: 90 })]) {
      const d = placeDuration(place, RULES, { pace: 'intense' });
      expect(d.minimumMin).toBeLessThanOrEqual(d.recommendedMin);
      expect(d.recommendedMin).toBeLessThanOrEqual(d.maximumMin);
    }
    expect(placeDuration(p('museum'), RULES).maximumMin).toBe(135);
  });
});
