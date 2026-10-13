/** Rejette avec une GeolocationPositionError (code 1 : permission refusée) ou une erreur "unavailable". */
export function getCurrentPosition(options) {
  return new Promise((resolve, reject) => {
    if (!globalThis.navigator?.geolocation) {
      reject(new Error('unavailable'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}
