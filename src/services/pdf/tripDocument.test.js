import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import i18next from 'i18next';
import fr from '../../i18n/locales/fr.json';
import en from '../../i18n/locales/en.json';
import { personal, standardDay, trip as makeTrip } from '@domain/testing/dayFixture.js';
import { exportFileName, buildTripDocument } from './tripDocument.js';
import { renderPdf } from './renderPdf.js';

let t;
let tEn;
beforeAll(async () => {
  const i = i18next.createInstance();
  await i.init({ lng: 'fr', resources: { fr: { translation: fr }, en: { translation: en } }, interpolation: { escapeValue: false } });
  t = i.getFixedT('fr');
  tEn = i.getFixedT('en');
});

function sampleTrip() {
  const d1 = standardDay('2026-10-06');
  d1.steps.splice(2, 0, personal('p', '14:00', '14:45', { km: 0.9, title: 'Visite d’un proche' }));
  d1.steps[2].place = { ...d1.steps[2].place, name: 'Chez Marie', address: '4 rue des Lilas, Villefranche' };
  d1.steps[2].note = 'Apporter les photos';
  const t0 = makeTrip([{ ...d1, startLodgingId: 'h', endLodgingId: 'h', departure: { time: '09:42', travelMin: 18 }, returnTravelMin: 20, holiday: 'Fête de test' }]);
  t0.title = 'Łódź et Αθήνα';
  t0.lodgings = [{ id: 'h', name: 'Hôtel du Parc', address: '12 place des Arts, Villefranche', lat: 45.98, lon: 4.72, nights: ['2026-10-06'] }];
  t0.carbon = { totalKgCo2e: 1.234, distanceKm: 12.5, byDay: [1.234], byMode: { walk: 0, bike: 0, transit: 0.06, car: 2.9 } };
  return t0;
}
const text = (doc) => doc.blocks.map((b) => (b.kind === 'step' ? [b.time, b.title, ...b.details].join(' | ') : b.text)).join('\n');
const generatedAt = new Date('2026-09-24T10:00:00Z');

describe('buildTripDocument', () => {
  it('titre, dates, planning jour par jour, étape personnelle, hébergement, bilan carbone et sources', () => {
    const doc = buildTripDocument(sampleTrip(), { t, locale: 'fr', includeAddresses: false, generatedAt });
    const all = text(doc);
    expect(doc.blocks[0]).toEqual({ kind: 'title', text: 'Łódź et Αθήνα' });
    expect(all).toContain('6 octobre 2026 – 6 octobre 2026');
    expect(all).toContain('Mardi 6 octobre');
    expect(all).toContain('Départ de Hôtel du Parc à 09:42');
    expect(all).toMatch(/14:00 – 14:45 \| Visite d’un proche \| .*Étape personnelle/);
    expect(all).toContain('Apporter les photos');
    expect(all).toContain('1,23 kg CO₂e');
    expect(all).toMatch(/OpenStreetMap — .*ODbL/);
    expect(all).toContain('Mérimée et Muséofile');
  });

  it('adresses personnelles et d\'hébergement masquées par défaut, affichées si l\'option est cochée', () => {
    const hidden = text(buildTripDocument(sampleTrip(), { t, locale: 'fr', includeAddresses: false, generatedAt }));
    expect(hidden).not.toContain('place des Arts');
    expect(hidden).not.toContain('rue des Lilas');
    expect(hidden).not.toContain('Chez Marie');
    expect(hidden).toContain('Adresses personnelles masquées');
    const shown = text(buildTripDocument(sampleTrip(), { t, locale: 'fr', includeAddresses: true, generatedAt }));
    expect(shown).toContain('Hôtel du Parc (12 place des Arts, Villefranche)');
    expect(shown).toContain('Chez Marie, 4 rue des Lilas, Villefranche');
  });

  it("dans la langue de l'interface (anglais)", () => {
    const all = text(buildTripDocument(sampleTrip(), { t: tEn, locale: 'en', includeAddresses: false, generatedAt }));
    expect(all).toContain('Tuesday, October 6');
    expect(all).toContain('Personal stop');
    expect(all).toContain('Data sources');
  });

  it('nom de fichier sans accents ni espaces', () => {
    expect(exportFileName({ title: 'Villefranche-sur-Saône (été)', startDate: '2026-10-06' })).toBe('mon-guide-villefranche-sur-saone-ete-2026-10-06.pdf');
    expect(exportFileName({ title: 'Αθήνα', startDate: '2026-10-06' })).toBe('mon-guide-sejour-2026-10-06.pdf');
  });
});

describe('renderPdf', () => {
  it('produit un PDF A4 avec la police embarquée (caractères polonais, grecs, cyrilliques)', () => {
    const font = (f) => readFileSync(`node_modules/dejavu-fonts-ttf/ttf/${f}`).toString('base64');
    const fonts = { regular: font('DejaVuSans.ttf'), bold: font('DejaVuSans-Bold.ttf') };
    const content = buildTripDocument(sampleTrip(), { t, locale: 'fr', includeAddresses: true, generatedAt });
    content.blocks.push({ kind: 'text', text: 'Пловдив · Λευκωσία · Brno · Łódź ≈ 12 min' });
    // Long séjour : plusieurs pages, pied de page sur chacune.
    const steps = content.blocks.filter((b) => b.kind === 'step');
    for (let i = 0; i < 8; i += 1) content.blocks.push(...steps);
    const doc = renderPdf(content, { fonts, lang: 'fr', footer: (page, total) => `Page ${page} / ${total}` });
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
    const out = doc.output();
    expect(out.startsWith('%PDF-')).toBe(true);
    expect(out).toContain('DejaVu');
  });
});
