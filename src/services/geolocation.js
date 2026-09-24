import { Geolocation } from '@capacitor/geolocation';

/**
 * Position de l'appareil ("Utiliser ma position"). La permission n'est
 * demandée qu'à l'appel, donc uniquement au clic de l'utilisateur. La
 * position exacte reste sur l'appareil ; le serveur ne reçoit qu'une
 * position arrondie (voir docs/api.md, geocode).
 */

export class GeolocationError extends Error {
  /** @param {'denied' | 'unavailable'} code */
  constructor(code) {
    super(code);
    this.name = 'GeolocationError';
    this.code = code;
    /** Clé i18n du message à afficher. */
    this.messageKey = code === 'denied' ? 'geolocation.denied' : 'geolocation.unavailable';
  }
}

/** @returns {Promise<{ lat: number, lon: number }>} */
export async function currentPosition() {
  try {
    const { coords } = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000 });
    return { lat: coords.latitude, lon: coords.longitude };
  } catch (err) {
    const text = `${err?.code ?? ''} ${err?.message ?? ''}`;
    throw new GeolocationError(/denied|permission|not authori/i.test(text) || err?.code === 1 ? 'denied' : 'unavailable');
  }
}
