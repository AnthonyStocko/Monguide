import { useEffect, useState } from 'react';
import { localPhotoUrl } from '../services/offlineImages.js';

/**
 * Adresse à afficher pour une photo : sa copie enregistrée pour le hors
 * ligne (blob:) si elle existe, sinon son adresse Wikimedia. null tant que la
 * copie locale est recherchée (l'illustration reste affichée).
 * @param {string | null | undefined} url
 */
export function useImageSrc(url) {
  const [state, setState] = useState({ url: null, src: null });
  useEffect(() => {
    if (!url) return undefined;
    let alive = true;
    localPhotoUrl(url)
      .catch(() => null)
      .then((local) => alive && setState({ url, src: local ?? url }));
    return () => {
      alive = false;
    };
  }, [url]);
  return url && state.url === url ? state.src : null;
}
