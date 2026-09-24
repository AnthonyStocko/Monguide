import { describe, expect, it } from 'vitest';
import { geoUrl, telUrl, webUrl } from './navigation.js';

describe('navigation', () => {
  it('construit un lien geo: avec un libellé', () => {
    expect(geoUrl({ lat: 45.9, lon: 4.7 }, 'Musée Paul-Dini')).toBe('geo:45.9,4.7?q=45.9,4.7(Mus%C3%A9e%20Paul-Dini)');
    expect(geoUrl({ lat: 45.9, lon: 4.7 })).toBe('geo:45.9,4.7?q=45.9,4.7');
  });

  it('construit des liens tel: et web', () => {
    expect(telUrl('+33 4 74 00-00-00')).toBe('tel:+33474000000');
    expect(webUrl('museepompiers.com/')).toBe('https://museepompiers.com/');
    expect(webUrl('http://a.fr')).toBe('http://a.fr');
  });
});
