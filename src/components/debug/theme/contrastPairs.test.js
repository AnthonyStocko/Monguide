import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CONTRAST_PAIRS, SCRIM_ALPHA, evaluatePairs, parseThemeColors } from './contrastPairs.js';

const css = readFileSync(new URL('../../../index.css', import.meta.url), 'utf8');
const colors = parseThemeColors(css);

describe('contrastes du design system (index.css)', () => {
  it.each(evaluatePairs(colors).map((r) => [r.usage, r.fg, r.bg, r]))('%s : %s sur %s', (_usage, _fg, _bg, r) => {
    expect(r.ratio).toBeGreaterThanOrEqual(r.min);
  });

  it('le voile image-scrim atteint l’opacité vérifiée sous le texte, dans la couleur ink', () => {
    const scrim = /@utility image-scrim \{[^}]*\}/.exec(css)?.[0] ?? '';
    // Arrêts du dégradé ; le dernier (transparent) est la zone de fondu, sans texte.
    const alphas = [...scrim.matchAll(/rgb\(15 23 42 \/ ([\d.]+)\)/g)].map((m) => Number(m[1])).slice(0, -1);
    expect(alphas.length).toBeGreaterThan(0);
    expect(colors.ink).toBe('#0f172a');
    expect(Math.min(...alphas)).toBeGreaterThanOrEqual(SCRIM_ALPHA);
  });

  it('toutes les paires désignent des jetons existants', () => {
    for (const { fg, bg } of CONTRAST_PAIRS) {
      for (const c of [fg, bg]) if (!c.startsWith('#')) expect(colors, c).toHaveProperty(c);
    }
  });
});
