import { describe, expect, it } from 'vitest';
import { RULES as rules } from './config/rules.js';
import { makePersonalStep, validatePersonalStep } from './personalStep.js';

describe('validatePersonalStep', () => {
  it('titre obligatoire, 60 caractères au plus ; fin après le début', () => {
    expect(validatePersonalStep({ title: 'Visite d’un proche', start: '14:00', end: '16:00' }, rules)).toEqual({});
    expect(validatePersonalStep({ title: '   ', start: '14:00', end: '16:00' }, rules)).toEqual({ title: 'required' });
    expect(validatePersonalStep({ title: 'x'.repeat(61), start: '14:00', end: '16:00' }, rules)).toEqual({ title: 'tooLong' });
    expect(validatePersonalStep({ title: 'x'.repeat(60), start: '14:00', end: '14:00' }, rules)).toEqual({ end: 'beforeStart' });
  });
});

describe('makePersonalStep', () => {
  it('étape verrouillée, horaire personnalisé, catégorie "personal", source "user"', () => {
    const s = makePersonalStep({ id: 'p1', title: ' Rendez-vous ', note: '  ', start: '10:00', end: '11:00', indoor: true, location: null });
    expect(s).toEqual({ id: 'p1', type: 'personal', category: 'personal', source: 'user', title: 'Rendez-vous', start: '10:00', end: '11:00', indoor: true, status: 'planned', customTime: true, locked: true, badges: [] });
  });

  it('avec un lieu : adresse précise, extérieur si choisi, note conservée', () => {
    const s = makePersonalStep({ id: 'p2', title: 'Pique-nique', note: 'Apporter la nappe', start: '12:00', end: '13:00', indoor: false, location: { address: '12 rue Nationale, Villefranche', lat: 45.99, lon: 4.72 } });
    expect(s.note).toBe('Apporter la nappe');
    expect(s.place).toEqual({ id: 'user:p2', name: 'Pique-nique', address: '12 rue Nationale, Villefranche', lat: 45.99, lon: 4.72, category: 'personal', source: 'user', certified: false, indoor: false });
  });
});
