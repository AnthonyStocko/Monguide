import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PLACE_CATEGORIES } from '@domain/model.js';
import Illustration, { ILLUSTRATIONS, illustrationForCategory, illustrationForStep } from './index.jsx';
import { PALETTE } from './palette.js';

const names = Object.keys(ILLUSTRATIONS);
const markup = (name) => renderToStaticMarkup(<Illustration name={name} />);
const colorsOf = (html) => new Set([...html.matchAll(/#[0-9a-f]{6}\b/gi)].map((m) => m[0].toLowerCase()));

describe('illustrations maison', () => {
  it('la liste demandée est complète', () => {
    expect(names).toEqual([
      'restaurant', 'market', 'farm', 'park', 'nature', 'viewpoint', 'smallHeritage', 'monument', 'museum', 'personal', 'lodging',
      'landscape', 'noTrips', 'offline', 'error', 'noResults', 'onboardingPrepare', 'onboardingFollow', 'onboardingFree'
    ]);
  });

  it.each(names)('%s : décorative, sans texte, 3 à 5 couleurs de la palette', (name) => {
    const html = markup(name);
    expect(html).toMatch(/^<svg[^>]* aria-hidden="true"/);
    expect(html).not.toMatch(/<text|<title|<image|href=/);
    const colors = colorsOf(html);
    expect([...colors].every((c) => PALETTE.includes(c)), [...colors].join(' ')).toBe(true);
    expect(colors.size).toBeGreaterThanOrEqual(3);
    expect(colors.size).toBeLessThanOrEqual(5);
  });

  it('animations seulement sur le soleil, le nuage et le repère', () => {
    expect(markup('landscape')).toContain('ill-spin');
    expect(markup('landscape')).toContain('ill-drift');
    expect(markup('onboardingPrepare')).toContain('ill-hop');
    expect(markup('restaurant')).not.toMatch(/ill-/);
  });
});

describe('vignette de chaque étape', () => {
  it('chaque catégorie de lieu a sa vignette carrée', () => {
    for (const category of PLACE_CATEGORIES) {
      const name = illustrationForCategory(category);
      expect(ILLUSTRATIONS[name].format, category).toBe('square');
    }
  });

  it.each([
    [{ type: 'culture', place: { category: 'monument' } }, 'monument'],
    [{ type: 'personal' }, 'personal'],
    [{ type: 'personal', place: { category: 'personal' } }, 'personal'],
    [{ type: 'lunch' }, 'restaurant'],
    [{ type: 'culture' }, 'museum'],
    [{ type: 'outdoor' }, 'nature'],
    [{ type: 'relax' }, 'park']
  ])('%o -> %s (jamais sans image)', (step, expected) => {
    expect(illustrationForStep(step)).toBe(expected);
  });
});
