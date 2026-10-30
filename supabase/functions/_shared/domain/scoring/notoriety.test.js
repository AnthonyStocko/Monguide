import { describe, expect, it } from 'vitest';
import { RULES } from '../config/rules.js';
import { notorietyScore, notorietyThreshold, percentile } from './notoriety.js';

describe('notorietyScore', () => {
  it('vaut 0 sans signaux ou sans article', () => {
    expect(notorietyScore(undefined, RULES)).toBe(0);
    expect(notorietyScore({ sitelinks: 0 }, RULES)).toBe(0);
  });

  it('croît avec le nombre d’articles Wikipédia, en échelle logarithmique, plafonné', () => {
    const at = (n) => notorietyScore({ sitelinks: n }, RULES);
    expect(at(1)).toBeLessThan(at(3));
    expect(at(3)).toBeLessThan(at(14));
    expect(at(14)).toBeLessThan(at(60));
    expect(at(60)).toBe(RULES.notoriety.weights.sitelinks);
    expect(at(500)).toBe(at(60));
    // Un article de plus compte beaucoup au début, presque plus au-delà de 40.
    expect(at(41) - at(40)).toBeLessThan(at(1) - at(0));
  });

  it('ajoute les signaux secondaires : articles fr et locaux, tags OSM, désignation de premier rang', () => {
    const base = notorietyScore({ sitelinks: 10 }, RULES);
    const w = RULES.notoriety.weights;
    expect(notorietyScore({ sitelinks: 10, langArticle: true, localArticle: true }, RULES)).toBe(base + w.langArticle + w.localArticle);
    expect(notorietyScore({ osmAttraction: true, osmHeritage: true }, RULES)).toBe(w.osmAttraction + w.osmHeritage);
    expect(notorietyScore({ sitelinks: 10, designations: ['Q9259'] }, RULES)).toBe(base + w.worldHeritage);
    expect(notorietyScore({ sitelinks: 10, designations: ['Q10387684'] }, RULES)).toBe(base + w.topDesignation);
    // Monument classé bruxellois : désignation courante, aucun bonus.
    expect(notorietyScore({ sitelinks: 10, designations: ['Q19346745'] }, RULES)).toBe(base);
  });

  it('classe Grand-Place et Manneken-Pis loin devant une maison d’inventaire, dans 0-100', () => {
    const grandPlace = notorietyScore({ sitelinks: 56, langArticle: true, localArticle: true, designations: ['Q9259', 'Q19346745'] }, RULES);
    const manneken = notorietyScore({ sitelinks: 67, langArticle: true, localArticle: true }, RULES);
    const maison = notorietyScore({ sitelinks: 0, designations: ['Q19346745'] }, RULES);
    expect(grandPlace).toBeLessThanOrEqual(100);
    expect(grandPlace).toBeGreaterThan(90);
    expect(manneken).toBeGreaterThan(70);
    expect(maison).toBe(0);
  });
});

describe('percentile', () => {
  it('interpole entre les valeurs, 0 pour une liste vide', () => {
    expect(percentile([], 75)).toBe(0);
    expect(percentile([0, 10, 20, 30, 40], 50)).toBe(20);
    expect(percentile([0, 10], 75)).toBe(7.5);
  });
});

describe('notorietyThreshold', () => {
  it('grande ville : percentile de la distribution locale, au-dessus du minimum absolu', () => {
    // 200 lieux sans article, 100 lieux moyens, 20 très connus.
    const scores = [...Array(200).fill(0), ...Array(100).fill(30), ...Array(20).fill(80)];
    const { threshold, lowered } = notorietyThreshold(scores, 12, RULES);
    expect(lowered).toBe(false);
    expect(threshold).toBe(30);
    expect(scores.filter((s) => s >= threshold)).toHaveLength(120);
  });

  it('jamais sous le minimum absolu quand il reste assez de lieux', () => {
    const scores = [...Array(50).fill(0), ...Array(10).fill(20)];
    expect(notorietyThreshold(scores, 8, RULES)).toEqual({ threshold: RULES.notoriety.threshold.minScore, base: RULES.notoriety.threshold.minScore, lowered: false });
  });

  it('petite ville : le seuil baisse pour garder assez de visites', () => {
    // Villefranche-sur-Saône : presque aucun lieu connu.
    const scores = [24, 12, 12, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const { threshold, base, lowered } = notorietyThreshold(scores, 8, RULES);
    expect(base).toBe(RULES.notoriety.threshold.minScore);
    expect(lowered).toBe(true);
    expect(threshold).toBe(0);
    expect(scores.filter((s) => s >= threshold).length).toBeGreaterThanOrEqual(8);
  });

  it('petite ville avec quelques lieux connus : seuil au score du dernier lieu nécessaire', () => {
    const scores = [60, 40, 30, 25, 20, 10, 5, 5, 0, 0];
    const { threshold, lowered } = notorietyThreshold(scores, 6, RULES);
    expect(lowered).toBe(true);
    expect(threshold).toBe(10);
  });

  it('sans lieu : minimum absolu', () => {
    expect(notorietyThreshold([], 8, RULES).threshold).toBe(RULES.notoriety.threshold.minScore);
  });
});
