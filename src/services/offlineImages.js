import * as settings from './settings.js';
import { SETTINGS_KEYS } from './settings.js';
import * as storage from './storage.js';
import { connectionType } from './network.js';
import { isAllowedImageUrl } from '../config/images.js';

/**
 * Photos d'un séjour enregistrées pour le hors ligne (IndexedDB) : sa photo
 * de destination et celles des lieux de ses étapes, 5 Mo au plus par séjour
 * (au-delà, les plus petites d'abord). Avec "Wi-Fi uniquement" (activé par
 * défaut), rien n'est téléchargé hors Wi-Fi. Une photo partagée par deux
 * séjours n'est stockée qu'une fois ; elle disparaît avec le dernier séjour
 * qui l'utilise.
 *
 * Clés : "img:<url>" -> { blob, size } ; "tripimgs:<id>" -> TripImagesRecord.
 */
const BLOB_PREFIX = 'img:';
const TRIP_PREFIX = 'tripimgs:';
export const TRIP_BUDGET_BYTES = 5 * 1024 * 1024;

/**
 * @typedef {object} TripImagesRecord
 * @property {string[]} urls photos enregistrées pour ce séjour
 * @property {'done' | 'wifi_only' | 'budget' | 'partial'} status
 *   done : tout est enregistré ; wifi_only : rien téléchargé (données mobiles et réglage Wi-Fi uniquement) ;
 *   budget : plafond de 5 Mo atteint ; partial : téléchargements en échec (réseau)
 * @property {number} bytes
 * @property {string} savedAt ISO
 */

/** Adresses d'objets déjà créées, une par photo (réutilisées d'un écran à l'autre). */
const objectUrls = new Map();

/** Réglage "Télécharger les images en Wi-Fi uniquement" (true par défaut). */
export async function isWifiOnly() {
  return (await settings.get(SETTINGS_KEYS.imagesWifiOnly, true).catch(() => true)) !== false;
}

/** @param {boolean} value */
export function setWifiOnly(value) {
  return settings.set(SETTINGS_KEYS.imagesWifiOnly, value);
}

/**
 * Photos d'un séjour, sans doublon : destination puis lieux des étapes.
 * @param {import('@domain/model.js').Trip} trip
 * @returns {{ url: string, area: number }[]}
 */
export function photosOfTrip(trip) {
  const images = [trip.hero, ...trip.days.flatMap((d) => d.steps.map((s) => s.place?.image))];
  const seen = new Map();
  for (const image of images) {
    if (image && isAllowedImageUrl(image.thumbUrl) && !seen.has(image.thumbUrl)) seen.set(image.thumbUrl, { url: image.thumbUrl, area: image.width * image.height });
  }
  return [...seen.values()];
}

/** @param {string} tripId @returns {Promise<TripImagesRecord | null>} */
export function tripImagesStatus(tripId) {
  return storage.get(`${TRIP_PREFIX}${tripId}`);
}

/**
 * Supprime les photos qu'aucun autre séjour n'utilise.
 * @param {string[]} urls
 * @param {string} tripId séjour qui ne les utilise plus
 */
async function releasePhotos(urls, tripId) {
  if (!urls.length) return;
  const keys = (await storage.keys()).filter((k) => typeof k === 'string' && k.startsWith(TRIP_PREFIX) && k !== `${TRIP_PREFIX}${tripId}`);
  const used = new Set((await Promise.all(keys.map((k) => storage.get(k)))).flatMap((r) => r?.urls ?? []));
  for (const url of urls) {
    if (used.has(url)) continue;
    await storage.remove(`${BLOB_PREFIX}${url}`);
    const objectUrl = objectUrls.get(url);
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrls.delete(url);
  }
}

/**
 * Enregistre les photos du séjour pour le hors ligne, dans la limite de 5 Mo
 * (les plus petites d'abord), et retire celles qu'il n'utilise plus.
 * @param {import('@domain/model.js').Trip} trip
 * @param {{ fetchImpl?: typeof fetch, budgetBytes?: number }} [options]
 * @returns {Promise<TripImagesRecord>}
 */
export async function saveTripPhotos(trip, { fetchImpl = (...a) => fetch(...a), budgetBytes = TRIP_BUDGET_BYTES } = {}) {
  const key = `${TRIP_PREFIX}${trip.id}`;
  const previous = await storage.get(key);
  const photos = photosOfTrip(trip).sort((a, b) => a.area - b.area);

  const stored = new Set(previous?.urls ?? []);
  const missing = photos.some((p) => !stored.has(p.url));
  if (missing && (await isWifiOnly()) && (await connectionType()) !== 'wifi') {
    // Rien n'est téléchargé ; les photos déjà enregistrées restent disponibles.
    const record = { urls: previous?.urls ?? [], status: 'wifi_only', bytes: previous?.bytes ?? 0, savedAt: new Date().toISOString() };
    await storage.set(key, record);
    return record;
  }

  const urls = [];
  let bytes = 0;
  let overBudget = false;
  let failed = false;
  for (const { url } of photos) {
    let size = (await storage.get(`${BLOB_PREFIX}${url}`))?.size;
    if (size === undefined) {
      try {
        const res = await fetchImpl(url);
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        if (bytes + blob.size > budgetBytes) {
          overBudget = true;
          continue;
        }
        await storage.set(`${BLOB_PREFIX}${url}`, { blob, size: blob.size });
        size = blob.size;
      } catch {
        failed = true;
        continue;
      }
    } else if (bytes + size > budgetBytes) {
      overBudget = true;
      continue;
    }
    bytes += size;
    urls.push(url);
  }

  const record = { urls, status: failed ? 'partial' : overBudget ? 'budget' : 'done', bytes, savedAt: new Date().toISOString() };
  await storage.set(key, record);
  await releasePhotos((previous?.urls ?? []).filter((u) => !urls.includes(u)), trip.id);
  return record;
}

/**
 * Supprime les photos d'un séjour supprimé (sauf celles d'autres séjours).
 * @param {string} tripId
 */
export async function deleteTripPhotos(tripId) {
  const key = `${TRIP_PREFIX}${tripId}`;
  const record = await storage.get(key);
  await storage.remove(key);
  await releasePhotos(record?.urls ?? [], tripId);
}

/** Supprime toutes les photos enregistrées (effacement de tous les séjours). */
export async function deleteAllTripPhotos() {
  const keys = (await storage.keys()).filter((k) => typeof k === 'string' && (k.startsWith(TRIP_PREFIX) || k.startsWith(BLOB_PREFIX)));
  await Promise.all(keys.map((k) => storage.remove(k)));
  objectUrls.forEach((u) => URL.revokeObjectURL(u));
  objectUrls.clear();
}

/**
 * Adresse locale (blob:) d'une photo enregistrée, ou null.
 * @param {string} url
 */
export async function localPhotoUrl(url) {
  if (objectUrls.has(url)) return objectUrls.get(url);
  const record = await storage.get(`${BLOB_PREFIX}${url}`).catch(() => null);
  if (!record?.blob) return null;
  const objectUrl = URL.createObjectURL(record.blob);
  objectUrls.set(url, objectUrl);
  return objectUrl;
}
