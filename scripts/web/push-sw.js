/* global self */
// Partie « rappels » du service worker de la version web, chargée par sw.js
// (importScripts, voir vite.config.js). Script classique, sans import.
//
// push : le serveur (fonction push-send) envoie { title, body, url, tag } ;
// la notification est affichée même application fermée et écran verrouillé.
// notificationclick : ouvre l'application sur le bon jour et la bonne étape
// (lien /planning/<séjour>?day=…&step=…).

self.addEventListener('push', (event) => {
  let message = {};
  try {
    message = event.data ? event.data.json() : {};
  } catch {
    // Message illisible : notification générique plutôt que rien (exigé par les navigateurs).
  }
  event.waitUntil(
    self.registration.showNotification(message.title || 'Mon guide', {
      body: message.body || '',
      tag: message.tag,
      icon: '/icons/icon-192.png',
      data: { url: typeof message.url === 'string' && message.url.startsWith('/') ? message.url : '/' }
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (open) {
        // Application déjà ouverte : navigation interne, sans rechargement (aucune saisie perdue).
        open.postMessage({ type: 'monguide:open-url', url: path });
        return open.focus();
      }
      return self.clients.openWindow(path);
    })()
  );
});
