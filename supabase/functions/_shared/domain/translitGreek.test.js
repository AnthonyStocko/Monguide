import { describe, expect, it } from 'vitest';
import { translitGreek } from './translitGreek.js';

describe('translitGreek (ELOT 743)', () => {
  it.each([
    ['Αθήνα', 'Athina'],
    ['Πλάκα', 'Plaka'],
    ['Νάξος', 'Naxos'],
    ['Θεσσαλονίκη', 'Thessaloniki'],
    ['Χανιά', 'Chania'],
    ['Ψυρρή', 'Psyrri'],
    ['Μοναστηράκι', 'Monastiraki'],
    ['Ταβέρνα Ο Γιάννης', 'Taverna O Giannis']
  ])('%s -> %s', (greek, latin) => {
    expect(translitGreek(greek)).toBe(latin);
  });

  it('groupes de voyelles et de consonnes', () => {
    expect(translitGreek('Ουζερί')).toBe('Ouzeri');
    expect(translitGreek('Ειρήνη')).toBe('Eirini');
    expect(translitGreek('Άγγελος')).toBe('Angelos');
    expect(translitGreek('Σφίγξ')).toBe('Sfinx');
    expect(translitGreek('Μελαγχολία')).toBe('Melancholia');
    expect(translitGreek('Μπουζούκι')).toBe('Mpouzouki');
    expect(translitGreek('Ντομάτα')).toBe('Ntomata');
    expect(translitGreek('Υιός')).toBe('Yios');
  });

  it('αυ, ευ, ηυ : v devant voyelle ou consonne sonore, f ailleurs', () => {
    expect(translitGreek('Ευρώπη')).toBe('Evropi');
    expect(translitGreek('Αύρα')).toBe('Avra');
    expect(translitGreek('Ναύπλιο')).toBe('Nafplio');
    expect(translitGreek('Αυτοκίνητο')).toBe('Aftokinito');
    expect(translitGreek('Παπαδημητρίου Ευ')).toBe('Papadimitriou Ef');
    expect(translitGreek('Ευαγγελισμός')).toBe('Evangelismos');
  });

  it('le tréma sépare le groupe', () => {
    expect(translitGreek('Ταΰγετος')).toBe('Taygetos');
    expect(translitGreek('Κορωπί και Ναϊάδες')).toBe('Koropi kai Naiades');
  });

  it('capitales', () => {
    expect(translitGreek('ΘΗΒΑ')).toBe('THIVA');
    expect(translitGreek('Θήβα')).toBe('Thiva');
    expect(translitGreek('ΟΥΖΕΡΙ ΤΟ ΧΑΝΙ')).toBe('OUZERI TO CHANI');
    expect(translitGreek('ΑΥΡΑ')).toBe('AVRA');
    expect(translitGreek('Χ')).toBe('Ch');
  });

  it('caractères non grecs gardés tels quels', () => {
    expect(translitGreek('Café Πλάκα & Co. 1898')).toBe('Café Plaka & Co. 1898');
    expect(translitGreek('Crêperie')).toBe('Crêperie');
    expect(translitGreek('')).toBe('');
  });
});
