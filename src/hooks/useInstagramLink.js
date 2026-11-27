import { useEffect, useState } from 'react';
import { findInstagramPost } from '@domain/instagramPlaces.js';
import { getInstagramPlaces } from '../services/dataApi.js';

/** Liste gardée en mémoire pendant la session : 3 h, ou 5 min si elle est vide (agent injoignable). */
const TTL_MS = 3 * 3600 * 1000;
const EMPTY_TTL_MS = 5 * 60 * 1000;

let loaded = null; // { places, at }
let pending = null;

/** Charge la liste une seule fois pour tous les écrans ; ne rejette jamais. */
function loadPlaces() {
  if (loaded && Date.now() - loaded.at < (loaded.places.length ? TTL_MS : EMPTY_TTL_MS)) return Promise.resolve(loaded.places);
  pending ??= getInstagramPlaces()
    .catch(() => [])
    .then((places) => {
      loaded = { places, at: Date.now() };
      return places;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

/** Remet à zéro la mémoire (tests). */
export function resetInstagramLinkCache() {
  loaded = null;
  pending = null;
}

/**
 * Adresse du post Instagram le plus récent commenté sur ce lieu, ou null
 * (aucun post, agent indisponible, lieu personnel). N'affiche jamais d'erreur.
 * @param {object | null | undefined} place lieu de l'étape
 * @param {string} [city] ville de destination du séjour
 * @returns {string | null}
 */
export function useInstagramLink(place, city) {
  const [places, setPlaces] = useState(() => loaded?.places ?? []);
  const eligible = Boolean(place) && place.source !== 'user';
  useEffect(() => {
    if (!eligible) return undefined;
    let active = true;
    loadPlaces().then((list) => active && setPlaces(list));
    return () => {
      active = false;
    };
  }, [eligible]);
  return eligible ? findInstagramPost(place, places, city) : null;
}
