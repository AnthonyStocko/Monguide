import { App } from '@capacitor/app';

export function onAppActive(listener) {
  const handle = App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) listener();
  });
  handle.catch(() => {});
  return () => {
    handle.then((h) => h.remove()).catch(() => {});
  };
}

let launchHandled = false;

export function onAppUrlOpen(listener) {
  // Lancement à froid par un lien (lien d'invitation) : adresse de lancement, prise en compte une seule fois.
  if (!launchHandled) {
    launchHandled = true;
    App.getLaunchUrl()
      .then((launch) => launch?.url && listener(launch.url))
      .catch(() => {});
  }
  const handle = App.addListener('appUrlOpen', ({ url }) => listener(url));
  handle.catch(() => {});
  return () => {
    handle.then((h) => h.remove()).catch(() => {});
  };
}
