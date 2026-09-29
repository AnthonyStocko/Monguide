import { distanceKm } from '../domain/geo.js';
import { isPlaceImage } from '../domain/model.js';
import { fetchExternalJson } from '../http.js';
import { userAgent } from '../meta.js';

/**
 * Photos des lieux : fichier principal d'un élément Wikidata (P18, exposé
 * par l'API sous pageprops.page_image_free, bien plus léger que les claims),
 * puis miniature et métadonnées du fichier sur Wikimedia Commons (imageinfo,
 * extmetadata). Requêtes groupées par 50 (limite de l'API), User-Agent
 * Mon guide et Api-User-Agent (politique User-Agent de Wikimedia).
 * Vérifié le 2026-09-29 : Commons renvoie ses miniatures sur
 * thumb.wikimedia.org avec des paramètres de suivi, et ne sert plus que des
 * largeurs standard (400 -> 500 px, 800 -> 960 px ; "400px-" répond 400).
 */

const WIKIDATA_API = () => globalThis.Deno?.env.get('WIKIDATA_API_URL') ?? 'https://www.wikidata.org/w/api.php';
const COMMONS_API = () => globalThis.Deno?.env.get('COMMONS_API_URL') ?? 'https://commons.wikimedia.org/w/api.php';

/** Titres ou identifiants par appel (limite des API MediaWiki sans droits de bot). */
const BATCH = 50;
const AUTHOR_MAX = 120;

const chunks = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/**
 * Texte seul d'un fragment HTML (auteur Commons : liens, balises, entités).
 * @param {unknown} html
 * @returns {string}
 */
export function stripHtml(html) {
  if (typeof html !== 'string') return '';
  const text = html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
      if (e[0] !== '#') return ENTITIES[e.toLowerCase()] ?? m;
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1));
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    })
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > AUTHOR_MAX ? `${text.slice(0, AUTHOR_MAX - 1).trimEnd()}…` : text;
}

/**
 * Licence acceptée : domaine public, CC0, CC BY, CC BY-SA (toutes versions et
 * adaptations nationales). Tout le reste (CC BY-NC, GFDL seule, Licence Art
 * Libre, licence absente…) est refusé.
 * @param {Record<string, { value?: string }>} meta extmetadata
 * @returns {{ license: string, licenseUrl?: string, needsAuthor: boolean } | null}
 */
export function acceptedLicense(meta) {
  const code = String(meta?.License?.value ?? '').trim().toLowerCase();
  const short = stripHtml(meta?.LicenseShortName?.value);
  const url = String(meta?.LicenseUrl?.value ?? '').trim();
  const licenseUrl = /^https?:\/\//i.test(url) ? url.replace(/^http:/i, 'https:') : url.startsWith('//') ? `https:${url}` : undefined;

  const publicDomain = code === 'pd' || code.startsWith('pd-') || (!code && /^public domain\b/i.test(short));
  if (publicDomain) return { license: short || 'Public domain', needsAuthor: false, ...(licenseUrl ? { licenseUrl } : {}) };
  const cc0 = code === 'cc0' || code === 'cc-zero' || (!code && /^cc0\b/i.test(short));
  if (cc0) return { license: short || 'CC0', licenseUrl: licenseUrl ?? 'https://creativecommons.org/publicdomain/zero/1.0/', needsAuthor: false };
  const by = /^cc-by(-sa)?-\d(\.\d)?(-[a-z]{2,3})?$/.test(code) || (!code && /^cc by(-sa)? \d(\.\d)?( [a-z]{2,3})?$/i.test(short));
  if (by && short) return { license: short, needsAuthor: true, ...(licenseUrl ? { licenseUrl } : {}) };
  return null;
}

/**
 * Miniature sur upload.wikimedia.org, sans paramètre ; null pour tout autre hôte.
 * @param {unknown} url
 */
export function normalizeThumbUrl(url) {
  if (typeof url !== 'string') return null;
  let u;
  try {
    u = new URL(url.startsWith('//') ? `https:${url}` : url);
  } catch {
    return null;
  }
  if (!['upload.wikimedia.org', 'thumb.wikimedia.org'].includes(u.hostname)) return null;
  return `https://upload.wikimedia.org${u.pathname}`;
}

/**
 * imageinfo d'un fichier Commons -> PlaceImage, ou null (licence refusée,
 * auteur manquant alors que la licence l'exige, URL ou dimensions absentes).
 * @param {Record<string, any>} info page.imageinfo[0]
 * @returns {import('../domain/model.js').PlaceImage | null}
 */
export function toPlaceImage(info) {
  if (!info) return null;
  const meta = info.extmetadata ?? {};
  const licence = acceptedLicense(meta);
  if (!licence) return null;
  const author = stripHtml(meta.Artist?.value);
  if (licence.needsAuthor && !author) return null;

  const thumbUrl = normalizeThumbUrl(info.thumburl ?? info.url);
  if (!thumbUrl || !(info.width > 0) || !(info.height > 0)) return null;
  // Largeur réelle du fichier servi : celle du nom ("500px-…"), sinon l'original.
  const px = Number(/\/(\d+)px-[^/]+$/.exec(thumbUrl)?.[1]);
  const width = px > 0 ? px : info.width;
  const height = px > 0 ? Math.round((px * info.height) / info.width) : info.height;

  const page = String(info.descriptionurl ?? '').replace(/^\/\//, 'https://');
  const sourceUrl = /^https:\/\/commons\.wikimedia\.org\//.test(page) ? page : undefined;
  const image = {
    thumbUrl,
    width,
    height,
    credit: {
      ...(author ? { author } : {}),
      license: licence.license,
      ...(licence.licenseUrl ? { licenseUrl: licence.licenseUrl } : {}),
      sourceUrl
    }
  };
  return isPlaceImage(image) ? image : null;
}

function apiHeaders() {
  return { 'Api-User-Agent': userAgent() };
}

/**
 * Requête action=query groupée (titres séparés par "|").
 * @param {string} base URL de l'API
 * @param {string[]} titles
 * @param {Record<string, string>} params
 * @param {(url: string, options: object) => Promise<any>} fetchJson
 * @param {number} timeoutMs
 */
async function queryPages(base, titles, params, fetchJson, timeoutMs) {
  const qs = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', titles: titles.join('|'), ...params });
  const json = await fetchJson(`${base}?${qs}`, { source: 'wikimedia', headers: apiHeaders(), timeoutMs });
  return { pages: json?.query?.pages ?? [], normalized: json?.query?.normalized ?? [] };
}

/**
 * Fichier principal (P18) de chaque élément : { Q…: "Nom de fichier.jpg" | null }.
 * @param {string[]} qids
 * @param {{ timeoutMs: number, fetchJson?: typeof fetchExternalJson }} options
 */
export async function fetchMainFiles(qids, { timeoutMs, fetchJson = fetchExternalJson }) {
  const files = {};
  for (const batch of chunks(qids, BATCH)) {
    const { pages } = await queryPages(WIKIDATA_API(), batch, { prop: 'pageprops', ppprop: 'page_image_free' }, fetchJson, timeoutMs);
    for (const qid of batch) files[qid] = null;
    for (const page of pages) {
      const file = page.pageprops?.page_image_free;
      if (page.title in files && typeof file === 'string' && file) files[page.title] = file.replace(/_/g, ' ');
    }
  }
  return files;
}

/**
 * Photos de fichiers Commons à la largeur voulue : { "Nom.jpg": PlaceImage | null }.
 * @param {string[]} fileNames sans le préfixe "File:"
 * @param {number} width
 * @param {{ timeoutMs: number, fetchJson?: typeof fetchExternalJson }} options
 */
export async function fetchFileImages(fileNames, width, { timeoutMs, fetchJson = fetchExternalJson }) {
  const images = {};
  for (const batch of chunks([...new Set(fileNames)], BATCH)) {
    const titles = batch.map((f) => `File:${f}`);
    const { pages, normalized } = await queryPages(
      COMMONS_API(),
      titles,
      {
        prop: 'imageinfo',
        iiprop: 'url|size|extmetadata',
        iiurlwidth: String(width),
        iiextmetadatafilter: 'Artist|LicenseShortName|LicenseUrl|License'
      },
      fetchJson,
      timeoutMs
    );
    // Titre renvoyé (normalisé : espaces, majuscule initiale) -> nom demandé.
    const requested = new Map(titles.map((t, i) => [t, batch[i]]));
    for (const { from, to } of normalized) if (requested.has(from)) requested.set(to, requested.get(from));
    for (const f of batch) images[f] = null;
    for (const page of pages) {
      const name = requested.get(page.title);
      if (name !== undefined) images[name] = toPlaceImage(page.imageinfo?.[0]);
    }
  }
  return images;
}

/**
 * Identifiant Wikidata d'une ville : recherche par nom (français puis
 * anglais), premier résultat situé à moins de maxDistanceKm. Photon ne donne
 * pas cet identifiant (vérifié le 2026-09-29).
 * @param {{ name: string, lat: number, lon: number }} city
 * @param {{ maxDistanceKm: number, timeoutMs: number, fetchJson?: typeof fetchExternalJson }} options
 * @returns {Promise<string | null>}
 */
export async function findCityQid(city, { maxDistanceKm, timeoutMs, fetchJson = fetchExternalJson }) {
  for (const language of ['fr', 'en']) {
    const qs = new URLSearchParams({ action: 'wbsearchentities', format: 'json', formatversion: '2', type: 'item', limit: '7', language, uselang: language, search: city.name });
    const found = await fetchJson(`${WIKIDATA_API()}?${qs}`, { source: 'wikimedia', headers: apiHeaders(), timeoutMs });
    const ids = (found?.search ?? []).map((r) => r.id).filter((id) => /^Q\d+$/.test(id));
    if (!ids.length) continue;
    const { pages } = await queryPages(WIKIDATA_API(), ids, { prop: 'coordinates' }, fetchJson, timeoutMs);
    const position = new Map(pages.map((p) => [p.title, p.coordinates?.find((c) => c.primary) ?? p.coordinates?.[0]]));
    const match = ids.find((id) => {
      const c = position.get(id);
      return c && distanceKm(city, { lat: c.lat, lon: c.lon }) <= maxDistanceKm;
    });
    if (match) return match;
  }
  return null;
}
