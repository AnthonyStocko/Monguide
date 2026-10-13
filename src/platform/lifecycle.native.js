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

export function onAppUrlOpen(listener) {
  const handle = App.addListener('appUrlOpen', ({ url }) => listener(url));
  handle.catch(() => {});
  return () => {
    handle.then((h) => h.remove()).catch(() => {});
  };
}
