import { isNative } from './target.js';

/**
 * Notifications locales programmées. Natif : @capacitor/local-notifications.
 * Web : indisponibles pour l'instant (rien n'est programmé, les réglages
 * l'expliquent).
 */
const impl = await (import.meta.env.VITE_TARGET !== 'web' && isNative ? import('./notifications.native.js') : import('./notifications.web.js'));

/** Même interface que le plugin (méthodes utilisées par services/notifications.js). */
export const LocalNotifications = impl.LocalNotifications;
