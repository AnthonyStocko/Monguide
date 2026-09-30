import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PALETTE } from '../illustrations/palette.js';
import { BRAND_COLORS, iconSvg, logoSvg, pinLayers } from './logo.js';

// Fins de ligne normalisées : Git peut les convertir en CRLF sous Windows.
const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

describe('logo « Mon guide »', () => {
  it('le nom est en tracés : aucun texte ni police, affichage identique sans Fraunces', () => {
    for (const svg of [logoSvg(), logoSvg({ variant: 'mono' }), iconSvg()]) {
      expect(svg).not.toMatch(/<text|font-family|@font-face/);
    }
    expect(logoSvg()).toContain('<title>Mon guide</title>');
  });

  it('couleurs du design system uniquement', () => {
    const palette = PALETTE.map((c) => c.toLowerCase());
    for (const c of Object.values(BRAND_COLORS)) expect(palette).toContain(c.toLowerCase());
  });

  it('monochrome : une seule couleur, fenêtre évidée', () => {
    const mono = pinLayers('mono', '#000000');
    expect(new Set(mono.layers.map((l) => l.fill))).toEqual(new Set(['#000000']));
    expect(mono.layers[0].evenOdd).toBe(true);
  });

  it('fichiers publiés à jour avec la source (npm run brand)', () => {
    expect(read('assets/brand/logo.svg')).toBe(`${logoSvg()}\n`);
    expect(read('assets/brand/icon.svg')).toBe(`${iconSvg()}\n`);
    expect(read('site/assets/logo.svg')).toBe(`${logoSvg()}\n`);
    expect(read('public/favicon.svg')).toBe(`${iconSvg({ size: 64, scale: 1.2 })}\n`);
  });
});
