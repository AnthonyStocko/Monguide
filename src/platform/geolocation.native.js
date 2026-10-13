import { Geolocation } from '@capacitor/geolocation';

export function getCurrentPosition(options) {
  return Geolocation.getCurrentPosition(options);
}
