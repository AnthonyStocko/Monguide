import { describe, expect, it } from 'vitest';
import fr from '../i18n/locales/fr.json';
import { remindersSignature, renderNotification } from './notificationText.js';

/** Traduction minimale à partir du fichier français (clés à points, {{valeurs}}). */
const t = (key, values = {}) =>
  key
    .split('.')
    .reduce((node, part) => node[part], fr)
    .replace(/\{\{(\w+)\}\}/g, (_, name) => values[name]);
const options = { t, locale: 'fr' };

const reminder = (data) => ({ kind: 'reminder', date: '2026-10-20', data: { tripTitle: 'Séjour à Lyon', start: '14:00', end: '15:30', ...data } });
const summary = {
  kind: 'summary',
  date: '2026-10-20',
  data: {
    departure: { time: '09:10', lodgingName: '12 rue des Lilas, Lyon' },
    steps: [
      { id: 's1', start: '10:00', name: 'Musée des Confluences', type: 'visit' },
      { id: 's2', start: '14:00', name: 'Rendez-vous chez le notaire', type: 'personal' },
      { id: 's3', start: '16:00', name: null, type: 'free' },
      { id: 's4', start: '19:30', name: 'Chez Paul', type: 'dinner' }
    ]
  }
};

describe('renderNotification', () => {
  it('rappel d’un lieu : nom du lieu, horaires et séjour', () => {
    expect(renderNotification(reminder({ name: 'Musée des Confluences', type: 'visit' }), options)).toEqual({
      title: 'Dans une heure : Musée des Confluences',
      body: 'De 14:00 à 15:30 · Séjour à Lyon'
    });
  });

  it('sur l’appareil (Android) : le titre d’une étape personnelle est affiché', () => {
    expect(renderNotification(reminder({ name: 'Rendez-vous chez le notaire', type: 'personal' }), options).title).toBe('Dans une heure : Rendez-vous chez le notaire');
  });

  it('confidentiel (web) : jamais le titre d’une étape personnelle', () => {
    const text = renderNotification(reminder({ name: 'Rendez-vous chez le notaire', type: 'personal' }), { ...options, confidential: true });
    expect(text.title).toBe('Dans 1 h : votre étape personnelle');
    expect(JSON.stringify(text)).not.toContain('notaire');
  });

  it('confidentiel : un lieu public garde son nom', () => {
    expect(renderNotification(reminder({ name: 'Chez Paul', type: 'dinner' }), { ...options, confidential: true }).title).toBe('Dîner dans une heure : Chez Paul');
  });

  it('résumé sur l’appareil : départ depuis l’hébergement et toutes les étapes', () => {
    const { title, body } = renderNotification(summary, options);
    expect(title).toBe('Demain, mardi 20 octobre');
    expect(body.split('\n')).toEqual([
      'Départ conseillé à 09:10 de 12 rue des Lilas, Lyon',
      '10:00 Musée des Confluences',
      '14:00 Rendez-vous chez le notaire',
      '16:00 Temps libre',
      '19:30 Dîner : Chez Paul'
    ]);
  });

  it('résumé confidentiel : ni adresse de l’hébergement, ni titre d’étape personnelle', () => {
    const { body } = renderNotification(summary, { ...options, confidential: true });
    expect(body.split('\n')).toEqual(['Départ conseillé à 09:10', '10:00 Musée des Confluences', '14:00 Étape personnelle', '16:00 Temps libre', '19:30 Dîner : Chez Paul']);
    expect(body).not.toContain('Lilas');
    expect(body).not.toContain('notaire');
  });
});

describe('remindersSignature', () => {
  const list = [
    { key: 1, sendAt: '2026-10-20T11:00:00.000Z', title: 'A', body: 'B', url: '/planning/t1?day=2026-10-20&step=s1' },
    { key: 2, sendAt: '2026-10-20T13:00:00.000Z', title: 'C', body: 'D', url: '/planning/t1?day=2026-10-20&step=s2' }
  ];

  it('liste vide : chaîne vide', () => {
    expect(remindersSignature([])).toBe('');
  });

  it('stable pour une même liste, différente dès qu’une heure ou un texte change', () => {
    expect(remindersSignature(list)).toBe(remindersSignature(structuredClone(list)));
    expect(remindersSignature([{ ...list[0], sendAt: '2026-10-20T11:30:00.000Z' }, list[1]])).not.toBe(remindersSignature(list));
    expect(remindersSignature([{ ...list[0], title: 'Autre' }, list[1]])).not.toBe(remindersSignature(list));
    expect(remindersSignature([list[0]])).not.toBe(remindersSignature(list));
  });
});

describe('renderNotification : rappel de réservation (groupe)', () => {
  it('« Réserver le dîner de demain pour 6 personnes », restaurant et heure', () => {
    const n = { kind: 'booking', date: '2026-12-12', data: { tripTitle: 'Bruxelles', start: '19:30', name: 'Chez Léon', travelers: 6, type: 'dinner' } };
    expect(renderNotification(n, options)).toEqual({ title: 'Réserver le dîner de demain pour 6 personnes', body: 'Chez Léon à 19:30 · Bruxelles' });
  });
});
