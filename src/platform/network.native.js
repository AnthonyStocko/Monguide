import { Network } from '@capacitor/network';

export async function getConnectionType() {
  return (await Network.getStatus()).connectionType;
}

export function onConnectionChange(listener) {
  const handle = Network.addListener('networkStatusChange', (status) => listener(status.connectionType));
  return () => {
    handle.then((h) => h.remove()).catch(() => {});
  };
}
