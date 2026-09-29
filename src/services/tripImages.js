import { isPlaceImage } from '@domain/model.js';
import { getImages } from './dataApi.js';
import { saveTripPhotos } from './offlineImages.js';
import * as storage from './storage.js';
import { loadTrip, updateTrip } from './tripsStore.js';

/**
 * Photos d'un séjour, demandées APRÈS la génération (jamais par elle : budget
 * de 20 s) : lieux des étapes en 400 px, destination en 800 px (trip.hero).
 * Les lieux déjà vérifiés ne sont pas redemandés pendant 30 jours (marque
 * locale "tripimgcheck:<id>", hors du séjour synchronisé) ; un identifiant
 * que le serveur n'a pas pu vérifier (Wikimedia indisponible) l'est à la
 * prochaine ouverture. Les photos sont ensuite enregistrées pour le hors ligne.
 */
const CHECK_PREFIX = 'tripimgcheck:';
const RECHECK_MS = 30 * 24 * 3600 * 1000;
const MAX_IDS = 30;
const PLACE_WIDTH = 400;
const HERO_WIDTH = 800;

const unique = (list) => [...new Set(list)];

/** Identifiants Wikidata des lieux des étapes. @param {import('@domain/model.js').Trip} trip */
export function stepQids(trip) {
  return unique(trip.days.flatMap((d) => d.steps.map((s) => s.place?.wikidata)).filter(Boolean));
}

/**
 * Séjour complété : photo de chaque lieu (étapes et réserve de candidats) dont
 * l'identifiant a une photo, photo et identifiant de la destination.
 * @param {import('@domain/model.js').Trip} trip
 * @param {Record<string, object | null>} images
 * @param {{ wikidata: string | null, image?: object | null }} [destination]
 * @returns {{ trip: import('@domain/model.js').Trip, changed: boolean }}
 */
export function applyTripImages(trip, images, destination) {
  let changed = false;
  const withImage = (place) => {
    const image = place?.wikidata ? images[place.wikidata] : undefined;
    if (!image || !isPlaceImage(image) || place.image?.thumbUrl === image.thumbUrl) return place;
    changed = true;
    return { ...place, image };
  };
  const days = trip.days.map((d) => {
    const steps = d.steps.map((s) => {
      const place = withImage(s.place);
      return place === s.place ? s : { ...s, place };
    });
    return steps.every((s, i) => s === d.steps[i]) ? d : { ...d, steps };
  });
  const candidates = (trip.candidates ?? []).map(withImage);
  let next = { ...trip, days, candidates };
  if (destination) {
    if (trip.destination.wikidata !== destination.wikidata) {
      next = { ...next, destination: { ...trip.destination, wikidata: destination.wikidata } };
      changed = true;
    }
    if (destination.image && isPlaceImage(destination.image) && trip.hero?.thumbUrl !== destination.image.thumbUrl) {
      next = { ...next, hero: destination.image };
      changed = true;
    }
  }
  return { trip: changed ? next : trip, changed };
}

async function fetchPhotos(trip, check) {
  const fresh = check && Date.now() - Date.parse(check.checkedAt) < RECHECK_MS;
  const checked = new Set(fresh ? check.qids : []);
  const wanted = stepQids(trip).filter((q) => !checked.has(q));
  const images = {};
  for (let i = 0; i < wanted.length; i += MAX_IDS) {
    Object.assign(images, (await getImages({ wikidataIds: wanted.slice(i, i + MAX_IDS), width: PLACE_WIDTH })).images);
  }

  let destination;
  if (!fresh || trip.destination.wikidata === undefined || (trip.destination.wikidata && !check?.hero)) {
    const known = trip.destination.wikidata;
    const { name, countryCode, lat, lon } = trip.destination;
    const res = await getImages(known ? { wikidataIds: [known], width: HERO_WIDTH } : { wikidataIds: [], width: HERO_WIDTH, destination: { name, countryCode, lat, lon } });
    const qid = known ?? res.destination?.wikidata;
    // Destination non vérifiée (serveur sans réponse de Wikidata) : réessayée plus tard.
    if (qid !== undefined) destination = { wikidata: qid, image: qid ? res.images[qid] : null, verified: !qid || qid in res.images };
  }
  return { images, destination, checked: [...checked, ...Object.keys(images)] };
}

const running = new Map();

/**
 * Complète les photos du séjour puis les enregistre pour le hors ligne. Sans
 * effet sur un séjour en lecture seule. Hors ligne ou serveur indisponible :
 * seul l'enregistrement hors ligne est tenté, avec les photos déjà connues.
 * @param {string} tripId
 * @returns {Promise<import('./offlineImages.js').TripImagesRecord | null>}
 */
export function refreshTripPhotos(tripId) {
  if (running.has(tripId)) return running.get(tripId);
  const task = (async () => {
    const loaded = await loadTrip(tripId);
    if (!loaded || loaded.readOnly) return null;
    let trip = loaded.trip;
    const check = await storage.get(`${CHECK_PREFIX}${tripId}`).catch(() => null);
    try {
      const { images, destination, checked } = await fetchPhotos(trip, check);
      // Dernière version enregistrée : l'utilisateur a pu modifier le séjour entre-temps.
      const latest = await loadTrip(tripId);
      if (!latest || latest.readOnly) return null;
      const { trip: next, changed } = applyTripImages(latest.trip, images, destination);
      trip = changed ? await updateTrip(next) : latest.trip;
      await storage.set(`${CHECK_PREFIX}${tripId}`, {
        checkedAt: check && Date.now() - Date.parse(check.checkedAt) < RECHECK_MS ? check.checkedAt : new Date().toISOString(),
        qids: unique(checked),
        hero: Boolean(destination?.verified) || Boolean(check?.hero)
      });
    } catch {
      // Hors ligne ou serveur indisponible : les photos connues restent utilisables.
    }
    return saveTripPhotos(trip);
  })().finally(() => running.delete(tripId));
  running.set(tripId, task);
  return task;
}

const placeImages = new Map();

/**
 * Photos de lieux affichés à la demande (candidats d'un remplacement) :
 * { Q…: PlaceImage | null }, gardées en mémoire le temps de la session.
 * @param {{ wikidata?: string }[]} places
 */
export async function photosForPlaces(places) {
  const wanted = unique(places.map((p) => p.wikidata).filter((q) => q && !placeImages.has(q)));
  for (let i = 0; i < wanted.length; i += MAX_IDS) {
    const { images } = await getImages({ wikidataIds: wanted.slice(i, i + MAX_IDS), width: PLACE_WIDTH });
    for (const [qid, image] of Object.entries(images)) placeImages.set(qid, isPlaceImage(image) ? image : null);
  }
  return Object.fromEntries(places.filter((p) => p.wikidata && placeImages.has(p.wikidata)).map((p) => [p.wikidata, placeImages.get(p.wikidata)]));
}
