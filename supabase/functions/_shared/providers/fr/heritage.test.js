import { describe, expect, it, vi } from 'vitest';
import { RULES } from '../../domain/config/rules.js';
import { isPlace } from '../../domain/model.js';
import { linkWikidata, merimeeToPlace, museofileToPlace } from './heritage.js';
import * as wikidata from '../../services/wikidata.js';
import { capitalize, parseLatLon } from './dataGouv.js';

describe('merimeeToPlace', () => {
  const row = {
    Reference: 'PA00118092',
    Titre_editorial_de_la_notice: 'Hôtel de ville',
    Denomination_de_l_edifice: 'hôtel de ville',
    coordonnees_au_format_WGS84: '45.9880320673964,4.71817168046388',
    Commune_forme_editoriale: 'Villefranche-sur-Saône',
    Siecle_de_la_campagne_principale_de_construction: '3e quart 17e siècle'
  };

  it('produit un Place certifié "Monument historique"', () => {
    const place = merimeeToPlace(row);
    expect(place).toEqual({
      id: 'merimee:PA00118092',
      name: 'Hôtel de ville (Villefranche-sur-Saône)',
      category: 'monument',
      lat: 45.9880320673964,
      lon: 4.71817168046388,
      source: 'merimee',
      certified: true,
      certification: 'monument_historique',
      indoor: true,
      url: 'https://pop.culture.gouv.fr/notice/merimee/PA00118092',
      description: '3e quart 17e siècle'
    });
    expect(isPlace(place)).toBe(true);
  });

  it('reprend la dénomination quand le titre manque', () => {
    expect(merimeeToPlace({ ...row, Titre_editorial_de_la_notice: null, Denomination_de_l_edifice: 'croix de chemin' })).toMatchObject({
      name: 'Croix de chemin (Villefranche-sur-Saône)',
      indoor: null
    });
  });

  it("n'ajoute pas la commune si le titre la contient déjà", () => {
    expect(merimeeToPlace({ ...row, Titre_editorial_de_la_notice: 'Château de Villefranche-sur-Saône' }).name).toBe('Château de Villefranche-sur-Saône');
  });

  it('ignore un monument sans coordonnées', () => {
    expect(merimeeToPlace({ ...row, coordonnees_au_format_WGS84: null })).toBeNull();
  });
});

describe('museofileToPlace', () => {
  const row = {
    Identifiant: 'M1128',
    Nom_officiel: 'musée des sapeurs-pompiers de Lyon',
    Coordonnees: '45.790491, 4.797411',
    URL: 'museepompiers.com/',
    Domaine_thematique: 'Ethnologie;Histoire'
  };

  it('produit un Place certifié "Musée de France", en intérieur', () => {
    const place = museofileToPlace(row);
    expect(place).toMatchObject({
      id: 'musee:M1128',
      name: 'Musée des sapeurs-pompiers de Lyon',
      category: 'museum',
      certification: 'musee_de_france',
      certified: true,
      indoor: true,
      url: 'https://museepompiers.com/',
      description: 'Ethnologie, Histoire'
    });
    expect(isPlace(place)).toBe(true);
  });

  it('ignore un musée sans coordonnées', () => {
    expect(museofileToPlace({ ...row, Coordonnees: null })).toBeNull();
  });
});

describe('dataGouv helpers', () => {
  it('lit "lat, lon" et rejette les valeurs invalides', () => {
    expect(parseLatLon('45.79, 4.79')).toEqual({ lat: 45.79, lon: 4.79 });
    expect(parseLatLon('abc')).toBeNull();
    expect(parseLatLon('95, 4')).toBeNull();
    expect(parseLatLon(null)).toBeNull();
  });

  it('met une capitale initiale', () => {
    expect(capitalize('écomusée')).toBe('Écomusée');
    expect(capitalize('')).toBe('');
  });
});

describe('linkWikidata', () => {
  const places = [
    { id: 'merimee:PA00118090', name: 'Église Notre-Dame-des-Marais', wikidata: undefined },
    { id: 'merimee:PA00999999', name: 'Sans correspondance' }
  ];
  const memoryCache = () => {
    const store = new Map();
    return { store, lookup: async (k) => store.get(k), set: async (k, _s, value) => store.set(k, { value, fresh: true }) };
  };
  const source = { property: 'P380', prefix: 'merimee:', cacheSource: 'merimee-wikidata' };
  const params = { lat: 45.99, lon: 4.72, radius: 5 };

  it('ajoute les identifiants trouvés, par référence, et met la correspondance en cache', async () => {
    const spy = vi.spyOn(wikidata, 'runSparql').mockResolvedValue([
      { item: { value: 'http://www.wikidata.org/entity/Q2983916' }, ref: { value: 'PA00118090' } }
    ]);
    const ctx = { cache: memoryCache(), rules: RULES };
    const out = await linkWikidata({ name: 'monuments', status: 'ok', data: places }, source, params, ctx);
    expect(out.data.map((p) => p.wikidata)).toEqual(['Q2983916', undefined]);
    expect(out.status).toBe('ok');
    await linkWikidata({ data: places }, source, params, ctx);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][2]).toEqual({ post: true });
    spy.mockRestore();
  });

  it('Wikidata en panne : lieux inchangés, rien en cache', async () => {
    const spy = vi.spyOn(wikidata, 'runSparql').mockRejectedValue(new Error('timeout'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const ctx = { cache: memoryCache(), rules: RULES };
    const outcome = { data: places };
    expect(await linkWikidata(outcome, source, params, ctx)).toBe(outcome);
    expect(ctx.cache.store.size).toBe(0);
    vi.restoreAllMocks();
    spy.mockRestore();
  });
});
