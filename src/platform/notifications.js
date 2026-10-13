import { isNative } from './target.js';

/**
 * Notifications des séjours. Natif : notifications locales programmées sur
 * le téléphone (@capacitor/local-notifications). Web : un navigateur ne sait
 * pas programmer une notification ; l'appareil s'abonne au Web Push et le
 * serveur envoie les rappels à l'heure prévue (services/notifications.js).
 */
const impl = await (import.meta.env.VITE_TARGET !== 'web' && isNative ? import('./notifications.native.js') : import('./notifications.web.js'));

/**
 * Natif : le plugin. Web : même interface pour la permission
 * (checkPermissions, requestPermissions) et l'appui sur une notification
 * (addListener) ; la programmation locale y est sans effet.
 */
export const LocalNotifications = impl.LocalNotifications;

/**
 * Web seulement (null en natif) : abonnement Web Push de cet appareil.
 * getSubscription() le crée si besoin et renvoie { endpoint, keys: { p256dh, auth } },
 * ou null si la permission n'est pas accordée ou le service worker absent.
 * @type {null | { getSubscription: () => Promise<{ endpoint: string, keys: { p256dh: string, auth: string } } | null> }}
 */
export const remotePush = impl.remotePush;
