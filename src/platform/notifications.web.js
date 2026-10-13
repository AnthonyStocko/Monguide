/** Clé publique VAPID du serveur (la clé privée n'existe que dans les secrets Supabase). */
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

/** Message envoyé par le service worker à l'appui sur une notification (scripts/web/push-sw.js). */
const OPEN_MESSAGE = 'monguide:open-url';

/**
 * Web Push utilisable : clé configurée et navigateur compatible. Sur iPhone,
 * ces API n'existent que dans l'application ajoutée à l'écran d'accueil.
 */
const supported = () =>
  Boolean(VAPID_PUBLIC_KEY) && typeof Notification !== 'undefined' && typeof PushManager !== 'undefined' && 'serviceWorker' in globalThis.navigator;

const toDisplay = (permission) => (permission === 'default' ? 'prompt' : permission);

const unavailable = async () => {
  throw new Error('unavailable');
};

function base64UrlToBytes(text) {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

export const LocalNotifications = {
  checkPermissions: async () => ({ display: supported() ? toDisplay(Notification.permission) : 'unavailable' }),
  // Appelée directement par l'appui sur « Activer les rappels » : la demande du
  // navigateur part aussitôt (Safari l'exige), jamais au chargement de la page.
  requestPermissions: () => {
    if (!supported()) return Promise.resolve({ display: 'unavailable' });
    return Promise.resolve(Notification.requestPermission()).then((permission) => ({ display: toDisplay(permission) }));
  },
  // Alarmes exactes et canal : propres à Android.
  checkExactNotificationSetting: unavailable,
  changeExactNotificationSetting: unavailable,
  createChannel: async () => {},
  // Rien n'est programmé dans le navigateur : les rappels partent du serveur.
  schedule: async () => {},
  cancel: async () => {},
  getPending: async () => ({ notifications: [] }),
  // Appui sur une notification, application déjà ouverte : le service worker transmet le lien.
  addListener: async (event, listener) => {
    if (event !== 'localNotificationActionPerformed' || !('serviceWorker' in globalThis.navigator)) return { remove: async () => {} };
    const onMessage = ({ data }) => {
      if (data?.type === OPEN_MESSAGE && typeof data.url === 'string') listener({ notification: { extra: { url: data.url } } });
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return { remove: async () => navigator.serviceWorker.removeEventListener('message', onMessage) };
  }
};

export const remotePush = {
  async getSubscription() {
    if (!supported() || Notification.permission !== 'granted') return null;
    // Pas de service worker (développement) : pas d'abonnement, sans attendre indéfiniment.
    if (!(await navigator.serviceWorker.getRegistration())) return null;
    const registration = await navigator.serviceWorker.ready;
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(VAPID_PUBLIC_KEY) }));
    const { endpoint, keys } = subscription.toJSON();
    return { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } };
  }
};
