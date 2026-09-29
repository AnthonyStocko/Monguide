import { describe, expect, it } from 'vitest';
import { acceptedLicense, fetchFileImages, fetchMainFiles, findCityQid, normalizeThumbUrl, stripHtml, toPlaceImage } from './commons.js';

const meta = (fields) => Object.fromEntries(Object.entries(fields).map(([k, value]) => [k, { value }]));

// Réponse Commons réelle (2026-09-29), raccourcie.
const DINI = {
  url: 'https://upload.wikimedia.org/wikipedia/commons/d/d8/Mus%C3%A9e_Paul-Dini_-_Espace_Grenette.jpg',
  thumburl:
    'https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d8/Mus%C3%A9e_Paul-Dini_-_Espace_Grenette.jpg/500px-Mus%C3%A9e_Paul-Dini_-_Espace_Grenette.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail',
  thumbwidth: 400,
  thumbheight: 266,
  width: 1535,
  height: 1020,
  descriptionurl: 'https://commons.wikimedia.org/wiki/File:Mus%C3%A9e_Paul-Dini_-_Espace_Grenette.jpg',
  extmetadata: meta({
    Artist:
      '<a href="//commons.wikimedia.org/w/index.php?title=User:Museepauldini14&amp;action=edit&amp;redlink=1" class="new" title="User:Museepauldini14 (page does not exist)">Museepauldini14</a>',
    LicenseShortName: 'CC BY-SA 3.0',
    LicenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0',
    License: 'cc-by-sa-3.0'
  })
};

describe('stripHtml', () => {
  it('ne garde que le texte : balises, entités, espaces', () => {
    expect(stripHtml('<a href="x">Jean&nbsp;Dupont</a> &amp; <span>Marie&#39;s</span>\n')).toBe('Jean Dupont & Marie\'s');
    expect(stripHtml('Caf&#xE9; <b>Br&eacute;hat</b>')).toBe('Café Br&eacute;hat');
  });

  it('tronque au-delà de 120 caractères et accepte les valeurs absentes', () => {
    expect(stripHtml('a'.repeat(200))).toHaveLength(120);
    expect(stripHtml(undefined)).toBe('');
  });
});

describe('acceptedLicense', () => {
  it.each([
    ['cc-by-sa-3.0', 'CC BY-SA 3.0', true],
    ['cc-by-4.0', 'CC BY 4.0', true],
    ['cc-by-sa-2.0-fr', 'CC BY-SA 2.0 fr', true],
    ['cc0', 'CC0', false],
    ['pd', 'Public domain', false]
  ])('accepte %s', (License, LicenseShortName, needsAuthor) => {
    expect(acceptedLicense(meta({ License, LicenseShortName }))).toMatchObject({ license: LicenseShortName, needsAuthor });
  });

  it.each([
    ['cc-by-nc-sa-4.0', 'CC BY-NC-SA 4.0'],
    ['cc-by-nd-4.0', 'CC BY-ND 4.0'],
    ['gfdl', 'GFDL'],
    ['fal', 'Licence Art Libre'],
    ['', ''],
    [undefined, undefined]
  ])('refuse %s', (License, LicenseShortName) => {
    expect(acceptedLicense(meta({ License, LicenseShortName }))).toBeNull();
  });

  it('se rabat sur le nom court quand le code manque', () => {
    expect(acceptedLicense(meta({ LicenseShortName: 'Public domain' }))).toMatchObject({ license: 'Public domain' });
    expect(acceptedLicense(meta({ LicenseShortName: 'CC BY-SA 4.0' }))).toMatchObject({ needsAuthor: true });
  });
});

describe('normalizeThumbUrl', () => {
  it('ramène thumb.wikimedia.org sur upload.wikimedia.org, sans paramètre', () => {
    expect(normalizeThumbUrl(DINI.thumburl)).toBe(
      'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d8/Mus%C3%A9e_Paul-Dini_-_Espace_Grenette.jpg/500px-Mus%C3%A9e_Paul-Dini_-_Espace_Grenette.jpg'
    );
  });

  it('refuse tout autre hôte', () => {
    expect(normalizeThumbUrl('https://example.org/x.jpg')).toBeNull();
    expect(normalizeThumbUrl('pas une url')).toBeNull();
  });
});

describe('toPlaceImage', () => {
  it('photo, dimensions réelles du fichier servi, crédit nettoyé', () => {
    expect(toPlaceImage(DINI)).toEqual({
      thumbUrl: normalizeThumbUrl(DINI.thumburl),
      width: 500,
      height: 332,
      credit: {
        author: 'Museepauldini14',
        license: 'CC BY-SA 3.0',
        licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0',
        sourceUrl: DINI.descriptionurl
      }
    });
  });

  it("original plus petit que la largeur demandée : l'original et ses dimensions", () => {
    const small = { ...DINI, thumburl: DINI.url, width: 320, height: 240 };
    expect(toPlaceImage(small)).toMatchObject({ thumbUrl: DINI.url, width: 320, height: 240 });
  });

  it('refuse une licence non acceptée, et une CC BY sans auteur', () => {
    expect(toPlaceImage({ ...DINI, extmetadata: { ...DINI.extmetadata, ...meta({ License: 'cc-by-nc-4.0', LicenseShortName: 'CC BY-NC 4.0' }) } })).toBeNull();
    expect(toPlaceImage({ ...DINI, extmetadata: { ...DINI.extmetadata, Artist: { value: '<a href="x"></a>' } } })).toBeNull();
  });

  it('accepte le domaine public sans auteur', () => {
    const pd = { ...DINI, extmetadata: meta({ License: 'pd', LicenseShortName: 'Public domain' }) };
    expect(toPlaceImage(pd)?.credit).toEqual({ license: 'Public domain', sourceUrl: DINI.descriptionurl });
  });
});

/** Faux fetchJson : répond selon l'URL, et note les appels. */
function fakeFetch(handler) {
  const calls = [];
  const fetchJson = async (url) => {
    const u = new URL(url);
    calls.push(u);
    return handler(u);
  };
  return { fetchJson, calls };
}

describe('fetchMainFiles', () => {
  it('lit page_image_free en une requête groupée ; null sans photo', async () => {
    const { fetchJson, calls } = fakeFetch(() => ({
      query: {
        pages: [
          { title: 'Q2983916', pageprops: { page_image_free: 'Katedra_w_Villefranche_-_panoramio.jpg' } },
          { title: 'Q1', pageprops: {} }
        ]
      }
    }));
    const files = await fetchMainFiles(['Q2983916', 'Q1'], { timeoutMs: 1000, fetchJson });
    expect(files).toEqual({ Q2983916: 'Katedra w Villefranche - panoramio.jpg', Q1: null });
    expect(calls).toHaveLength(1);
    expect(calls[0].searchParams.get('titles')).toBe('Q2983916|Q1');
    expect(calls[0].searchParams.get('ppprop')).toBe('page_image_free');
  });

  it('par lots de 50', async () => {
    const { fetchJson, calls } = fakeFetch(() => ({ query: { pages: [] } }));
    await fetchMainFiles(Array.from({ length: 120 }, (_, i) => `Q${i + 1}`), { timeoutMs: 1000, fetchJson });
    expect(calls).toHaveLength(3);
  });
});

describe('fetchFileImages', () => {
  it('suit les titres normalisés par Commons', async () => {
    const { fetchJson, calls } = fakeFetch(() => ({
      query: {
        normalized: [{ from: 'File:musée Paul-Dini - Espace Grenette.jpg', to: 'File:Musée Paul-Dini - Espace Grenette.jpg' }],
        pages: [{ title: 'File:Musée Paul-Dini - Espace Grenette.jpg', imageinfo: [DINI] }, { title: 'File:Absent.jpg', missing: true }]
      }
    }));
    const images = await fetchFileImages(['musée Paul-Dini - Espace Grenette.jpg', 'Absent.jpg'], 400, { timeoutMs: 1000, fetchJson });
    expect(images['musée Paul-Dini - Espace Grenette.jpg']).toMatchObject({ width: 500 });
    expect(images['Absent.jpg']).toBeNull();
    expect(calls[0].searchParams.get('iiurlwidth')).toBe('400');
  });
});

describe('findCityQid', () => {
  const city = { name: 'Villefranche-sur-Saône', lat: 45.99, lon: 4.72 };

  it('premier résultat de la recherche situé assez près', async () => {
    const { fetchJson } = fakeFetch((u) =>
      u.searchParams.get('action') === 'wbsearchentities'
        ? { search: [{ id: 'Q999' }, { id: 'Q208770' }, { id: 'Q2576354' }] }
        : {
            query: {
              pages: [
                { title: 'Q999', coordinates: [{ lat: 43.7, lon: 7.3, primary: true }] },
                { title: 'Q208770', coordinates: [{ lat: 45.989, lon: 4.7197, primary: true }] },
                { title: 'Q2576354', coordinates: [{ lat: 45.98, lon: 4.72, primary: true }] }
              ]
            }
          }
    );
    expect(await findCityQid(city, { maxDistanceKm: 15, timeoutMs: 1000, fetchJson })).toBe('Q208770');
  });

  it('null si aucun résultat proche, après les deux langues', async () => {
    const { fetchJson, calls } = fakeFetch((u) =>
      u.searchParams.get('action') === 'wbsearchentities' ? { search: [{ id: 'Q999' }] } : { query: { pages: [{ title: 'Q999', coordinates: [{ lat: 43.7, lon: 7.3 }] }] } }
    );
    expect(await findCityQid(city, { maxDistanceKm: 15, timeoutMs: 1000, fetchJson })).toBeNull();
    expect(calls.filter((u) => u.searchParams.get('action') === 'wbsearchentities').map((u) => u.searchParams.get('language'))).toEqual(['fr', 'en']);
  });
});
